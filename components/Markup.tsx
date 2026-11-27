import { parseMarkup, parseInline, type Inline } from "@/lib/activities";

function InlineNodes({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) =>
        n.t === "b" ? <strong key={i}>{n.v}</strong> : n.t === "i" ? <em key={i}>{n.v}</em> : n.t === "a" ? (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="app-link">{n.v}</a>
        ) : (
          <span key={i}>{n.v}</span>
        )
      )}
    </>
  );
}

// Renders the simple page markup as React elements. No HTML string is ever
// built, so text from authors can't inject markup or script.
export default function Markup({ text }: { text: string }) {
  const blocks = parseMarkup(text);
  return (
    <div className="grid gap-3 text-sm leading-relaxed text-gray-800">
      {blocks.map((b, i) => {
        if (b.t === "h") {
          const cls = b.level === 1 ? "text-xl font-bold text-gray-900" : b.level === 2 ? "text-lg font-semibold text-gray-900" : "text-base font-semibold text-gray-900";
          return <div key={i} role="heading" aria-level={b.level + 1} className={cls}><InlineNodes nodes={b.inline} /></div>;
        }
        if (b.t === "ul") return <ul key={i} className="list-disc pl-6 grid gap-1">{b.items.map((it, j) => <li key={j}><InlineNodes nodes={it} /></li>)}</ul>;
        if (b.t === "ol") return <ol key={i} className="list-decimal pl-6 grid gap-1">{b.items.map((it, j) => <li key={j}><InlineNodes nodes={it} /></li>)}</ol>;
        return <p key={i}><InlineNodes nodes={b.inline} /></p>;
      })}
    </div>
  );
}

export { parseInline };
