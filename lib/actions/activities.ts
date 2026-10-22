"use server";

// Staff side of the activities and resources: creating and editing the new
// module types, grading assignments and moderating forums. Every action
// resolves the module through staffModule(), which only returns modules in the
// caller's own academy (and, for instructors, only their own modules).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Modules, Courses, type ModuleRow } from "@/lib/queries";
import { requireTenantSession } from "@/lib/authz";
import { staffModule } from "@/lib/moduleAccess";
import { deleteFile } from "@/lib/storage";
import { safeHttpUrl } from "@/lib/safeUrl";
import { ModuleFiles, Submissions, ForumPosts } from "@/lib/activityQueries";
import {
  ActivityInputError, LIMITS, clip, isConfigType, mediaKindOf, detectMediaMime,
  parseBookForm, parseGlossaryForm, parseChoiceForm, parseLessonForm, parseAssignmentForm,
  readAssignment, type ConfigType,
} from "@/lib/activities";
import { assertDocument, assertTotalSize, isRealFile, storeUpload } from "@/lib/uploads";
import { postForumMessage } from "@/lib/activityLogic";
import type { SessionPayload } from "@/lib/auth";

function areaOf(session: SessionPayload): "admin" | "instructor" {
  return session.role === "ACADEMY_ADMIN" ? "admin" : "instructor";
}

interface Built {
  content_text: string | null;
  content_url: string | null;
  config_json: string | null;
  upload: File | null;
  uploadMime: string | null;
  folderFiles: File[];
}

function buildForType(type: ConfigType, fd: FormData): Built {
  const out: Built = { content_text: null, content_url: null, config_json: null, upload: null, uploadMime: null, folderFiles: [] };
  switch (type) {
    case "PAGE":
      out.content_text = clip(fd.get("content_text"), LIMITS.pageText);
      if (!out.content_text) throw new ActivityInputError("Write some content for the page.");
      break;
    case "BOOK":
      out.config_json = JSON.stringify(parseBookForm(fd));
      break;
    case "GLOSSARY":
      out.config_json = JSON.stringify(parseGlossaryForm(fd));
      break;
    case "LESSON":
      out.config_json = JSON.stringify(parseLessonForm(fd));
      break;
    case "CHOICE":
      out.config_json = JSON.stringify(parseChoiceForm(fd));
      break;
    case "ASSIGNMENT":
      out.content_text = clip(fd.get("content_text"), LIMITS.instructions);
      if (!out.content_text) throw new ActivityInputError("Write the assignment instructions.");
      out.config_json = JSON.stringify(parseAssignmentForm(fd));
      break;
    case "FORUM":
      out.config_json = JSON.stringify({ prompt: clip(fd.get("content_text"), LIMITS.instructions) });
      break;
    case "FOLDER": {
      const files = fd.getAll("files").filter(isRealFile);
      if (files.length > LIMITS.folderFiles) throw new ActivityInputError(`A folder can hold up to ${LIMITS.folderFiles} files per save.`);
      files.forEach(assertDocument);
      assertTotalSize(files);
      out.folderFiles = files;
      break;
    }
    case "MEDIA": {
      out.config_json = JSON.stringify({ caption: clip(fd.get("content_text"), LIMITS.instructions) });
      const raw = String(fd.get("content_url") || "").trim();
      if (raw) {
        const safe = safeHttpUrl(raw, { httpsOnly: true });
        if (!safe) throw new ActivityInputError("That doesn't look like a valid https:// link.");
        out.content_url = safe;
      }
      const f = fd.get("file");
      if (isRealFile(f)) {
        const mime = detectMediaMime(f.name, f.type);
        if (!mime) throw new ActivityInputError("Upload a PNG, JPG, GIF, WebP image, an MP3/WAV/OGG audio clip, or an MP4/WebM video. (SVG isn't allowed.)");
        assertTotalSize([f]);
        out.upload = f;
        out.uploadMime = mime;
      }
      break;
    }
  }
  return out;
}

