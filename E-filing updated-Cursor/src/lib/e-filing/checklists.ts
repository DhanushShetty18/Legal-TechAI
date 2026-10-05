export type ChecklistItem = {
  id: string;
  label: string;
  why: string;
  href?: string;
};

export type FilingPack = {
  id: string;
  title: string;
  blurb: string;
  items: ChecklistItem[];
};

/**
 * Filing packs grounded in this product:
 * - property sale uses the stamp duty engine before registration
 * - divorce uses the document phases already listed on the file-a-case screen
 * - a criminal packet uses the FIR / witness papers the inconsistency engine compares
 */
export const FILING_PACKS: FilingPack[] = [
  {
    id: "property-sale",
    title: "Property sale",
    blurb: "A sale deed is sent back when the duty, the value, or the parties are missing.",
    items: [
      {
        id: "identity",
        label: "Identity proof for the buyer and the seller",
        why: "The sub-registrar has to know who is signing.",
      },
      {
        id: "value",
        label: "Property description and market value in rupees",
        why: "Stamp duty is a percentage of this number.",
      },
      {
        id: "duty",
        label: "Stamp duty amount from the Stamp Duty Engine",
        why: "The deed cannot be registered until the duty figure is known.",
        href: "/stamp-duty",
      },
      {
        id: "registration",
        label: "Registration charge from that same result",
        why: "Registration is a separate percentage. It is not included inside stamp duty.",
        href: "/stamp-duty",
      },
      {
        id: "deed",
        label: "Draft sale deed",
        why: "This is the document the duty is paid on.",
      },
      {
        id: "payment",
        label: "Proof the duty was paid (e-stamp or challan)",
        why: "A calculated number is not the same as a paid challan.",
      },
    ],
  },
  {
    id: "divorce",
    title: "Divorce petition",
    blurb: "The file-a-case screen already groups these papers into identity, petition, money, and children.",
    items: [
      {
        id: "identity",
        label: "Identity and address proof for both spouses",
        why: "Phase 1 of the filing checklist. Without it the petition has no parties.",
      },
      {
        id: "marriage",
        label: "Proof of marriage",
        why: "A certificate, or if none exists, an invitation, photographs, or witness affidavits.",
      },
      {
        id: "petition",
        label: "The petition (mutual settlement or contested grounds)",
        why: "Phase 2. Mutual filings need a settlement. Contested filings need the legal grounds.",
      },
      {
        id: "money",
        label: "Income, tax, and bank records when money is in dispute",
        why: "Phase 3. Alimony and property division need these numbers.",
      },
      {
        id: "children",
        label: "Child identity and care records when custody is in dispute",
        why: "Phase 4. Skip only when no child is part of the case.",
      },
    ],
  },
  {
    id: "criminal-packet",
    title: "Criminal complaint packet",
    blurb: "The inconsistency engine exists to compare an FIR with witness statements before a judge reads them.",
    items: [
      {
        id: "fir",
        label: "FIR",
        why: "The first written account of place, date, and what happened.",
      },
      {
        id: "charges",
        label: "Charge sheet or complaint",
        why: "The later paper that has to agree with the FIR.",
      },
      {
        id: "witness",
        label: "Witness statements",
        why: "A witness who puts the same person in two cities on one date is a contradiction.",
      },
      {
        id: "scan",
        label: "Contradiction check on the two papers that disagree",
        why: "Run the preview here, or the full Gemini pipeline in the Python backend.",
        href: "/game-changers/contradiction-finder",
      },
    ],
  },
];
