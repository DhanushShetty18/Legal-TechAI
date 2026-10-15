/**
 * Case types, their document checklists and the field sets that drive the
 * review form.
 *
 * This mirrors `backend/modules/drafting/checklists.py` and `schema.py`. The
 * duplication is deliberate: the backend runs on a free Render instance that
 * cold-starts in around two minutes, and the checklist is the first thing the
 * page has to paint. Shipping it with the client means the flow is usable
 * immediately and the backend is only needed once a document is actually
 * uploaded. The `id` values must stay identical to the backend's, because they
 * are what tells the extractor which prompt to use for an upload.
 */

export const SALE_DEED = "Sale Deed";
export const GIFT_DEED = "Gift Deed";
export const DIVORCE_CASE = "Divorce Case";

export interface RequiredDocument {
  id: string;
  label: string;
  required: boolean;
}

export interface ChecklistPhase {
  phase: string;
  documents: RequiredDocument[];
}

export interface FieldDef {
  key: string;
  label: string;
  group: string;
  required?: boolean;
  kind?: "text" | "number" | "date" | "textarea";
  placeholder?: string;
  helpText?: string;
}

export const SALE_DEED_CHECKLIST: ChecklistPhase[] = [
  {
    phase: "Phase 1: Identity & Capacity of the Parties",
    documents: [
      { id: "vendor_id", required: true, label: "Proof of Identity of the Vendor: Aadhaar, PAN Card, Passport or Voter ID." },
      { id: "purchaser_id", required: true, label: "Proof of Identity of the Purchaser: Aadhaar, PAN Card, Passport or Voter ID." },
      { id: "vendor_address_proof", required: true, label: "Proof of Address of the Vendor: utility bill, bank statement or registered rent agreement." },
      { id: "purchaser_address_proof", required: true, label: "Proof of Address of the Purchaser: utility bill, bank statement or registered rent agreement." },
      { id: "party_photographs", required: false, label: "Passport-size photographs of the Vendor and the Purchaser, for affixing on the deed." },
    ],
  },
  {
    phase: "Phase 2: Title & Chain of Ownership",
    documents: [
      { id: "parent_sale_deed", required: true, label: "Prior registered Sale Deed (parent deed) by which the Vendor acquired the property." },
      { id: "mother_deed", required: false, label: "Mother Deed / chain of title documents tracing ownership for the preceding 30 years." },
      { id: "encumbrance_certificate", required: true, label: "Encumbrance Certificate (EC) establishing the property is free of mortgage, lien or charge." },
      { id: "rtc_khata_extract", required: true, label: "RTC / Khata Extract / Mutation Register / 7-12 Extract standing in the name of the Vendor." },
      { id: "property_card", required: true, label: "Property Card / P.T. Sheet / Chalta extract (cities) or Survey & Sub-division sketch (villages)." },
    ],
  },
  {
    phase: "Phase 3: Statutory Clearances & Property Status",
    documents: [
      { id: "property_tax_receipt", required: true, label: "Latest Property Tax paid receipt (house tax / municipal tax) up to the date of execution." },
      { id: "khata_certificate", required: false, label: "Khata Certificate from the Village Panchayat or Municipality." },
      { id: "approved_plan", required: false, label: "Approved Building Plan / Layout Sanction, if the property is constructed upon." },
      { id: "conversion_order", required: false, label: "Land Conversion Order (DC Conversion), if the land was classified as agricultural." },
      { id: "utility_bills", required: false, label: "Latest electricity and water bills for the said property, showing no arrears." },
    ],
  },
  {
    phase: "Phase 4: Consideration, Valuation & Stamp Duty",
    documents: [
      { id: "agreement_to_sell", required: false, label: "Agreement to Sell executed between the parties, if any." },
      { id: "payment_proof", required: true, label: "Proof of payment of the sale consideration: RTGS / NEFT advice, cheque record or bank statement." },
      { id: "valuation_challan", required: true, label: "Guidance-value assessment and Stamp Duty / Registration Fee challan or e-Stamp certificate." },
      { id: "tds_certificate", required: false, label: "Form 26QB / TDS certificate, where the consideration exceeds Rs. 50,00,000." },
    ],
  },
  {
    phase: "Phase 5: Attesting Witnesses",
    documents: [
      { id: "witness_ids", required: true, label: "Proof of Identity and Address of the two attesting witnesses." },
    ],
  },
];

