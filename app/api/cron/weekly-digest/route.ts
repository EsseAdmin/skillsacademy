import { NextRequest, NextResponse } from "next/server";
import { sendWeeklyDigests } from "@/lib/analyticsDigest";
import { tokenMatches } from "@/lib/cronToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called every Monday morning by netlify/functions/weekly-digest.mjs. Requires
// "Authorization: Bearer <token>" (see lib/cronToken.ts); anything else is a 401.
async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!tokenMatches(token)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const result = await sendWeeklyDigests(req.nextUrl.origin);
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
