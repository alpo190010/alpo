import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/db";
import { reports, subscribers } from "@/db/schema";

const resend = new Resend(process.env.RESEND_API_KEY);

function buildEmail(score: number, tips: string[]): string {
  const scoreColor = score >= 70 ? "#16A34A" : score >= 40 ? "#D97706" : "#DC2626";
  const tipItems = (tips || []).slice(0, 7).map((t, i) =>
    `<li style="margin-bottom:12px;color:#374151;font-size:15px;line-height:1.5;">${i + 1}. ${t}</li>`
  ).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F7F4;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:48px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="text-align:center;padding-bottom:32px;">
    <span style="font-size:20px;font-weight:700;color:#111111;">PageScore</span>
  </td></tr>
  <tr><td style="background:#fff;border:1.5px solid #E5E7EB;border-radius:12px;padding:40px 36px;">
    <p style="margin:0 0 8px;font-size:13px;color:#9E9E9E;text-transform:uppercase;letter-spacing:0.05em;">Your conversion audit</p>
    <div style="text-align:center;margin:24px 0;">
      <span style="font-size:80px;font-weight:800;color:${scoreColor};line-height:1;">${score}</span>
      <span style="font-size:20px;color:#9E9E9E;">/100</span>
    </div>
    <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#111111;">Your fix list:</h2>
    <ul style="margin:0;padding:0;list-style:none;">
      ${tipItems}
    </ul>
    <div style="margin-top:32px;padding:24px;background:#EFF6FF;border-radius:8px;text-align:center;">
      <p style="margin:0 0 4px;font-size:15px;color:#111111;font-weight:600;">Want weekly monitoring + AI rewrites?</p>
      <p style="margin:0 0 16px;font-size:14px;color:#6B6B6B;">Get alerted when your score drops and get AI fixes automatically.</p>
      <a href="https://alpo.ai" style="display:inline-block;padding:12px 28px;background:#2563EB;color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Upgrade to Pro — $49/mo</a>
    </div>
  </td></tr>
  <tr><td style="text-align:center;padding-top:24px;">
    <p style="margin:0;font-size:12px;color:#9E9E9E;">PageScore · alpo.ai</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, url, score, summary, tips, categories } = body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Send email
    const { error: emailError } = await resend.emails.send({
      from: "PageScore <onboarding@resend.dev>",
      to: email,
      subject: `Your product page scored ${score}/100 — here are your fixes`,
      html: buildEmail(score, tips || []),
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
    }

    // Save to DB (non-blocking)
    db.insert(reports).values({
      email, url, score,
      summary: summary || null,
      tips: tips || null,
      categories: categories || null,
    }).catch(e => console.error("reports insert:", e));

    db.insert(subscribers).values({
      email,
      firstScanUrl: url,
      firstScanScore: score,
    }).onConflictDoNothing().catch(e => console.error("subscribers insert:", e));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("request-report error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
