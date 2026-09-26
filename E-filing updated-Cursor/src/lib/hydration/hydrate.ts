export type CourtFields = {
  name: string | null;
  dateOfBirth: string | null;
  address: string | null;
  aadhaar: string | null;
  documentType: string | null;
};

export type HydrationFailure = { ok: false; error: string };

export type HydrationSuccess = {
  ok: true;
  fields: CourtFields;
  problems: string[];
};

const LINE = {
  name: /^(?:name)\s*:\s*(.+)$/i,
  dateOfBirth: /^(?:date of birth|dob)\s*:\s*(.+)$/i,
  address: /^(?:address)\s*:\s*(.+)$/i,
  aadhaar: /^(?:aadhaar|aadhar)\s*:\s*(.+)$/i,
  documentType: /^(?:document type|document|deed)\s*:\s*(.+)$/i,
} as const;

/**
 * FLOW BOUNDARY — transform.
 * A pasted note has already entered. This copies labeled lines into court-form fields.
 * Next step: the page shows filled boxes and a list of what is still missing.
 * Failure points: a blank note, or a note with none of the labels this form knows.
 * Aadhaar that is not 12 digits is kept on screen and listed as a problem.
 * This is not the Gemini OCR extractor.
 */
export function hydrateCourtForm(note: string): HydrationFailure | HydrationSuccess {
  if (!note.trim()) {
    return { ok: false, error: "Paste the identity note first. An empty box cannot fill a form." };
  }

  const fields: CourtFields = {
    name: null,
    dateOfBirth: null,
    address: null,
    aadhaar: null,
    documentType: null,
  };

  for (const line of note.split(/\n/)) {
    const trimmed = line.trim();
    for (const key of Object.keys(LINE) as (keyof typeof LINE)[]) {
      const match = trimmed.match(LINE[key]);
      if (match) fields[key] = match[1].trim();
    }
  }

  const labeled = Object.values(fields).some((value) => value);
  if (!labeled) {
    return {
      ok: false,
      error: "No labeled lines found. Start a line with Name:, Date of birth:, Address:, Aadhaar:, or Document:.",
    };
  }

  const problems: string[] = [];
  if (!fields.name) problems.push("Name is missing. A court form cannot file a nameless party.");
  if (!fields.dateOfBirth) problems.push("Date of birth is missing.");
  if (!fields.address) problems.push("Address is missing.");
  if (!fields.documentType) problems.push("Document type is missing.");
  if (!fields.aadhaar) {
    problems.push("Aadhaar is missing.");
  } else {
    const digits = fields.aadhaar.replace(/\s+/g, "");
    if (!/^\d{12}$/.test(digits)) {
      problems.push("Aadhaar must be 12 digits. This one is not.");
    } else {
      fields.aadhaar = digits.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3");
    }
  }

  return { ok: true, fields, problems };
}

export const HYDRATION_EXAMPLE = `Name: Asha Rao
Date of birth: 02 April 1990
Address: 12 MG Road, Pune
Aadhaar: 1234 5678 9012
Document: Sale deed`;
