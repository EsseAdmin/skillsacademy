import { useId } from "react";
import type { ArtKind } from "@/lib/courseArt";
import { contrastTextColor } from "@/lib/color";

// Original flat illustrations used as the default picture for courses and
// modules. They are drawn in the academy's own colours: a gradient of the
// primary/secondary colours with the picture in whichever of white/near-black
// reads best on it (so every template, including Light Minimal, works).
export default function CourseArt({
  kind,
  primary,
  secondary,
  accent,
  className = "w-full h-full",
}: {
  kind: ArtKind;
  primary: string;
  secondary: string;
  accent: string;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const fg = contrastTextColor(primary);
  const gradId = `g${uid}`;

  return (
    <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-hidden="true" data-art={kind}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={primary} />
          <stop offset="1" stopColor={secondary} />
        </linearGradient>
      </defs>
      <rect width="400" height="250" fill={`url(#${gradId})`} />
      {/* soft background shapes */}
      <circle cx="40" cy="30" r="70" fill={fg} opacity="0.06" />
      <circle cx="372" cy="228" r="96" fill={fg} opacity="0.07" />
      <circle cx="338" cy="46" r="26" fill={fg} opacity="0.08" />
      <circle cx="200" cy="125" r="92" fill={fg} opacity="0.12" />

      {kind === "learning" && (
        <g>
          <path d="M150 124v34c0 16 100 16 100 0v-34l-50 24z" fill={fg} opacity="0.8" />
          <polygon points="200,66 292,104 200,142 108,104" fill={fg} />
          <line x1="284" y1="108" x2="284" y2="156" stroke={accent} strokeWidth="5" strokeLinecap="round" />
          <circle cx="284" cy="160" r="8" fill={accent} />
          <path d="M122 196q39-14 78 0q39-14 78 0v16q-39-14-78 0q-39-14-78 0z" fill={fg} opacity="0.9" />
        </g>
      )}

      {kind === "people" && (
        <g>
          <path d="M118 78h116a16 16 0 0 1 16 16v44a16 16 0 0 1-16 16h-64l-30 24v-24h-22a16 16 0 0 1-16-16V94a16 16 0 0 1 16-16z" fill={fg} />
          <circle cx="150" cy="116" r="6" fill={primary} />
          <circle cx="176" cy="116" r="6" fill={primary} />
          <circle cx="202" cy="116" r="6" fill={primary} />
          <path d="M190 138h92a16 16 0 0 1 16 16v38a16 16 0 0 1-16 16h-16v22l-28-22h-48a16 16 0 0 1-16-16v-38a16 16 0 0 1 16-16z" fill={accent} opacity="0.95" />
          <path d="M214 172l14 14 28-30" fill="none" stroke={primary} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {kind === "chart" && (
        <g>
          <rect x="128" y="150" width="38" height="46" rx="5" fill={fg} opacity="0.7" />
          <rect x="181" y="122" width="38" height="74" rx="5" fill={fg} opacity="0.85" />
          <rect x="234" y="92" width="38" height="104" rx="5" fill={fg} />
          <line x1="112" y1="198" x2="290" y2="198" stroke={fg} strokeWidth="5" strokeLinecap="round" />
          <polyline points="124,128 176,104 212,116 276,70" fill="none" stroke={accent} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <polygon points="288,60 292,86 266,78" fill={accent} />
        </g>
      )}

      {kind === "code" && (
        <g>
          <rect x="108" y="72" width="184" height="118" rx="12" fill={fg} opacity="0.16" stroke={fg} strokeWidth="4" />
          <line x1="108" y1="96" x2="292" y2="96" stroke={fg} strokeWidth="4" />
          <circle cx="124" cy="84" r="4.5" fill={fg} />
          <circle cx="140" cy="84" r="4.5" fill={fg} />
          <circle cx="156" cy="84" r="4.5" fill={accent} />
          <polyline points="162,120 140,142 162,164" fill="none" stroke={fg} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="238,120 260,142 238,164" fill="none" stroke={fg} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="219" y1="116" x2="181" y2="168" stroke={accent} strokeWidth="9" strokeLinecap="round" />
        </g>
      )}

      {kind === "health" && (
        <g>
          <path d="M200 66l62 22v44c0 36-28 56-62 70c-34-14-62-34-62-70V88z" fill={fg} />
          <rect x="190" y="102" width="20" height="62" rx="4" fill={primary} />
          <rect x="169" y="123" width="62" height="20" rx="4" fill={primary} />
          <circle cx="262" cy="70" r="12" fill={accent} />
        </g>
      )}

      {kind === "legal" && (
        <g>
          <circle cx="200" cy="76" r="9" fill={accent} />
          <line x1="200" y1="84" x2="200" y2="186" stroke={fg} strokeWidth="7" strokeLinecap="round" />
          <rect x="166" y="184" width="68" height="12" rx="5" fill={fg} />
          <line x1="132" y1="104" x2="268" y2="104" stroke={fg} strokeWidth="7" strokeLinecap="round" />
          <path d="M132 104l-26 52M132 104l26 52M268 104l-26 52M268 104l26 52" stroke={fg} strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M100 156h64a32 22 0 0 1-64 0z" fill={fg} opacity="0.95" />
          <path d="M236 156h64a32 22 0 0 1-64 0z" fill={accent} opacity="0.95" />
        </g>
      )}

      {kind === "science" && (
        <g>
          <ellipse cx="200" cy="125" rx="82" ry="30" fill="none" stroke={fg} strokeWidth="6" />
          <ellipse cx="200" cy="125" rx="82" ry="30" fill="none" stroke={fg} strokeWidth="6" transform="rotate(60 200 125)" />
          <ellipse cx="200" cy="125" rx="82" ry="30" fill="none" stroke={fg} strokeWidth="6" transform="rotate(120 200 125)" />
          <circle cx="200" cy="125" r="14" fill={accent} />
          <circle cx="282" cy="125" r="7" fill={fg} />
          <circle cx="159" cy="54" r="7" fill={fg} />
          <circle cx="159" cy="196" r="7" fill={fg} />
        </g>
      )}

      {kind === "language" && (
        <g>
          <rect x="116" y="74" width="168" height="112" rx="16" fill={fg} />
          <text x="200" y="152" textAnchor="middle" fontSize="78" fontWeight="800" fontFamily="Georgia, 'Times New Roman', serif" fill={primary}>
            Aa
          </text>
          <path d="M256 186l22 22v-22z" fill={fg} />
          <rect x="136" y="164" width="128" height="6" rx="3" fill={accent} />
        </g>
      )}

      {kind === "mind" && (
        <g>
          <path d="M198 78c-24-16-62-2-64 30c-22 8-24 40-4 52c-4 22 18 40 40 32c8 8 20 10 28 4z" fill={fg} />
          <path d="M202 78c24-16 62-2 64 30c22 8 24 40 4 52c4 22-18 40-40 32c-8 8-20 10-28 4z" fill={fg} opacity="0.88" />
          <path d="M200 82v110" stroke={primary} strokeWidth="4" strokeLinecap="round" />
          <path d="M150 112c14-2 24 6 26 18M160 154c10-8 22-6 28 4M250 112c-14-2-24 6-26 18M240 154c-10-8-22-6-28 4" fill="none" stroke={primary} strokeWidth="4" strokeLinecap="round" opacity="0.7" />
          <circle cx="262" cy="66" r="11" fill={accent} />
          <circle cx="286" cy="86" r="6" fill={accent} opacity="0.8" />
        </g>
      )}
    </svg>
  );
}
