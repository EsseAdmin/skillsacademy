// Hosts that are the platform itself, never a tenant's custom domain. Used
// by proxy.ts to decide whether an incoming request's Host header should be
// looked up as a custom domain at all — checking every single request
// against Postgres would be wasteful and wrong for the platform's own
// traffic, which is the vast majority of it.
const STATIC_PLATFORM_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "skillacademies.ai",
  "www.skillacademies.ai",
  "skillsacademy.ai",
  "www.skillsacademy.ai",
]);

export function isPlatformHost(hostname: string): boolean {
  const host = hostname.toLowerCase().split(":")[0]; // strip a port, e.g. localhost:3000
  if (STATIC_PLATFORM_HOSTS.has(host)) return true;
  // Netlify's own default domain for this site (<site-name>.netlify.app)
  // and any deploy-preview/branch subdomain of netlify.app.
  if (host.endsWith(".netlify.app")) return true;
  return false;
}

// The hostname academy admins CNAME their custom domain to. Configurable via
// env since the platform's actual Netlify site domain can differ between
// environments; defaults to the real production site's default domain per
// DEPLOYMENT.md.
export function platformCnameTarget(): string {
  return process.env.PLATFORM_ROOT_DOMAIN || "skillacademies.netlify.app";
}
