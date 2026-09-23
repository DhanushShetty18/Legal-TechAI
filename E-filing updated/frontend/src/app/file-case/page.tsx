"use client";

import React, { useState, useEffect } from "react";
import { ChevronLeft, FileText, CheckCircle2, Circle, Loader2, Download, Printer } from "lucide-react";
import Link from "next/link";

type Mode = "mode_a" | "mode_b";
type SubMode = "jmfc" | "vakalatnama" | "none";

const dummyExtractions = [
    "✅ Document Extracted: FIR Copy",
    "✅ Identified Jurisdiction: Mumbai Court",
    "✅ Petitioner Name Found: Rajesh Kumar",
    "✅ Respondent Name Found: State of Maharashtra",
    "✅ Validating Legal Provisions...",
    "✅ Sections Identified: 420, 406 IPC",
    "✅ Extracting Dates...",
    "✅ Date of Incident: 14th Aug 2026",
    "✅ Structuring Final Draft..."
];

export default function LiveCompilationEngine() {
    const [mode, setMode] = useState<Mode>("mode_a");
    const [subMode, setSubMode] = useState<SubMode>("none");
    const [isStampPaper, setIsStampPaper] = useState(false);

    const [isGenerating, setIsGenerating] = useState(false);
    const [extractionSteps, setExtractionSteps] = useState<string[]>([]);
    const [canvasLines, setCanvasLines] = useState<string[]>([]);
    const [isComplete, setIsComplete] = useState(false);

    // Document mock payload mapped to the Backend API
    const getPayload = () => {
        if (mode === "mode_a") {
            return {
                mode: "mode_a",
                data: {
                    is_affidavit_or_deed: isStampPaper,
                    court_name: "HIGH COURT OF JUDICATURE AT BOMBAY",
                    petitioner_name: "Rajesh Kumar",
                    respondent_name: "State of Maharashtra",
                    synopsis: [{ date: "14-08-2026", event: "FIR registered at local PS." }],
                    body_paragraphs: [
                        "That the petitioner is a law-abiding citizen.",
                        "That the charges levied under sections 420 and 406 are fabricated.",
                        "That there is no prime facie case against the petitioner."
                    ],
                    prayer_clauses: ["To quash the FIR.", "Any other relief deemed fit."],
                    place: "Mumbai",
                    date: "23rd Sept 2026",
                    year: "2026",
                    case_number: "___"
                }
            };
        } else {
            return {
                mode: "mode_b",
                data: {
                    template_type: subMode,
                    is_stamp_paper: isStampPaper,
                    case_number: "1234",
                    complainant: "Rajesh Kumar",
                    accused: "State of Maharashtra",
                    court_name: "ADDL. J.M.F.C.",
                    client_name: "Rajesh Kumar",
                    advocate_name: "Dhanush Shetty"
                }
            };
        }
    };

    const runSimulation = () => {
        setIsGenerating(true);
        setExtractionSteps([]);
        setCanvasLines([]);
        setIsComplete(false);

        // Simulating Live Typing MACAPTT effect
        const totalSteps = dummyExtractions.length;

        dummyExtractions.forEach((text, i) => {
            setTimeout(() => {
                setExtractionSteps(prev => [...prev, text]);

                if (i === 1) setCanvasLines(prev => [...prev, "IN THE HIGH COURT OF JUDICATURE AT BOMBAY"]);
                if (i === 3) setCanvasLines(prev => [...prev, "Rajesh Kumar ... Petitioner\nVs.\nState of Maharashtra ... Respondent"]);
                if (i === 5) setCanvasLines(prev => [...prev, "1. That the petitioner is a law abiding citizen..."]);
                if (i === 7) setCanvasLines(prev => [...prev, "2. That the charges levied are entirely fabricated..."]);
                if (i === 8) setCanvasLines(prev => [...prev, "PRAYER:\nWherefore it is prayed to quash the FIR."]);

                if (i === totalSteps - 1) {
                    setIsComplete(true);
                    setIsGenerating(false);
                }
            }, (i + 1) * 800);
        });
    };

    const handleDownload = async () => {
        try {
            const payload = getPayload();
            const res = await fetch("http://localhost:8000/drafting/draft", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Generation failed");

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = mode === "mode_a" ? "Draft_Petition.docx" : "Draft_Application.pdf";
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error(error);
            alert("Backend connection failed. Ensure FastAPI is running on port 8000.");
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans">
            <header className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur z-10 sticky top-0 px-6">
                <div className="flex items-center">
                    <Link href="/" className="mr-4 text-slate-400 hover:text-white transition-colors">
                        <ChevronLeft className="h-6 w-6" />
                    </Link>
                    <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
                        Live Drafting Engine
                    </h1>
                </div>
            </header>

            <main className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden">
                {/* LEFT PANEL: Controls & Extraction Checklist */}
                <div className="w-full lg:w-1/3 p-6 border-r border-slate-800 bg-slate-900/50 flex flex-col gap-6 overflow-y-auto">
                    <div>
                        <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">Engine Settings</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm mb-1 text-slate-300">Select Architecture Mode</label>
                                <select
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={mode}
                                    onChange={(e) => {
                                        setMode(e.target.value as Mode);
                                        if (e.target.value === "mode_b") setSubMode("jmfc");
                                    }}
                                    disabled={isGenerating}
                                >
                                    <option value="mode_a">[Mode A] Multi-Page Court Petition</option>
                                    <option value="mode_b">[Mode B] One-Pager Fixed Application</option>
                                </select>
                            </div>

                            {mode === "mode_b" && (
                                <div className="animate-in fade-in slide-in-from-top-2">
                                    <label className="block text-sm mb-1 text-slate-300">Application Template</label>
                                    <select
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={subMode}
                                        onChange={(e) => setSubMode(e.target.value as SubMode)}
                                        disabled={isGenerating}
                                    >
                                        <option value="jmfc">JMFC Urgent Application Memo</option>
                                        <option value="vakalatnama">Standard Vakalatnama</option>
                                    </select>
                                </div>
                            )}

                            <div className="flex items-center gap-3 bg-slate-800/50 p-3 rounded-lg border border-slate-700 cursor-pointer" onClick={() => setIsStampPaper(!isStampPaper)}>
                                <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${isStampPaper ? 'bg-indigo-500 border-indigo-500' : 'border-slate-500'}`}>
                                    {isStampPaper && <CheckCircle2 className="w-4 h-4 text-white" />}
                                </div>
                                <div>
                                    <p className="text-sm font-medium">Enable Stamp Paper Offset</p>
                                    <p className="text-xs text-slate-400">Leaves 4.5" blank top margin on Page 1</p>
                                </div>
                            </div>

                            <button
                                onClick={runSimulation}
                                disabled={isGenerating}
                                className="w-full mt-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded-lg font-bold transition-all shadow-lg flex items-center justify-center gap-2"
                            >
                                {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}
                                {isGenerating ? "Compiling Live..." : "Start Compilation Engine"}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden">
                        <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider flex items-center justify-between">
                            <span>Extraction Pipeline</span>
                            {isGenerating && <span className="text-xs text-indigo-400 flex items-center gap-1 animate-pulse"><Circle className="w-2 h-2 fill-current" /> Streaming</span>}
                        </h2>

                        <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 flex-1 overflow-y-auto space-y-3 font-mono text-sm shadow-inner">
                            {extractionSteps.length === 0 && !isGenerating && (
                                <p className="text-slate-500 italic text-center mt-10">Awaiting trigger signal...</p>
                            )}
                            {extractionSteps.map((step, idx) => (
                                <div key={idx} className="flex gap-2 text-emerald-400 animate-in slide-in-from-left-4 fade-in duration-300">
                                    <span>{step}</span>
                                </div>
                            ))}
                            {isGenerating && (
                                <div className="flex items-center gap-2 text-slate-400 animate-pulse">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Processing parameters...
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT PANEL: Digital Canvas Projection */}
                <div className="w-full lg:w-2/3 bg-slate-800/20 p-4 md:p-8 flex items-center justify-center relative overflow-y-auto">

                    {/* Visual A4 Canvas Paper */}
                    <div className="bg-white w-full max-w-[800px] min-h-[1131px] shadow-2xl rounded rounded-sm relative transition-all duration-700 flex flex-col pb-16 transform scale-90 md:scale-100 origin-top">

                        {/* Stamp paper guideline representation */}
                        {isStampPaper && (
                            <div className="absolute top-0 left-0 right-0 h-[324px] bg-red-500/5 border-b border-red-500/20 z-0 flex items-center justify-center">
                                <span className="text-red-900/30 text-2xl font-bold uppercase rotate-[-15deg] select-none border-4 border-red-900/20 p-2">Physical Stamp Paper Offset Area (4.5")</span>
                            </div>
                        )}

                        <div className={`relative z-10 w-full h-full flex flex-col p-16 text-black select-none ${isStampPaper ? 'pt-[360px]' : ''}`}>

                            {canvasLines.length === 0 && !isGenerating && (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4 opacity-50">
                                    <FileText className="w-16 h-16" />
                                    <p className="text-lg">Canvas Offline</p>
                                </div>
                            )}

                            {canvasLines.map((line, idx) => (
                                <div key={idx} className="text-[17px] font-serif leading-[2.2] mb-6 whitespace-pre-wrap text-justify animate-in fade-in duration-700" style={{ fontFamily: 'Times New Roman, serif' }}>
                                    {idx === 0 ? <div className="text-center font-bold text-lg leading-relaxed">{line}</div> : line}
                                </div>
                            ))}

                        </div>
                    </div>

                    {/* Download Controls overlay */}
                    {isComplete && (
                        <div className="absolute bottom-8 right-8 z-50 animate-in slide-in-from-bottom-8 fade-in">
                            <button
                                onClick={handleDownload}
                                className="py-4 px-8 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold transition-all shadow-xl shadow-emerald-500/25 flex items-center justify-center gap-3 text-lg"
                            >
                                <Download className="w-6 h-6" /> Produce Official Document
                            </button>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
}

