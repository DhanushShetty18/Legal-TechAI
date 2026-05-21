"use client";

import { useState } from "react";
import AppSidebar from "@/components/AppSidebar";
import { Upload, FileSearch, AlertCircle, CheckCircle, Loader2 } from "lucide-react";

export default function InconsistencyPage() {
    const [fileA, setFileA] = useState<File | null>(null);
    const [fileB, setFileB] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const handleScan = async () => {
        if (!fileA || !fileB) {
            setError("Please upload both Document A and Document B.");
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const formData = new FormData();
            formData.append("files", fileA);
            formData.append("files", fileB);

            const res = await fetch("https://legal-techai.onrender.com/inconsistency/detect-inconsistencies", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || "Failed to scan documents.");
            }

            const data = await res.json();
            setResult(data);
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex bg-slate-50">
            <AppSidebar />
            <main className="flex-1 overflow-y-auto">
                <header className="bg-white border-b border-slate-200 px-8 py-6">
                    <h1 className="text-2xl font-bold text-slate-900">Inconsistency Detector</h1>
                    <p className="text-slate-500 text-sm">Cross-examine two documents to find factual contradictions.</p>
                </header>
                
                <div className="p-8 max-w-5xl mx-auto space-y-8">
                    {/* Upload Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center">
                            <h3 className="font-bold text-slate-700 mb-4">Document A</h3>
                            <div className="w-full relative">
                                <input 
                                    type="file" 
                                    accept=".pdf,.txt"
                                    onChange={(e) => setFileA(e.target.files?.[0] || null)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <div className={`w-full py-8 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors ${fileA ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                                    <Upload className="h-8 w-8 mb-2" />
                                    <span className="font-medium text-sm">{fileA ? fileA.name : "Click or drag file to upload"}</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center">
                            <h3 className="font-bold text-slate-700 mb-4">Document B</h3>
                            <div className="w-full relative">
                                <input 
                                    type="file" 
                                    accept=".pdf,.txt"
                                    onChange={(e) => setFileB(e.target.files?.[0] || null)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <div className={`w-full py-8 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors ${fileB ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                                    <Upload className="h-8 w-8 mb-2" />
                                    <span className="font-medium text-sm">{fileB ? fileB.name : "Click or drag file to upload"}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-center">
                        {error && (
                            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 w-full max-w-md text-sm">
                                <AlertCircle className="h-5 w-5 shrink-0" /> {error}
                            </div>
                        )}
                        <button
                            onClick={handleScan}
                            disabled={loading || !fileA || !fileB}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-8 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-sm"
                        >
                            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSearch className="h-5 w-5" />}
                            {loading ? "Scanning for Contradictions..." : "Scan for Contradictions"}
                        </button>
                    </div>

                    {/* Results Section */}
                    {result && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
                                    <div className="text-3xl font-bold text-slate-900">{result.total_contradictions}</div>
                                    <div className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Contradictions</div>
                                </div>
                                <div className="bg-white p-6 rounded-xl border border-red-100 shadow-sm text-center">
                                    <div className="text-3xl font-bold text-red-600">{result.high_severity}</div>
                                    <div className="text-sm font-medium text-red-500 uppercase tracking-wider">High Severity</div>
                                </div>
                                <div className="bg-white p-6 rounded-xl border border-emerald-100 shadow-sm text-center">
                                    <div className="text-3xl font-bold text-emerald-600">{result.clean_facts?.length || 0}</div>
                                    <div className="text-sm font-medium text-emerald-500 uppercase tracking-wider">Consistent Facts</div>
                                </div>
                            </div>

                            {result.contradictions && result.contradictions.length > 0 ? (
                                <div className="space-y-4">
                                    <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                        <AlertCircle className="h-6 w-6 text-red-500" /> Detected Contradictions
                                    </h3>
                                    {result.contradictions.map((inc: any, i: number) => (
                                        <div key={i} className={`bg-white rounded-xl shadow-sm border-l-4 p-6 ${inc.severity === 'HIGH' ? 'border-red-500' : inc.severity === 'MEDIUM' ? 'border-amber-500' : 'border-blue-500'}`}>
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex items-center gap-3">
                                                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${inc.severity === 'HIGH' ? 'bg-red-100 text-red-700' : inc.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                                        {inc.severity} SEVERITY
                                                    </span>
                                                    <span className="text-sm font-bold text-slate-500 uppercase">{inc.contradiction_type}</span>
                                                </div>
                                            </div>
                                            
                                            <p className="text-slate-800 font-medium mb-4">{inc.explanation}</p>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                                                    <div className="text-xs font-bold text-slate-400 mb-1">Document A Quote:</div>
                                                    <p className="text-sm text-slate-700 italic">"{inc.exact_quote_doc_a}"</p>
                                                </div>
                                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                                                    <div className="text-xs font-bold text-slate-400 mb-1">Document B Quote:</div>
                                                    <p className="text-sm text-slate-700 italic">"{inc.exact_quote_doc_b}"</p>
                                                </div>
                                            </div>

                                            {inc.impossibility_reason && (
                                                <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-800 flex items-start gap-2">
                                                    <AlertCircle className="h-5 w-5 shrink-0" />
                                                    <div>
                                                        <strong>Physical Impossibility:</strong> {inc.impossibility_reason}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-emerald-50 border border-emerald-200 p-8 rounded-2xl text-center flex flex-col items-center">
                                    <CheckCircle className="h-12 w-12 text-emerald-500 mb-4" />
                                    <h3 className="text-xl font-bold text-emerald-800 mb-2">No Contradictions Found</h3>
                                    <p className="text-emerald-600">The analyzed documents appear consistent based on the extracted facts.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
