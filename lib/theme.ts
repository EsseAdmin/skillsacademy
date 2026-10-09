import type { CSSProperties } from "react";
import type { Template } from "./queries";
import { contrastTextColor } from "./color";

export function themeVars(t: Template): CSSProperties {
  return {
    "--brand-primary": t.primary_color,
    "--brand-secondary": t.secondary_color,
    "--brand-accent": t.accent_color,
    // Readable text colour for anything painted with --brand-primary as a
    // background (the portal sidebar, .app-btn-primary buttons, etc.) —
    // computed from the template's actual primary colour rather than
    // assumed to always be white, since a light template (e.g. the
    // built-in "Light Minimal" preset) needs dark text instead. See
    // lib/color.ts and app/globals.css's .app-shell/.app-sidebar rules.
    "--brand-primary-contrast": contrastTextColor(t.primary_color),
  } as CSSProperties;
}
