import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/token
 *
 * Returns the raw JWT session cookie so client-side code can forward it
 * as a Bearer token to the FastAPI backend.
 *
 * Auth.js v5 stores the JWT in `authjs.session-token` (HTTP) or
 * `__Secure-authjs.session-token` (HTTPS).
 */
export async function GET(request: NextRequest) {
  const token =
    request.cookies.get("authjs.session-token")?.value ??
    request.cookies.get("__Secure-authjs.session-token")?.value ??
    null;

  return NextResponse.json({ token });
}