/**
 * A gift of a flat held through a co-operative housing society, which is what
 * the reference deed is. The society documents carry as much weight as the
 * title documents here: without the Society's NOC and the share certificate the
 * transfer cannot be recorded, however good the Donor's title.
 */
export const GIFT_DEED_CHECKLIST: ChecklistPhase[] = [
  {
    phase: "Phase 1: Identity, Capacity & Relationship",
    documents: [
      { id: "donor_id", required: true, label: "Proof of Identity of the Donor: Aadhaar, PAN Card, Passport or Voter ID." },
      { id: "donee_id", required: true, label: "Proof of Identity of the Donee: Aadhaar, PAN Card, Passport or Voter ID." },
      { id: "donor_address_proof", required: true, label: "Proof of Address of the Donor: utility bill, bank statement or registered rent agreement." },
      { id: "donee_address_proof", required: true, label: "Proof of Address of the Donee: utility bill, bank statement or registered rent agreement." },
      { id: "relationship_proof", required: true, label: "Proof of relationship between the Donor and the Donee: birth certificate, ration card, family register or school record naming both." },
      { id: "party_photographs", required: false, label: "Passport-size photographs of the Donor and the Donee, for affixing on the deed." },
    ],
  },
  {
    phase: "Phase 2: Title & Chain of Ownership",
    documents: [
      { id: "parent_agreement", required: true, label: "Registered Agreement / Sale Deed by which the Donor acquired the flat, together with any deed of ratification recording the shareholding ratio." },
      { id: "chain_of_title", required: false, label: "Chain of title documents tracing ownership for the preceding 30 years." },
      { id: "share_certificate", required: true, label: "Share Certificate issued by the Society in the name of the Donor." },
      { id: "society_registration_certificate", required: true, label: "Registration Certificate of the Co-operative Housing Society." },
      { id: "index_ii_or_property_card", required: false, label: "Index-II of the parent agreement, or the Property Card / C.T.S. extract for the plot." },
    ],
  },
  {
    phase: "Phase 3: Society & Statutory Clearances",
    documents: [
      { id: "society_noc", required: true, label: "No-Objection Certificate from the Society for the transfer of the shares and interest by gift." },
      { id: "encumbrance_certificate", required: true, label: "Encumbrance Certificate establishing the flat is free of mortgage, lien or charge." },
      { id: "property_tax_receipt", required: true, label: "Latest municipal property tax paid receipt for the said flat." },
      { id: "maintenance_noc", required: false, label: "Society certificate that maintenance and sinking-fund dues stand cleared." },
      { id: "occupancy_certificate", required: false, label: "Occupancy / Completion Certificate for the building." },
    ],
  },
  {
    phase: "Phase 4: Valuation & Stamp Duty",
    documents: [
      { id: "market_valuation", required: true, label: "Ready-reckoner valuation or registered valuer's report for the share being gifted." },
      { id: "stamp_duty_challan", required: true, label: "Stamp Duty / Registration Fee challan, e-Stamp certificate or adjudication order." },
      { id: "donor_declaration", required: false, label: "Donor's declaration that the gift is voluntary, without consideration and irrevocable." },
      { id: "heirs_noc", required: false, label: "Consent or no-objection of the Donor's other legal heirs, where obtained." },
    ],
  },
  {
    phase: "Phase 5: Attesting Witnesses",
    documents: [
      { id: "witness_ids", required: true, label: "Proof of Identity and Address of the two attesting witnesses." },
    ],
  },
];

