import { NextResponse } from "next/server";
import { queryOne, queryAll } from "@/lib/db";
import { ensureSeed } from "@/lib/seed";

// TEMPORARY diagnostic endpoint — added to debug a production seeding issue.
// Returns only counts and error messages, no secrets. Remove once the issue
// is resolved.
export async function GET() {
  const result: Record<string, unknown> = {};

  try {
    const templates = await queryAll<{ id: string }>("SELECT id FROM templates");
    result.templateCount = templates.length;
  } catch (err) {
    result.templateCountError = String(err);
  }

  try {
    const academies = await queryAll<{ slug: string }>("SELECT slug FROM academies");
    result.academySlugs = academies.map((a) => a.slug);
  } catch (err) {
    result.academySlugsError = String(err);
  }

  try {
    const admins = await queryOne<{ id: string }>("SELECT id FROM super_admins LIMIT 1");
    result.hasSuperAdmin = !!admins;
  } catch (err) {
    result.hasSuperAdminError = String(err);
  }

  result.hasNetlifyDbUrl = !!process.env.NETLIFY_DB_URL;
  result.hasDatabaseUrl = !!process.env.DATABASE_URL;

  // Manually invoke ensureSeed() right now and report whether it throws.
  try {
    await ensureSeed();
    result.ensureSeedRanOk = true;
  } catch (err) {
    result.ensureSeedError = String(err);
    result.ensureSeedErrorStack = err instanceof Error ? err.stack : undefined;
  }

  try {
    const academiesAfter = await queryAll<{ slug: string }>("SELECT slug FROM academies");
    result.academySlugsAfterRetry = academiesAfter.map((a) => a.slug);
  } catch (err) {
    result.academySlugsAfterRetryError = String(err);
  }

  return NextResponse.json(result);
}
