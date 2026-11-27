import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called every few minutes by netlify/functions/keep-warm.mjs when KEEP_WARM=on. It starts the app (if it has gone to sleep)
// and makes one trivial database query, so the next real visitor doesn't wait for a cold start. Reveals nothing.
export async function GET() {
  try {
    await queryOne("SELECT 1");
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