export const DIVORCE_CHECKLIST: ChecklistPhase[] = [
  {
    phase: "Phase 1: The Initial Filing (Identity & Marriage Proof)",
    documents: [
      { id: "spouse_ids", required: true, label: "Proof of Identity: Aadhaar, PAN Card, Passport, or Voter ID for both spouses." },
      { id: "spouse_address", required: true, label: "Proof of Address: Recent utility bills, bank statements, or registered rent agreements for both spouses." },
      { id: "spouse_age", required: true, label: "Proof of Age: Birth certificate, Passport, or 10th standard mark sheet." },
      { id: "marriage_certificate", required: true, label: "Proof of Marriage: The official Marriage Certificate. (If not registered, provide wedding invitation card, wedding photographs, or witness affidavits)." },
      { id: "spouse_photographs", required: false, label: "Photographs: 4 recent passport-sized photographs of both the husband and the wife." },
    ],
  },
  {
    phase: "Phase 2: The Core Petition",
    documents: [
      { id: "joint_petition", required: false, label: "Joint Petition (Mutual): A drafted legal petition signed by both parties stating they agree to dissolve the marriage." },
      { id: "separation_proof", required: false, label: "Proof of Separation (Mutual): Documents proving the couple has been living separately for at least one continuous year." },
      { id: "settlement_mou", required: false, label: "Memorandum of Understanding / Settlement (Mutual): A legally binding document detailing alimony, asset division, and child custody." },
      { id: "divorce_petition", required: false, label: "The Divorce Petition (Contested): A detailed legal document outlining exact legal grounds for divorce (e.g., cruelty, adultery, desertion)." },
      { id: "grounds_evidence", required: false, label: "Documentary Evidence of Grounds (Contested): Medical records, FIRs, investigator reports, hotel bills, or legal notices." },
      { id: "witness_affidavits", required: false, label: "Witness Affidavits (Contested): Sworn written statements from family, neighbors, or doctors corroborating the claims." },
    ],
  },
  {
    phase: "Phase 3: Financial & Alimony Assessment",
    documents: [
      { id: "income_proof", required: true, label: "Income Proof: Salary slips for the last 3 to 6 months for employed individuals." },
      { id: "tax_records", required: true, label: "Tax Records: Income Tax Returns (ITR) and Form 16 for the past 2 to 3 years." },
      { id: "banking_records", required: true, label: "Banking Records: Statements for all joint and individual bank accounts for the past 6 months." },
      { id: "asset_documents", required: false, label: "Asset Documents: Sale deeds for owned properties, vehicle registration certificates, mutual fund statements, and insurance policies." },
    ],
  },
  {
    phase: "Phase 4: Child Custody & Welfare (If Applicable)",
    documents: [
      { id: "children_id", required: false, label: "Identity & Age Proof of Children: Birth certificates and school ID cards." },
      { id: "children_education", required: false, label: "Educational Records: School fee receipts and progress reports." },
      { id: "children_medical", required: false, label: "Medical Records: General health history or documents for special medical needs." },
      { id: "custody_proof", required: false, label: "Current Custody Proof: Documentation or witness statements proving who currently provides daily physical care." },
    ],
  },
];

export const CHECKLISTS: Record<string, ChecklistPhase[]> = {
  [SALE_DEED]: SALE_DEED_CHECKLIST,
  [GIFT_DEED]: GIFT_DEED_CHECKLIST,
  [DIVORCE_CASE]: DIVORCE_CHECKLIST,
};

/** Case types the drafting engine can produce a court-ready document for. */
export const DRAFTABLE_CASE_TYPES = [SALE_DEED, GIFT_DEED];

export const EXECUTION = "Execution";
export const VENDOR_GROUP = "Vendor (Seller)";
export const PURCHASER_GROUP = "Purchaser (Buyer)";
export const TITLE_GROUP = "Title & Prior Deed";
export const CONSIDERATION_GROUP = "Consideration & Valuation";
export const PROPERTY_GROUP = "Property Schedule";
export const BOUNDARIES_GROUP = "Boundaries";
export const WITNESSES_GROUP = "Witnesses";

