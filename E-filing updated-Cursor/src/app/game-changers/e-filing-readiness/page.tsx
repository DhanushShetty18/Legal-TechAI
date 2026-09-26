import ReadinessGate from "@/components/ReadinessGate";

export default function EFilingReadinessPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-extrabold text-slate-900">E-Filing Readiness Gate</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Courts delay filings when a required paper is missing. Pick a pack this product already
        knows, tick what you have, and see what is still open.
      </p>
      <div className="mt-8">
        <ReadinessGate />
      </div>
    </main>
  );
}
