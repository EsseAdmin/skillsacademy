import PptxGenJS from "pptxgenjs";
import type { SlidesContent } from "@/lib/moduleContent";

// Builds a genuine .pptx (opens in PowerPoint, Keynote, Google Slides) from
// AI-written slide content: a branded title slide followed by one slide per
// entry, with the model's speaker notes attached to each. Colours come from
// the academy's theme so a generated deck matches its branding.
function hex(c: string): string {
  return c.replace(/^#/, "").toUpperCase();
}

export async function buildPptx(content: SlidesContent, opts: { academyName: string; primary: string; accent: string }): Promise<Buffer> {
  const primary = hex(opts.primary);
  const accent = hex(opts.accent);
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_16x9";
  pres.title = content.deckTitle;
  pres.company = opts.academyName;

  const title = pres.addSlide();
  title.background = { color: primary };
  title.addText(content.deckTitle, {
    x: 0.7, y: 1.9, w: 8.6, h: 1.4, fontSize: 36, bold: true, color: "FFFFFF", fontFace: "Calibri", valign: "middle",
  });
  title.addText(opts.academyName, { x: 0.7, y: 3.4, w: 8.6, h: 0.5, fontSize: 18, color: "FFFFFF", fontFace: "Calibri" });
  title.addShape(pres.ShapeType.rect, { x: 0.7, y: 3.3, w: 1.6, h: 0.06, fill: { color: accent }, line: { color: accent } });

  content.slides.forEach((s, i) => {
    const slide = pres.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 10, h: 1.0, fill: { color: primary }, line: { color: primary } });
    slide.addText(s.title, { x: 0.5, y: 0.1, w: 9, h: 0.8, fontSize: 26, bold: true, color: "FFFFFF", fontFace: "Calibri", valign: "middle" });
    slide.addText(
      s.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
      { x: 0.7, y: 1.4, w: 8.6, h: 3.6, fontSize: 20, color: "1F2937", fontFace: "Calibri", valign: "top", paraSpaceAfter: 10 }
    );
    slide.addText(`${opts.academyName}  ·  ${i + 1}`, { x: 0.5, y: 5.2, w: 9, h: 0.3, fontSize: 10, color: "6B7280", fontFace: "Calibri" });
    if (s.notes) slide.addNotes(s.notes);
  });

  const out = await pres.write({ outputType: "nodebuffer" });
  return Buffer.from(out as Buffer);
}
