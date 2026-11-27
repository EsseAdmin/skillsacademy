// Saves AI-designed illustrations as the course's cover / the module's picture
// (the same storage and columns an uploaded picture uses).
import { Academies, Courses, Modules, Templates } from "@/lib/queries";
import { saveFile, deleteFile } from "@/lib/storage";
import { designIllustration, type SvgDrawer } from "@/lib/aiIllustration";

async function colorsFor(academyId: string) {
  const academy = await Academies.byId(academyId);
  const t = academy ? await Templates.byId(academy.template_id) : undefined;
  return { primary: t?.primary_color ?? "#1e3a5f", secondary: t?.secondary_color ?? "#2f5d8a", accent: t?.accent_color ?? "#c9a227" };
}

async function dropQuietly(key: string | null | undefined) {
  if (!key) return;
  try {
    await deleteFile(key);
  } catch {
    /* an orphaned old picture is harmless */
  }
}

export async function illustrateCourse(courseId: string, opts: { timeoutMs: number; drawer?: SvgDrawer }): Promise<boolean> {
  const course = await Courses.byId(courseId);
  if (!course) return false;
  const svg = await designIllustration(
    { kind: "course", title: course.title, description: course.description, courseType: course.course_type, colors: await colorsFor(course.academy_id) },
    opts
  );
  const key = `course-covers/${course.id}/${crypto.randomUUID()}.svg`;
  await saveFile(key, Buffer.from(svg, "utf8"));
  await Courses.setCoverDetails(course.id, { cover_image_path: key });
  await dropQuietly(course.cover_image_path);
  return true;
}

/** onlyIfMissing: automatic builds never replace a picture a person chose. */
export async function illustrateModule(moduleId: string, opts: { timeoutMs: number; drawer?: SvgDrawer; onlyIfMissing?: boolean }): Promise<boolean> {
  const mod = await Modules.byId(moduleId);
  if (!mod || (opts.onlyIfMissing && mod.image_path)) return false;
  const svg = await designIllustration(
    { kind: "module", title: mod.title, description: mod.description, colors: await colorsFor(mod.academy_id) },
    opts
  );
  const key = `module-images/${mod.id}/${crypto.randomUUID()}.svg`;
  await saveFile(key, Buffer.from(svg, "utf8"));
  await Modules.setImage(mod.id, key);
  await dropQuietly(mod.image_path);
  return true;
}
