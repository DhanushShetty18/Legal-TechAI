"use client";

import React, { useState, useRef } from "react";
import DocumentForm, { OCRData } from "@/components/DocumentForm";
import { UploadCloud, FileImage, Loader2 } from "lucide-react";

export default function OCRFormPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [extractedData, setExtractedData] = useState<OCRData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      setError(null);
      
      const reader = new FileReader();
      reader.onload = (event) => {
        setPreview(event.target?.result as string);
      };
      reader.readAsDataURL(selected);
    }
  };

  const handleProcessImage = async () => {
    if (!file) return;

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Pointing to the FastAPI backend running on port 8000
      const response = await fetch("http://localhost:8000/ocr/extract", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || "Failed to process image");
      }

      const data: OCRData = await response.json();
      setExtractedData(data);
    } catch (err: any) {
      console.error("Error processing document:", err);
      setError(err.message || "An unexpected error occurred during AI processing.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitFinal = async (data: OCRData) => {
    // Here we would submit the final verified data to the backend storage endpoint
    console.log("Submitting finalized data:", data);
    setIsSuccess(true);
    
    // Simulate API call
    setTimeout(() => {
      alert("Data successfully saved to database!");
    }, 500);
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="bg-gray-900 border border-emerald-500/30 p-10 rounded-2xl text-center max-w-md w-full shadow-[0_0_40px_rgba(16,185,129,0.1)]">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} className="text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Document Processed</h2>
          <p className="text-gray-400 mb-8">
            The document data has been successfully verified and securely stored in the system.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors border border-gray-700"
          >
            Process Another Document
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F19] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(29,78,216,0.15),rgba(255,255,255,0))] text-white p-6 md:p-12 font-sans selection:bg-blue-500/30">
      <div className="max-w-6xl mx-auto space-y-10">
        
        <header className="text-center space-y-4 pt-10">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
            Intelligent Auto-Fill
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            Securely upload a document image. Our Enterprise Vision AI will instantly extract semantic fields and map them for your review.
          </p>
        </header>

        {!extractedData ? (
          <div className="max-w-2xl mx-auto mt-12 animate-in zoom-in-95 duration-500">
            <div 
              className={`relative overflow-hidden rounded-3xl border-2 border-dashed transition-all duration-300 ease-out bg-gray-900/50 backdrop-blur-xl ${
                file ? "border-blue-500/50" : "border-gray-700 hover:border-gray-500 hover:bg-gray-800/50"
              }`}
            >
              <div className="p-12 text-center flex flex-col items-center">
                
                {preview ? (
                  <div className="w-full space-y-6">
                    <div className="relative h-64 w-full rounded-xl overflow-hidden border border-gray-700 shadow-2xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview} alt="Document Preview" className="w-full h-full object-contain bg-gray-950" />
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-400 bg-gray-950/50 p-3 rounded-lg border border-gray-800">
                      <span className="flex items-center gap-2 truncate">
                        <FileImage size={16} className="text-blue-400" />
                        <span className="truncate max-w-[200px]">{file?.name}</span>
                      </span>
                      <button 
                        onClick={() => { setFile(null); setPreview(null); }}
                        className="text-red-400 hover:text-red-300 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div 
                    className="flex flex-col items-center cursor-pointer space-y-4 py-10"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="w-20 h-20 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20 shadow-[0_0_30px_rgba(59,130,246,0.15)]">
                      <UploadCloud size={32} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xl font-semibold text-gray-200">Click to upload document</p>
                      <p className="text-sm text-gray-500">Supports JPG, PNG, PDF formats</p>
                    </div>
                  </div>
                )}

                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                />

                {error && (
                  <div className="w-full mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-left">
                    <p className="font-semibold mb-1">Processing Error</p>
                    {error}
                  </div>
                )}

                {file && (
                  <button
                    onClick={handleProcessImage}
                    disabled={isLoading}
                    className={`mt-8 w-full py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all duration-300 ${
                      isLoading 
                        ? "bg-gray-800 text-gray-400 cursor-not-allowed border border-gray-700" 
                        : "bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] border border-blue-500/50"
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="animate-spin" size={22} />
                        Extracting AI Data...
                      </>
                    ) : (
                      "Process with Vision AI"
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-8 animate-in slide-in-from-bottom-8 duration-700">
            <DocumentForm 
              initialData={extractedData} 
              onSubmit={handleSubmitFinal} 
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Need to import CheckCircle2 at the top for the success state
import { CheckCircle2 } from "lucide-react";
