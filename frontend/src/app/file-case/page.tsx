"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Camera, ChevronLeft, Upload, CheckCircle, AlertCircle } from "lucide-react";

export default function FileCasePage() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [imageBlob, setImageBlob] = useState<Blob | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
    const [caseTitle, setCaseTitle] = useState("");

    // Start Camera on Mount
    useEffect(() => {
        startCamera();
        return () => stopCamera();
    }, []);

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" } // Prefer back camera on mobile
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("Camera access is required to file a case.");
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext("2d");

            if (context) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);

                const imageUrl = canvas.toDataURL("image/jpeg");
                setCapturedImage(imageUrl);

                canvas.toBlob((blob) => {
                    setImageBlob(blob);
                }, "image/jpeg", 0.9);
            }
        }
    };

    const retakePhoto = () => {
        setCapturedImage(null);
        setImageBlob(null);
        setUploadStatus("idle");
    };

    const submitCase = async () => {
        if (!imageBlob || !caseTitle) {
            alert("Please provide a case title and capture evidence.");
            return;
        }

        setIsSubmitting(true);
        setUploadStatus("idle");

        try {
            // 1. Create Case First (simplification: usually we'd do this in one go or user session)
            // For MVP, we'll create a user (hardcoded id=1) and a case, then upload doc.
            // Ideally we'd have auth.

            // We'll skip case creation request for MVP and assume we're attaching to a new case 
            // OR we just create the case directly.
            // Let's call the endpoints we tested.

            const USER_ID = 1; // Hardcoded for MVP

            // Create Case
            const caseRes = await fetch("https://legal-techai.onrender.com/cases/?user_id=" + USER_ID, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: caseTitle,
                    description: "Filed via Camera App",
                    priority: "NORMAL"
                })
            });

            if (!caseRes.ok) throw new Error("Failed to create case");
            const caseData = await caseRes.json();
            const CASE_ID = caseData.id;

            // Upload Document
            const formData = new FormData();
            formData.append("file", imageBlob, "evidence.jpg");
            formData.append("case_id", CASE_ID.toString());
            formData.append("uploader_id", USER_ID.toString());
            formData.append("capture_method", "camera");

            const docRes = await fetch("https://legal-techai.onrender.com/documents/", {
                method: "POST",
                body: formData
            });

            if (!docRes.ok) throw new Error("Failed to upload evidence");

            setUploadStatus("success");
        } catch (error) {
            console.error(error);
            setUploadStatus("error");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 text-white font-sans flex flex-col">
            {/* Header */}
            <header className="flex items-center p-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur">
                <Link href="/" className="mr-4 text-slate-400 hover:text-white">
                    <ChevronLeft className="h-6 w-6" />
                </Link>
                <h1 className="text-lg font-bold">New Case Filing</h1>
            </header>

            <main className="flex-1 flex flex-col p-4 max-w-md mx-auto w-full">
                {/* Progress Steps (Fake) */}
                <div className="flex gap-2 mb-6">
                    <div className="h-1 flex-1 bg-amber-500 rounded-full"></div>
                    <div className="h-1 flex-1 bg-amber-500/20 rounded-full"></div>
                    <div className="h-1 flex-1 bg-amber-500/20 rounded-full"></div>
                </div>

                {/* Input Details */}
                <div className="mb-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Case Title / Type</label>
                        <input
                            type="text"
                            className="w-full bg-slate-800 border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="e.g. Traffic Violation, Property Dispute"
                            value={caseTitle}
                            onChange={(e) => setCaseTitle(e.target.value)}
                            disabled={uploadStatus === "success"}
                        />
                    </div>
                </div>

                {/* Camera Viewfinder */}
                <div className="relative flex-1 bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-800 mb-6 min-h-[400px]">
                    {!capturedImage ? (
                        <>
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                className="absolute inset-0 w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-64 h-64 border-2 border-white/30 rounded-lg"></div>
                            </div>

                            {/* Capture Button */}
                            <div className="absolute bottom-6 left-0 right-0 flex justify-center z-10">
                                <button
                                    onClick={capturePhoto}
                                    className="h-20 w-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:scale-95 transition-transform"
                                >
                                    <div className="h-16 w-16 rounded-full bg-white"></div>
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <img src={capturedImage} alt="Captured" className="absolute inset-0 w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                {uploadStatus === "success" && (
                                    <div className="bg-emerald-500/90 text-white px-6 py-4 rounded-xl flex flex-col items-center animate-in zoom-in">
                                        <CheckCircle className="h-10 w-10 mb-2" />
                                        <span className="font-bold">Filing Successful</span>
                                        <span className="text-xs opacity-90">Hash generated & stored</span>
                                    </div>
                                )}
                                {uploadStatus === "error" && (
                                    <div className="bg-red-500/90 text-white px-6 py-4 rounded-xl flex flex-col items-center">
                                        <AlertCircle className="h-10 w-10 mb-2" />
                                        <span className="font-bold">Upload Failed</span>
                                    </div>
                                )}
                            </div>
                            <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4 z-10">
                                {uploadStatus !== "success" && (
                                    <button
                                        onClick={retakePhoto}
                                        className="px-6 py-3 rounded-full bg-white text-slate-900 font-bold hover:bg-slate-200 transition-colors"
                                    >
                                        Retake
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                    <canvas ref={canvasRef} className="hidden" />
                </div>

                {/* Submit Button */}
                {capturedImage && uploadStatus !== "success" && (
                    <button
                        onClick={submitCase}
                        disabled={isSubmitting}
                        className="w-full py-4 rounded-xl bg-indigo-600 text-white font-bold text-lg hover:bg-indigo-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <span>Verifying & Uploading...</span>
                        ) : (
                            <>
                                <Upload className="h-5 w-5" />
                                <span>Secure Submit</span>
                            </>
                        )}
                    </button>
                )}

                {uploadStatus === "success" && (
                    <Link
                        href="/"
                        className="w-full py-4 rounded-xl bg-slate-800 text-white font-bold text-lg hover:bg-slate-700 transition-colors flex items-center justify-center"
                    >
                        Return to Home
                    </Link>
                )}

            </main>
        </div>
    );
}
