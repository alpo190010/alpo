import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  if (req.headers.get("x-migrate-secret") !== "pagescore2024") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Tables already exist — use `drizzle-kit push` for future schema changes
  return NextResponse.json({ success: true, message: "Use drizzle-kit push for migrations" });
}
