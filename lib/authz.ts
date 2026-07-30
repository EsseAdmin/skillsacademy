import { redirect } from "next/navigation";
import { getSession, SessionPayload } from "./auth";
import type { Role } from "./queries";

export async function requireTenantSession(slug: string, roles: Role[]): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.academySlug !== slug || !roles.includes(session.role)) {
    redirect(`/a/${slug}/login`);
  }
  return session;
}

export async function requireSuperAdminSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    redirect("/super-admin/login");
  }
  return session;
}

export async function requireAnyTenantSession(roles: Role[]): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || !session.academyId || !roles.includes(session.role)) {
    redirect("/login");
  }
  return session;
}
