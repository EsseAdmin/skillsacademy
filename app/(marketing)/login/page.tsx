"use client";

import { useActionState } from "react";
import Link from "next/link";
import { findAcademyAndRedirect } from "@/lib/actions/auth";

export default function FindAcademyPage() {
  const [state, formAction, pending] = useActionState(findAcademyAndRedirect, undefined);

  return (
    <section style={{ paddingTop: 160, minHeight: "100vh", display: "flex", justifyContent: "center" }}>
      <div className="solution-box" style={{ maxWidth: 440, width: "100%" }}>
        <h3>Log in to your academy</h3>
        <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.55)", marginTop: -8, marginBottom: 24 }}>
          Enter your academy&apos;s web address to continue to its login page.
        </p>
        <form action={formAction} style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>skillsacademy.ai/a/</span>
            <input
              name="slug"
              placeholder="your-academy"
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 2,
                padding: "12px 14px",
                color: "#fff",
                fontSize: 14,
              }}
            />
          </div>
          {state?.error && <p style={{ color: "#ff6b6b", fontSize: 13.5 }}>{state.error}</p>}
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Looking up your academy…" : "Continue →"}
          </button>
        </form>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 20 }}>
          Try the demo academies: <code>brightwave</code>, <code>riverside</code>, or <code>northgate</code>.
        </p>
        <p style={{ fontSize: 13, marginTop: 24 }}>
          Don&apos;t have an academy yet?{" "}
          <Link href="/signup" style={{ color: "var(--gold)" }}>
            Create one free →
          </Link>
        </p>
      </div>
    </section>
  );
}
