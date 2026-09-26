"use client";

import { useState } from "react";
import { AlertCircle, Calculator, CheckCircle2, Info } from "lucide-react";
import type { StampDutySuccess } from "@/lib/stamp-duty/engine";
import {
  PROPERTY_TYPES,
  STATE_OPTIONS,
  STATE_RATES,
  TRANSACTION_TYPES,
  type BuyerType,
  type PropertyType,
  type StateCode,
  type TransactionType,
} from "@/lib/stamp-duty/rates";

function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

type Status = "idle" | "loading" | "done" | "error";

export default function StampDutyCalculator() {
  const [state, setState] = useState<StateCode>("maharashtra");
  const [propertyValue, setPropertyValue] = useState("");
  const [gender, setGender] = useState<BuyerType>("male");
  const [propertyType, setPropertyType] = useState<PropertyType>("residential");
  const [transactionType, setTransactionType] = useState<TransactionType>("sale");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [result, setResult] = useState<StampDutySuccess | null>(null);
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);

  const formKey = JSON.stringify({ state, propertyValue, gender, propertyType, transactionType });
  const stale = status === "done" && result !== null && submittedKey !== formKey;
  const selected = STATE_RATES[state];

  async function onCalculate() {
    // FLOW BOUNDARY — data enters from the form, then leaves for /api/stamp-duty.
    // Typing in the boxes does not reach this function. Only the Calculate click does.
    // Next step: the route calls calculateStampDuty and returns JSON.
    // Failure points: blank or bad value (engine error), or the route never answers.
    setStatus("loading");
    setError(null);
    setErrorField(null);
    setResult(null);

    try {
      const response = await fetch("/api/stamp-duty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state, propertyValue, gender, propertyType, transactionType }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!data || typeof data !== "object" || !("ok" in data)) {
        setStatus("error");
        setError("The stamp duty route answered in a shape this page does not understand.");
        return;
      }
      const payload = data as { ok: boolean; error?: string; field?: string };
      if (!payload.ok) {
        setStatus("error");
        setError(payload.error ?? "The engine rejected this input.");
        setErrorField(payload.field ?? null);
        return;
      }
      setResult(data as StampDutySuccess);
      setSubmittedKey(formKey);
      setStatus("done");
    } catch {
      setStatus("error");
      setError("The stamp duty route did not answer. If /api/stamp-duty is missing, Calculate cannot finish.");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Property details</h2>

        <label className="block text-sm text-slate-700">
          State / UT
          <select
            value={state}
            onChange={(event) => setState(event.target.value as StateCode)}
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {STATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-slate-700">
          Property / market value (₹)
          <input
            type="text"
            inputMode="decimal"
            placeholder="e.g. 5000000"
            value={propertyValue}
            onChange={(event) => setPropertyValue(event.target.value)}
            aria-invalid={errorField === "propertyValue"}
            className={`mt-1.5 w-full rounded-xl border p-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500 ${
              errorField === "propertyValue" ? "border-red-400" : "border-slate-300"
            }`}
          />
        </label>

        <fieldset>
          <legend className="text-sm text-slate-700">Buyer type</legend>
          <div className="mt-2 flex gap-2">
            {(["male", "female", "joint"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setGender(option)}
                className={`flex-1 rounded-xl border py-2.5 text-sm font-medium capitalize ${
                  gender === option
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-slate-300 bg-white text-slate-600"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm text-slate-700">
          Property type
          <select
            value={propertyType}
            onChange={(event) => setPropertyType(event.target.value as PropertyType)}
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {PROPERTY_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-slate-700">
          Transaction / document type
          <select
            value={transactionType}
            onChange={(event) => setTransactionType(event.target.value as TransactionType)}
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {TRANSACTION_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onCalculate}
          disabled={status === "loading"}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
        >
          <Calculator className="h-4 w-4" aria-hidden />
          {status === "loading" ? "Calculating…" : "Calculate stamp duty"}
        </button>
        <p className="text-xs text-slate-500">
          Changing a box only updates this page. The total changes after you click Calculate.
        </p>
      </section>

      <section className="flex flex-col gap-6">
        <div aria-live="polite">
          {status === "idle" && (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
              <Calculator className="h-10 w-10 opacity-40" aria-hidden />
              <p className="text-sm">
                Nothing calculated yet. Fill in the details and click{" "}
                <span className="font-semibold text-emerald-700">Calculate stamp duty</span>.
              </p>
            </div>
          )}

          {status === "loading" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Asking /api/stamp-duty…
            </div>
          )}

          {status === "error" && error && (
            <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <p>{error}</p>
            </div>
          )}

          {status === "done" && result && (
            <div className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-6">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" aria-hidden />
                <h2 className="text-sm font-semibold uppercase tracking-wider">Calculation result</h2>
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-slate-100 py-2">
                  <dt className="text-slate-500">Property value</dt>
                  <dd className="font-semibold">{formatInr(result.propertyValue)}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-2">
                  <dt className="text-slate-500">Stamp duty rate</dt>
                  <dd className="font-semibold text-emerald-700">{result.rate}%</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-2">
                  <dt className="text-slate-500">Stamp duty amount</dt>
                  <dd className="text-lg font-bold">{formatInr(result.stampDuty)}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 py-2">
                  <dt className="text-slate-500">Registration charges ({result.registrationRate}%)</dt>
                  <dd className="font-semibold">{formatInr(result.registration)}</dd>
                </div>
                <div className="flex justify-between rounded-xl bg-emerald-50 px-3 py-3">
                  <dt className="font-bold text-emerald-800">Total payable</dt>
                  <dd className="text-xl font-extrabold text-emerald-800">{formatInr(result.total)}</dd>
                </div>
              </dl>
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
                {result.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
              {stale && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  You changed the form. This total is for the last click. Click Calculate again.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-amber-700">
            <Info className="h-4 w-4" aria-hidden />
            <h3 className="text-xs font-bold uppercase tracking-wider">Disclaimer</h3>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            These are indicative estimates from the published state table in this app. Circle rates,
            surcharges, and municipal levies can change the bill. A licensed advocate or the
            sub-registrar confirms the official figure before registration.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Selected state rates — {selected.label}
          </h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(["male", "female", "joint"] as const).map((option) => (
              <div
                key={option}
                className={`rounded-xl border p-3 text-center ${
                  gender === option ? "border-emerald-600 bg-emerald-50" : "border-slate-200"
                }`}
              >
                <p className="text-xs capitalize text-slate-500">{option}</p>
                <p className="mt-1 text-lg font-bold">{selected[option]}%</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">
            Registration charge: <span className="font-semibold text-slate-800">{selected.registration}%</span>
          </p>
        </div>
      </section>
    </div>
  );
}
