import StampDutyCalculator from "@/components/StampDutyCalculator";

export default function StampDutyPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Stamp Duty Engine</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Pick a state, a buyer, and a document. The engine applies the rate table and adds
            registration. India — FY 2025–26 table.
          </p>
        </div>
        <span className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-500">
          Indicative, not a challan
        </span>
      </div>
      <StampDutyCalculator />
    </main>
  );
}
