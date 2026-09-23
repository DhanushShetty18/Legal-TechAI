"use client";

import React, { useState, useEffect } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

export interface OCRData {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  addressStreet1: string | null;
  addressStreet2: string | null;
  city: string | null;
  stateProvince: string | null;
  postalZipCode: string | null;
  telephone: string | null;
  mobile: string | null;
  herdNo: string | null;
  email: string | null;
}

interface DocumentFormProps {
  initialData: OCRData;
  onSubmit: (data: OCRData) => void;
  isSubmitting?: boolean;
}

export default function DocumentForm({ initialData, onSubmit, isSubmitting = false }: DocumentFormProps) {
  const [formData, setFormData] = useState<OCRData>(initialData);
  const [aiPopulated, setAiPopulated] = useState<Record<keyof OCRData, boolean>>({} as any);

  // Initialize tracking of which fields were AI-populated
  useEffect(() => {
    const populatedTrack = {} as Record<keyof OCRData, boolean>;
    for (const key in initialData) {
      if (initialData[key as keyof OCRData]) {
        populatedTrack[key as keyof OCRData] = true;
      }
    }
    setAiPopulated(populatedTrack);
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // If user edits, it's no longer purely AI populated
    if (aiPopulated[name as keyof OCRData]) {
      setAiPopulated((prev) => ({ ...prev, [name]: false }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    onSubmit(formData);
  };
  
  // Validate if all required fields are filled to lock the submit button
  const isFormValid = () => {
    return !!(
      formData.firstName &&
      formData.lastName &&
      formData.addressStreet1 &&
      formData.city &&
      formData.stateProvince &&
      formData.postalZipCode &&
      formData.mobile
    );
  };

  const renderInput = (name: keyof OCRData, label: string, type: string = "text", required: boolean = false) => {
    const isAi = aiPopulated[name];
    const hasValue = formData[name];
    
    return (
      <div className="flex flex-col gap-1.5 w-full">
        <label className="text-sm font-medium text-gray-300 flex justify-between">
          <span>{label} {required && <span className="text-red-400">*</span>}</span>
          {isAi && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <CheckCircle2 size={12} /> Auto-filled
            </span>
          )}
        </label>
        <div className="relative">
          <input
            type={type}
            name={name}
            value={formData[name] || ""}
            onChange={handleChange}
            required={required}
            className={`w-full px-4 py-2.5 rounded-lg border bg-gray-900/50 backdrop-blur-sm text-white placeholder-gray-500 transition-all duration-200 outline-none
              ${
                isAi
                  ? "border-emerald-500/50 focus:border-emerald-400 ring-2 ring-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                  : "border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              }
            `}
            placeholder={`Enter ${label.toLowerCase()}`}
          />
          {!isAi && !hasValue && required && (
            <div className="absolute right-3 top-3 text-amber-500">
              <AlertCircle size={18} />
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-6 md:p-8 backdrop-blur-xl shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-6 border-b border-gray-700/50 pb-4 flex items-center gap-2">
          Document Details
          <span className="text-sm font-normal px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Please verify AI extracted data
          </span>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          {renderInput("firstName", "First Name", "text", true)}
          {renderInput("lastName", "Last Name", "text", true)}
          <div className="md:col-span-2">
            {renderInput("companyName", "Company Name (Optional)", "text")}
          </div>
          
          <div className="md:col-span-2 space-y-5">
            <h3 className="text-lg font-semibold text-gray-200 mt-2">Address Information</h3>
            <div className="grid grid-cols-1 gap-5">
              {renderInput("addressStreet1", "Street Address 1", "text", true)}
              {renderInput("addressStreet2", "Street Address 2 (Optional)", "text")}
            </div>
          </div>
          
          {renderInput("city", "City", "text", true)}
          {renderInput("stateProvince", "State/Province", "text", true)}
          {renderInput("postalZipCode", "Postal/Zip Code", "text", true)}
          {renderInput("herdNo", "Herd No", "text")}
          
          <div className="md:col-span-2 space-y-5">
            <h3 className="text-lg font-semibold text-gray-200 mt-2">Contact Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {renderInput("telephone", "Telephone", "tel")}
              {renderInput("mobile", "Mobile", "tel", true)}
              <div className="md:col-span-2">
                {renderInput("email", "Email Address", "email")}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 flex justify-end gap-4 border-t border-gray-700/50 pt-6">
          <button
            type="button"
            className="px-6 py-2.5 rounded-lg font-medium text-gray-300 hover:text-white hover:bg-gray-700/50 transition-colors"
            onClick={() => window.location.reload()}
          >
            Start Over
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !isFormValid()}
            className="px-8 py-2.5 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/25 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? "Submitting..." : "Secure Submit"}
          </button>
        </div>
      </div>
    </form>
  );
}
