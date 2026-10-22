import type { ForumPost } from "@/lib/activityQueries";

type Action = (formData: FormData) => void | Promise<void>;

const field = "rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900";

function When({ iso }: { iso: string }) {
  return <time dateTime={iso} className="text-xs text-gray-600">{new Date(iso).toISOString().replace("T", " ").slice(0, 16)} UTC</time>;
}

// A forum as topics with one level of replies. Used by learners (post only)
// and by staff (post, plus hide/show on any post).
export default function ForumThread({
  moduleId, posts, postAction, moderateAction,
}: {
  moduleId: string;
  posts: ForumPost[];
  postAction: Action;
  moderateAction?: Action;
}) {
  const topics = posts.filter((p) => !p.parent_id);
  const repliesOf = (id: string) => posts.filter((p) => p.parent_id === id);

  const Body = ({ p }: { p: ForumPost }) => (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-gray-900">{p.author_name}</span>
        {p.author_role !== "LEARNER" && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{p.author_role === "INSTRUCTOR" ? "Instructor" : "Admin"}</span>}
        <When iso={p.created_at} />
        {p.hidden === 1 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Hidden</span>}
      </div>
      {p.hidden === 1 && !moderateAction ? (
        <p className="mt-1 text-sm italic text-gray-600">This post was hidden by a moderator.</p>
      ) : (
        <p className="mt-1 whitespace-pre-line text-sm text-gray-800">{p.body}</p>
      )}
      {moderateAction && (
        <form action={moderateAction} className="mt-1">
          <input type="hidden" name="moduleId" value={moduleId} />
          <input type="hidden" name="postId" value={p.id} />
          <input type="hidden" name="hide" value={p.hidden === 1 ? "0" : "1"} />
          <button type="submit" className="text-xs font-semibold text-gray-700 underline">{p.hidden === 1 ? "Show this post" : "Hide this post"}</button>
        </form>
      )}
    </div>
  );

  return (
    <div className="grid gap-5">
      {topics.map((t) => (
        <article key={t.id} className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="mb-2 font-semibold text-gray-900">{t.subject}</h3>
          <Body p={t} />
          <div className="mt-4 grid gap-3 border-l-2 border-gray-200 pl-4">
            {repliesOf(t.id).map((r) => <Body key={r.id} p={r} />)}
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-gray-800">Reply</summary>
              <form action={postAction} className="mt-2 grid gap-2">
                <input type="hidden" name="moduleId" value={moduleId} />
                <input type="hidden" name="parentId" value={t.id} />
                <textarea name="body" required rows={3} maxLength={4000} aria-label={`Reply to ${t.subject}`} className={field} />
                <div><button type="submit" className="app-btn-primary rounded-md px-4 py-2 text-xs font-semibold">Post reply</button></div>
              </form>
            </details>
          </div>
        </article>
      ))}
      {topics.length === 0 && <p className="text-sm text-gray-700">No topics yet — start the first one below.</p>}
      <form action={postAction} className="grid gap-3 rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900">Start a new topic</h3>
        <input type="hidden" name="moduleId" value={moduleId} />
        <input name="subject" required maxLength={160} placeholder="Subject" aria-label="Subject" className={field} />
        <textarea name="body" required rows={4} maxLength={4000} placeholder="Your message" aria-label="Message" className={field} />
        <div><button type="submit" className="app-btn-primary rounded-md px-4 py-2 text-xs font-semibold">Post to forum</button></div>
      </form>
    </div>
  );
}
