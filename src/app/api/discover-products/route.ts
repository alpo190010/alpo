import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stores, storeProducts } from "@/db/schema";
import { eq } from "drizzle-orm";

interface ShopifyProduct {
  title: string;
  handle: string;
  images: Array<{ src: string }>;
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const baseUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
    const origin = `${baseUrl.protocol}//${baseUrl.host}`;
    const domain = baseUrl.host;

    // Strategy 1: Shopify JSON API — fast, reliable, includes images
    const jsonProducts = await tryShopifyJson(origin);
    if (jsonProducts.length > 0) {
      const titleMatch = await fetchPageTitle(origin);

      // Persist store + products to DB
      const storeId = await persistStoreAndProducts(domain, titleMatch, jsonProducts);

      return NextResponse.json({
        products: jsonProducts.slice(0, 20),
        storeName: titleMatch,
        isProductPage: false,
        storeId,
      });
    }

    // Strategy 2: HTML scraping fallback for non-Shopify or blocked JSON
    const htmlResult = await tryHtmlScraping(origin, baseUrl, url);

    // Persist store + products to DB
    const storeId = await persistStoreAndProducts(domain, htmlResult.storeName, htmlResult.products);

    return NextResponse.json({ ...htmlResult, storeId });
  } catch (err) {
    console.error("Discover products error:", err);
    return NextResponse.json(
      { error: "Could not fetch that URL. Make sure it's accessible." },
      { status: 400 }
    );
  }
}

/** Upsert store by domain, replace products, return storeId (or null on failure) */
async function persistStoreAndProducts(
  domain: string,
  storeName: string,
  products: Array<{ url: string; slug: string; image: string }>
): Promise<string | null> {
  try {
    // Upsert store by domain
    const [store] = await db
      .insert(stores)
      .values({ domain, name: storeName || null })
      .onConflictDoUpdate({
        target: stores.domain,
        set: { name: storeName || null, updatedAt: new Date() },
      })
      .returning({ id: stores.id });

    const storeId = store.id;

    // Delete existing products for this store, then bulk-insert fresh list
    await db.delete(storeProducts).where(eq(storeProducts.storeId, storeId));

    if (products.length > 0) {
      await db.insert(storeProducts).values(
        products.map((p) => ({
          storeId,
          url: p.url,
          slug: p.slug,
          image: p.image || null,
        }))
      );
    }

    return storeId;
  } catch (dbErr) {
    console.error("DB store persist error:", dbErr);
    return null;
  }
}

/** Try Shopify's /products.json endpoint — returns structured product data with images */
async function tryShopifyJson(
  origin: string
): Promise<Array<{ url: string; slug: string; image: string }>> {
  try {
    const res = await fetch(`${origin}/products.json?limit=20`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const data = await res.json();
    const products: ShopifyProduct[] = data.products || [];

    return products
      .filter((p) => p.handle && p.title)
      .map((p) => {
        let image = p.images?.[0]?.src || "";
        // Request a small thumbnail from Shopify CDN
        if (image && image.includes("cdn.shopify.com")) {
          image = image.replace(
            /(\.(jpg|jpeg|png|webp|avif))/i,
            "_180x$1"
          );
        }
        // Ensure https
        if (image.startsWith("//")) image = `https:${image}`;

        return {
          url: `${origin}/products/${p.handle}`,
          slug: p.title,
          image,
        };
      });
  } catch {
    return [];
  }
}

/** Fetch page title for store name */
async function fetchPageTitle(origin: string): Promise<string> {
  try {
    const res = await fetch(origin, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(6000),
    });
    const html = await res.text();
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match?.[1]?.trim().split(/[–—|]/)[0]?.trim() || "";
  } catch {
    return "";
  }
}

/** Fallback: scrape HTML for product links and nearby images */
async function tryHtmlScraping(
  origin: string,
  baseUrl: URL,
  originalUrl: string
): Promise<{
  products: Array<{ url: string; slug: string; image: string }>;
  storeName: string;
  isProductPage: boolean;
}> {
  const res = await fetch(originalUrl.startsWith("http") ? originalUrl : `https://${originalUrl}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    return { products: [], storeName: "", isProductPage: false };
  }

  const html = await res.text();

  const titleRegex = /<title[^>]*>([^<]+)<\/title>/i;
  const titleMatch = html.match(titleRegex);
  const storeName = titleMatch?.[1]?.trim().split(/[–—|]/)[0]?.trim() || "";

  // Check if this is already a product page
  const isProductPage =
    /\/products\/[^/]+/.test(baseUrl.pathname) ||
    (html.includes("/products/") &&
      /add.to.cart|AddToCart|product-form/i.test(html) &&
      (html.match(/\/products\//g) || []).length <= 5);

  // Extract product links
  const productLinkRegex =
    /href=["']((?:https?:\/\/[^"']*)?\/products\/([^"'#?]+))["']/gi;
  const seen = new Set<string>();
  const products: Array<{ url: string; slug: string; image: string }> = [];

  let match;
  while (
    (match = productLinkRegex.exec(html)) !== null &&
    products.length < 20
  ) {
    let href = match[1];
    const rawSlug = match[2];
    if (href.startsWith("/")) {
      href = `${origin}${href}`;
    }
    try {
      const parsed = new URL(href);
      const clean = `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/$/, "")}`;
      if (seen.has(clean)) continue;
      seen.add(clean);

      const slug = rawSlug?.replace(/-/g, " ").replace(/\//g, "").trim();
      if (!slug) continue;

      // Try to find a nearby image in the HTML
      const linkPos = match.index;
      const neighborhood = html.slice(
        Math.max(0, linkPos - 1500),
        linkPos + 1500
      );
      const imgMatch = neighborhood.match(
        /(?:src|data-src)=["']((?:https?:)?\/\/[^"'\s]+?\.(?:jpg|jpeg|png|webp|avif)[^"'\s]*)/i
      );
      let image = imgMatch?.[1] || "";
      if (image.startsWith("//")) image = `https:${image}`;

      products.push({ url: clean, slug, image });
    } catch {
      continue;
    }
  }

  return { products, storeName, isProductPage };
}
