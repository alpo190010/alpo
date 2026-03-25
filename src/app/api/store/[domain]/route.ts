import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { stores, storeProducts, productAnalyses } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ domain: string }> }
) {
  const { domain } = await params;

  if (!domain) {
    return NextResponse.json({ error: "Domain is required" }, { status: 400 });
  }

  try {
    // 1. Look up the store by domain
    const storeRows = await db
      .select()
      .from(stores)
      .where(eq(stores.domain, domain));

    if (storeRows.length === 0) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const store = storeRows[0];

    // 2. Get all products for this store, ordered by creation time
    const products = await db
      .select()
      .from(storeProducts)
      .where(eq(storeProducts.storeId, store.id))
      .orderBy(asc(storeProducts.createdAt));

    // 3. Get all analyses for products on this domain
    const analysisRows = await db
      .select()
      .from(productAnalyses)
      .where(eq(productAnalyses.storeDomain, domain));

    // 4. Build analyses map keyed by productUrl for fast frontend lookup
    const analyses: Record<string, {
      id: string;
      score: number;
      summary: string | null;
      tips: unknown;
      categories: unknown;
      productPrice: string | null;
      productCategory: string | null;
      estimatedMonthlyVisitors: number | null;
      updatedAt: Date | null;
    }> = {};

    for (const row of analysisRows) {
      analyses[row.productUrl] = {
        id: row.id,
        score: row.score,
        summary: row.summary,
        tips: row.tips,
        categories: row.categories,
        productPrice: row.productPrice,
        productCategory: row.productCategory,
        estimatedMonthlyVisitors: row.estimatedMonthlyVisitors,
        updatedAt: row.updatedAt,
      };
    }

    return NextResponse.json({
      store: {
        id: store.id,
        domain: store.domain,
        name: store.name,
        updatedAt: store.updatedAt,
      },
      products: products.map((p) => ({
        id: p.id,
        url: p.url,
        slug: p.slug,
        image: p.image,
      })),
      analyses,
    });
  } catch (error) {
    console.error("[store/domain] Failed to fetch store data:", error);
    return NextResponse.json(
      { error: "Failed to fetch store data" },
      { status: 500 }
    );
  }
}
