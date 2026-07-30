import type { CSSProperties } from "react";
import type { Template } from "./queries";

export function themeVars(t: Template): CSSProperties {
  return {
    "--brand-primary": t.primary_color,
    "--brand-secondary": t.secondary_color,
    "--brand-accent": t.accent_color,
  } as CSSProperties;
}
