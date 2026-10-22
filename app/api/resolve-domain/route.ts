import { NextRequest, NextResponse } from "next/server";
import { Academies } from "@/lib/queries";

// Internal-use endpoint that proxy.ts calls to resolve an incoming request's
// Host header to a verified academy slug, so a custom domain can be routed
// to that academy's content. It's kept as a small, ordinary Node.js route
// handler (rather than doing the lookup inside middleware itself) because
// Next.js middleware can run on a restricted "Edge" runtime depending on
// the deployment target — Netlify Edge Functions in particular don't
// support the raw TCP socket the `pg` driver needs to reach Postgres.
// Calling this route over `fetch()` from middleware works everywhere.
//
// The response only ever reveals a slug for an academy whose domain has
// already been verified — and that academy's page is public at
// skillsacademy.ai/a/{slug} regardless, so there's no new information
// disclosure here worth gating behind auth.
export async function GET(req: NextRequest) {
  const host = req.nextUrl.searchParams.get("host")?.toLowerCase().trim();
  if (!host) return NextResponse.json({ slug: null }, { status: 400 });

  const academy = await Academies.byCustomDomain(host);
  return NextResponse.json(
    { slug: academy?.slug ?? null },
    { headers: { "Cache-Control": "private, max-age=30" } }
  );
}
