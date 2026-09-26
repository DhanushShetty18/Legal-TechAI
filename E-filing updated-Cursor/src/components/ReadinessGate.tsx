"use client";

import { useState } from "react";
import Link from "next/link";
import { FILING_PACKS } from "@/lib/e-filing/checklists";

type Verdict = { ready: boolean; missing: string[] } | null;

export default function ReadinessGate() {
  const [packId, setPackId] = useState(FILING_PACKS[0].id);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [verdict, setVerdict] = useState<Verdict>(null);
  const pack = FILING_PACKS.find((item) => item.id === packId) ?? FILING_PACKS[0];

  function toggle(id: string) {
    // A tick only changes local state. The verdict waits for the button.
    setChecked((current) => ({ ...current, [id]: !current[id] }));
    setVerdict(null);
  }

  function onCheck() {
    // FLOW BOUNDARY — the click reads the ticks and decides ready or not.
    // Next step: the panel lists missing papers. Nothing is sent to a server.
    // Failure point: any unticked row keeps the filing in the "not ready" state.
    const missing = pack.items.filter((item) => !checked[item.id]).map((item) => item.label);
    setVerdict({ ready: missing.length === 0, missing });
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <label className="block text-sm text-slate-700">
          Filing type
          <select
            value={pack.id}
            onChange={(event) => {
              setPackId(event.target.value);
              setChecked({});
              setVerdict(null);
            }}
            className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm"
          >
            {FILING_PACKS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-slate-600">{pack.blurb}</p>
        <ul className="space-y-3">
          {pack.items.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-200 p-3">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(checked[item.id])}
                  onChange={() => toggle(item.id)}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold text-slate-900">{item.label}</span>
                  <span className="mt-1 block text-slate-500">{item.why}</span>
                  {item.href && (
                    <Link href={item.href} className="mt-1 inline-block font-semibold text-indigo-700">
                      Open the tool
                    </Link>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onCheck}
          className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white"
        >
          Check readiness
        </button>
      </section>

      <section aria-live="polite">
        {verdict === null ? (
          <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            No verdict yet. Tick the papers you have, then press Check readiness.
          </div>
        ) : verdict.ready ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
            <h2 className="text-lg font-bold">Ready to file</h2>
            <p className="mt-2 text-sm">Every paper in this pack is ticked. A clerk still checks the real documents.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
            <h2 className="text-lg font-bold">Not ready — a clerk can send this back</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {verdict.missing.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
