"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ChevronLeft, Calendar, FileText, Activity } from "lucide-react";

interface Case {
    id: number;
    case_number: string;
    title: string;
    description: string;
    status: string;
    created_at: string;
    documents: { id: number, file_hash: string, capture_metadata?: string }[];
}

export default function SearchCasePage() {
    const [query, setQuery] = useState("");
    const [result, setResult] = useState<Case | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query) return;

        setLoading(true);
        setError("");
        setResult(null);

        try {
            const res = await fetch(`https://legal-techai.onrender.com/cases/search?q=${query}`);
            if (!res.ok) {
                if (res.status === 404) throw new Error("Case not found");
                throw new Error("Search failed");
            }
            const data = await res.json();
            setResult(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50">
            <nav className="bg-white border-b border-slate-200 px-4 py-3 sticky top-0 z-10">
                <div className="container mx-auto flex items-center gap-4">
                    <Link href="/" className="text-slate-400 hover:text-slate-900">
                        <ChevronLeft className="h-6 w-6" />
                    </Link>
                    <h1 className="font-bold text-slate-900">Public Case Search</h1>
                </div>
            </nav>

            <main className="container mx-auto p-4 py-8 max-w-3xl">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
                    <h2 className="text-2xl font-bold text-slate-900 mb-4 text-center">Track Case Status</h2>
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Enter Case Number (e.g., CASE-XXXXX)"
                                className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none uppercase font-mono tracking-wide"
                                value={query}
                                onChange={(e) => setQuery(e.target.value.toUpperCase())}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                            {loading ? "Searching..." : "Track"}
                        </button>
                    </form>
                    {error && (
                        <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-xl text-center">
                            {error}
                        </div>
                    )}
                </div>

                {result && (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                        <div className="bg-slate-900 p-6 text-white flex justify-between items-start">
                            <div>
                                <div className="text-slate-400 text-sm font-mono mb-1">CASE NUMBER</div>
                                <h1 className="text-3xl font-bold font-mono tracking-wider">{result.case_number}</h1>
                            </div>
                            <div className={`px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wider ${result.status === 'OPEN' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-slate-700 text-slate-300'}`}>
                                {result.status}
                            </div>
                        </div>

                        <div className="p-6 space-y-8">
                            {/* Title & Desc */}
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 mb-2">{result.title}</h3>
                                <p className="text-slate-600 leading-relaxed">{result.description}</p>
                            </div>

                            {/* Meta Stats */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-6 border-y border-slate-100">
                                <div>
                                    <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Filed On</div>
                                    <div className="flex items-center gap-2 text-slate-900 font-medium">
                                        <Calendar className="h-4 w-4 text-indigo-500" />
                                        {new Date(result.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Documents</div>
                                    <div className="flex items-center gap-2 text-slate-900 font-medium">
                                        <FileText className="h-4 w-4 text-indigo-500" />
                                        {result.documents.length} Files
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Next Hearing</div>
                                    <div className="flex items-center gap-2 text-slate-500 font-medium italic">
                                        Pending
                                    </div>
                                </div>
                            </div>

                            {/* Simple Timeline Sim */}
                            <div>
                                <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                    <Activity className="h-5 w-5 text-indigo-600" /> Case Activity
                                </h4>
                                <div className="border-l-2 border-indigo-100 ml-2 space-y-6 pb-2">
                                    <div className="relative pl-6">
                                        <div className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-indigo-600 border-4 border-white shadow-sm"></div>
                                        <div className="font-medium text-slate-900">Case Filed</div>
                                        <div className="text-sm text-slate-500">{new Date(result.created_at).toLocaleString()}</div>
                                        <div className="mt-2 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100 text-slate-600">
                                            Digital filing accepted via Camera Interface. Original evidence hashed.
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Extracted Document Data Section */}
                            {result.documents.map((doc, idx) => {
                                if (!doc.capture_metadata) return null;
                                let metadata = null;
                                try {
                                    metadata = JSON.parse(doc.capture_metadata);
                                } catch (e) {
                                    return null;
                                }
                                
                                return (
                                    <div key={idx} className="mt-8 border border-slate-200 rounded-xl overflow-hidden">
                                        <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center gap-2">
                                            <FileText className="h-5 w-5 text-indigo-600" />
                                            <h4 className="font-bold text-slate-900">Extracted Document Form</h4>
                                        </div>
                                        <div className="p-6 bg-white">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                                {Object.entries(metadata).map(([key, value]) => (
                                                    value ? (
                                                        <div key={key} className="border-b border-slate-100 pb-2">
                                                            <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">
                                                                {key.replace(/([A-Z])/g, ' $1').trim()}
                                                            </div>
                                                            <div className="font-medium text-slate-900">
                                                                {String(value)}
                                                            </div>
                                                        </div>
                                                    ) : null
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
