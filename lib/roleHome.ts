// Shared by lib/actions/auth.ts and lib/actions/passwordReset.ts. Kept in
// its own plain module rather than exported from either "use server" file
// directly — Next.js requires every export of a "use server" file to be an
// async function, so a plain object like this can't live there.
import type { Role } from "@/lib/queries";

export const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "",
  ACADEMY_ADMIN: "admin",
  INSTRUCTOR: "instructor",
  LEARNER: "learner",
};
