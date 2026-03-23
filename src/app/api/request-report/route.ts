import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { Resend } from "resend";

const DATA_DIR = path.join(process.cwd(), "data");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");

const resend = new Resend(process.env.RESEND_API_KEY);

function buildEmailHtml(score: number, tips: string[], token: string): string {
  const reportUrl = `https://alpo.ai/report/${token}`;
  const tipsHtml = tips
    .slice(0, 3)
    .map((t) => `<li style="margin-bottom:8px;color:#a1a1aa;">${t}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0f0f0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f0f0f;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr><td style="padding:0 0 32px;text-align:center;">
          <span style="color:#818cf8;font-size:18px;font-weight:700;letter-spacing:-0.5px;">PageScore</span>
        </td></tr>
        <!-- Score card -->
        <tr><td style="background-color:#141414;border:1px solid #262626;border-radius:12px;padding:40px 32px;text-align:center;">
          <h1 style="margin:0 0 8px;color:#ededed;font-size:22px;font-weight:700;">Your product page analysis is ready</h1>
          <p style="margin:0 0 32px;color:#737373;font-size:14px;">Here's a preview of what we found.</p>
          <!-- Big score -->
          <div style="margin:0 0 32px;">
            <span style="font-size:72px;font-weight:800;color:#818cf8;line-height:1;">${score}</span>
            <span style="font-size:24px;color:#737373;font-weight:600;">/100</span>
          </div>
          <!-- Findings -->
          <div style="text-align:left;margin:0 0 32px;">
            <h3 style="margin:0 0 12px;color:#ededed;font-size:14px;font-weight:600;">Key findings:</h3>
            <ul style="margin:0;padding:0 0 0 20px;font-size:14px;line-height:1.7;">
              ${tipsHtml}
            </ul>
          </div>
          <!-- CTA -->
          <a href="${reportUrl}" style="display:inline-block;padding:14px 32px;background-color:#818cf8;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;">
            View Full Report &rarr;
          </a>
          <p style="margin:16px 0 0;color:#737373;font-size:12px;">10 sections &bull; prioritized fixes &bull; action plan</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:32px 0 0;text-align:center;">
          <p style="margin:0;color:#525252;font-size:12px;">PageScore &bull; alpo.ai</p>
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

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const token = crypto.randomUUID();

    // Ensure data directory exists
    await fs.mkdir(DATA_DIR, { recursive: true });

    // Read existing reports
    let reports: unknown[] = [];
    try {
      const existing = await fs.readFile(REPORTS_FILE, "utf-8");
      reports = JSON.parse(existing);
    } catch {
      // File doesn't exist yet
    }

    const entry = {
      id: token,
      email,
      url,
      score,
      summary,
      tips,
      categories,
      timestamp: new Date().toISOString(),
      used: false,
    };

    reports.push(entry);
    await fs.writeFile(REPORTS_FILE, JSON.stringify(reports, null, 2));

    // Send email via Resend
    await resend.emails.send({
      from: "PageScore <onboarding@resend.dev>",
      to: email,
      subject: `Your Shopify product page scored ${score}/100`,
      html: buildEmailHtml(score, tips || [], token),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Request report error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
