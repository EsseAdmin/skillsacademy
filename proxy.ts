import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { isPlatformHost } from "@/lib/platformDomains";

const SESSION_COOKIE = "sa_session";
const secretKey = process.env.AUTH_SECRET || "skillsacademy-dev-secret-change-me-in-production";
const key = new TextEncoder().encode(secretKey);

async function readSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    return payload as { role: string; academySlug: string | null };
  } catch {
    return null;
  }
}

// Best-effort, per-instance cache mapping a custom domain hostname to the
// academy slug it resolves to (or null if it isn't connected to any
// verified academy). See app/api/resolve-domain/route.ts for why this is
// a fetch() call rather than a direct DB query from here. The cache just
// amortizes that extra hop — a cold instance, a new region, or an expired
// entry simply takes the slow path once and is never incorrect.
const DOMAIN_CACHE_TTL_MS = 60_000;
const domainCache = new Map<string, { slug: string | null; expires: number }>();

async function resolveCustomDomain(req: NextRequest, host: string): Promise<string | null> {
  const cached = domainCache.get(host);
  if (cached && cached.expires > Date.now()) return cached.slug;

  try {
    const url = new URL("/api/resolve-domain", req.nextUrl.origin);
    url.searchParams.set("host", host);
    const res = await fetch(url);
    const slug = res.ok ? ((await res.json()) as { slug: string | null }).slug : null;
    domainCache.set(host, { slug, expires: Date.now() + DOMAIN_CACHE_TTL_MS });
    return slug;
  } catch {
    // Lookup failed (network hiccup, cold start, etc.) — fail safe by
    // falling back to any (possibly stale) cached value rather than
    // blocking the request or throwing out of middleware.
    return cached?.slug ?? null;
  }
}

export async function proxy(req: NextRequest) {
  let pathname = req.nextUrl.pathname;
  const host = req.headers.get("host") || req.nextUrl.hostname;

  // If this request arrived on a domain that isn't the platform's own
  // (skillsacademy.ai, the Netlify default domain, localhost, etc.), see
  // if it's a verified custom domain for some academy. If so, everything
  // below runs as if the request had come in on skillsacademy.ai/a/{slug}
  // instead — same auth guards, same routing, just rewritten internally
  // so the academy's site loads at the visitor's own domain rather than
  // 404ing or showing the plain marketing site.
  //
  // Note: only the bare paths that aren't already slug-prefixed get
  // rewritten. Existing links throughout the app are hardcoded to
  // `/a/{slug}/...`, so following one of those from a custom domain will
  // still show `/a/{slug}/...` in the address bar rather than staying
  // "clean" — the root page and any bookmarked/typed clean path do get
  // rewritten correctly, which covers the common case of visitors landing
  // on the academy's own domain.
  let targetUrl: URL | null = null;
  if (!isPlatformHost(host)) {
    const slug = await resolveCustomDomain(req, host);
    if (slug) {
      const prefix = `/a/${slug}`;
      if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) {
        targetUrl = req.nextUrl.clone();
        targetUrl.pathname = pathname === "/" ? prefix : `${prefix}${pathname}`;
        pathname = targetUrl.pathname;
      }
    }
  }

  if (pathname.startsWith("/super-admin") && pathname !== "/super-admin/login") {
    const session = await readSession(req);
    if (!session || session.role !== "SUPER_ADMIN") {
      const url = req.nextUrl.clone();
      url.pathname = "/super-admin/login";
      return NextResponse.redirect(url);
    }
    return targetUrl ? NextResponse.rewrite(targetUrl) : NextResponse.next();
  }

  const tenantMatch = pathname.match(/^\/a\/([^/]+)\/(admin|instructor|learner)(\/|$)/);
  if (tenantMatch) {
    const [, slug, area] = tenantMatch;
    const session = await readSession(req);
    const roleForArea: Record<string, string> = {
      admin: "ACADEMY_ADMIN",
      instructor: "INSTRUCTOR",
      learner: "LEARNER",
    };
    if (!session || session.academySlug !== slug || session.role !== roleForArea[area]) {
      const url = req.nextUrl.clone();
      url.pathname = `/a/${slug}/login`;
      return NextResponse.redirect(url);
    }
    return targetUrl ? NextResponse.rewrite(targetUrl) : NextResponse.next();
  }

  return targetUrl ? NextResponse.rewrite(targetUrl) : NextResponse.next();
}

export const config = {
  // Runs on every request except static assets and API routes (API routes
  // are excluded so app/api/resolve-domain itself, which this file calls
  // via fetch(), can never recurse back through this middleware).
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
