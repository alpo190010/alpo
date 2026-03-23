import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");

interface Report {
  id: string;
  email: string;
  url: string;
  score: number;
  summary: string;
  tips: string[];
  categories: Record<string, number>;
  timestamp: string;
  used: boolean;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const data = await fs.readFile(REPORTS_FILE, "utf-8");
    const reports: Report[] = JSON.parse(data);
    const report = reports.find((r) => r.id === token);

    if (!report) {
      return NextResponse.json({ error: "Report not found or expired" }, { status: 404 });
    }

    // Mark as used
    if (!report.used) {
      report.used = true;
      await fs.writeFile(REPORTS_FILE, JSON.stringify(reports, null, 2));
    }

    return NextResponse.json(report);
  } catch {
    return NextResponse.json({ error: "Report not found or expired" }, { status: 404 });
  }
}
