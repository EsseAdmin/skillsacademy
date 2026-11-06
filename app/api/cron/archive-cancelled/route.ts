import { NextRequest, NextResponse } from "next/server";
import { archiveDueAcademies } from "@/lib/archiveCancelled";
import { tokenMatches } from "@/lib/cronToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called every 15 minutes by netlify/functions/archive-cancelled.mjs. Requires
// "Authorization: Bearer <token>" (see lib/cronToken.ts); anything else is a 401.
async function handle(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!tokenMatches(token)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { archived } = await archiveDueAcademies();
  return NextResponse.json({ ok: true, archived });
}

export const GET = handle;
export const POST = handle;
