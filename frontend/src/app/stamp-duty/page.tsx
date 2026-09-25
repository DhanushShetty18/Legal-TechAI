"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Calculator, FileText, Info, IndianRupee, AlertCircle, CheckCircle2 } from "lucide-react";

/* ─────────────────────────────────────────────
   Stamp Duty rates by Indian state (2025 values)
   Males / Female / Joint — percentages
────────────────────────────────────────────── */
const STATE_RATES: Record<string, { male: number; female: number; joint: number; registration: number; label: string }> = {
    maharashtra: { male: 6, female: 5, joint: 5, registration: 1, label: "Maharashtra" },
    delhi: { male: 6, female: 4, joint: 5, registration: 1, label: "Delhi" },
    karnataka: { male: 5.6, female: 5.6, joint: 5.6, registration: 1, label: "Karnataka" },
    tamilnadu: { male: 7, female: 7, joint: 7, registration: 1, label: "Tamil Nadu" },
    gujart: { male: 4.9, female: 4.9, joint: 4.9, registration: 1, label: "Gujarat" },
    rajasthan: { male: 6, female: 5, joint: 5.5, registration: 1, label: "Rajasthan" },
    up: { male: 7, female: 7, joint: 7, registration: 1, label: "Uttar Pradesh" },
    westbengal: { male: 6, female: 6, joint: 6, registration: 1, label: "West Bengal" },
    andhra: { male: 5, female: 5, joint: 5, registration: 0.5, label: "Andhra Pradesh" },
    telangana: { male: 4, female: 4, joint: 4, registration: 0.5, label: "Telangana" },
    kerala: { male: 8, female: 8, joint: 8, registration: 2, label: "Kerala" },
    mp: { male: 7.5, female: 7.5, joint: 7.5, registration: 3, label: "Madhya Pradesh" },
    punjab: { male: 7, female: 5, joint: 6, registration: 1, label: "Punjab" },
    haryana: { male: 7, female: 5, joint: 6, registration: 0.5, label: "Haryana" },
};

const PROPERTY_TYPES = [
    { value: "residential", label: "Residential Property" },
    { value: "commercial", label: "Commercial Property" },
    { value: "agricultural", label: "Agricultural Land" },
    { value: "industrial", label: "Industrial Property" },
];

const TRANSACTION_TYPES = [
    { value: "sale", label: "Sale Deed" },
    { value: "gift", label: "Gift Deed" },
    { value: "will", label: "Will / Testament" },
    { value: "lease", label: "Lease Agreement" },
];

