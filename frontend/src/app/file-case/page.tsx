"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Camera,
  CheckCircle,
  CheckSquare,
  ChevronLeft,
  Download,
  Edit,
  FileText,
  Image as ImageIcon,
  Loader2,
  PenLine,
  RefreshCw,
  Sparkles,
  Upload,
} from "lucide-react";

import ExtractedFieldsForm from "@/components/ExtractedFieldsForm";
import LiveDeedCanvas from "@/components/LiveDeedCanvas";
import { downloadFile, postForm, postJson } from "@/lib/api";
import {
  DIVORCE_CASE,
  DeedFields,
  SALE_DEED,
  allDocuments,
  checklistFor,
  fieldLabel,
  isDraftable,
  missingRequiredFields,
} from "@/lib/caseTypes";
import { DeedSection } from "@/lib/deedStream";
import { useDeedGeneration } from "@/lib/useDeedGeneration";

type FlowState =
  | "IDLE"        // checklist
  | "CAPTURE"     // camera or file picker for one document
  | "PROCESSING"  // extracting that document
  | "REVIEW"      // editable extracted particulars
  | "GENERATING"  // the deed being written live
  | "SUBMITTED";  // non-draftable case types keep the original ending

type DocumentState = {
  status: "Pending" | "Uploaded";
  fields?: DeedFields;
  error?: string | null;
};

interface ExtractResponse {
  documents: { docId: string; label: string; error: string | null }[];
  fields: DeedFields;
}

interface MergeResponse {
  fields: DeedFields;
  provenance: Record<string, string>;
  missingRequired: string[];
  readyToGenerate: boolean;
}

