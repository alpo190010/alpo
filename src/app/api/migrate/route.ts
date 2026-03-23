import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(req: NextRequest) {
  if (req.headers.get("x-migrate-secret") !== "pagescore2024") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text,
      url text,
      score int,
      summary text,
      tips jsonb,
      categories jsonb,
      product_price numeric,
      product_category text,
      estimated_visitors int,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS subscribers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text UNIQUE,
      first_scan_url text,
      first_scan_score int,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS scans (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      url text,
      score int,
      product_category text,
      product_price numeric,
      created_at timestamptz DEFAULT now()
    );
  `);

  return NextResponse.json({ success: true });
}