export const SALE_DEED_FIELDS: FieldDef[] = [
  { key: "place_of_execution", label: "Place of Execution", group: EXECUTION, required: true, placeholder: "e.g. Mangaluru" },
  { key: "date_of_execution", label: "Date of Execution", group: EXECUTION, required: true, kind: "date" },

  { key: "vendor_name", label: "Full Name", group: VENDOR_GROUP, required: true, placeholder: "e.g. Ramesh Kumar" },
  { key: "vendor_father_name", label: "Father's / Husband's Name", group: VENDOR_GROUP, required: true },
  { key: "vendor_age", label: "Age", group: VENDOR_GROUP, required: true, kind: "number" },
  { key: "vendor_marital_status", label: "Marital Status", group: VENDOR_GROUP },
  { key: "vendor_occupation", label: "Professional Status", group: VENDOR_GROUP, placeholder: "e.g. Business" },
  { key: "vendor_nationality", label: "Nationality", group: VENDOR_GROUP, placeholder: "Indian" },
  { key: "vendor_address", label: "Residential Address", group: VENDOR_GROUP, required: true, kind: "textarea" },
  { key: "vendor_pan", label: "PAN Card No.", group: VENDOR_GROUP, required: true, placeholder: "ABCDE1234F" },
  { key: "vendor_aadhaar", label: "Aadhaar No.", group: VENDOR_GROUP, helpText: "Printed in full on the deed, as the Sub-Registrar requires." },

  { key: "purchaser_name", label: "Full Name", group: PURCHASER_GROUP, required: true },
  { key: "purchaser_father_name", label: "Father's / Husband's Name", group: PURCHASER_GROUP, required: true },
  { key: "purchaser_age", label: "Age", group: PURCHASER_GROUP, required: true, kind: "number" },
  { key: "purchaser_marital_status", label: "Marital Status", group: PURCHASER_GROUP },
  { key: "purchaser_occupation", label: "Professional Status", group: PURCHASER_GROUP },
  { key: "purchaser_nationality", label: "Nationality", group: PURCHASER_GROUP, placeholder: "Indian" },
  { key: "purchaser_address", label: "Residential Address", group: PURCHASER_GROUP, required: true, kind: "textarea" },
  { key: "purchaser_pan", label: "PAN Card No.", group: PURCHASER_GROUP, required: true },
  { key: "purchaser_aadhaar", label: "Aadhaar No.", group: PURCHASER_GROUP, helpText: "Printed in full on the deed, as the Sub-Registrar requires." },

  { key: "prior_deed_document_no", label: "Prior Deed Document No.", group: TITLE_GROUP, required: true },
  { key: "prior_deed_book_no", label: "Addl. Book No.", group: TITLE_GROUP, placeholder: "Book-I" },
  { key: "prior_deed_volume_no", label: "Volume No.", group: TITLE_GROUP },
  { key: "prior_deed_pages", label: "Pages", group: TITLE_GROUP, placeholder: "e.g. 112 to 126" },
  { key: "prior_deed_date", label: "Date of Prior Deed", group: TITLE_GROUP, required: true, kind: "date" },
  { key: "prior_deed_sro", label: "Sub-Registrar Office", group: TITLE_GROUP, required: true, placeholder: "e.g. SR Mangaluru" },
  { key: "title_recital", label: "How the Vendor acquired title", group: TITLE_GROUP, kind: "textarea", helpText: "Left blank, this recital is drafted for you." },

  { key: "sale_consideration_amount", label: "Sale Consideration (Rs.)", group: CONSIDERATION_GROUP, required: true, kind: "number" },
  { key: "sale_consideration_words", label: "Consideration in Words", group: CONSIDERATION_GROUP, helpText: "Left blank, this is computed from the amount." },
  { key: "market_value", label: "Market Value (Rs.)", group: CONSIDERATION_GROUP, kind: "number" },
  { key: "stamp_duty_paid", label: "Stamp Duty Paid (Rs.)", group: CONSIDERATION_GROUP, kind: "number" },
  { key: "registration_fee", label: "Registration Fee (Rs.)", group: CONSIDERATION_GROUP, kind: "number" },
  { key: "mode_of_payment", label: "Mode of Payment", group: CONSIDERATION_GROUP, placeholder: "e.g. RTGS dated 04.08.2026" },

  { key: "property_description", label: "Property Description", group: PROPERTY_GROUP, required: true, kind: "textarea" },
  { key: "survey_number", label: "Survey No.", group: PROPERTY_GROUP },
  { key: "sub_division_number", label: "Sub-Division No.", group: PROPERTY_GROUP },
  { key: "pt_sheet_number", label: "P.T. Sheet No.", group: PROPERTY_GROUP },
  { key: "chalta_number", label: "Chalta No.", group: PROPERTY_GROUP },
  { key: "property_area", label: "Area", group: PROPERTY_GROUP, required: true, placeholder: "e.g. 2,400 sq. ft." },
  { key: "village_or_city", label: "Village / City", group: PROPERTY_GROUP, required: true },
  { key: "taluka", label: "Taluka", group: PROPERTY_GROUP },
  { key: "district", label: "District", group: PROPERTY_GROUP, required: true },
  { key: "state", label: "State", group: PROPERTY_GROUP, required: true },
  { key: "local_authority", label: "Village Panchayat / Municipality", group: PROPERTY_GROUP },

  { key: "boundary_east", label: "East", group: BOUNDARIES_GROUP, required: true },
  { key: "boundary_west", label: "West", group: BOUNDARIES_GROUP, required: true },
  { key: "boundary_north", label: "North", group: BOUNDARIES_GROUP, required: true },
  { key: "boundary_south", label: "South", group: BOUNDARIES_GROUP, required: true },

  { key: "witness_1_name", label: "Witness 1 - Name", group: WITNESSES_GROUP, required: true },
  { key: "witness_1_address", label: "Witness 1 - Address", group: WITNESSES_GROUP },
  { key: "witness_2_name", label: "Witness 2 - Name", group: WITNESSES_GROUP, required: true },
  { key: "witness_2_address", label: "Witness 2 - Address", group: WITNESSES_GROUP },
];

