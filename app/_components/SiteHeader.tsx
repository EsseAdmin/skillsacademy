import Link from 'next/link';

// The wordmark that leads back to the home page. Used by the admin area and the
// 404 page; the public marketing pages have their own navigation instead.
export default function SiteHeader() {
  return (
    <header className="border-b border-gray-200">
      <div className="mx-auto flex max-w-2xl items-center px-6 py-4">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-gray-900 hover:text-teal-700"
        >
          Skill Academies
        </Link>
      </div>
    </header>
  );
}
