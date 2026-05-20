"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Camera, ChevronLeft, Upload, CheckCircle, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import DocumentForm, { OCRData } from "@/components/DocumentForm";

type FlowState = 
    | 'CAMERA_ACTIVE' 
    | 'PROCESSING_OCR' 
    | 'FORM_VERIFICATION' 
    | 'SUBMITTING_DATA' 
    | 'SUCCESS';

export default function FileCasePage() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [imageBlob, setImageBlob] = useState<Blob | null>(null);
    const [caseTitle, setCaseTitle] = useState("");
    const [ocrData, setOcrData] = useState<OCRData | null>(null);
    
    // Strict State Machine
    const [flowState, setFlowState] = useState<FlowState>('CAMERA_ACTIVE');
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [processError, setProcessError] = useState<string | null>(null);

    // Initialize Camera
    useEffect(() => {
        if (flowState === 'CAMERA_ACTIVE') {
            startCamera();
        }
        return () => stopCamera();
    }, [flowState]);

    const startCamera = async () => {
        setCameraError(null);
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Your browser does not support camera access.");
            }

            // Attempt environment camera first (mobile rear), fallback gracefully to any available
            let mediaStream: MediaStream;
            try {
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: "environment" } }
                });
            } catch (err) {
                // Fallback to default if environment facing mode fails (e.g. on laptops)
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: true
                });
            }

            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err: any) {
            console.error("Camera Initialization Error:", err);
            setCameraError(
                err.name === 'NotAllowedError' 
                    ? "Camera access denied. Please check your browser permissions and reload."
                    : "Unable to access camera. Please ensure your device has a working webcam."
            );
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    // State 1 -> State 2 Transition
    const handleCapture = () => {
        if (!caseTitle.trim()) {
            alert("Please provide a Case Title before capturing the document.");
            return;
        }

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
                        processDocument(blob); // Immediately transition to processing
                    }
                }, "image/jpeg", 0.9);
            }
        }
    };

    // State 2 Action: Process OCR
    const processDocument = async (blob: Blob) => {
        setFlowState('PROCESSING_OCR');
        setProcessError(null);

        try {
            const formData = new FormData();
            formData.append("file", blob, "evidence.jpg");

            // Post image to backend to extract text
            const response = await fetch("https://legal-techai.onrender.com/ocr-extract", {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || "Vision AI processing failed.");
            }

            const data: OCRData = await response.json();
            setOcrData(data);
            
            // State 2 -> State 3 Transition
            setFlowState('FORM_VERIFICATION');

        } catch (error: any) {
            console.error("OCR Error:", error);
            setProcessError(error.message || "An unexpected error occurred during extraction.");
            // Keep in processing state but show error UI to allow retry
        }
    };

    const retryCapture = () => {
        setProcessError(null);
        setImageBlob(null);
        setOcrData(null);
        setFlowState('CAMERA_ACTIVE');
    };

    // State 3 -> State 4 Transition
    const handleFinalSubmit = async (finalOcrData: OCRData) => {
        setFlowState('SUBMITTING_DATA');
        setProcessError(null);
        
        try {
            const USER_ID = 1;

            // 1. Create Case
            const caseRes = await fetch("https://legal-techai.onrender.com/cases/?user_id=" + USER_ID, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: caseTitle,
                    description: "Filed via Camera App with OCR Extraction",
                    priority: "NORMAL"
                })
            });

            if (!caseRes.ok) throw new Error("Failed to create case record.");
            const caseData = await caseRes.json();
            const CASE_ID = caseData.id;

            // 2. Upload Document
            const formData = new FormData();
            formData.append("file", imageBlob!, "evidence.jpg");
            formData.append("case_id", CASE_ID.toString());
            formData.append("uploader_id", USER_ID.toString());
            formData.append("capture_method", "camera");
            formData.append("extracted_metadata", JSON.stringify(finalOcrData));

            const docRes = await fetch("https://legal-techai.onrender.com/documents/", {
                method: "POST",
                body: formData
            });

            if (!docRes.ok) throw new Error("Failed to securely upload evidence document.");

            // State 4 -> State 5 Transition
            setFlowState('SUCCESS');
            
        } catch (error: any) {
            console.error("Submission Error:", error);
            setProcessError(error.message || "Failed to submit final data.");
            // Revert to form verification so they can try submitting again
            setFlowState('FORM_VERIFICATION');
        }
    };

    // Render Logic based on strict State Machine
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
                
                {/* State 1: CAMERA_ACTIVE */}
                {flowState === 'CAMERA_ACTIVE' && (
                    <div className="max-w-md mx-auto w-full flex flex-col animate-in fade-in duration-300">
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-400 mb-2">Case Title / Reference</label>
                            <input
                                type="text"
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                placeholder="e.g. Property Dispute"
                                value={caseTitle}
                                onChange={(e) => setCaseTitle(e.target.value)}
                            />
                        </div>

                        <div className="relative flex-1 bg-black rounded-3xl overflow-hidden shadow-2xl border border-slate-800 mb-6 min-h-[500px]">
                            {cameraError ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900">
                                    <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                                    <p className="text-slate-300 font-medium">{cameraError}</p>
                                    <button 
                                        onClick={startCamera}
                                        className="mt-6 px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
                                    >
                                        Try Again
                                    </button>
                                </div>
                            ) : (
                                <>
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
                                </>
                            )}
                            <canvas ref={canvasRef} className="hidden" />
                        </div>
                    </div>
                )}

                {/* State 2: PROCESSING_OCR */}
                {flowState === 'PROCESSING_OCR' && (
                    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in zoom-in-95 duration-500">
                        {processError ? (
                            <div className="bg-slate-900 border border-red-500/30 p-8 rounded-3xl text-center max-w-md shadow-2xl">
                                <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-white mb-2">Extraction Failed</h3>
                                <p className="text-slate-400 mb-8">{processError}</p>
                                <button
                                    onClick={retryCapture}
                                    className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                                >
                                    <RefreshCw className="h-5 w-5" /> Retake Photo
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center text-center space-y-6">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-indigo-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
                                    <div className="h-24 w-24 bg-slate-900 border border-indigo-500/30 rounded-2xl flex items-center justify-center shadow-2xl relative z-10">
                                        <Loader2 className="h-10 w-10 text-indigo-400 animate-spin" />
                                    </div>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 mb-2">
                                        Extracting Legal Data
                                    </h2>
                                    <p className="text-slate-400">Our Vision AI is actively parsing your document...</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* State 3: FORM_VERIFICATION (and Error display for SUBMITTING_DATA) */}
                {flowState === 'FORM_VERIFICATION' && ocrData && (
                    <div className="w-full animate-in slide-in-from-bottom-8 duration-700">
                        {processError && (
                            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
                                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                                <p className="text-red-200 text-sm">{processError}</p>
                            </div>
                        )}
                        <DocumentForm 
                            initialData={ocrData} 
                            onSubmit={handleFinalSubmit} 
                        />
                    </div>
                )}

                {/* State 4: SUBMITTING_DATA */}
                {flowState === 'SUBMITTING_DATA' && (
                    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in">
                        <Loader2 className="h-14 w-14 text-emerald-400 animate-spin mb-6" />
                        <h2 className="text-2xl font-bold text-white mb-2">Securing Data</h2>
                        <p className="text-slate-400">Encrypting and committing to national ledger...</p>
                    </div>
                )}

                {/* State 5: SUCCESS */}
                {flowState === 'SUCCESS' && (
                    <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in zoom-in-95 duration-500">
                        <div className="bg-slate-900 border border-emerald-500/30 p-10 rounded-3xl text-center max-w-md shadow-[0_0_40px_rgba(16,185,129,0.1)]">
                            <div className="h-20 w-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircle className="h-10 w-10 text-emerald-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-3">Filing Complete</h2>
                            <p className="text-slate-400 mb-8">
                                Document successfully hashed and securely stored.
                            </p>
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