export const DONOR_GROUP = "Donor";
export const DONEE_GROUP = "Donee";
export const GIFT_GROUP = "Gift & Relationship";
export const GIFT_TITLE_GROUP = "Title & Chain of Ownership";
export const SOCIETY_GROUP = "Society & Shares";

export const GIFT_DEED_FIELDS: FieldDef[] = [
  { key: "place_of_execution", label: "Place of Execution", group: EXECUTION, required: true, placeholder: "e.g. Mumbai" },
  { key: "date_of_execution", label: "Date of Execution", group: EXECUTION, required: true, kind: "date" },

  { key: "donor_name", label: "Full Name", group: DONOR_GROUP, required: true, placeholder: "e.g. Mr. Prakash Hiralal Desai" },
  { key: "donor_father_name", label: "Father's / Husband's Name", group: DONOR_GROUP },
  { key: "donor_age", label: "Age", group: DONOR_GROUP, required: true, kind: "number" },
  { key: "donor_occupation", label: "Professional Status", group: DONOR_GROUP, placeholder: "e.g. Retired" },
  { key: "donor_religion", label: "Religion", group: DONOR_GROUP, placeholder: "Hindu", helpText: "Recited as 'an adult Hindu Indian Inhabitant'." },
  { key: "donor_nationality", label: "Nationality", group: DONOR_GROUP, placeholder: "Indian" },
  { key: "donor_address", label: "Residential Address", group: DONOR_GROUP, required: true, kind: "textarea" },
  { key: "donor_pan", label: "PAN Card No.", group: DONOR_GROUP, required: true, placeholder: "ABCDE1234F" },
  { key: "donor_aadhaar", label: "Aadhaar No.", group: DONOR_GROUP, helpText: "Printed in full on the deed, as the Sub-Registrar requires." },
  { key: "donor_passport", label: "Passport No.", group: DONOR_GROUP, helpText: "Recited instead of PAN where the party is resident abroad." },

  { key: "donee_name", label: "Full Name", group: DONEE_GROUP, required: true },
  { key: "donee_father_name", label: "Father's / Husband's Name", group: DONEE_GROUP },
  { key: "donee_age", label: "Age", group: DONEE_GROUP, required: true, kind: "number" },
  { key: "donee_occupation", label: "Professional Status", group: DONEE_GROUP },
  { key: "donee_religion", label: "Religion", group: DONEE_GROUP, placeholder: "Hindu" },
  { key: "donee_nationality", label: "Nationality", group: DONEE_GROUP, placeholder: "Indian" },
  { key: "donee_address", label: "Residential Address", group: DONEE_GROUP, required: true, kind: "textarea" },
  { key: "donee_pan", label: "PAN Card No.", group: DONEE_GROUP, required: true },
  { key: "donee_aadhaar", label: "Aadhaar No.", group: DONEE_GROUP, helpText: "Printed in full on the deed, as the Sub-Registrar requires." },
  { key: "donee_passport", label: "Passport No.", group: DONEE_GROUP },

  { key: "donee_relationship", label: "The Donee is the Donor's", group: GIFT_GROUP, required: true, placeholder: "e.g. Son", helpText: "Recited as the natural love and affection founding the gift." },
  { key: "donor_relationship", label: "The Donor is the Donee's", group: GIFT_GROUP, placeholder: "e.g. Father", helpText: "Left blank, the reciprocal is taken from the Donee's relationship." },
  { key: "gift_share_percentage", label: "Share Gifted (%)", group: GIFT_GROUP, required: true, placeholder: "e.g. 50", helpText: "The undivided share of the Donor passing under this deed." },
  { key: "gift_recital", label: "Why the gift is being made", group: GIFT_GROUP, kind: "textarea", helpText: "Left blank, this recital is drafted from the relationship." },
  { key: "market_value", label: "Market Value (Rs.)", group: GIFT_GROUP, kind: "number", helpText: "Stamp duty on a gift is charged on the value of the share gifted." },
  { key: "stamp_duty_paid", label: "Stamp Duty Paid (Rs.)", group: GIFT_GROUP, kind: "number" },
  { key: "registration_fee", label: "Registration Fee (Rs.)", group: GIFT_GROUP, kind: "number" },
  { key: "stamp_duty_borne_by", label: "Stamp Duty & Registration Borne By", group: GIFT_GROUP, placeholder: "Donor", helpText: "The reference deed places the whole burden on the Donor." },

  { key: "prior_agreement_date", label: "Date of Prior Agreement", group: GIFT_TITLE_GROUP, kind: "date", helpText: "The agreement under which the Donor acquired the property." },
  { key: "prior_agreement_parties", label: "Parties to the Prior Agreement", group: GIFT_TITLE_GROUP, kind: "textarea" },
  { key: "title_recital", label: "How the Donor acquired title", group: GIFT_TITLE_GROUP, kind: "textarea", helpText: "Left blank, this recital is drafted from the prior agreement." },
  { key: "co_owner_name", label: "Co-owner Retaining a Share", group: GIFT_TITLE_GROUP, helpText: "Named in the before-and-after share table." },
  { key: "co_owner_share", label: "Co-owner's Share (%)", group: GIFT_TITLE_GROUP, placeholder: "e.g. 50" },

  { key: "society_name", label: "Co-operative Housing Society", group: SOCIETY_GROUP, required: true, placeholder: "e.g. Vishwashanti Co-op. Hsg. Soc. Ltd." },
  { key: "society_registration_no", label: "Society Registration No.", group: SOCIETY_GROUP },
  { key: "society_registration_date", label: "Society Registration Date", group: SOCIETY_GROUP, kind: "date" },
  { key: "society_address", label: "Society Address", group: SOCIETY_GROUP, kind: "textarea" },
  { key: "share_certificate_no", label: "Share Certificate No.", group: SOCIETY_GROUP, required: true },
  { key: "share_count", label: "Number of Shares", group: SOCIETY_GROUP, placeholder: "e.g. 5" },
  { key: "share_face_value", label: "Face Value per Share (Rs.)", group: SOCIETY_GROUP, placeholder: "e.g. 50" },
  { key: "share_distinctive_nos", label: "Distinctive Share Nos.", group: SOCIETY_GROUP, placeholder: "e.g. 021 to 025" },

  { key: "flat_number", label: "Flat No.", group: PROPERTY_GROUP, required: true, placeholder: "e.g. 101" },
  { key: "floor_number", label: "Floor", group: PROPERTY_GROUP, placeholder: "e.g. 1st Floor" },
  { key: "building_name", label: "Building Name", group: PROPERTY_GROUP, required: true },
  { key: "carpet_area", label: "Carpet Area", group: PROPERTY_GROUP, required: true, placeholder: "e.g. 540 sq. ft." },
  { key: "year_of_construction", label: "Year of Construction", group: PROPERTY_GROUP },
  { key: "building_floors", label: "No. of Floors in the Building", group: PROPERTY_GROUP },
  { key: "lift_available", label: "Lift", group: PROPERTY_GROUP, placeholder: "Yes / No" },
  { key: "plot_number", label: "Plot No.", group: PROPERTY_GROUP },
  { key: "survey_number", label: "Survey No.", group: PROPERTY_GROUP },
  { key: "cts_number", label: "C.T.S. No.", group: PROPERTY_GROUP },
  { key: "street_number", label: "Street No. / Road", group: PROPERTY_GROUP },
  { key: "village_or_city", label: "Village / City", group: PROPERTY_GROUP, required: true },
  { key: "taluka", label: "Taluka", group: PROPERTY_GROUP },
  { key: "district", label: "District", group: PROPERTY_GROUP, required: true },
  { key: "state", label: "State", group: PROPERTY_GROUP, required: true },
  { key: "property_description", label: "Property Description", group: PROPERTY_GROUP, kind: "textarea", helpText: "Left blank, the schedule is drafted from the particulars above." },

  { key: "witness_1_name", label: "Witness 1 - Name", group: WITNESSES_GROUP, required: true },
  { key: "witness_1_address", label: "Witness 1 - Address", group: WITNESSES_GROUP },
  { key: "witness_2_name", label: "Witness 2 - Name", group: WITNESSES_GROUP, required: true },
  { key: "witness_2_address", label: "Witness 2 - Address", group: WITNESSES_GROUP },
];

