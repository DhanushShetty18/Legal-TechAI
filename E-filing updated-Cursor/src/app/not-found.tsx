import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-3xl font-bold text-slate-900">This page is not in the e-filing app</h1>
      <p className="mt-3 text-slate-600">
        The address does not match a page in this folder. Open the home page or the Game changer modules.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white">
          Home
        </Link>
        <Link href="/game-changers" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-bold">
          Game changers
        </Link>
      </div>
    </main>
  );
}
