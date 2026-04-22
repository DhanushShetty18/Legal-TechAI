"use client";

import { useState } from "react";
import Link from "next/link";
import { Scale, FileText, BrainCircuit, ChevronRight, Calendar, AlertTriangle } from "lucide-react";

interface Summary {
    case_number: string;
    summary: string;
    recommendation: string;
    key_dates: { event: string; date: string }[];
    citations: string[];
}

export default function JudgeDashboard() {
    const [caseId, setCaseId] = useState(""); // Simplified for MVP: enter ID
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(false);

    const handleGenerateSummary = async () => {
        if (!caseId) return;
        setLoading(true);
        try {
            // We usually use ID, but for simpler manual testing let's assume user knows database ID or we search
            // For this demo, let's just try ID 1 if they type 1, etc.
            const res = await fetch(`http://localhost:8000/cases/${caseId}/summary`);
            if (!res.ok) throw new Error("Case failed");
            const data = await res.json();
            setSummary(data);
        } catch (e) {
            alert("Case not found or Summary Error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 flex">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col hidden md:flex">
                <div className="p-6 border-b border-slate-800 flex items-center gap-2 text-white font-bold text-xl">
                    <Scale className="h-6 w-6" /> JudicialOS
                </div>
                <nav className="flex-1 p-4 space-y-2">
                    <div className="bg-slate-800 text-white rounded-lg p-3 flex items-center gap-3">
                        <BrainCircuit className="h-5 w-5 text-purple-400" /> AI Assistant
                    </div>
                    <div className="hover:bg-slate-800 rounded-lg p-3 flex items-center gap-3 cursor-not-allowed opacity-50">
                        <FileText className="h-5 w-5" /> Case Files
                    </div>
                    <div className="hover:bg-slate-800 rounded-lg p-3 flex items-center gap-3 cursor-not-allowed opacity-50">
                        <Calendar className="h-5 w-5" /> Schedule
                    </div>
                </nav>
                <div className="p-4 border-t border-slate-800">
                    <div className="text-xs uppercase tracking-wider font-bold mb-2">System Status</div>
                    <div className="flex items-center gap-2 text-emerald-400 text-sm">
                        <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse"></div> Online
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-8">
                <header className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Case Readiness & Summary</h1>
                        <p className="text-slate-500">AI-Assisted Judicial Prep Tool</p>
                    </div>
                    <Link href="/" className="text-sm font-bold text-slate-500 hover:text-slate-900 border border-slate-300 rounded-lg px-4 py-2 bg-white">
                        Exit Dashboard
                    </Link>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Input Column */}
                    <div className="col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit">
                        <h2 className="font-bold text-slate-900 mb-4">Select Case</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Enter Case Internal ID</label>
                                <input
                                    type="number"
                                    className="w-full border border-slate-300 rounded-lg px-4 py-2"
                                    placeholder="e.g. 1"
                                    value={caseId}
                                    onChange={(e) => setCaseId(e.target.value)}
                                />
                                <p className="text-xs text-slate-400 mt-1">
                                    * Try '1' or '2' (Created via scripts)
                                </p>
                            </div>
                            <button
                                onClick={handleGenerateSummary}
                                disabled={loading || !caseId}
                                className="w-full bg-purple-600 text-white rounded-lg py-3 font-bold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? <BrainCircuit className="h-5 w-5 animate-spin" /> : <BrainCircuit className="h-5 w-5" />}
                                Generate AI Summary
                            </button>

                            <div className="bg-purple-50 text-purple-800 p-4 rounded-lg text-sm">
                                <strong>Note:</strong> This uses a deterministic rule-based engine for the MVP. Full LLM integration requires an API Key.
                            </div>
                        </div>
                    </div>

                    {/* Summary Output */}
                    <div className="col-span-1 lg:col-span-2 space-y-6">
                        {summary ? (
                            <div className="bg-white rounded-2xl shadow-lg border border-purple-100 overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                                <div className="bg-purple-900 p-6 text-white flex justify-between items-start">
                                    <div>
                                        <div className="text-purple-300 text-xs font-bold uppercase tracking-wider mb-1">AI ANALYSIS GENERATED</div>
                                        <h2 className="text-2xl font-bold">Case #{summary.case_number}</h2>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-purple-300 text-xs font-bold uppercase tracking-wider mb-1">Risk Assessment</div>
                                        <span className="bg-white/10 px-3 py-1 rounded text-sm font-bold border border-white/20">
                                            {summary.recommendation}
                                        </span>
                                    </div>
                                </div>

                                <div className="p-8 space-y-8">
                                    <div>
                                        <h3 className="flex items-center gap-2 font-bold text-slate-900 mb-2">
                                            <FileText className="h-5 w-5 text-purple-600" /> Executive Summary
                                        </h3>
                                        <p className="text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-100">
                                            {summary.summary}
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div>
                                            <h3 className="flex items-center gap-2 font-bold text-slate-900 mb-4">
                                                <Calendar className="h-5 w-5 text-purple-600" /> Key Timeline
                                            </h3>
                                            <div className="space-y-4">
                                                {summary.key_dates.map((d, i) => (
                                                    <div key={i} className="flex gap-4">
                                                        <div className="w-24 text-xs font-bold text-slate-500 text-right pt-1">{d.date}</div>
                                                        <div className="flex-1 pb-4 border-l-2 border-purple-100 pl-4 relative">
                                                            <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-purple-400"></div>
                                                            <div className="font-medium text-slate-900">{d.event}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="flex items-center gap-2 font-bold text-slate-900 mb-4">
                                                <Scale className="h-5 w-5 text-purple-600" /> Relevant Statutes
                                            </h3>
                                            <ul className="space-y-2">
                                                {summary.citations.map((c, i) => (
                                                    <li key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-100 text-sm font-medium text-slate-700">
                                                        <ChevronRight className="h-4 w-4 text-purple-400" /> {c}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl p-12 bg-white/50">
                                <BrainCircuit className="h-16 w-16 mb-4 opacity-20" />
                                <p>Select a case ID and generate summary to view AI insights.</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
