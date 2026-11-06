// Data access for the activity types (folder files, assignment submissions,
// poll votes, forum posts, lesson progress). Callers are responsible for
// checking that the module belongs to the session's academy first (see
// lib/moduleAccess.ts); these functions never take an academy from user input.
import { exec, queryAll, queryOne, newId, nowIso } from "@/lib/db";

// ---------- Folder files ----------
export interface ModuleFile {
  id: string;
  module_id: string;
  file_path: string;
  file_name: string;
  file_mime: string;
  file_size: number;
  order_index: number;
  created_at: string;
}

export const ModuleFiles = {
  listByModule(moduleId: string): Promise<ModuleFile[]> {
    return queryAll<ModuleFile>("SELECT * FROM module_files WHERE module_id = $1 ORDER BY order_index, created_at", [moduleId]);
  },
  byIdInModule(id: string, moduleId: string): Promise<ModuleFile | undefined> {
    return queryOne<ModuleFile>("SELECT * FROM module_files WHERE id = $1 AND module_id = $2", [id, moduleId]);
  },
  async add(moduleId: string, f: { file_path: string; file_name: string; file_mime: string; file_size: number }): Promise<void> {
    const next = await queryOne<{ n: number }>("SELECT COALESCE(MAX(order_index) + 1, 0)::int AS n FROM module_files WHERE module_id = $1", [moduleId]);
    await exec(
      "INSERT INTO module_files (id, module_id, file_path, file_name, file_mime, file_size, order_index, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [newId(), moduleId, f.file_path, f.file_name, f.file_mime, f.file_size, next?.n ?? 0, nowIso()]
    );
  },
  async remove(id: string, moduleId: string): Promise<ModuleFile | undefined> {
    const f = await ModuleFiles.byIdInModule(id, moduleId);
    if (f) await exec("DELETE FROM module_files WHERE id = $1 AND module_id = $2", [id, moduleId]);
    return f;
  },
};

// ---------- Assignment submissions ----------
export interface Submission {
  id: string;
  module_id: string;
  learner_id: string;
  submission_text: string | null;
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  status: "SUBMITTED" | "GRADED";
  grade: number | null;
  feedback: string | null;
  graded_by: string | null;
  graded_at: string | null;
  submitted_at: string;
}
export interface SubmissionWithLearner extends Submission {
  learner_name: string;
  learner_email: string;
}

export const Submissions = {
  byModuleAndLearner(moduleId: string, learnerId: string): Promise<Submission | undefined> {
    return queryOne<Submission>("SELECT * FROM assignment_submissions WHERE module_id = $1 AND learner_id = $2", [moduleId, learnerId]);
  },
  byIdInModule(id: string, moduleId: string): Promise<Submission | undefined> {
    return queryOne<Submission>("SELECT * FROM assignment_submissions WHERE id = $1 AND module_id = $2", [id, moduleId]);
  },
  byId(id: string): Promise<Submission | undefined> {
    return queryOne<Submission>("SELECT * FROM assignment_submissions WHERE id = $1", [id]);
  },
  listByModule(moduleId: string): Promise<SubmissionWithLearner[]> {
    return queryAll<SubmissionWithLearner>(
      `SELECT s.*, u.name AS learner_name, u.email AS learner_email
         FROM assignment_submissions s JOIN users u ON u.id = s.learner_id
        WHERE s.module_id = $1 ORDER BY s.submitted_at DESC`,
      [moduleId]
    );
  },
  /**
   * Hand in (or re-submit). A graded submission is locked: the conditional
   * update leaves it alone, and the caller is told whether the write applied.
   */
  async submit(
    moduleId: string,
    learnerId: string,
    v: { text: string | null; file?: { file_path: string; file_name: string; file_mime: string; file_size: number } | null }
  ): Promise<boolean> {
    const existing = await Submissions.byModuleAndLearner(moduleId, learnerId);
    if (!existing) {
      await exec(
        `INSERT INTO assignment_submissions (id, module_id, learner_id, submission_text, file_path, file_name, file_mime, file_size, status, submitted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'SUBMITTED',$9) ON CONFLICT (module_id, learner_id) DO NOTHING`,
        [newId(), moduleId, learnerId, v.text, v.file?.file_path ?? null, v.file?.file_name ?? null, v.file?.file_mime ?? null, v.file?.file_size ?? null, nowIso()]
      );
      return true;
    }
    const rows = await queryAll<{ id: string }>(
      `UPDATE assignment_submissions
          SET submission_text = $3,
              file_path = COALESCE($4, file_path), file_name = COALESCE($5, file_name),
              file_mime = COALESCE($6, file_mime), file_size = COALESCE($7, file_size),
              submitted_at = $8
        WHERE module_id = $1 AND learner_id = $2 AND status = 'SUBMITTED' RETURNING id`,
      [moduleId, learnerId, v.text, v.file?.file_path ?? null, v.file?.file_name ?? null, v.file?.file_mime ?? null, v.file?.file_size ?? null, nowIso()]
    );
    return rows.length > 0;
  },
  async grade(id: string, moduleId: string, graderId: string, grade: number, feedback: string): Promise<boolean> {
    const rows = await queryAll<{ id: string }>(
      `UPDATE assignment_submissions SET status='GRADED', grade=$3, feedback=$4, graded_by=$5, graded_at=$6
        WHERE id=$1 AND module_id=$2 RETURNING id`,
      [id, moduleId, grade, feedback || null, graderId, nowIso()]
    );
    return rows.length > 0;
  },
  async reopen(id: string, moduleId: string): Promise<boolean> {
    const rows = await queryAll<{ id: string }>(
      "UPDATE assignment_submissions SET status='SUBMITTED', grade=NULL, feedback=NULL, graded_by=NULL, graded_at=NULL WHERE id=$1 AND module_id=$2 RETURNING id",
      [id, moduleId]
    );
    return rows.length > 0;
  },
  listFilePathsByModule(moduleId: string): Promise<{ file_path: string }[]> {
    return queryAll<{ file_path: string }>("SELECT file_path FROM assignment_submissions WHERE module_id = $1 AND file_path IS NOT NULL", [moduleId]);
  },
  countByModule(moduleId: string): Promise<{ total: number; ungraded: number } | undefined> {
    return queryOne<{ total: number; ungraded: number }>(
      "SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int AS ungraded FROM assignment_submissions WHERE module_id = $1",
      [moduleId]
    );
  },
};

