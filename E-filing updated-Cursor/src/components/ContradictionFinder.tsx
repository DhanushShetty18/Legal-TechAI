"use client";

import { useState } from "react";
import {
  CONTRADICTION_EXAMPLE,
  findContradictions,
  type PreviewSuccess,
} from "@/lib/contradiction/preview";

export default function ContradictionFinder() {
  const [textA, setTextA] = useState("");
  const [textB, setTextB] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PreviewSuccess | null>(null);

  function onScan() {
    // FLOW BOUNDARY — both boxes enter here. The preview function compares them.
    // Next step: clashes, matches, or an error. No request leaves this browser.
    // Failure point: a blank box. The full Gemini engine is a different program.
    const outcome = findContradictions(textA, textB);
    if (!outcome.ok) {
      setError(outcome.error);
      setResult(null);
      return;
    }
    setError(null);
    setResult(outcome);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">
          Document A
          <textarea
            value={textA}
            onChange={(event) => setTextA(event.target.value)}
            rows={8}
            className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
            placeholder={"Location: Pune\nDate: 12 March 2024\nAmount: Rs 500000"}
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Document B
          <textarea
            value={textB}
            onChange={(event) => setTextB(event.target.value)}
            rows={8}
            className="mt-2 w-full rounded-xl border border-slate-300 p-3 font-normal"
            placeholder={"Location: Mumbai\nDate: 12 March 2024\nAmount: Rs 50000"}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onScan} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white">
          Check for clashes
        </button>
        <button
          type="button"
          onClick={() => {
            setTextA(CONTRADICTION_EXAMPLE.a);
            setTextB(CONTRADICTION_EXAMPLE.b);
            setError(null);
            setResult(null);
          }}
          className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold"
        >
          Load FIR example
        </button>
      </div>

      <div aria-live="polite">
        {!error && !result && (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
            Nothing compared yet. Paste two papers, or load the FIR example, then check for clashes.
          </p>
        )}
        {error && <p className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">{error}</p>}
        {result && (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm">
            {result.clashes.length === 0 ? (
              <p className="font-semibold text-emerald-800">No clash in the labeled facts both papers share.</p>
            ) : (
              <ul className="space-y-2">
                {result.clashes.map((clash) => (
                  <li key={clash.kind} className="rounded-xl bg-red-50 px-3 py-2 text-red-900">
                    <span className="font-bold capitalize">{clash.kind}:</span> Document A says {clash.left}. Document B says {clash.right}.
                  </li>
                ))}
              </ul>
            )}
            {result.matched.length > 0 && (
              <p className="text-slate-600">Matches: {result.matched.join(", ")}.</p>
            )}
            {result.onlyOnOneSide.length > 0 && (
              <p className="text-slate-600">
                Only on one side:{" "}
                {result.onlyOnOneSide.map((item) => `${item.kind} on ${item.side}`).join(", ")}.
              </p>
            )}
            <p className="text-xs text-slate-500">{result.note}</p>
          </div>
        )}
      </div>
    </div>
  );
}
