import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Skill Academies</h1>
      <p className="mt-3 text-base text-gray-600">
        Run your academy&rsquo;s courses, modules, and live sessions in one place.
      </p>

      <div className="mt-10 rounded-lg border border-gray-200 p-5">
        <h2 className="text-sm font-medium text-gray-900">Administration</h2>
        <p className="mt-1 text-sm text-gray-600">
          Connect your organisation&rsquo;s Zoom or Microsoft Teams account so any course or module
          can host live sessions through it.
        </p>
        <Link
          href="/admin/integrations"
          className="mt-4 inline-block text-sm font-medium text-teal-700 underline underline-offset-4 hover:text-teal-800"
        >
          Manage integrations
        </Link>
      </div>
    </main>
  );
}