// ---------- Choice (poll) ----------
export const ChoiceResponses = {
  async byModuleAndLearner(moduleId: string, learnerId: string): Promise<number | null> {
    const r = await queryOne<{ option_index: number }>("SELECT option_index FROM choice_responses WHERE module_id = $1 AND learner_id = $2", [moduleId, learnerId]);
    return r ? r.option_index : null;
  },
  async set(moduleId: string, learnerId: string, optionIndex: number): Promise<void> {
    await exec(
      `INSERT INTO choice_responses (id, module_id, learner_id, option_index, created_at) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (module_id, learner_id) DO UPDATE SET option_index = EXCLUDED.option_index`,
      [newId(), moduleId, learnerId, optionIndex, nowIso()]
    );
  },
  async insertOnce(moduleId: string, learnerId: string, optionIndex: number): Promise<boolean> {
    const rows = await queryAll<{ id: string }>(
      `INSERT INTO choice_responses (id, module_id, learner_id, option_index, created_at) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (module_id, learner_id) DO NOTHING RETURNING id`,
      [newId(), moduleId, learnerId, optionIndex, nowIso()]
    );
    return rows.length > 0;
  },
  listByModule(moduleId: string): Promise<{ option_index: number }[]> {
    return queryAll<{ option_index: number }>("SELECT option_index FROM choice_responses WHERE module_id = $1", [moduleId]);
  },
};

// ---------- Forum ----------
export interface ForumPost {
  id: string;
  module_id: string;
  author_id: string;
  parent_id: string | null;
  subject: string | null;
  body: string;
  hidden: number;
  created_at: string;
  author_name: string;
  author_role: string;
}

export const ForumPosts = {
  listByModule(moduleId: string): Promise<ForumPost[]> {
    return queryAll<ForumPost>(
      `SELECT p.*, u.name AS author_name, u.role AS author_role
         FROM forum_posts p JOIN users u ON u.id = p.author_id
        WHERE p.module_id = $1 ORDER BY p.created_at ASC`,
      [moduleId]
    );
  },
  byIdInModule(id: string, moduleId: string): Promise<{ id: string; parent_id: string | null } | undefined> {
    return queryOne<{ id: string; parent_id: string | null }>("SELECT id, parent_id FROM forum_posts WHERE id = $1 AND module_id = $2", [id, moduleId]);
  },
  async create(moduleId: string, authorId: string, v: { parent_id: string | null; subject: string | null; body: string }): Promise<string> {
    const id = newId();
    await exec(
      "INSERT INTO forum_posts (id, module_id, author_id, parent_id, subject, body, hidden, created_at) VALUES ($1,$2,$3,$4,$5,$6,0,$7)",
      [id, moduleId, authorId, v.parent_id, v.subject, v.body, nowIso()]
    );
    return id;
  },
  async setHidden(id: string, moduleId: string, hidden: boolean): Promise<void> {
    await exec("UPDATE forum_posts SET hidden = $3 WHERE id = $1 AND module_id = $2", [id, moduleId, hidden ? 1 : 0]);
  },
  async countRecentByAuthor(moduleId: string, authorId: string, sinceIso: string): Promise<number> {
    const r = await queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM forum_posts WHERE module_id = $1 AND author_id = $2 AND created_at >= $3", [moduleId, authorId, sinceIso]);
    return r?.n ?? 0;
  },
  async countByModule(moduleId: string): Promise<number> {
    const r = await queryOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM forum_posts WHERE module_id = $1 AND hidden = 0", [moduleId]);
    return r?.n ?? 0;
  },
};

// ---------- Lesson progress ----------
export interface LessonProgress {
  id: string;
  module_id: string;
  learner_id: string;
  answers_json: string;
  completed_at: string | null;
  updated_at: string;
}

export const LessonProgressStore = {
  byModuleAndLearner(moduleId: string, learnerId: string): Promise<LessonProgress | undefined> {
    return queryOne<LessonProgress>("SELECT * FROM lesson_progress WHERE module_id = $1 AND learner_id = $2", [moduleId, learnerId]);
  },
  async saveAnswers(moduleId: string, learnerId: string, answers: Record<string, number>): Promise<void> {
    await exec(
      `INSERT INTO lesson_progress (id, module_id, learner_id, answers_json, updated_at) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (module_id, learner_id) DO UPDATE SET answers_json = EXCLUDED.answers_json, updated_at = EXCLUDED.updated_at`,
      [newId(), moduleId, learnerId, JSON.stringify(answers), nowIso()]
    );
  },
  async markCompleted(moduleId: string, learnerId: string): Promise<void> {
    await exec("UPDATE lesson_progress SET completed_at = COALESCE(completed_at, $3), updated_at = $3 WHERE module_id = $1 AND learner_id = $2", [moduleId, learnerId, nowIso()]);
  },
};
