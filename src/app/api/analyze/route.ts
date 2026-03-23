import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scans } from "@/db/schema";

export const maxDuration = 60; // Extend Vercel function timeout to 60s for reasoning model

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Fetch the page HTML
    let html: string;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; PageScore/1.0; +https://pagescore.app)",
        },
        signal: AbortSignal.timeout(10000),
      });
      html = await res.text();
    } catch {
      return NextResponse.json(
        { error: "Could not fetch that URL. Make sure it's accessible." },
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
- "categories": scores 0-10 for: title, images, pricing, socialProof, cta, description, trust
- "productPrice": extract the product price as a number (e.g. 49.99). Return 0 if not found.
- "productCategory": one of: "fashion", "electronics", "beauty", "home", "food", "fitness", "jewelry", "other"
- "estimatedMonthlyVisitors": your best estimate of monthly visitors based on page signals (brand size, product type, reviews count). Return as number: 500 for small stores, 2000 for medium, 10000 for large brands.

Score criteria (be STRICT):
- Title (0-10): Does it have product name + key benefit + material/spec? Generic names = 3 or less
- Images (0-10): Multiple angles? Lifestyle shots? On-model? Zoom? Pure white bg only = 4 or less
- Pricing (0-10): Price anchor? Was/now pricing? Bundle offers? Just one price = 5
- Social proof (0-10): Reviews visible above fold? Count shown? Star rating? No reviews = 2 or less
- CTA (0-10): Prominent? Above fold on mobile? Urgency? Color contrast? Just "Add to Cart" = 5
- Description (0-10): Benefits first? Scannable? Bullet points? Wall of text = 3 or less
- Trust (0-10): Guarantees? Returns policy visible? Secure badges? None visible = 3 or less

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
        model: "minimax/minimax-m2.7",
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
    // minimax-m2.7 is a reasoning model — content may be null while reasoning is populated
    const msg = aiData.choices?.[0]?.message || {};
    const content = msg.content || msg.reasoning || "";

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse analysis" },
        { status: 500 }
      );
    }

    const result = JSON.parse(jsonMatch[0]);

    const response = {
      score: Math.min(100, Math.max(0, Number(result.score) || 50)),
      summary: result.summary || "Analysis complete.",
      tips: (result.tips || []).slice(0, 3),
      categories: result.categories || {},
      productPrice: Number(result.productPrice) || 0,
      productCategory: result.productCategory || "other",
      estimatedMonthlyVisitors: Number(result.estimatedMonthlyVisitors) || 1000,
    };

    // Fire-and-forget: persist scan to Postgres
    db.insert(scans).values({
      url,
      score: response.score,
      productCategory: response.productCategory || null,
      productPrice: response.productPrice?.toString() || null,
    }).catch(e => console.error("Scan insert error:", e));

    return NextResponse.json(response);
  } catch (err) {
    console.error("Analyze error:", err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
