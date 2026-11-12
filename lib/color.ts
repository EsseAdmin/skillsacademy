// Small self-contained colour-contrast helpers.
//
// An academy's template colours (primary/secondary/accent) are picked
// freely by the academy admin via plain hex colour inputs on the Branding
// page — including the built-in "Light Minimal" preset, whose primary
// colour is a near-white (#F8FAFC). Several places in the app render text
// directly on top of `template.primary_color` (nav bars, hero sections,
// footers, the login/register side panel) and used to hardcode that text
// as white, on the assumption that a template's primary colour is always
// a dark brand colour. For a light template that made the text invisible
// — white text on a near-white background.
//
// Rather than trusting `templates.preview_style` (a "light"/"dark" label
// set once when a preset is seeded, never computed for a custom template
// an admin creates), these compute real WCAG relative luminance from the
// actual hex value, so the right text colour is picked no matter what
// colour was chosen.

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const srgb = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function isLightBackground(backgroundHex: string): boolean {
  const rgb = hexToRgb(backgroundHex);
  if (!rgb) return false; // unparsable colour: fall back to the old white-text behaviour
  // WCAG's plain midpoint (0.5) still reads some pastel-but-mid-tone
  // brand colours as "dark enough for white text" in practice; 0.55 leans
  // slightly toward dark text, matching how most design systems switch.
  return relativeLuminance(rgb) > 0.55;
}

/**
 * Full-strength readable text colour (near-black or white) for a given
 * background hex colour.
 */
export function contrastTextColor(backgroundHex: string): string {
  return isLightBackground(backgroundHex) ? "#111827" : "#ffffff";
}

/**
 * A translucent black/white overlay colour (for muted/secondary text,
 * borders, etc.) that follows the same light/dark decision as
 * contrastTextColor, at the given alpha (0–1).
 */
export function contrastOverlayColor(backgroundHex: string, alpha: number): string {
  return isLightBackground(backgroundHex) ? `rgba(17,24,39,${alpha})` : `rgba(255,255,255,${alpha})`;
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Colour to use for text links that sit on a WHITE page. The template's
 * primary colour is used when it is readable on white (WCAG AA, 4.5:1);
 * otherwise (e.g. the near-white "Light Minimal" preset) links fall back to
 * near-black so they never disappear.
 */
export function linkColorOnWhite(brandHex: string): string {
  const rgb = hexToRgb(brandHex);
  if (!rgb) return "#111827";
  return contrastRatio(rgb, [255, 255, 255]) >= 4.5 ? brandHex : "#111827";
}
