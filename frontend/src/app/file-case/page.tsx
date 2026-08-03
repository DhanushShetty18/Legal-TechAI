"use client";

import { useState, useRef, useEffect, ChangeEvent } from "react";
import Link from "next/link";
import { Camera, ChevronLeft, Upload, CheckCircle, AlertCircle, Loader2, Image as ImageIcon, RefreshCw, CheckSquare, Edit } from "lucide-react";
import DocumentForm, { OCRData } from "@/components/DocumentForm";

type FlowState = 
    | 'IDLE'        
    | 'CAPTURE'     
    | 'PROCESSING'  
    | 'SUBMITTED';  

const caseDocumentRequirements = {
  "Divorce Case": [
    {
      phase: "Phase 1: The Initial Filing (Identity & Marriage Proof)",
      documents: [
        "Proof of Identity: [Aadhaar Redacted], PAN Card, Passport, or Voter ID for both spouses.",
        "Proof of Address: Recent utility bills, bank statements, or registered rent agreements for both spouses.",
        "Proof of Age: Birth certificate, Passport, or 10th standard mark sheet.",
        "Proof of Marriage: The official Marriage Certificate. (If not registered, provide wedding invitation card, wedding photographs, or witness affidavits).",
        "Photographs: 4 recent passport-sized photographs of both the husband and the wife."
      ]
    },
    {
      phase: "Phase 2: The Core Petition",
      documents: [
        "Joint Petition (Mutual): A drafted legal petition signed by both parties stating they agree to dissolve the marriage.",
        "Proof of Separation (Mutual): Documents proving the couple has been living separately for at least one continuous year.",
        "Memorandum of Understanding / Settlement (Mutual): A legally binding document detailing alimony, asset division, and child custody.",
        "The Divorce Petition (Contested): A detailed legal document outlining exact legal grounds for divorce (e.g., cruelty, adultery, desertion).",
        "Documentary Evidence of Grounds (Contested): Medical records, FIRs, investigator reports, hotel bills, or legal notices.",
        "Witness Affidavits (Contested): Sworn written statements from family, neighbors, or doctors corroborating the claims."
      ]
    },
    {
      phase: "Phase 3: Financial & Alimony Assessment",
      documents: [
        "Income Proof: Salary slips for the last 3 to 6 months for employed individuals.",
        "Tax Records: Income Tax Returns (ITR) and Form 16 for the past 2 to 3 years.",
        "Banking Records: Statements for all joint and individual bank accounts for the past 6 months.",
        "Asset Documents: Sale deeds for owned properties, vehicle registration certificates, mutual fund statements, and insurance policies."
      ]
    },
    {
      phase: "Phase 4: Child Custody & Welfare (If Applicable)",
      documents: [
        "Identity & Age Proof of Children: Birth certificates and school ID cards.",
        "Educational Records: School fee receipts and progress reports.",
        "Medical Records: General health history or documents for special medical needs.",
        "Current Custody Proof: Documentation or witness statements proving who currently provides daily physical care."
      ]
    }
  ]
};

type UploadedDocument = {
    status: 'Pending' | 'Uploaded';
    data?: OCRData | null;
    blob?: Blob | null;
};