async function addFolderFiles(moduleId: string, files: File[]) {
  for (const f of files) {
    const up = await storeUpload(f);
    await ModuleFiles.add(moduleId, up);
  }
}

function fail(path: string, e: unknown): never {
  if (e instanceof ActivityInputError) redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(e.message)}`);
  throw e;
}

export async function createActivity(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const area = areaOf(session);
  const type = String(formData.get("content_type") || "");
  const courseId = String(formData.get("courseId") || "");
  const back = `/a/${slug}/${area}/modules/new?type=${encodeURIComponent(type)}${courseId ? `&courseId=${encodeURIComponent(courseId)}` : ""}`;
  if (!isConfigType(type)) redirect(`/a/${slug}/${area}/modules`);
  const title = clip(formData.get("title"), LIMITS.title);
  const description = clip(formData.get("description"), 400);
  if (!title) redirect(`${back}&error=${encodeURIComponent("Give the module a title.")}`);

  let moduleId: string;
  try {
    const built = buildForType(type, formData);
    let file: Awaited<ReturnType<typeof storeUpload>> | null = null;
    if (built.upload) file = await storeUpload(built.upload, built.uploadMime ?? undefined);
    const mod = await Modules.create({
      academy_id: session.academyId!,
      created_by: session.userId,
      title,
      description,
      content_type: type,
      content_text: built.content_text,
      content_url: built.content_url,
      config_json: built.config_json,
      ...(file ?? {}),
    });
    moduleId = mod.id;
    await addFolderFiles(mod.id, built.folderFiles);
    if (courseId) {
      const course = await Courses.byId(courseId);
      if (course && course.academy_id === session.academyId) {
        const existing = await Modules.listByCourse(courseId);
        await Modules.assignToCourse(courseId, mod.id, existing.length);
      }
    }
  } catch (e) {
    fail(back, e);
  }
  revalidatePath(`/a/${slug}/${area}/modules`);
  if (courseId) revalidatePath(`/a/${slug}/${area}/courses/${courseId}`);
  redirect(`/a/${slug}/${area}/modules?created=${encodeURIComponent(moduleId)}${courseId ? `&courseId=${encodeURIComponent(courseId)}` : ""}`);
}

export async function updateActivity(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const area = areaOf(session);
  const id = String(formData.get("moduleId") || "");
  const mod = await staffModule(session, id);
  const back = `/a/${slug}/${area}/modules`;
  if (!mod || !isConfigType(mod.content_type)) redirect(back);
  const title = clip(formData.get("title"), LIMITS.title);
  if (!title) redirect(`${back}?error=${encodeURIComponent("The title can't be empty.")}`);
  const type = mod.content_type as ConfigType;

  try {
    const built = buildForType(type, formData);
    const patch: Parameters<typeof Modules.update>[1] = { title, description: clip(formData.get("description"), 400) };
    if (built.content_text !== null) patch.content_text = built.content_text;
    if (built.config_json !== null) patch.config_json = built.config_json;
    if (type === "MEDIA") {
      patch.content_url = built.content_url;
      if (built.upload) {
        const up = await storeUpload(built.upload, built.uploadMime ?? undefined);
        if (mod.file_path) await deleteFile(mod.file_path);
        Object.assign(patch, up);
      } else if (formData.get("removeFile") === "on" && mod.file_path) {
        await deleteFile(mod.file_path);
        Object.assign(patch, { file_path: null, file_name: null, file_mime: null, file_size: null });
      }
    }
    if (type === "FOLDER") {
      for (const fid of formData.getAll("remove_file").map(String)) {
        const removed = await ModuleFiles.remove(fid, mod.id);
        if (removed) await deleteFile(removed.file_path);
      }
      const current = await ModuleFiles.listByModule(mod.id);
      if (current.length + built.folderFiles.length > LIMITS.folderFiles * 3) throw new ActivityInputError("That folder would hold too many files.");
      await addFolderFiles(mod.id, built.folderFiles);
    }
    await Modules.update(mod.id, patch);
  } catch (e) {
    fail(back, e);
  }
  revalidatePath(back);
  redirect(`${back}?saved=${encodeURIComponent(id)}`);
}

/** Frees stored files that belong to a module's activity data (called before the module is deleted). */
export async function purgeActivityFiles(mod: ModuleRow): Promise<void> {
  const paths: string[] = [];
  for (const f of await ModuleFiles.listByModule(mod.id)) paths.push(f.file_path);
  for (const s of await Submissions.listFilePathsByModule(mod.id)) paths.push(s.file_path);
  for (const p of paths) {
    try {
      await deleteFile(p);
    } catch {
      /* a missing blob shouldn't block deleting the module */
    }
  }
}

// ---------- Grading ----------
export async function gradeSubmission(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const area = areaOf(session);
  const moduleId = String(formData.get("moduleId") || "");
  const submissionId = String(formData.get("submissionId") || "");
  const page = `/a/${slug}/${area}/activities/${moduleId}`;
  const mod = await staffModule(session, moduleId);
  if (!mod || mod.content_type !== "ASSIGNMENT") redirect(`/a/${slug}/${area}/modules`);
  const sub = await Submissions.byIdInModule(submissionId, moduleId);
  if (!sub) redirect(page);
  const cfg = readAssignment(mod.config_json);
  const grade = Math.round(Number(formData.get("grade")));
  if (!Number.isFinite(grade) || grade < 0 || grade > cfg.maxGrade) {
    redirect(`${page}?error=${encodeURIComponent(`Enter a grade between 0 and ${cfg.maxGrade}.`)}`);
  }
  await Submissions.grade(submissionId, moduleId, session.userId, grade, clip(formData.get("feedback"), 3000));
  revalidatePath(page);
  redirect(`${page}?graded=1`);
}

export async function reopenSubmission(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const area = areaOf(session);
  const moduleId = String(formData.get("moduleId") || "");
  const page = `/a/${slug}/${area}/activities/${moduleId}`;
  const mod = await staffModule(session, moduleId);
  if (!mod || mod.content_type !== "ASSIGNMENT") redirect(`/a/${slug}/${area}/modules`);
  await Submissions.reopen(String(formData.get("submissionId") || ""), moduleId);
  revalidatePath(page);
  redirect(page);
}

// ---------- Forum moderation ----------
export async function moderateForumPost(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const area = areaOf(session);
  const moduleId = String(formData.get("moduleId") || "");
  const page = `/a/${slug}/${area}/activities/${moduleId}`;
  const mod = await staffModule(session, moduleId);
  if (!mod || mod.content_type !== "FORUM") redirect(`/a/${slug}/${area}/modules`);
  const post = await ForumPosts.byIdInModule(String(formData.get("postId") || ""), moduleId);
  if (post) await ForumPosts.setHidden(post.id, moduleId, formData.get("hide") === "1");
  revalidatePath(page);
  redirect(page);
}

export async function staffReplyForum(slug: string, formData: FormData) {
  const session = await requireTenantSession(slug, ["ACADEMY_ADMIN", "INSTRUCTOR"]);
  const area = areaOf(session);
  const moduleId = String(formData.get("moduleId") || "");
  const page = `/a/${slug}/${area}/activities/${moduleId}`;
  const mod = await staffModule(session, moduleId);
  if (!mod || mod.content_type !== "FORUM") redirect(`/a/${slug}/${area}/modules`);
  const res = await postForumMessage(mod.id, session.userId, {
    parentId: String(formData.get("parentId") || "") || null,
    subject: String(formData.get("subject") || ""),
    body: String(formData.get("body") || ""),
  });
  revalidatePath(page);
  redirect(res.ok ? page : `${page}?error=${encodeURIComponent(res.error)}`);
}

