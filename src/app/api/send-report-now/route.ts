import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function buildFullReport(score: number, tips: string[], categories: Record<string, number>): string {
  const scoreColor = score >= 70 ? "#16A34A" : score >= 40 ? "#D97706" : "#DC2626";

  const categoryLabels: Record<string, string> = {
    pageSpeed: "Page Speed", images: "Product Images", socialProof: "Reviews & Social Proof",
    checkout: "Checkout & Payments", mobileCta: "Mobile CTA & UX", title: "Title & SEO",
    aiDiscoverability: "AI Discoverability", structuredData: "Schema Markup",
    pricing: "Pricing Psychology", description: "Description Quality",
    shipping: "Shipping Transparency", crossSell: "Cross-Sell & Upsell",
    cartRecovery: "Cart Recovery", trust: "Trust & Guarantees",
    merchantFeed: "Merchant Feed", socialCommerce: "Social Commerce",
    sizeGuide: "Size & Fit", variantUx: "Variant UX", accessibility: "Accessibility",
    contentFreshness: "Content Freshness",
  };

  const impactLevels: Record<string, string> = {
    pageSpeed: "🔴 Very High", images: "🔴 Very High", socialProof: "🔴 Very High",
    checkout: "🔴 Very High", mobileCta: "🟠 High", title: "🟠 High",
    aiDiscoverability: "🟠 High", structuredData: "🟠 High", pricing: "🟠 High",
    description: "🟡 Medium-High", shipping: "🟡 Medium-High", crossSell: "🟡 Medium-High",
    cartRecovery: "🟡 Medium-High", trust: "🟢 Medium", merchantFeed: "🟢 Medium",
    socialCommerce: "🟢 Medium", sizeGuide: "🟢 Medium", variantUx: "🟢 Medium",
    accessibility: "⚪ Low-Medium", contentFreshness: "⚪ Low-Medium",
  };

  // Sort categories worst-first
  const sorted = Object.entries(categories || {}).sort((a, b) => (a[1] as number) - (b[1] as number));

  const categoryRows = sorted.map(([key, val]) => {
    const catScore = Number(val) || 0;
    const color = catScore >= 70 ? "#16A34A" : catScore >= 40 ? "#D97706" : "#DC2626";
    const label = categoryLabels[key] || key;
    const impact = impactLevels[key] || "Medium";
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #F3F4F6;font-size:14px;color:#374151;">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #F3F4F6;text-align:center;"><span style="font-weight:700;color:${color};font-size:16px;">${catScore}</span><span style="color:#9CA3AF;font-size:12px;">/100</span></td>
      <td style="padding:10px 12px;border-bottom:1px solid #F3F4F6;font-size:12px;color:#6B7280;">${impact}</td>
    </tr>`;
  }).join("");

  const tipItems = (tips || []).slice(0, 20).map((t, i) =>
    `<li style="margin-bottom:10px;color:#374151;font-size:14px;line-height:1.5;">${i + 1}. ${escapeHtml(String(t))}</li>`
  ).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F7F4;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:48px 20px;">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">
  <tr><td style="text-align:center;padding-bottom:32px;">
    <span style="font-size:20px;font-weight:700;color:#111111;">alpo.ai</span>
    <span style="font-size:12px;color:#9CA3AF;margin-left:8px;">Priority Report</span>
  </td></tr>
  <tr><td style="background:#fff;border:1.5px solid #E5E7EB;border-radius:12px;padding:40px 36px;">
    <div style="text-align:center;margin-bottom:32px;">
      <p style="margin:0 0 8px;font-size:13px;color:#9E9E9E;text-transform:uppercase;letter-spacing:0.05em;">Overall Score</p>
      <span style="font-size:72px;font-weight:800;color:${scoreColor};line-height:1;">${score}</span>
      <span style="font-size:20px;color:#9E9E9E;">/100</span>
    </div>

    <h2 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#111111;">All 20 Dimensions Scored</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin-bottom:32px;">
      <tr style="background:#F9FAFB;">
        <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">Dimension</th>
        <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;">Score</th>
        <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;">Revenue Impact</th>
      </tr>
      ${categoryRows}
    </table>

    <h2 style="margin:0 0 16px;font-size:18px;font-weight:700;color:#111111;">Your Fix List</h2>
    <ul style="margin:0;padding:0;list-style:none;">
      ${tipItems}
    </ul>

    <div style="margin-top:32px;padding:24px;background:#EFF6FF;border-radius:8px;text-align:center;">
      <p style="margin:0 0 4px;font-size:15px;color:#111111;font-weight:600;">Want weekly monitoring?</p>
      <p style="margin:0 0 16px;font-size:14px;color:#6B6B6B;">Get alerted when your scores drop. Track all 20 dimensions over time.</p>
      <a href="https://alpo.ai" style="display:inline-block;padding:12px 28px;background:#7C3AED;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Coming Soon — Join Waitlist</a>
    </div>
  </td></tr>
  <tr><td style="text-align:center;padding-top:24px;">
    <p style="color:#9CA3AF;font-size:12px;">alpo.ai by alpo.ai — Stop losing sales to fixable page issues.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  try {
    const { email, url, score, tips, categories } = await req.json();

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const safeScore = Math.min(100, Math.max(0, Number(score) || 0));
    const safeTips = Array.isArray(tips) ? tips.map((t: unknown) => String(t).slice(0, 300)).slice(0, 20) : [];
    const safeCats = (categories && typeof categories === "object") ? categories as Record<string, number> : {};

    const { error: emailError } = await resend.emails.send({
      from: "alpo.ai <noreply@alpo.ai>",
      to: email.trim(),
      subject: `Your product page scored ${safeScore}/100 — full report with all 20 dimensions`,
      html: buildFullReport(safeScore, safeTips, safeCats),
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      return NextResponse.json({ error: "Failed to send" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("send-report-now error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