/** Mirrors `DERIVABLE_FIELDS` on the backend: the generator writes these itself. */
export const DERIVABLE_FIELDS = new Set([
  "sale_consideration_words",
  "title_recital",
  "gift_recital",
]);

export const FIELDS_BY_CASE_TYPE: Record<string, FieldDef[]> = {
  [SALE_DEED]: SALE_DEED_FIELDS,
  [GIFT_DEED]: GIFT_DEED_FIELDS,
  [DIVORCE_CASE]: [],
};

/**
 * Groups whose labels repeat across the two parties, so the label alone is
 * ambiguous: "Full Name" could be either side's. Used by `fieldLabel`.
 */
const PARTY_GROUPS: Record<string, string[]> = {
  [SALE_DEED]: [VENDOR_GROUP, PURCHASER_GROUP],
  [GIFT_DEED]: [DONOR_GROUP, DONEE_GROUP],
};

export function fieldsFor(caseType: string): FieldDef[] {
  return FIELDS_BY_CASE_TYPE[caseType] ?? [];
}

/** The groups of a case type, in the order the deed reads. */
export function fieldGroupsFor(caseType: string): string[] {
  return fieldsFor(caseType).reduce<string[]>((groups, field) => {
    if (!groups.includes(field.group)) groups.push(field.group);
    return groups;
  }, []);
}

