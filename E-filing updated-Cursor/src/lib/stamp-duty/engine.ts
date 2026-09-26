/**
 * Rate table copied from the existing calculator at
 * frontend/src/app/stamp-duty/page.tsx (labeled FY 2025–26).
 * The repo folder stamp-duty-engine/ has no files, so that page is the engine.
 *
 * male / female / joint are buyer-type percentages.
 * registration is a separate percentage added after stamp duty.
 *
 * This table lives in the engine file so `npm test` can load it with Node.
 * rates.ts re-exports it for the pages.
 */
export const STATE_RATES = {
  maharashtra: { male: 6, female: 5, joint: 5, registration: 1, label: "Maharashtra" },
  delhi: { male: 6, female: 4, joint: 5, registration: 1, label: "Delhi" },
  karnataka: { male: 5.6, female: 5.6, joint: 5.6, registration: 1, label: "Karnataka" },
  tamilnadu: { male: 7, female: 7, joint: 7, registration: 1, label: "Tamil Nadu" },
  gujarat: { male: 4.9, female: 4.9, joint: 4.9, registration: 1, label: "Gujarat" },
  rajasthan: { male: 6, female: 5, joint: 5.5, registration: 1, label: "Rajasthan" },
  up: { male: 7, female: 7, joint: 7, registration: 1, label: "Uttar Pradesh" },
  westbengal: { male: 6, female: 6, joint: 6, registration: 1, label: "West Bengal" },
  andhra: { male: 5, female: 5, joint: 5, registration: 0.5, label: "Andhra Pradesh" },
  telangana: { male: 4, female: 4, joint: 4, registration: 0.5, label: "Telangana" },
  kerala: { male: 8, female: 8, joint: 8, registration: 2, label: "Kerala" },
  mp: { male: 7.5, female: 7.5, joint: 7.5, registration: 3, label: "Madhya Pradesh" },
  punjab: { male: 7, female: 5, joint: 6, registration: 1, label: "Punjab" },
  haryana: { male: 7, female: 5, joint: 6, registration: 0.5, label: "Haryana" },
} as const;

export type StateCode = keyof typeof STATE_RATES;

export const BUYER_TYPES = ["male", "female", "joint"] as const;
export type BuyerType = (typeof BUYER_TYPES)[number];

export const PROPERTY_TYPES = [
  { value: "residential", label: "Residential property" },
  { value: "commercial", label: "Commercial property" },
  { value: "agricultural", label: "Agricultural land" },
  { value: "industrial", label: "Industrial property" },
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number]["value"];

export const TRANSACTION_TYPES = [
  { value: "sale", label: "Sale deed" },
  { value: "gift", label: "Gift deed" },
  { value: "will", label: "Will / testament" },
  { value: "lease", label: "Lease agreement" },
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number]["value"];

export const STATE_OPTIONS = (Object.keys(STATE_RATES) as StateCode[]).map((code) => ({
  value: code,
  label: STATE_RATES[code].label,
}));

/** What the form (or a test) hands to the engine. All fields are text. */
export type StampDutyRequest = {
  state: string;
  propertyValue: string;
  gender: string;
  propertyType: string;
  transactionType: string;
};

export type StampDutySuccess = {
  ok: true;
  state: StateCode;
  stateLabel: string;
  propertyValue: number;
  gender: BuyerType;
  propertyType: PropertyType;
  transactionType: TransactionType;
  rate: number;
  registrationRate: number;
  stampDuty: number;
  registration: number;
  total: number;
  notes: string[];
};

export type StampDutyFailure = {
  ok: false;
  error: string;
  field: "state" | "propertyValue" | "gender" | "propertyType" | "transactionType";
};

export type StampDutyResult = StampDutySuccess | StampDutyFailure;

function isListed<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

/**
 * FLOW BOUNDARY — transform.
 * Data has already entered as a StampDutyRequest.
 * This function turns that request into rupee amounts, or stops with an error.
 * It does not read the network, an API key, or a database.
 * Next step: the caller (the /api/stamp-duty route, or a test) shows the result.
 * Failure points: blank value, a value that is not a plain number, zero,
 * a huge number, or a state / buyer / property / document type this table does not know.
 */
export function calculateStampDuty(input: StampDutyRequest): StampDutyResult {
  const state = input.state.trim().toLowerCase();
  if (!isListed(state, Object.keys(STATE_RATES) as StateCode[])) {
    return {
      ok: false,
      field: "state",
      error: "Pick a state from the list. This engine has no rates for that name.",
    };
  }

  const gender = input.gender.trim().toLowerCase();
  if (!isListed(gender, BUYER_TYPES)) {
    return {
      ok: false,
      field: "gender",
      error: "Buyer type must be male, female, or joint.",
    };
  }

  const propertyType = input.propertyType.trim().toLowerCase();
  if (!isListed(propertyType, PROPERTY_TYPES.map((item) => item.value))) {
    return {
      ok: false,
      field: "propertyType",
      error: "Property type must be residential, commercial, agricultural, or industrial.",
    };
  }

  const transactionType = input.transactionType.trim().toLowerCase();
  if (!isListed(transactionType, TRANSACTION_TYPES.map((item) => item.value))) {
    return {
      ok: false,
      field: "transactionType",
      error: "Document type must be sale, gift, will, or lease.",
    };
  }

  const cleaned = input.propertyValue.replace(/,/g, "").trim();
  if (!cleaned) {
    return {
      ok: false,
      field: "propertyValue",
      error: "Type a property value first. A blank box has nothing to calculate.",
    };
  }
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return {
      ok: false,
      field: "propertyValue",
      error: "Use digits only, for example 5000000. Words and symbols are not a value.",
    };
  }

  const propertyValue = Number(cleaned);
  if (propertyValue <= 0) {
    return {
      ok: false,
      field: "propertyValue",
      error: "Property value must be more than zero.",
    };
  }
  if (propertyValue > 10_000_000_000_000) {
    return {
      ok: false,
      field: "propertyValue",
      error: "That number is too large for this calculator.",
    };
  }

  const rates = STATE_RATES[state];
  let rate: number = rates[gender];
  const notes: string[] = [`${rates.label} ${gender} base rate is ${rates[gender]}%.`];

  // Same order as the original page: uplift, then gift, then lease/will wins.
  if (propertyType === "commercial" || propertyType === "industrial") {
    rate += 1;
    notes.push("Commercial and industrial property add 1 percentage point.");
  }
  if (transactionType === "gift") {
    rate = Math.max(1, rate - 2);
    notes.push("A gift deed takes 2 points off the rate, and the rate never goes below 1%.");
  }
  if (transactionType === "lease" || transactionType === "will") {
    rate = 1;
    notes.push("A lease or a will uses a flat 1% in this engine.");
  }

  const stampDuty = Math.round((propertyValue * rate) / 100);
  const registration = Math.round((propertyValue * rates.registration) / 100);

  notes.push(`Registration is a separate ${rates.registration}% charge.`);

  return {
    ok: true,
    state,
    stateLabel: rates.label,
    propertyValue,
    gender,
    propertyType,
    transactionType,
    rate,
    registrationRate: rates.registration,
    stampDuty,
    registration,
    total: stampDuty + registration,
    notes,
  };
}
