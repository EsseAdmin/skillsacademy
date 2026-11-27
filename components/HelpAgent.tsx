"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { askHelpAgent } from "@/lib/actions/help";

interface Msg {
  role: "user" | "assistant";
  text: string;
  links?: { label: string; href: string }[];
}

// A floating Help button on every admin page. Read-only: it answers questions and links to the right page.
export default function HelpAgent({ slug, suggestions }: { slug: string; suggestions: string[] }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs, pending, open]);

  function send(q: string) {
    const question = q.trim();
    if (!question || pending) return;
    const next: Msg[] = [...msgs, { role: "user", text: question }];
    setMsgs(next);
    setText("");
    setError("");
    start(async () => {
      const res = await askHelpAgent(slug, next.map((m) => ({ role: m.role, text: m.text })));
      if (res.ok) setMsgs([...next, { role: "assistant", text: res.answer.text, links: res.answer.links }]);
      else setError(res.error);
    });
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 rounded-full app-btn-primary shadow-lg px-5 py-3 text-sm font-semibold flex items-center gap-2"
          data-testid="help-open"
        >
          <span aria-hidden>💬</span> Help
        </button>
      )}
      {open && (
        <section
          className="fixed bottom-5 right-5 z-40 w-[min(26rem,calc(100vw-2.5rem))] h-[min(34rem,calc(100vh-2.5rem))] bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col"
          role="dialog"
          aria-label="Help assistant"
          data-testid="help-panel"
        >
          <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div>
              <div className="font-semibold text-gray-900 text-sm">Help assistant</div>
              <div className="text-xs text-gray-500">Ask how to do anything in your academy</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close help" className="text-gray-400 hover:text-gray-700 text-xl leading-none" data-testid="help-close">
              ×
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-3 grid gap-3 content-start text-sm" aria-live="polite">
            {msgs.length === 0 && (
              <div className="grid gap-2">
                <p className="text-gray-600">Hi! I can explain how things work and why something isn&apos;t showing. I can&apos;t change anything myself - I&apos;ll point you to the right page. Try one of these:</p>
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="text-left rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50 text-gray-800" data-testid="help-suggestion">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "justify-self-end max-w-[85%]" : "max-w-[95%]"} data-testid={`help-${m.role}`}>
                <div className={`rounded-lg px-3 py-2 whitespace-pre-wrap ${m.role === "user" ? "app-btn-primary" : "bg-gray-100 text-gray-900"}`}>{m.text}</div>
                {m.links && m.links.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {m.links.map((l) => (
                      <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50" data-testid="help-link">
                        {l.label} →
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {pending && <div className="text-gray-500 text-xs" data-testid="help-thinking">Thinking…</div>}
            {error && <div className="text-red-600 text-xs" data-testid="help-error">{error}</div>}
            <div ref={endRef} />
          </div>

          <form
            className="border-t border-gray-200 p-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              placeholder="Ask a question…"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              aria-label="Your question"
              data-testid="help-input"
            />
            <button type="submit" disabled={pending || !text.trim()} className="app-btn-primary rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-50" data-testid="help-send">
              Ask
            </button>
          </form>
        </section>
      )}
    </>
  );
}