export const FIELD_GROUPS: string[] = fieldGroupsFor(SALE_DEED);

export type DeedFields = Record<string, string>;

/** Required particulars the user still has to supply before the deed can be drafted. */
export function missingRequiredFields(
  fields: DeedFields,
  caseType: string = SALE_DEED,
): string[] {
  return fieldsFor(caseType)
    .filter(
      (field) =>
        field.required &&
        !DERIVABLE_FIELDS.has(field.key) &&
        !String(fields[field.key] ?? "").trim(),
    )
    .map((field) => field.key);
}

export function checklistFor(caseType: string): ChecklistPhase[] {
  return CHECKLISTS[caseType] ?? [];
}

export function isDraftable(caseType: string): boolean {
  return DRAFTABLE_CASE_TYPES.includes(caseType);
}

export function allDocuments(caseType: string): RequiredDocument[] {
  return checklistFor(caseType).flatMap((phase) => phase.documents);
}

export function fieldLabel(key: string, caseType: string = SALE_DEED): string {
  const field = fieldsFor(caseType).find((candidate) => candidate.key === key);
  if (!field) return key;
  const scoped = (PARTY_GROUPS[caseType] ?? []).includes(field.group);
  return scoped ? `${field.group.split(" ")[0]} - ${field.label}` : field.label;
}
