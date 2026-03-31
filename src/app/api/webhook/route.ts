import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { emailPalette } from "@/lib/email-palette";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET || "";

    // Verify signature
    const signature = req.headers.get("x-signature") || "";
    const hmac = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    if (signature !== hmac) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody);
    const eventName = body.meta?.event_name;

    if (eventName !== "order_created") {
      return NextResponse.json({ ok: true });
    }

    const email = body.data?.attributes?.user_email;
    const customData = body.meta?.custom_data || {};
    const pageUrl = customData.url;

    if (!email || !pageUrl) {
      console.error("Missing email or URL in webhook", { email, pageUrl });
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    // Generate full report
    const report = await generateFullReport(pageUrl);

    // Send via email (using Resend)
    await sendReportEmail(email, pageUrl, report);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}

async function generateFullReport(url: string): Promise<string> {
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; alpo.ai/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    html = await res.text();
  } catch {
    return "Error: Could not fetch the provided URL.";
  }

  const truncated = html.slice(0, 30000);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "Error: Server configuration issue.";

  const prompt = `You are an elite landing page consultant who has optimized hundreds of high-converting pages. Provide a comprehensive, brutally honest analysis of this landing page.

Structure your report with these 10 sections:

1. **COPY TEARDOWN** — Analyze headline, subheadline, body copy, and CTAs. Are they clear, benefit-driven, and compelling?

2. **SEO AUDIT** — Check meta title, description, headings structure, alt text, and keyword usage.

3. **CRO OPPORTUNITIES** — Identify conversion blockers. Is the value prop clear above the fold? Any friction in the flow?

4. **DESIGN REVIEW** — Visual hierarchy, whitespace usage, color contrast, font choices, layout effectiveness.

5. **ACCESSIBILITY** — WCAG issues, color contrast, form labels, alt text, keyboard navigation hints.

6. **PERFORMANCE** — Image optimization, script loading, render-blocking resources, estimated impact.

7. **MOBILE UX** — Responsive design issues, touch targets, viewport settings, mobile-first considerations.

8. **TRUST SIGNALS** — Social proof, testimonials, guarantees, security badges, credibility indicators.

9. **COMPETITOR POSITIONING** — How well does the page differentiate? Is the unique value proposition clear?

10. **PRIORITIZED ACTION PLAN** — Top 10 changes ranked by impact and effort. Quick wins first.

For each section, give:
- Current state assessment (what's there now)
- Specific issues found
- Exact recommendations to fix them

Be specific. Reference actual text and elements from the page. No generic advice.

URL: ${url}
HTML:
${truncated}`;

  const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-5.4-nano",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 4000,
    }),
  });

  if (!aiRes.ok) {
    console.error("OpenAI error:", await aiRes.text());
    return "Error generating report. Our team has been notified.";
  }

  const aiData = await aiRes.json();
  return aiData.choices?.[0]?.message?.content || "Report generation failed.";
}

async function sendReportEmail(
  email: string,
  url: string,
  report: string
): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error("No Resend API key configured");
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "alpo.ai <report@alpo.com>",
      to: email,
      subject: `Your alpo.ai Report: ${url}`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 680px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 24px; margin-bottom: 8px;">Your alpo.ai Report</h1>
          <p style="color: ${emailPalette.textMuted}; margin-bottom: 32px;">Analysis for: <a href="${url}">${url}</a></p>
          <div style="white-space: pre-wrap; line-height: 1.6;">${report.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</div>
          <hr style="margin: 40px 0; border: none; border-top: 1px solid ${emailPalette.divider};">
          <p style="color: ${emailPalette.textTertiary}; font-size: 12px;">Generated by alpo.ai — AI Landing Page Analyzer</p>
        </div>
      `,
    }),
  });
}
