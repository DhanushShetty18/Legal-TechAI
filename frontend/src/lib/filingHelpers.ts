/**
 * Small, pure helpers for the filing page.
 *
 * Kept free of React and the DOM so each rule can be unit-tested on its own
 * (see filingHelpers.test.ts). Every function here fixes a bug that used to
 * live inline in app/file-case/page.tsx.
 */

import type { DeedFields } from "./caseTypes";

// ---------------------------------------------------------------- capture
export type CaptureCheck =
  | { ok: true }
  | { ok: false; message: string };

/** The shutter may fire only once the camera has produced a real frame.
 *  Before that, videoWidth is 0 and the photo comes out empty. */
export function canCapture(
  video: { videoWidth: number; videoHeight: number } | null,
): CaptureCheck {
  if (!video || !video.videoWidth || !video.videoHeight) {
    return {
      ok: false,
      message: "The camera is still starting. Try again in a moment.",
    };
  }
  return { ok: true };
}

// --------------------------------------------------------------- re-upload
export interface DocumentState {
  status: "Pending" | "Uploaded";
  fields?: DeedFields;
  error?: string | null;
}

/** A failed re-read must not wipe what an earlier, successful read found. */
export function documentStateAfterExtraction(
  previous: DocumentState | undefined,
  extracted: DeedFields,
  error: string | null,
): DocumentState {
  const hadFields = previous?.fields && Object.keys(previous.fields).length > 0;
  return {
    status: "Uploaded",
    fields: error && hadFields ? previous!.fields : extracted,
    error,
  };
}

// ---------------------------------------------------------------- filename
/** A download stem that keeps letters and digits from any script
 *  (Devanagari, Kannada...) and is never empty. */
export function downloadStem(title: string, fallback: string): string {
  const clean = (text: string) =>
    text
      .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-");
  return clean(title) || clean(fallback) || "Deed";
}

// ------------------------------------------------------- form input values
/** Coerce OCR / user dates into the yyyy-mm-dd an <input type="date"> accepts.
 *  Indian order (day first) is assumed for dd-mm-yyyy. "" when unparseable. */
export function toDateInputValue(raw: string | undefined | null): string {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (!m) return "";
  const [, d, mo, y] = m;
  const day = Number(d);
  const month = Number(mo);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** "Rs. 45,00,000/-" -> "4500000". "" when there is no number. */
export function toAmountInputValue(raw: string | undefined | null): string {
  const match = String(raw ?? "").match(/\d[\d,]*(?:\.\d{1,2})?/);
  if (!match) return "";
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(value) ? String(value) : "";
}
