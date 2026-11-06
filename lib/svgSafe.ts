// Makes an SVG written by an AI model safe to store and serve: rebuilt from an
// allow-list of drawing elements and attributes, so scripts, links, styles,
// external images, text and event handlers can never get through. Pure (no
// network, no database) so it can be tested on its own.
const ALLOWED_TAGS = new Set([
  "svg", "g", "defs", "lineargradient", "radialgradient", "stop", "clippath",
  "rect", "circle", "ellipse", "path", "polygon", "polyline", "line",
]);
const CANONICAL: Record<string, string> = { lineargradient: "linearGradient", radialgradient: "radialGradient", clippath: "clipPath" };
const DRAWING = new Set(["rect", "circle", "ellipse", "path", "polygon", "polyline", "line"]);

const NUM = /^-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?%?$/i;
const COLOR = /^(?:#[0-9a-f]{3,8}|none|transparent|url\(#[\w-]{1,30}\)|rgba?\(\s*[\d.\s,%]+\)|[a-z]{3,20})$/i;
const TRANSFORM = /^(?:\s*(?:translate|rotate|scale|skewX|skewY|matrix)\(\s*[-\d\s.,e]+\))+\s*$/i;
const ATTR: Record<string, (v: string) => boolean> = {
  x: (v) => NUM.test(v), y: (v) => NUM.test(v), x1: (v) => NUM.test(v), x2: (v) => NUM.test(v), y1: (v) => NUM.test(v), y2: (v) => NUM.test(v),
  cx: (v) => NUM.test(v), cy: (v) => NUM.test(v), r: (v) => NUM.test(v), rx: (v) => NUM.test(v), ry: (v) => NUM.test(v), fx: (v) => NUM.test(v), fy: (v) => NUM.test(v),
  width: (v) => NUM.test(v), height: (v) => NUM.test(v), offset: (v) => NUM.test(v),
  opacity: (v) => NUM.test(v), "fill-opacity": (v) => NUM.test(v), "stroke-opacity": (v) => NUM.test(v), "stop-opacity": (v) => NUM.test(v), "stroke-width": (v) => NUM.test(v),
  "stroke-miterlimit": (v) => NUM.test(v), "stroke-dashoffset": (v) => NUM.test(v),
  d: (v) => v.length <= 4000 && /^[MmLlHhVvCcSsQqTtAaZz0-9eE\s,.+-]+$/.test(v),
  points: (v) => v.length <= 2000 && /^[0-9eE\s,.+-]+$/.test(v),
  fill: (v) => COLOR.test(v), stroke: (v) => COLOR.test(v), "stop-color": (v) => COLOR.test(v),
  transform: (v) => TRANSFORM.test(v), gradientTransform: (v) => TRANSFORM.test(v),
  id: (v) => /^[A-Za-z][\w-]{0,30}$/.test(v),
  "clip-path": (v) => /^url\(#[\w-]{1,30}\)$/.test(v),
  gradientUnits: (v) => v === "userSpaceOnUse" || v === "objectBoundingBox",
  clipPathUnits: (v) => v === "userSpaceOnUse" || v === "objectBoundingBox",
  "stroke-linecap": (v) => ["butt", "round", "square"].includes(v),
  "stroke-linejoin": (v) => ["miter", "round", "bevel"].includes(v),
  "fill-rule": (v) => v === "nonzero" || v === "evenodd",
  "clip-rule": (v) => v === "nonzero" || v === "evenodd",
  "stroke-dasharray": (v) => /^[\d\s.,]+$/.test(v) && v.length <= 60,
};
const ATTR_BY_LOWER = new Map(Object.keys(ATTR).map((k) => [k.toLowerCase(), k]));

export const SVG_LIMITS = { maxElements: 320, maxBytes: 28_000, minDrawing: 3 } as const;
export const ILLUSTRATION_VIEWBOX = "0 0 800 450";

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTR_RE = /([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** The cleaned SVG, or null when there is nothing usable (not an SVG, too few shapes, too big). */
export function sanitizeSvg(raw: string): string | null {
  const start = raw.search(/<svg[\s>]/i);
  const end = raw.toLowerCase().lastIndexOf("</svg>");
  if (start < 0 || end < start) return null;
  const body = raw.slice(start, end + 6);

  let out = "";
  let elements = 0;
  let drawing = 0;
  let sawRoot = false;
  const stack: string[] = [];
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(body))) {
    const closing = m[1] === "/";
    const lower = m[2].toLowerCase();
    if (!ALLOWED_TAGS.has(lower)) continue; // dropped; its text content is never copied either
    const name = CANONICAL[lower] ?? lower;
    if (closing) {
      if (stack[stack.length - 1] === name) {
        out += `</${name}>`;
        stack.pop();
      }
      continue;
    }
    if (name === "svg") {
      if (sawRoot) continue;
      sawRoot = true;
      out += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ILLUSTRATION_VIEWBOX}" preserveAspectRatio="xMidYMid slice">`;
      stack.push("svg");
      continue;
    }
    if (!sawRoot) continue;
    if (++elements > SVG_LIMITS.maxElements) return null;
    if (DRAWING.has(name)) drawing++;
    let attrs = "";
    ATTR_RE.lastIndex = 0;
    let a: RegExpExecArray | null;
    while ((a = ATTR_RE.exec(m[3]))) {
      const key = ATTR_BY_LOWER.get(a[1].toLowerCase());
      const value = (a[2] ?? a[3] ?? "").trim();
      if (key && ATTR[key](value)) attrs += ` ${key}="${value}"`;
    }
    if (m[4] === "/") out += `<${name}${attrs}/>`;
    else {
      out += `<${name}${attrs}>`;
      stack.push(name);
    }
  }
  if (!sawRoot || drawing < SVG_LIMITS.minDrawing) return null;
  while (stack.length) out += `</${stack.pop()}>`;
  return Buffer.byteLength(out) <= SVG_LIMITS.maxBytes ? out : null;
}
