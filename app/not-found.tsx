import Link from 'next/link';

// Replaces Next.js' built-in 404, which is a dead end with no link back into
// the site. The status code stays 404 — only the page a visitor sees changes.
export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm font-medium text-gray-500">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">
        We couldn&rsquo;t find that page
      </h1>
      <p className="mt-3 text-base text-gray-600">
        The address may be mistyped, or the page may have moved.
      </p>
      <Link
        href="/"
        className="mt-8 inline-block text-sm font-medium text-teal-700 underline underline-offset-4 hover:text-teal-800"
      >
        Go to the home page
      </Link>
    </main>
  );
}