function formatINR(n: number): string {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export default function StampDutyPage() {
    const [state, setState] = useState("maharashtra");
    const [propertyValue, setPropertyValue] = useState("");
    const [gender, setGender] = useState<"male" | "female" | "joint">("male");
    const [propertyType, setPropertyType] = useState("residential");
    const [transactionType, setTransactionType] = useState("sale");
    const [result, setResult] = useState<null | { stampDuty: number; registration: number; total: number; rate: number; regRate: number }>(null);

    const calculate = () => {
        const val = parseFloat(propertyValue.replace(/,/g, ""));
        if (!val || isNaN(val)) return;

        const rates = STATE_RATES[state];
        let rate = rates[gender];

        // Commercial / Industrial uplift in some states
        if (propertyType === "commercial" || propertyType === "industrial") rate += 1;
        // Gift deeds usually get reduced stamp duty
        if (transactionType === "gift") rate = Math.max(1, rate - 2);
        // Lease and will — flat lower bracket
        if (transactionType === "lease" || transactionType === "will") rate = 1;

        const stampDuty = Math.round((val * rate) / 100);
        const regRate = rates.registration;
        const registration = Math.round((val * regRate) / 100);
        const total = stampDuty + registration;
        setResult({ stampDuty, registration, total, rate, regRate });
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white font-sans">
            {/* Header */}
            <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur">
                <div className="flex items-center gap-3">
                    <Link href="/" className="text-slate-400 hover:text-white transition-colors">
                        <ChevronLeft className="h-5 w-5" />
                    </Link>
                    <Calculator className="h-5 w-5 text-emerald-400" />
                    <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-400">
                        Stamp Duty Engine
                    </h1>
                </div>
                <span className="text-xs text-slate-500 border border-slate-700 px-3 py-1 rounded-full">India — FY 2025–26</span>
            </header>

            <main className="container mx-auto max-w-5xl px-4 py-10 grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* LEFT — Calculator Form */}
                <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                    <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-emerald-400" />
                        <h2 className="font-semibold text-slate-200 text-sm uppercase tracking-wider">Property Details</h2>
                    </div>

                    {/* State */}
                    <div>
                        <label className="block text-xs text-slate-400 mb-1.5">State / UT</label>
                        <select
                            value={state}
                            onChange={e => setState(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        >
                            {Object.entries(STATE_RATES).map(([k, v]) => (
                                <option key={k} value={k}>{v.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Market Value */}
                    <div>
                        <label className="block text-xs text-slate-400 mb-1.5">Property / Market Value (₹)</label>
                        <div className="relative">
                            <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <input
                                type="number"
                                placeholder="e.g. 5000000"
                                value={propertyValue}
                                onChange={e => setPropertyValue(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 pl-9 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                        </div>
                    </div>

                    {/* Buyer Gender */}
                    <div>
                        <label className="block text-xs text-slate-400 mb-2">Buyer Type</label>
                        <div className="flex gap-2">
                            {(["male", "female", "joint"] as const).map(g => (
                                <button
                                    key={g}
                                    onClick={() => setGender(g)}
                                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all capitalize ${gender === g
                                            ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-700/30"
                                            : "bg-slate-800 border-slate-700 text-slate-400 hover:border-emerald-600/50"
                                        }`}
                                >
                                    {g === "joint" ? "Joint" : g === "female" ? "Female" : "Male"}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Property Type */}
                    <div>
                        <label className="block text-xs text-slate-400 mb-1.5">Property Type</label>
                        <select
                            value={propertyType}
                            onChange={e => setPropertyType(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        >
                            {PROPERTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>

                    {/* Transaction Type */}
                    <div>
                        <label className="block text-xs text-slate-400 mb-1.5">Transaction / Document Type</label>
                        <select
                            value={transactionType}
                            onChange={e => setTransactionType(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        >
                            {TRANSACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>

                    <button
                        onClick={calculate}
                        className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-700/30 flex items-center justify-center gap-2"
                    >
                        <Calculator className="h-4 w-4" /> Calculate Stamp Duty
                    </button>
                </section>

                {/* RIGHT — Result Panel */}
                <section className="flex flex-col gap-6">

                    {/* Result card */}
                    {result ? (
                        <div className="bg-slate-900 border border-emerald-800/50 rounded-2xl p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                                <h2 className="font-semibold text-emerald-300 text-sm uppercase tracking-wider">Calculation Result</h2>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center py-3 border-b border-slate-800">
                                    <span className="text-sm text-slate-400">Property Value</span>
                                    <span className="font-semibold text-white">{formatINR(parseFloat(propertyValue))}</span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-b border-slate-800">
                                    <span className="text-sm text-slate-400">Stamp Duty Rate</span>
                                    <span className="font-semibold text-emerald-400">{result.rate}%</span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-b border-slate-800">
                                    <span className="text-sm text-slate-400">Stamp Duty Amount</span>
                                    <span className="font-bold text-white text-lg">{formatINR(result.stampDuty)}</span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-b border-slate-800">
                                    <span className="text-sm text-slate-400">Registration Charges ({result.regRate}%)</span>
                                    <span className="font-semibold text-white">{formatINR(result.registration)}</span>
                                </div>
                                <div className="flex justify-between items-center py-3 rounded-xl bg-emerald-900/20 px-3">
                                    <span className="font-bold text-emerald-300">Total Payable</span>
                                    <span className="font-extrabold text-emerald-300 text-xl">{formatINR(result.total)}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-4 text-slate-500 flex-1">
                            <Calculator className="h-12 w-12 opacity-30" />
                            <p className="text-sm">Fill in the details and click <span className="text-emerald-400 font-semibold">Calculate</span> to see the stamp duty breakdown.</p>
                        </div>
                    )}

                    {/* Info Card */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                        <div className="flex items-center gap-2">
                            <Info className="h-4 w-4 text-amber-400" />
                            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">Disclaimer</h3>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            This engine provides <strong className="text-slate-300">indicative estimates only</strong> based on published state rates.
                            Actual stamp duty may vary based on circle rates, surcharges, and municipal levies. Always consult a licensed advocate or sub-registrar for official valuation prior to registration.
                        </p>
                        <div className="flex items-center gap-2 mt-2 p-3 bg-amber-900/20 rounded-xl border border-amber-800/40">
                            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                            <p className="text-xs text-amber-300">Rates updated for FY 2025–26. Subject to state government revisions.</p>
                        </div>
                    </div>

                    {/* State Rate Table */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Selected State Rates — {STATE_RATES[state].label}</h3>
                        <div className="grid grid-cols-3 gap-2">
                            {(["male", "female", "joint"] as const).map(g => (
                                <div key={g} className={`rounded-xl p-3 text-center border ${gender === g ? "border-emerald-600 bg-emerald-900/20" : "border-slate-800 bg-slate-800/50"}`}>
                                    <p className="text-xs capitalize text-slate-400">{g}</p>
                                    <p className="text-lg font-bold text-white mt-1">{STATE_RATES[state][g]}%</p>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 text-center">
                            <p className="text-xs text-slate-500">Registration charge: <span className="text-slate-300 font-semibold">{STATE_RATES[state].registration}%</span></p>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
