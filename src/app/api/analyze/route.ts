import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scans, productAnalyses } from "@/db/schema";

export const maxDuration = 60; // Extend Vercel function timeout to 60s for reasoning model

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL format and prevent SSRF
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "Only HTTP/HTTPS URLs are supported" }, { status: 400 });
    }

    // Block internal/private IPs
    const hostname = parsedUrl.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.startsWith("127.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("172.") ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local") ||
      hostname === "[::1]"
    ) {
      return NextResponse.json({ error: "Internal URLs are not allowed" }, { status: 400 });
    }

    // Cap URL length
    if (url.length > 2048) {
      return NextResponse.json({ error: "URL is too long" }, { status: 400 });
    }

    // Fetch the page HTML (limit redirects to prevent loops)
    let html: string;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `Page returned ${res.status}. Make sure the URL is correct and publicly accessible.` },
          { status: 400 }
        );
      }
      html = await res.text();
    } catch {
      return NextResponse.json(
        { error: "Could not fetch that URL. Make sure it's accessible and not behind a login." },
        { status: 400 }
      );
    }

    // Reject empty/tiny pages
    if (html.length < 100) {
      return NextResponse.json(
        { error: "Page appears to be empty or too small to analyze." },
        { status: 400 }
      );
    }

    // Truncate HTML to keep tokens reasonable
    const truncated = html.slice(0, 15000);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const prompt = `You are a ruthless e-commerce conversion expert. You have analyzed thousands of Shopify product pages. You are HONEST and SPECIFIC — you never give vague feedback.

Analyze this HTML for a Shopify product page. Return a JSON object with:
- "score": number 0-100 (conversion effectiveness — be harsh, most pages score 40-65)
- "summary": one punchy sentence about the biggest issue (max 20 words, be specific)
- "tips": array of exactly 3 specific fixes — each must reference actual content on THIS page (max 30 words each). No generic advice.
- "categories": scores 0-100 for: title, images, pricing, socialProof, cta, description, trust
- "productPrice": extract the product price as a number (e.g. 49.99). Return 0 if not found.
- "productCategory": one of: "fashion", "electronics", "beauty", "home", "food", "fitness", "jewelry", "other"
- "estimatedMonthlyVisitors": your best estimate of monthly visitors based on page signals (brand size, product type, reviews count). Return as number: 500 for small stores, 2000 for medium, 10000 for large brands.

Score criteria (be STRICT):
- Title (0-100): Does it have product name + key benefit + material/spec? Generic names = 30 or less
- Images (0-100): Multiple angles? Lifestyle shots? On-model? Zoom? Pure white bg only = 40 or less
- Pricing (0-100): Price anchor? Was/now pricing? Bundle offers? Just one price = 50
- Social proof (0-100): Reviews visible above fold? Count shown? Star rating? No reviews = 20 or less
- CTA (0-100): Prominent? Above fold on mobile? Urgency? Color contrast? Just "Add to Cart" = 50
- Description (0-100): Benefits first? Scannable? Bullet points? Wall of text = 30 or less
- Trust (0-100): Guarantees? Returns policy visible? Secure badges? None visible = 30 or less

If the page is a 404 or error, return score: 0.

Return ONLY valid JSON. No markdown, no explanation.

HTML:
${truncated}`;

    const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "minimax/minimax-m2.5",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!aiRes.ok) {
      console.error("OpenAI error:", await aiRes.text());
      return NextResponse.json(
        { error: "AI analysis failed" },
        { status: 500 }
      );
    }

    const aiData = await aiRes.json();
    // Extract content from response
    const msg = aiData.choices?.[0]?.message || {};
    const content = msg.content || msg.reasoning || "";

    // Parse JSON from response (safely)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "AI returned an unexpected format. Please try again." },
        { status: 500 }
      );
    }

    let result: Record<string, unknown>;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response. Please try again." },
        { status: 500 }
      );
    }

    // Defensive: ensure all category keys exist as numbers 0-100
    const rawCats = (result.categories || {}) as Record<string, unknown>;
    const clampScore = (v: unknown) => Math.min(100, Math.max(0, Number(v) || 0));
    const safeCategories = {
      title: clampScore(rawCats.title),
      images: clampScore(rawCats.images),
      pricing: clampScore(rawCats.pricing),
      socialProof: clampScore(rawCats.socialProof),
      cta: clampScore(rawCats.cta),
      description: clampScore(rawCats.description),
      trust: clampScore(rawCats.trust),
    };

    const response = {
      score: Math.min(100, Math.max(0, Number(result.score) || 50)),
      summary: String(result.summary || "Analysis complete.").slice(0, 200),
      tips: (Array.isArray(result.tips) ? result.tips : []).map((t: unknown) => String(t).slice(0, 300)).slice(0, 7),
      categories: safeCategories,
      productPrice: Math.max(0, Number(result.productPrice) || 0),
      productCategory: String(result.productCategory || "other"),
      estimatedMonthlyVisitors: Math.max(0, Number(result.estimatedMonthlyVisitors) || 1000),
    };

    // Persist scan to Postgres (blocking — surface errors)
    try {
      await db.insert(scans).values({
        url,
        score: response.score,
        productCategory: response.productCategory || null,
        productPrice: response.productPrice?.toString() || null,
      });
    } catch (dbErr) {
      console.error("DB scan insert error:", dbErr);
    }

    // Persist full analysis to product_analyses (upsert by productUrl)
    let analysisId: string | null = null;
    try {
      const storeDomain = parsedUrl.hostname;
      const [row] = await db
        .insert(productAnalyses)
        .values({
          productUrl: url,
          storeDomain,
          score: response.score,
          summary: response.summary,
          tips: response.tips,
          categories: response.categories,
          productPrice: response.productPrice?.toString() || null,
          productCategory: response.productCategory || null,
          estimatedMonthlyVisitors: response.estimatedMonthlyVisitors,
        })
        .onConflictDoUpdate({
          target: productAnalyses.productUrl,
          set: {
            storeDomain,
            score: response.score,
            summary: response.summary,
            tips: response.tips,
            categories: response.categories,
            productPrice: response.productPrice?.toString() || null,
            productCategory: response.productCategory || null,
            estimatedMonthlyVisitors: response.estimatedMonthlyVisitors,
            updatedAt: new Date(),
          },
        })
        .returning({ id: productAnalyses.id });
      analysisId = row.id;
    } catch (dbErr) {
      console.error("DB product analysis upsert error:", dbErr);
    }

    return NextResponse.json({ ...response, analysisId });
  } catch (err) {
    console.error("Analyze error:", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
