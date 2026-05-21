"use client";

import { useState, useRef, useEffect, ChangeEvent } from "react";
import Link from "next/link";
import { Camera, ChevronLeft, Upload, CheckCircle, AlertCircle, Loader2, Image as ImageIcon, RefreshCw } from "lucide-react";
import DocumentForm, { OCRData } from "@/components/DocumentForm";

// ==========================================
// STATE MACHINE EXACTLY AS REQUESTED
// ==========================================
// A State Machine is a pattern that restricts the UI to specific modes.
// This prevents bugs like submitting before scanning finishes.
type FlowState = 
    | 'IDLE'        // Waiting for user to select camera or upload 
    | 'CAPTURE'     // Camera is open, or file upload dialog is ready
    | 'PROCESSING'  // OCR is processing the image via the backend API
    | 'REVIEW'      // AI data is returned, showing the DocumentForm to review
    | 'SUBMITTED';  // Form has been successfully sent to database

export default function FileCasePage() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [imageBlob, setImageBlob] = useState<Blob | null>(null);
    const [caseTitle, setCaseTitle] = useState("");
    const [ocrData, setOcrData] = useState<OCRData | null>(null);
    
    // ==========================================
    // STRICT STATE MACHINE TRACKING
    // ==========================================
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

    // Cleanup camera when leaving CAPTURE state
    useEffect(() => {
        if (flowState !== 'CAPTURE') {
            stopCamera();
        }
        return () => stopCamera();
    }, [flowState]);

    const startCamera = async () => {
        setFlowState('CAPTURE');
        setShowFileUpload(false);
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false
            });
            setStream(stream); // Keep track for stopCamera
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            setShowFileUpload(true);
            setError('Camera unavailable. Please upload image.');
        }
    };

    const handleFileUploadClick = () => {
        setError(null);
        setFlowState('CAPTURE');
        setShowFileUpload(true);
    };

    // Triggered when user selects a file from disk
    const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageBlob(file);
            // PROBLEM 2 FIX: Automatically go to STATE 3
            extractFromImage(file);
        }
    };

    // Triggered when user clicks "Capture" from webcam
    const handleCapture = () => {
        if (!caseTitle.trim()) {
            setError("Please provide a Case Title before capturing the document.");
            return;
        }
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
                        setImageBlob(blob);
                        stopCamera();
                        // PROBLEM 2 FIX: Automatically go to STATE 3
                        extractFromImage(blob); 
                    }
                }, "image/jpeg", 0.9);
            }
        }
    };

    const extractFromImage = async (imageBlob: Blob) => {
        setFlowState('PROCESSING');
        setError(null);
        try {
            const formData = new FormData();
            formData.append('file', imageBlob, 'document.jpg');
            const response = await fetch(
                'https://legal-techai.onrender.com/ocr-extract',
                { method: 'POST', body: formData }
            );
            if (!response.ok) throw new Error('OCR failed');
            
            const data: OCRData = await response.json();
            setOcrData(data);
            setFlowState('REVIEW');
            
            return data;
        } catch (err: any) {
            console.error("OCR Error:", err);
            setError(err.message || "Failed to read document.");
            setFlowState('IDLE');
            throw err;
        }
    };

    const handleFinalSubmit = async (finalOcrData: OCRData) => {
        // ==========================================
        // PROBLEM 3 FIX: SUBMISSION LOCK
        // ==========================================
        // Submission logic is completely locked behind STATE 4 (REVIEW).
        // This guarantees that `ocrData` exists and the user has reviewed it.
        setIsSubmitting(true);
        setError(null);
        
        try {
            const USER_ID = 1;

            const caseRes = await fetch("https://legal-techai.onrender.com/cases/?user_id=" + USER_ID, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: caseTitle || "Untitled Case",
                    description: "Filed via Document OCR",
                    priority: "NORMAL"
                })
            });

            if (!caseRes.ok) throw new Error("Failed to create case.");
            const caseData = await caseRes.json();
            const CASE_ID = caseData.id;

            const formData = new FormData();
            formData.append("file", imageBlob!, "evidence.jpg");
            formData.append("case_id", CASE_ID.toString());
            formData.append("uploader_id", USER_ID.toString());
            formData.append("capture_method", showFileUpload ? "upload" : "camera");
            formData.append("extracted_metadata", JSON.stringify(finalOcrData));

            const docRes = await fetch("https://legal-techai.onrender.com/documents/", {
                method: "POST",
                body: formData
            });

            if (!docRes.ok) throw new Error("Failed to upload document data.");

            // STATE 5: SUBMITTED
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
        setImageBlob(null);
        setOcrData(null);
        setCaseTitle("");
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col selection:bg-indigo-500/30">
            {/* Header */}
            <header className="flex items-center p-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur z-10 sticky top-0">
                <Link href="/" className="mr-4 text-slate-400 hover:text-white transition-colors">
                    <ChevronLeft className="h-6 w-6" />
                </Link>
                <h1 className="text-lg font-bold">Intelligent Case Filing</h1>
            </header>

            <main className="flex-1 flex flex-col p-4 md:p-8 max-w-4xl mx-auto w-full">
                
                {/* Global Error Display (used in IDLE, REVIEW) */}
                {error && flowState !== 'CAPTURE' && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3 w-full max-w-md mx-auto">
                        <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-red-200 text-sm">{error}</p>
                    </div>
                )}

                {/* Case Title Input (Visible in IDLE and CAPTURE) */}
                {(flowState === 'IDLE' || flowState === 'CAPTURE') && (
                    <div className="max-w-md mx-auto w-full mb-6">
                        <label className="block text-sm font-medium text-slate-400 mb-2">Case Title / Reference</label>
                        <input
                            type="text"
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                            placeholder="e.g. Property Dispute"
                            value={caseTitle}
                            onChange={(e) => setCaseTitle(e.target.value)}
                        />
                    </div>
                )}
                
                {/* STATE 1: IDLE */}
                {flowState === 'IDLE' && (
                    <div className="max-w-md mx-auto w-full flex flex-col gap-4 animate-in fade-in duration-300 mt-4">
                        <button 
                            onClick={startCamera}
                            className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-colors flex flex-col items-center justify-center gap-3 shadow-lg shadow-indigo-500/20"
                        >
                            <Camera className="h-8 w-8" />
                            <span className="text-lg">Open Camera</span>
                        </button>
                        
                        <div className="text-center text-slate-500 font-medium py-2">OR</div>
                        
                        <button 
                            onClick={handleFileUploadClick}
                            className="w-full py-5 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl font-bold transition-colors flex flex-col items-center justify-center gap-3 border border-slate-700"
                        >
                            <Upload className="h-8 w-8 text-slate-400" />
                            <span className="text-lg">Upload Image</span>
                        </button>
                    </div>
                )}

                {/* STATE 2: CAPTURE */}
                {flowState === 'CAPTURE' && (
                    <div className="max-w-md mx-auto w-full flex flex-col animate-in fade-in duration-300">
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
                                {/* Viewfinder overlay */}
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

                                {/* Capture Button */}
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
                                    Reading your document...
                                </h2>
                                <p className="text-slate-400">Securely extracting legal data via Vision AI</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* STATE 4: REVIEW */}
                {flowState === 'REVIEW' && ocrData && (
                    <div className="w-full animate-in slide-in-from-bottom-8 duration-700 relative">
                        {isSubmitting ? (
                            <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center">
                                <Loader2 className="h-12 w-12 text-indigo-400 animate-spin mb-4" />
                                <span className="text-lg font-bold">Submitting to database...</span>
                            </div>
                        ) : null}
                        
                        <div className="mb-4 flex justify-end">
                            <button 
                                onClick={resetToIdle}
                                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors bg-slate-800/50 px-4 py-2 rounded-lg"
                            >
                                <RefreshCw className="h-4 w-4" />
                                Retake Document
                            </button>
                        </div>
                        
                        <DocumentForm 
                            initialData={ocrData} 
                            onSubmit={handleFinalSubmit} 
                            isSubmitting={isSubmitting}
                        />
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
                                Document successfully parsed and securely stored.
                            </p>
                            
                            <button
                                onClick={resetToIdle}
                                className="block w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-colors shadow-lg mb-4"
                            >
                                File Another Document
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
