import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { Resend } from "resend";
import { db } from "@/db";
import { reports as reportsTable, subscribers } from "@/db/schema";

const DATA_DIR = path.join(process.cwd(), "data");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");

const resend = new Resend(process.env.RESEND_API_KEY);

interface CategoryScores {
  title: number;
  images: number;
  pricing: number;
  socialProof: number;
  cta: number;
  description: number;
  trust: number;
}

function getSeverityLabel(catScore: number): string {
  if (catScore < 4) return "Critical";
  if (catScore <= 6) return "Moderate";
  return "Minor";
}

function getSeverityColor(catScore: number): string {
  if (catScore < 4) return "#f87171"; // red
  if (catScore <= 6) return "#fbbf24"; // yellow
  return "#4ade80"; // green
}

function getRevenueImpact(catScore: number): string {
  if (catScore < 4) return `$${150 + Math.round(Math.random() * 150)}`;
  if (catScore <= 6) return `$${80 + Math.round(Math.random() * 70)}`;
  return `$${30 + Math.round(Math.random() * 50)}`;
}

function buildFixListEmail(
  score: number,
  tips: string[],
  categories: CategoryScores
): string {
  // Build leak items sorted by worst score
  const entries = Object.entries(categories) as [string, number][];
  entries.sort((a, b) => a[1] - b[1]);

  const items = entries.slice(0, 7).map((entry, i) => {
    const [, catScore] = entry;
    const severity = getSeverityLabel(catScore);
    const color = getSeverityColor(catScore);
    const impact = getRevenueImpact(catScore);
    const tip = tips[i] || "Review and optimize this area for better conversions.";
    // Create a fix suggestion from the tip
    const fix = tip;

    return `
      <tr><td style="padding:16px 0;border-bottom:1px solid #262626;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:top;width:32px;padding-right:12px;">
              <span style="display:inline-block;width:28px;height:28px;border-radius:50%;background-color:${color}20;color:${color};font-size:14px;font-weight:700;text-align:center;line-height:28px;">${i + 1}</span>
            </td>
            <td>
              <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;color:${color};background-color:${color}15;margin-bottom:6px;">${severity}</span>
              <p style="margin:4px 0 6px;color:#ededed;font-size:15px;font-weight:600;">${fix}</p>
              <p style="margin:0;color:#fbbf24;font-size:13px;font-weight:500;">Est. impact: ~${impact}/mo</p>
            </td>
          </tr>
        </table>
      </td></tr>`;
  });

  const tipCount = Math.min(tips.length, 7);

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

        <!-- Main card -->
        <tr><td style="background-color:#141414;border:1px solid #262626;border-radius:12px;padding:40px 32px;">
          <!-- Headline -->
          <h1 style="margin:0 0 32px;color:#ededed;font-size:24px;font-weight:700;text-align:center;">Your conversion fix list</h1>

          <!-- Big score -->
          <div style="text-align:center;margin:0 0 32px;">
            <span style="font-size:80px;font-weight:800;color:#818cf8;line-height:1;">${score}</span>
            <span style="font-size:24px;color:#737373;font-weight:600;">/100</span>
          </div>

          <!-- Fix list -->
          <table width="100%" cellpadding="0" cellspacing="0">
            ${items.join("")}
          </table>

          <!-- Pro trial CTA -->
          <div style="margin:40px 0 0;padding:24px;background-color:#818cf810;border:1px solid #818cf830;border-radius:12px;text-align:center;">
            <h3 style="margin:0 0 8px;color:#ededed;font-size:16px;font-weight:700;">Try PageScore Pro for $1</h3>
            <p style="margin:0 0 16px;color:#a1a1aa;font-size:13px;">Monthly re-scans, competitor benchmarks, fix tracking. Cancel anytime.</p>
            <a href="https://alpo.ai/#upgrade" style="display:inline-block;padding:14px 32px;background-color:#818cf8;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;">
              Claim $1 Trial &rarr;
            </a>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:32px 0 0;text-align:center;">
          <p style="margin:0;color:#525252;font-size:12px;">PageScore &bull; alpo.ai</p>
          <p style="margin:8px 0 0;color:#525252;font-size:11px;">You received this because you requested a scan report. <a href="#" style="color:#525252;">Unsubscribe</a></p>
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
    // Best-effort directory + file ops — may be read-only on Vercel serverless
    let reports: unknown[] = [];
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const existing = await fs.readFile(REPORTS_FILE, "utf-8");
      reports = JSON.parse(existing);
    } catch {
      // Directory or file doesn't exist, or filesystem is read-only — continue
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
    // Best-effort write — silently skip if filesystem is read-only (e.g. Vercel serverless)
    try {
      await fs.writeFile(REPORTS_FILE, JSON.stringify(reports, null, 2));
    } catch {
      // Non-fatal — email still sends
    }

    const tipCount = Math.min((tips || []).length, 7);

    // Send email via Resend
    await resend.emails.send({
      from: "PageScore <onboarding@resend.dev>",
      to: email,
      subject: `${tipCount} fixes for your ${score}/100 product page`,
      html: buildFixListEmail(score, tips || [], categories || {}),
    });

    // Fire-and-forget: persist to Postgres
    db.insert(reportsTable).values({
      email, url, score,
      summary: summary || null,
      tips: tips || null,
      categories: categories || null,
      productPrice: body.productPrice?.toString() || null,
      productCategory: body.productCategory || null,
      estimatedVisitors: body.estimatedVisitors || null,
    }).catch(e => console.error("DB insert error:", e));

    db.insert(subscribers).values({
      email,
      firstScanUrl: url,
      firstScanScore: score,
    }).onConflictDoNothing().catch(e => console.error("Subscriber insert error:", e));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Request report error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