export default function FileCasePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [caseTitle, setCaseTitle] = useState("");
  const [selectedCaseType, setSelectedCaseType] = useState(SALE_DEED);

  const [documentStates, setDocumentStates] = useState<Record<string, DocumentState>>({});
  const [activeDocument, setActiveDocument] = useState<string | null>(null);

  const [flowState, setFlowState] = useState<FlowState>("IDLE");
  const [error, setError] = useState<string | null>(null);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const [fields, setFields] = useState<DeedFields>({});
  const [provenance, setProvenance] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});

  const generation = useDeedGeneration();

  const checklist = useMemo(() => checklistFor(selectedCaseType), [selectedCaseType]);
  const documents = useMemo(() => allDocuments(selectedCaseType), [selectedCaseType]);
  const uploadedCount = documents.filter(
    (doc) => documentStates[doc.id]?.status === "Uploaded",
  ).length;
  const draftable = isDraftable(selectedCaseType);
  const missing = useMemo(() => missingRequiredFields(fields), [fields]);

  const labelFor = (docId: string) =>
    documents.find((doc) => doc.id === docId)?.label ?? docId;

  // ---------------------------------------------------------------- camera

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    if (flowState !== "CAPTURE" || showFileUpload) stopCamera();
    return stopCamera;
  }, [flowState, showFileUpload]);

  const startCameraForDoc = async (docId: string) => {
    setActiveDocument(docId);
    setShowFileUpload(false);
    setFlowState("CAPTURE");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => undefined);
      }
    } catch {
      setShowFileUpload(true);
      setError("Camera unavailable. Please upload an image instead.");
    }
  };

  const handleFileUploadClickForDoc = (docId: string) => {
    setActiveDocument(docId);
    setError(null);
    setShowFileUpload(true);
    setFlowState("CAPTURE");
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void extractFromImage(file, file.type || "image/jpeg", file.name);
    event.target.value = "";
  };

  const handleCapture = () => {
    setError(null);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!video || !canvas || !context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stopCamera();
        void extractFromImage(blob, "image/jpeg", "capture.jpg");
      },
      "image/jpeg",
      0.95,
    );
  };

  // ------------------------------------------------------------ extraction

  /**
   * Documents are extracted one at a time, as they are captured, so the user
   * sees what was read off each scan within seconds instead of waiting for the
   * whole checklist. The results are folded together when the review opens.
   */
  const extractFromImage = async (blob: Blob, mimeType: string, filename: string) => {
    const docId = activeDocument;
    if (!docId) return;

    setFlowState("PROCESSING");
    setError(null);

    let extracted: DeedFields = {};
    let docError: string | null = null;

    if (draftable) {
      try {
        const form = new FormData();
        form.append("files", new File([blob], filename, { type: mimeType }));
        form.append("doc_ids", docId);
        form.append("case_type", selectedCaseType);
        const response = await postForm<ExtractResponse>("/drafting/extract", form);
        extracted = response.fields ?? {};
        docError = response.documents?.[0]?.error ?? null;
      } catch (caught) {
        // A failed read must not lose the upload; the user can still type the
        // particulars in at the review step.
        docError =
          caught instanceof Error ? caught.message : "Could not read this document.";
      }
    }

    setDocumentStates((current) => ({
      ...current,
      [docId]: { status: "Uploaded", fields: extracted, error: docError },
    }));
    setActiveDocument(null);
    setShowFileUpload(false);
    setFlowState("IDLE");
    if (docError) {
      setError(
        `${labelFor(docId)} was saved, but nothing could be read from it. ` +
          `You can fill those particulars in at the review step.`,
      );
    }
  };

  const openReview = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const overrides = Object.fromEntries(
        Object.entries(fields).filter(([key]) => provenance[key] === "user"),
      );
      const merged = await postJson<MergeResponse>("/drafting/merge", {
        documents: Object.entries(documentStates)
          .filter(([, state]) => state.fields)
          .map(([docId, state]) => ({ docId, fields: state.fields })),
        overrides,
        caseType: selectedCaseType,
      });
      setFields(merged.fields ?? {});
      setProvenance(merged.provenance ?? {});
      setFlowState("REVIEW");
    } catch (caught) {
      // The merge is only a convenience; the review form works offline too.
      const local: DeedFields = {};
      const localProvenance: Record<string, string> = {};
      Object.entries(documentStates).forEach(([docId, state]) => {
        Object.entries(state.fields ?? {}).forEach(([key, value]) => {
          if (!local[key] && String(value ?? "").trim()) {
            local[key] = value;
            localProvenance[key] = docId;
          }
        });
      });
      setFields((current) => ({ ...local, ...current }));
      setProvenance((current) => ({ ...localProvenance, ...current }));
      setFlowState("REVIEW");
      setError(
        caught instanceof Error
          ? `Working offline: ${caught.message}`
          : "Working offline with the particulars read so far.",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const updateField = (key: string, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    setProvenance((current) => ({ ...current, [key]: "user" }));
  };

  // ------------------------------------------------------------ generation

  const startGeneration = () => {
    setEdits({});
    setFlowState("GENERATING");
    void generation.start(fields);
  };

  const approvedSections = (): DeedSection[] => {
    const base =
      generation.result?.sections ??
      generation.sections.map(({ id, style, heading, target }) => ({
        id,
        style,
        heading,
        body: target,
      }));
    return base.map((section) =>
      edits[section.id] !== undefined
        ? { ...section, body: edits[section.id] }
        : section,
    );
  };

  const download = async (format: "pdf" | "docx") => {
    setIsBusy(true);
    setError(null);
    const stem = (caseTitle.trim() || `Sale-Deed-${fields.vendor_name ?? "Draft"}`)
      .replace(/[^\w\s-]/g, "")
      .trim();
    try {
      await downloadFile(
        `/drafting/export/${format}`,
        { fields, sections: approvedSections(), filename: stem, caseType: selectedCaseType },
        `${stem.replace(/\s+/g, "-")}.${format}`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Download failed.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleFinalSubmitAll = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await postJson("/cases/?user_id=1", {
        title: caseTitle || "Untitled Case",
        description: `Filed via E-Filing Checklist (${selectedCaseType})`,
        priority: "NORMAL",
      });
      setFlowState("SUBMITTED");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to submit.");
    } finally {
      setIsBusy(false);
    }
  };

  const resetToIdle = () => {
    setFlowState("IDLE");
    setError(null);
    setActiveDocument(null);
    setShowFileUpload(false);
  };

  const startNewFiling = () => {
    generation.reset();
    setDocumentStates({});
    setFields({});
    setProvenance({});
    setEdits({});
    setCaseTitle("");
    setError(null);
    setFlowState("IDLE");
  };

  const isWriting = generation.phase === "writing" || generation.phase === "connecting";
  const isGenerationComplete = generation.phase === "complete";

  // ----------------------------------------------------------------- render

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 font-sans text-white selection:bg-indigo-500/30">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-slate-800 bg-slate-900/90 p-4 backdrop-blur">
        <Link href="/" className="text-slate-400 transition-colors hover:text-white">
          <ChevronLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-lg font-bold">Intelligent Case Filing Checklist</h1>
        {draftable && (
          <span className="ml-auto hidden items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300 sm:flex">
            <Sparkles className="h-3 w-3" /> Live drafting enabled
          </span>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col p-4 md:p-8">
        {error && flowState !== "CAPTURE" && (
          <div className="mx-auto mb-6 flex w-full items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <p className="text-sm text-amber-100">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto shrink-0 text-xs text-amber-300/70 hover:text-amber-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {(flowState === "IDLE" || flowState === "CAPTURE") && (
          <div className="mx-auto mb-6 grid w-full max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="case-title"
                className="mb-2 block text-sm font-medium text-slate-400"
              >
                Case Title / Reference
              </label>
              <input
                id="case-title"
                type="text"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                placeholder="e.g. Kadri Road Property Sale"
                value={caseTitle}
                onChange={(event) => setCaseTitle(event.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="case-type"
                className="mb-2 block text-sm font-medium text-slate-400"
              >
                Select Type of Case
              </label>
              <select
                id="case-type"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                value={selectedCaseType}
                onChange={(event) => {
                  setSelectedCaseType(event.target.value);
                  setDocumentStates({});
                  setFields({});
                  setProvenance({});
                }}
              >
                <option value={SALE_DEED}>Sale Deed</option>
                <option value={DIVORCE_CASE}>Divorce Case</option>
              </select>
            </div>
          </div>
        )}

        {/* ---------------------------------------------- STATE 1: CHECKLIST */}
        {flowState === "IDLE" && (
          <div className="mx-auto flex w-full max-w-3xl animate-in flex-col gap-6 duration-300 fade-in">
            <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-xl md:p-8">
              <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-bold">Required Documents Checklist</h2>
                <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300">
                  {uploadedCount} of {documents.length} uploaded
                </span>
              </div>

              {checklist.map((phase) => (
                <div key={phase.phase} className="mb-10 last:mb-0">
                  <h3 className="mb-4 border-b border-slate-800 pb-2 text-lg font-semibold text-indigo-400">
                    {phase.phase}
                  </h3>
                  <ul className="space-y-4">
                    {phase.documents.map((doc) => {
                      const state = documentStates[doc.id] ?? { status: "Pending" };
                      const isUploaded = state.status === "Uploaded";
                      const readCount = Object.keys(state.fields ?? {}).length;
                      return (
                        <li
                          key={doc.id}
                          className={`flex flex-col justify-between gap-4 rounded-2xl border p-4 transition-all md:flex-row md:items-center ${
                            isUploaded
                              ? "border-emerald-500/30 bg-emerald-950/20"
                              : "border-slate-800 bg-slate-950/50"
                          }`}
                        >
                          <div className="flex flex-1 items-start gap-4">
                            <div className="mt-1 shrink-0">
                              {isUploaded ? (
                                <CheckSquare className="h-6 w-6 text-emerald-500" />
                              ) : (
                                <div className="h-6 w-6 rounded border-2 border-slate-600" />
                              )}
                            </div>
                            <div className="flex-1">
                              <span
                                className={`text-sm leading-relaxed md:text-base ${
                                  isUploaded
                                    ? "text-slate-300"
                                    : doc.required
                                      ? "font-medium text-red-400"
                                      : "text-slate-400"
                                }`}
                              >
                                {doc.label}
                              </span>
                              {!doc.required && !isUploaded && (
                                <span className="ml-2 text-xs text-slate-600">
                                  (if applicable)
                                </span>
                              )}
                              {isUploaded && draftable && (
                                <p className="mt-1 text-xs text-emerald-400/80">
                                  {readCount > 0
                                    ? `${readCount} particular${readCount === 1 ? "" : "s"} read from this document`
                                    : "Saved - nothing could be read automatically"}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2 self-end md:self-auto">
                            {isUploaded ? (
                              <button
                                onClick={() => handleFileUploadClickForDoc(doc.id)}
                                className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
                              >
                                <Edit className="h-4 w-4" /> Re-upload
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleFileUploadClickForDoc(doc.id)}
                                  className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
                                >
                                  <Upload className="h-4 w-4" /> Upload
                                </button>
                                <button
                                  onClick={() => startCameraForDoc(doc.id)}
                                  className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-500"
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

              <div className="mt-10 border-t border-slate-800 pt-6">
                {draftable ? (
                  <>
                    <button
                      onClick={openReview}
                      disabled={isBusy}
                      className="flex w-full items-center justify-center gap-3 rounded-2xl bg-indigo-600 py-4 font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {isBusy ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        <PenLine className="h-6 w-6" />
                      )}
                      <span className="text-lg">Review Extracted Details</span>
                    </button>
                    <p className="mt-3 text-center text-xs text-slate-500">
                      You will be asked only for the particulars that could not be
                      read from your documents.
                    </p>
                  </>
                ) : (
                  <button
                    onClick={handleFinalSubmitAll}
                    disabled={isBusy}
                    className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 py-4 font-bold text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {isBusy ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <CheckCircle className="h-6 w-6" />
                    )}
                    <span className="text-lg">Submit Entire Filing</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------ STATE 2: CAPTURE */}
        {flowState === "CAPTURE" && (
          <div className="relative mx-auto flex w-full max-w-md animate-in flex-col duration-300 fade-in">
            <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900 p-4 text-center">
              <h3 className="mb-1 font-semibold text-indigo-400">
                Capturing document for:
              </h3>
              <p className="text-sm text-slate-300">
                {activeDocument ? labelFor(activeDocument) : ""}
              </p>
            </div>

            {showFileUpload ? (
              <div className="flex min-h-[400px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-700 bg-slate-900 p-10 text-center">
                {error && (
                  <div className="mb-6 flex w-full items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <ImageIcon className="mb-6 h-16 w-16 text-slate-500" />
                <h3 className="mb-2 text-xl font-semibold text-white">
                  Upload Document
                </h3>
                <p className="mb-8 text-sm text-slate-400">
                  Select a photograph, scan or PDF from your device
                </p>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-xl bg-indigo-600 px-8 py-3 font-medium transition-colors hover:bg-indigo-500"
                >
                  Select File
                </button>
                <button
                  onClick={resetToIdle}
                  className="mt-6 text-sm text-slate-500 transition-colors hover:text-white"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="relative min-h-[500px] flex-1 overflow-hidden rounded-3xl border border-slate-800 bg-black shadow-2xl">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-1/2 max-h-64 w-3/4 max-w-sm rounded-xl border-2 border-indigo-500/50 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
                </div>
                <div className="absolute left-0 right-0 top-4 text-center text-sm font-medium text-white/80 drop-shadow-md">
                  Align the document within the frame
                </div>
                <div className="absolute bottom-8 left-0 right-0 z-10 flex flex-col items-center gap-3">
                  <button
                    onClick={handleCapture}
                    className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 shadow-xl backdrop-blur-sm transition-all hover:bg-white/30 active:scale-95"
                    aria-label="Capture Document"
                  >
                    <div className="h-14 w-14 rounded-full bg-white shadow-inner" />
                  </button>
                  <span className="font-medium text-white drop-shadow-md">
                    Capture Document
                  </span>
                </div>
                <canvas ref={canvasRef} className="hidden" />
                <button
                  onClick={resetToIdle}
                  className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white/80 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* --------------------------------------------- STATE 3: PROCESSING */}
        {flowState === "PROCESSING" && (
          <div className="flex min-h-[50vh] animate-in flex-col items-center justify-center duration-500 zoom-in-95">
            <div className="flex flex-col items-center space-y-6 text-center">
              <div className="relative">
                <div className="absolute inset-0 animate-pulse rounded-full bg-indigo-500 opacity-20 blur-xl" />
                <div className="relative z-10 flex h-24 w-24 items-center justify-center rounded-2xl border border-indigo-500/30 bg-slate-900 shadow-2xl">
                  <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
                </div>
              </div>
              <div>
                <h2 className="mb-2 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-2xl font-bold text-transparent">
                  Reading the document...
                </h2>
                <p className="text-slate-400">
                  Extracting every particular the deed needs.
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  The first request of a session can take up to two minutes while
                  the engine wakes up.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------- STATE 4: REVIEW */}
        {flowState === "REVIEW" && (
          <div className="mx-auto w-full max-w-4xl animate-in duration-300 fade-in">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">Confirm the particulars</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {missing.length === 0
                    ? "Everything the deed needs has been captured. Review and generate."
                    : `${missing.length} particular${missing.length === 1 ? "" : "s"} could not be read. Please supply ${missing.length === 1 ? "it" : "them"} below.`}
                </p>
              </div>
              <button
                onClick={resetToIdle}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
              >
                Back to checklist
              </button>
            </div>

            {missing.length > 0 && (
              <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-200">
                  <AlertCircle className="h-4 w-4" /> Still needed
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {missing.map((key) => (
                    <li
                      key={key}
                      className="rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-200"
                    >
                      {fieldLabel(key)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ExtractedFieldsForm
              fields={fields}
              provenance={provenance}
              onChange={updateField}
            />

            <div className="sticky bottom-0 mt-8 border-t border-slate-800 bg-slate-950/95 py-5 backdrop-blur">
              <button
                onClick={startGeneration}
                disabled={missing.length > 0}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-indigo-600 py-4 font-bold text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Sparkles className="h-6 w-6" />
                <span className="text-lg">Generate Document</span>
              </button>
              {missing.length > 0 && (
                <button
                  onClick={startGeneration}
                  className="mt-3 w-full text-center text-xs text-slate-500 underline decoration-dotted transition-colors hover:text-slate-300"
                >
                  Generate anyway, leaving the {missing.length} missing particular
                  {missing.length === 1 ? "" : "s"} as fill-in lines
                </button>
              )}
            </div>
          </div>
        )}

        {/* --------------------------------- STATE 5: LIVE GENERATION / DONE */}
        {flowState === "GENERATING" && (
          <div className="mx-auto w-full max-w-5xl animate-in duration-300 fade-in">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-indigo-400" />
                <div>
                  <h2 className="text-xl font-bold">
                    {isGenerationComplete ? "Sale Deed ready" : "Drafting your Sale Deed"}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {isGenerationComplete ? (
                      <>
                        {generation.result?.estimatedPages ?? generation.estimatedPages}{" "}
                        pages
                        {generation.result?.source === "gemini"
                          ? " - recitals drafted by the AI"
                          : " - drafted from precedent wording"}
                        . Click any paragraph to edit it.
                      </>
                    ) : (
                      generation.status ||
                      `Writing section ${generation.sections.length} of ${generation.sectionCount || "..."}`
                    )}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                {isWriting && generation.sections.length > 0 && (
                  <button
                    onClick={generation.skipAnimation}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
                  >
                    Skip to the end
                  </button>
                )}
                {isGenerationComplete && (
                  <>
                    <button
                      onClick={() => {
                        generation.reset();
                        setFlowState("REVIEW");
                      }}
                      className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
                    >
                      <RefreshCw className="h-4 w-4" /> Edit &amp; Regenerate
                    </button>
                    <button
                      onClick={() => void download("docx")}
                      disabled={isBusy}
                      className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:opacity-50"
                    >
                      <Edit className="h-4 w-4" /> Editable DOCX
                    </button>
                    <button
                      onClick={() => void download("pdf")}
                      disabled={isBusy}
                      className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Download PDF
                    </button>
                  </>
                )}
              </div>
            </div>

            {generation.notices.map((notice) => (
              <div
                key={notice}
                className="mb-4 flex items-start gap-2 rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span>{notice}</span>
              </div>
            ))}

            {generation.phase === "error" ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center">
                <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-400" />
                <h3 className="mb-2 text-lg font-bold">Generation failed</h3>
                <p className="mb-6 text-sm text-red-200">{generation.error}</p>
                <button
                  onClick={startGeneration}
                  className="rounded-xl bg-indigo-600 px-6 py-3 font-medium transition-colors hover:bg-indigo-500"
                >
                  Try again
                </button>
              </div>
            ) : (
              <>
                {generation.phase === "connecting" && (
                  <div className="mb-4 flex items-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-sm text-indigo-200">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>
                      Waking the drafting engine. The first request of a session can
                      take up to two minutes.
                    </span>
                  </div>
                )}
                <LiveDeedCanvas
                  sections={generation.sections}
                  isWriting={isWriting}
                  edits={edits}
                  editable={isGenerationComplete}
                  onEdit={(sectionId, body) =>
                    setEdits((current) => ({ ...current, [sectionId]: body }))
                  }
                />
                {isGenerationComplete && (
                  <button
                    onClick={startNewFiling}
                    className="mt-6 w-full rounded-xl border border-slate-700 bg-slate-900 py-3.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
                  >
                    Start a new filing
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ---------------------------------------------- STATE 6: SUBMITTED */}
        {flowState === "SUBMITTED" && (
          <div className="flex min-h-[50vh] animate-in flex-col items-center justify-center duration-500 zoom-in-95">
            <div className="w-full max-w-md rounded-3xl border border-emerald-500/30 bg-slate-900 p-10 text-center shadow-[0_0_40px_rgba(16,185,129,0.1)]">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20">
                <CheckCircle className="h-10 w-10 text-emerald-400" />
              </div>
              <h2 className="mb-3 text-2xl font-bold text-white">Filing Complete</h2>
              <p className="mb-8 text-slate-400">
                All documents were uploaded and securely stored.
              </p>
              <button
                onClick={startNewFiling}
                className="mb-4 block w-full rounded-xl bg-indigo-600 py-4 font-bold text-white shadow-lg transition-colors hover:bg-indigo-500"
              >
                Start New Filing
              </button>
              <Link
                href="/"
                className="block w-full rounded-xl border border-slate-700 bg-slate-800 py-3.5 font-medium text-white transition-colors hover:bg-slate-700"
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
