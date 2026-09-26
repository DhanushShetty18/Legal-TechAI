import ContradictionFinder from "@/components/ContradictionFinder";

export default function ContradictionFinderPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-extrabold text-slate-900">Contradiction Finder</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        The product&apos;s inconsistency engine compares an FIR with a witness statement. This page
        is the small version: it only reads Location, Date, and Amount lines. The Gemini pipeline
        lives in the Python backend and is not started by this website.
      </p>
      <div className="mt-8">
        <ContradictionFinder />
      </div>
    </main>
  );
}
