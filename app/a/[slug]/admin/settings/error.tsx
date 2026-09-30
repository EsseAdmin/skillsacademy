"use client";

// Server Actions on this page (setCustomDomain, verifyCustomDomain, etc.)
// throw a plain Error with a user-facing message on invalid input (bad
// domain, duplicate domain, DNS record not found yet, ...). Without a
// route-level error boundary, Next.js's built-in default one redacts that
// message in a production build and shows a generic broken-page fallback
// instead — so this boundary exists specifically to let those validation
// messages actually reach the admin trying to connect their domain.
export default function SettingsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="app-card p-6 max-w-lg mt-6 border border-red-200 bg-red-50">
      <p className="text-sm font-semibold text-red-700 mb-1">Something went wrong</p>
      <p className="text-sm text-red-600 mb-4">{error.message || "Please check your input and try again."}</p>
      <button
        onClick={reset}
        className="rounded-md px-4 py-2 text-sm font-semibold border border-red-300 text-red-700 hover:bg-red-100"
      >
        Try again
      </button>
    </div>
  );
}
