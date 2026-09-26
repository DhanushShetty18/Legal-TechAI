export type FactKind = "location" | "date" | "amount";

export type Clash = {
  kind: FactKind;
  left: string;
  right: string;
};

export type PreviewFailure = { ok: false; error: string };

export type PreviewSuccess = {
  ok: true;
  clashes: Clash[];
  matched: FactKind[];
  onlyOnOneSide: { kind: FactKind; side: "A" | "B"; value: string }[];
  note: string;
};

const LINE: Record<FactKind, RegExp> = {
  location: /^(?:location|place|city)\s*:\s*(.+)$/i,
  date: /^(?:date|dated)\s*:\s*(.+)$/i,
  amount: /^(?:amount|sum|value)\s*:\s*(.+)$/i,
};

function normalize(kind: FactKind, value: string): string {
  const text = value.trim().toLowerCase().replace(/,/g, "");
  if (kind === "amount") {
    return text.replace(/₹|rs\.?|inr/gi, "").replace(/\s+/g, "");
  }
  return text.replace(/\s+/g, " ");
}

function extract(text: string): Partial<Record<FactKind, string>> {
  const found: Partial<Record<FactKind, string>> = {};
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim();
    for (const kind of ["location", "date", "amount"] as const) {
      const match = trimmed.match(LINE[kind]);
      if (match) found[kind] = match[1].trim();
    }
  }
  return found;
}

/**
 * FLOW BOUNDARY — transform.
 * Two pasted texts have already entered. This reads only lines that start
 * with Location, Date, or Amount (Place, City, Dated, Sum, and Value count too).
 * Next step: the page lists clashes, matches, or a "nothing to compare" note.
 * Failure point: either box is blank. This is not the Gemini pipeline.
 */
export function findContradictions(textA: string, textB: string): PreviewFailure | PreviewSuccess {
  if (!textA.trim() || !textB.trim()) {
    return {
      ok: false,
      error: "Paste both papers first. One empty box cannot be compared.",
    };
  }

  const left = extract(textA);
  const right = extract(textB);
  const kinds = ["location", "date", "amount"] as const;
  const clashes: Clash[] = [];
  const matched: FactKind[] = [];
  const onlyOnOneSide: PreviewSuccess["onlyOnOneSide"] = [];

  for (const kind of kinds) {
    const a = left[kind];
    const b = right[kind];
    if (a && b) {
      if (normalize(kind, a) === normalize(kind, b)) matched.push(kind);
      else clashes.push({ kind, left: a, right: b });
    } else if (a) {
      onlyOnOneSide.push({ kind, side: "A", value: a });
    } else if (b) {
      onlyOnOneSide.push({ kind, side: "B", value: b });
    }
  }

  const foundAny = clashes.length + matched.length + onlyOnOneSide.length > 0;
  return {
    ok: true,
    clashes,
    matched,
    onlyOnOneSide,
    note: foundAny
      ? "This preview only compares location, date, and amount lines. The Python inconsistency engine also checks names and impossible travel."
      : "No Location, Date, or Amount lines were found. Start a line with one of those words and a colon.",
  };
}

export const CONTRADICTION_EXAMPLE = {
  a: "FIR\nLocation: Pune\nDate: 12 March 2024\nAmount: Rs 500000",
  b: "Witness statement\nLocation: Mumbai\nDate: 12 March 2024\nAmount: Rs 50000",
};
