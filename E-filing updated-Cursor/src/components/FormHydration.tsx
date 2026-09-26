"use client";

import { useState } from "react";
import { HYDRATION_EXAMPLE, hydrateCourtForm, type HydrationSuccess } from "@/lib/hydration/hydrate";

const LABELS = [
  ["name", "Name"],
  ["dateOfBirth", "Date of birth"],
  ["address", "Address"],
  ["aadhaar", "Aadhaar"],
  ["documentType", "Document"],
] as const;

export default function FormHydration() {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HydrationSuccess | null>(null);

  function onFill() {
    // FLOW BOUNDARY — the note enters here and becomes form fields.
    // Next step: filled boxes, or a list of problems. No OCR call is made.
    // Failure points: empty note, no labels, or an Aadhaar that is not 12 digits.
    const outcome = hydrateCourtForm(note);
    if (!outcome.ok) {
      setError(outcome.error);
      setResult(null);
      return;
    }
    setError(null);
    setResult(outcome);
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <section className="space-y-3">
        <label className="block text-sm font-semibold text-slate-700">
          Identity note
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={12}
            className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
            placeholder={"Name: Asha Rao\nDate of birth: 02 April 1990\nAddress: 12 MG Road, Pune\nAadhaar: 1234 5678 9012\nDocument: Sale deed"}
          />
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onFill} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">
            Fill the form
          </button>
          <button
            type="button"
            onClick={() => {
              setNote(HYDRATION_EXAMPLE);
              setError(null);
              setResult(null);
            }}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold"
          >
            Load example
          </button>
        </div>
      </section>

      <section aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Court form preview</h2>
        {!error && !result && (
          <p className="mt-4 text-sm text-slate-500">
            The form is empty. Paste a note and press Fill the form. Typing alone does not fill it.
          </p>
        )}
        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
        {result && (
          <div className="mt-4 space-y-3">
            {LABELS.map(([key, label]) => (
              <div key={key}>
                <p className="text-xs text-slate-500">{label}</p>
                <p className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  {result.fields[key] ?? "Missing"}
                </p>
              </div>
            ))}
            {result.problems.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800">
                {result.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm font-semibold text-emerald-800">Every field this preview knows is filled.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