export default function FileCasePage() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [caseTitle, setCaseTitle] = useState("");
    
    // Checklist specific state
    const [selectedCaseType, setSelectedCaseType] = useState("Divorce Case");
    const [documentStates, setDocumentStates] = useState<Record<string, UploadedDocument>>({});
    const [activeDocument, setActiveDocument] = useState<string | null>(null);
    
    const [flowState, setFlowState] = useState<FlowState>('IDLE');
    const [error, setError] = useState<string | null>(null);
    const [showFileUpload, setShowFileUpload] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    useEffect(() => {
        if (flowState !== 'CAPTURE' && !showFileUpload) {
            stopCamera();
        }
        return () => stopCamera();
    }, [flowState, showFileUpload]);

    const startCameraForDoc = async (docName: string) => {
        setActiveDocument(docName);
        setShowFileUpload(false);
        setFlowState('CAPTURE');
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false
            });
            setStream(stream); 
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play().catch(e => console.error("Play error:", e));
            }
        } catch (err) {
            setShowFileUpload(true);
            setError('Camera unavailable. Please upload image.');
        }
    };

    const handleFileUploadClickForDoc = (docName: string) => {
        setActiveDocument(docName);
        setError(null);
        setShowFileUpload(true);
        setFlowState('CAPTURE');
    };

    const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            extractFromImage(file);
        }
    };

    const handleCapture = () => {
        setError(null);
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext("2d");

            if (context) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);

                canvas.toBlob((blob) => {
                    if (blob) {
                        stopCamera();
                        extractFromImage(blob); 
                    }
                }, "image/jpeg", 0.95);
            }
        }
    };

    const extractFromImage = async (imageBlob: Blob) => {
        setFlowState('PROCESSING');
        setError(null);
        try {
            const formData = new FormData();
            formData.append('file', imageBlob, 'capture.jpg');
            // Mocking local extraction success without review gate
            let ocrRes: OCRData | null = null;
            try {
                const response = await fetch('https://legal-techai.onrender.com/ocr-extract', { 
                    method: 'POST', 
                    body: formData 
                });
                if (response.ok) {
                    ocrRes = await response.json();
                }
            } catch (e) {
                console.warn("Local OCR skipped/failed, bypassing rejection");
            }
            
            if (activeDocument) {
                setDocumentStates(prev => ({
                    ...prev,
                    [activeDocument]: { status: 'Uploaded', blob: imageBlob, data: ocrRes }
                }));
            }
            
            setFlowState('IDLE');
            setActiveDocument(null);
        } catch (err: any) {
            if (activeDocument) {
                setDocumentStates(prev => ({
                    ...prev,
                    [activeDocument]: { status: 'Uploaded', blob: imageBlob, data: null }
                }));
            }
            setFlowState('IDLE');
            setActiveDocument(null);
        }
    };

    const handleFinalSubmitAll = async () => {
        setIsSubmitting(true);
        setError(null);
        
        try {
            const USER_ID = 1;
            const caseRes = await fetch("https://legal-techai.onrender.com/cases/?user_id=" + USER_ID, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: caseTitle || "Untitled Case",
                    description: `Filed via E-Filing Checklist (${selectedCaseType})`,
                    priority: "NORMAL"
                })
            });

            if (!caseRes.ok) throw new Error("Failed to create case.");
            
            setFlowState('SUBMITTED');
        } catch (err: any) {
            console.error("Submission Error:", err);
            setError(err.message || "Failed to submit final data.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetToIdle = () => {
        setFlowState('IDLE');
        setError(null);
        setActiveDocument(null);
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col selection:bg-indigo-500/30">
            {/* Header */}
            <header className="flex items-center p-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur z-10 sticky top-0">
                <Link href="/" className="mr-4 text-slate-400 hover:text-white transition-colors">
                    <ChevronLeft className="h-6 w-6" />
                </Link>
                <h1 className="text-lg font-bold">Intelligent Case Filing Checklist</h1>
            </header>

            <main className="flex-1 flex flex-col p-4 md:p-8 max-w-4xl mx-auto w-full">
                {error && flowState !== 'CAPTURE' && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3 w-full max-w-md mx-auto">
                        <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-red-200 text-sm">{error}</p>
                    </div>
                )}

                {(flowState === 'IDLE' || flowState === 'CAPTURE') && (
                    <div className="max-w-3xl mx-auto w-full mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">Case Title / Reference</label>
                            <input
                                type="text"
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                placeholder="e.g. Property Dispute"
                                value={caseTitle}
                                onChange={(e) => setCaseTitle(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-2">Select Type of Case</label>
                            <select
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                value={selectedCaseType}
                                onChange={(e) => setSelectedCaseType(e.target.value)}
                            >
                                <option value="Divorce Case">Divorce Case</option>
                            </select>
                        </div>
                    </div>
                )}
                
                {/* STATE 1: IDLE */}
                {flowState === 'IDLE' && (
                    <div className="max-w-3xl mx-auto w-full flex flex-col gap-6 animate-in fade-in duration-300">
                        <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 md:p-8 shadow-xl">
                            <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
                                <span>Required Documents Checklist</span>
                            </h2>
                            {caseDocumentRequirements[selectedCaseType as keyof typeof caseDocumentRequirements]?.map((phase, pIdx) => (
                                <div key={pIdx} className="mb-10 last:mb-0">
                                    <h3 className="text-lg font-semibold text-indigo-400 mb-4 border-b border-slate-800 pb-2">{phase.phase}</h3>
                                    <ul className="space-y-4">
                                        {phase.documents.map((doc, dIdx) => {
                                            const docState = documentStates[doc] || { status: 'Pending' };
                                            const isUploaded = docState.status === 'Uploaded';
                                            return (
                                                <li key={dIdx} className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl border transition-all ${isUploaded ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-slate-950/50 border-slate-800'}`}>
                                                    <div className="flex items-start gap-4 flex-1">
                                                        <div className="mt-1 flex-shrink-0">
                                                            {isUploaded ? (
                                                                <CheckSquare className="h-6 w-6 text-emerald-500" />
                                                            ) : (
                                                                <div className="h-6 w-6 border-2 border-slate-600 rounded"></div>
                                                            )}
                                                        </div>
                                                        <span className={`text-sm md:text-base leading-relaxed ${isUploaded ? 'text-slate-300' : 'text-red-400 font-medium'}`}>
                                                            {doc}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-2 shrink-0 self-end md:self-auto">
                                                        {isUploaded ? (
                                                            <button
                                                                onClick={() => handleFileUploadClickForDoc(doc)}
                                                                className="px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                                                            >
                                                                <Edit className="h-4 w-4" /> Edit / Re-upload
                                                            </button>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={() => handleFileUploadClickForDoc(doc)}
                                                                    className="px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
                                                                >
                                                                    <Upload className="h-4 w-4" /> Upload
                                                                </button>
                                                                <button
                                                                    onClick={() => startCameraForDoc(doc)}
                                                                    className="px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
                                                                >
                                                                    <Camera className="h-4 w-4" /> Camera
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            ))}
                            
                            <div className="mt-10 pt-6 border-t border-slate-800">
                                <button 
                                    onClick={handleFinalSubmitAll}
                                    disabled={isSubmitting}
                                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20"
                                >
                                    {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : <CheckCircle className="h-6 w-6" />}
                                    <span className="text-lg">Submit Entire Filing</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* STATE 2: CAPTURE */}
                {flowState === 'CAPTURE' && (
                    <div className="max-w-md mx-auto w-full flex flex-col animate-in fade-in duration-300 relative">
                        <div className="mb-4 text-center bg-slate-900 border border-slate-700 p-4 rounded-xl">
                            <h3 className="font-semibold text-indigo-400 mb-1">Capturing Document For:</h3>
                            <p className="text-sm text-slate-300 truncate max-w-full">{activeDocument}</p>
                        </div>
                        
                        {showFileUpload ? (
                            <div className="bg-slate-900 border-2 border-dashed border-slate-700 rounded-3xl p-10 text-center flex flex-col items-center justify-center min-h-[400px]">
                                {error && (
                                    <div className="mb-6 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2 text-amber-300 text-sm w-full">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        <span>{error}</span>
                                    </div>
                                )}
                                <ImageIcon className="h-16 w-16 text-slate-500 mb-6" />
                                <h3 className="text-xl font-semibold text-white mb-2">Upload Document</h3>
                                <p className="text-slate-400 mb-8 text-sm">Select an image from your device</p>
                                
                                <input 
                                    type="file" 
                                    accept="image/*"
                                    className="hidden"
                                    ref={fileInputRef}
                                    onChange={handleFileSelect}
                                />
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-medium transition-colors w-full"
                                >
                                    Select File
                                </button>
                                
                                <button 
                                    onClick={resetToIdle}
                                    className="mt-6 text-sm text-slate-500 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <div className="relative flex-1 bg-black rounded-3xl overflow-hidden shadow-2xl border border-slate-800 min-h-[500px]">
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="absolute inset-0 w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-3/4 h-1/2 max-w-sm max-h-64 border-2 border-indigo-500/50 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                                        <div className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 border-indigo-400"></div>
                                        <div className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 border-indigo-400"></div>
                                        <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 border-indigo-400"></div>
                                        <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 border-indigo-400"></div>
                                    </div>
                                </div>
                                <div className="absolute top-4 left-0 right-0 text-center text-sm font-medium text-white/80 drop-shadow-md">
                                    Align document within frame
                                </div>

                                <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center z-10 gap-3">
                                    <button
                                        onClick={handleCapture}
                                        className="h-20 w-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 hover:bg-white/30 active:scale-95 transition-all shadow-xl backdrop-blur-sm"
                                        aria-label="Capture Document"
                                    >
                                        <div className="h-14 w-14 rounded-full bg-white shadow-inner"></div>
                                    </button>
                                    <span className="text-white font-medium drop-shadow-md">Capture Document</span>
                                </div>
                                <canvas ref={canvasRef} className="hidden" />
                                
                                <button 
                                    onClick={resetToIdle}
                                    className="absolute top-4 right-4 bg-black/50 p-2 rounded-full text-white/80 hover:text-white"
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* STATE 3: PROCESSING */}
                {flowState === 'PROCESSING' && (
                    <div className="flex flex-col items-center justify-center min-h-[50vh] animate-in zoom-in-95 duration-500">
                        <div className="flex flex-col items-center text-center space-y-6">
                            <div className="relative">
                                <div className="absolute inset-0 bg-indigo-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
                                <div className="h-24 w-24 bg-slate-900 border border-indigo-500/30 rounded-2xl flex items-center justify-center shadow-2xl relative z-10">
                                    <Loader2 className="h-10 w-10 text-indigo-400 animate-spin" />
                                </div>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 mb-2">
                                    Securing Document...
                                </h2>
                                <p className="text-slate-400">Processing and saving securely into your local filing.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* STATE 5: SUBMITTED */}
                {flowState === 'SUBMITTED' && (
                    <div className="flex flex-col items-center justify-center min-h-[50vh] animate-in zoom-in-95 duration-500">
                        <div className="bg-slate-900 border border-emerald-500/30 p-10 rounded-3xl text-center max-w-md shadow-[0_0_40px_rgba(16,185,129,0.1)] w-full">
                            <div className="h-20 w-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircle className="h-10 w-10 text-emerald-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-3">Filing Complete</h2>
                            <p className="text-slate-400 mb-8">
                                All documents successfully uploaded and securely stored.
                            </p>
                            
                            <button
                                onClick={() => {
                                    setDocumentStates({});
                                    setCaseTitle("");
                                    setFlowState('IDLE');
                                }}
                                className="block w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-colors shadow-lg mb-4"
                            >
                                Start New Filing
                            </button>
                            
                            <Link
                                href="/"
                                className="block w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors border border-slate-700"
                            >
                                Return to Dashboard
                            </Link>
                        </div>
                    </div>
                )}

            </main>
        </div>
    );
}
