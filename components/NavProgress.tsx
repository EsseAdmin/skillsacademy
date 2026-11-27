"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// A thin progress bar across the top while the next page is being fetched. Pages here are rendered on the server, so a click
// can take a moment (a cold start can take several seconds); without this the old page just sits there and it feels stuck.
// It watches for clicks on ordinary same-site links, shows the bar, and hides it when the address changes.
export default function NavProgress() {
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  // The address changed: the new page has arrived.
  useEffect(() => {
    setBusy(false);
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a");
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(link.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      setBusy(true);
    }
    // Capture phase: the framework's own link handler cancels the click before it would bubble up to here.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Never leave the bar up for ever if a navigation fails.
  useEffect(() => {
    if (!busy) return;
    const t = setTimeout(() => setBusy(false), 30_000);
    return () => clearTimeout(t);
  }, [busy]);

  if (!busy) return null;
  return (
    <>
      <style>{`@keyframes sa-nav-progress{0%{width:0}15%{width:35%}60%{width:75%}100%{width:92%}}`}</style>
      <div
        data-testid="nav-progress"
        role="progressbar"
        aria-label="Loading page"
        style={{ position: "fixed", top: 0, left: 0, height: 3, zIndex: 9999, background: "var(--gold, #fbcb07)", animation: "sa-nav-progress 12s ease-out forwards", boxShadow: "0 0 8px var(--gold, #fbcb07)" }}
      />
    </>
  );
}
