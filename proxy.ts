import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

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

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/super-admin") && pathname !== "/super-admin/login") {
    const session = await readSession(req);
    if (!session || session.role !== "SUPER_ADMIN") {
      const url = req.nextUrl.clone();
      url.pathname = "/super-admin/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
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
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/super-admin/:path*", "/a/:path*"],
};
