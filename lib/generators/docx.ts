import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import type { DocumentContent } from "@/lib/moduleContent";

// Builds a genuine .docx lesson handout (opens in Word, Pages, Google Docs)
// from AI-written content: title, intro, then a heading + paragraphs +
// bullet list per section.
function hex(c: string): string {
  return c.replace(/^#/, "").toUpperCase();
}

export async function buildDocx(content: DocumentContent, opts: { academyName: string; primary: string }): Promise<Buffer> {
  const color = hex(opts.primary);
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 120 },
      children: [new TextRun({ text: content.title, bold: true, color, size: 44 })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: opts.academyName, color: "6B7280", size: 22 })],
    }),
  ];
  if (content.intro) {
    children.push(new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: content.intro, size: 24 })] }));
  }
  for (const s of content.sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 280, after: 120 },
        children: [new TextRun({ text: s.heading, bold: true, color, size: 30 })],
      })
    );
    for (const p of s.paragraphs) {
      children.push(new Paragraph({ spacing: { after: 140 }, children: [new TextRun({ text: p, size: 24 })] }));
    }
    for (const b of s.bullets) {
      children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: b, size: 24 })] }));
    }
  }
  const doc = new Document({
    creator: opts.academyName,
    title: content.title,
    sections: [{ children }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
