"""Required-document checklists per case type.

``extracts`` names the fields a document is expected to yield. The extractor
uses it to send each upload to a focused prompt instead of one generic one, and
the UI uses it to explain why a document is being asked for.
"""

from typing import Any, Dict, List

from .schema import DIVORCE_CASE, GIFT_DEED, SALE_DEED

SALE_DEED_REQUIREMENTS: List[Dict[str, Any]] = [
    {
        "phase": "Phase 1: Identity & Capacity of the Parties",
        "documents": [
            {
                "id": "vendor_id",
                "label": "Proof of Identity of the Vendor: Aadhaar, PAN Card, Passport or Voter ID.",
                "required": True,
                "extracts": ["vendor_name", "vendor_father_name", "vendor_age",
                             "vendor_address", "vendor_pan", "vendor_aadhaar"],
            },
            {
                "id": "purchaser_id",
                "label": "Proof of Identity of the Purchaser: Aadhaar, PAN Card, Passport or Voter ID.",
                "required": True,
                "extracts": ["purchaser_name", "purchaser_father_name", "purchaser_age",
                             "purchaser_address", "purchaser_pan", "purchaser_aadhaar"],
            },
            {
                "id": "vendor_address_proof",
                "label": "Proof of Address of the Vendor: utility bill, bank statement or registered rent agreement.",
                "required": True,
                "extracts": ["vendor_address"],
            },
            {
                "id": "purchaser_address_proof",
                "label": "Proof of Address of the Purchaser: utility bill, bank statement or registered rent agreement.",
                "required": True,
                "extracts": ["purchaser_address"],
            },
            {
                "id": "party_photographs",
                "label": "Passport-size photographs of the Vendor and the Purchaser, for affixing on the deed.",
                "required": False,
                "extracts": [],
            },
        ],
    },
    {
        "phase": "Phase 2: Title & Chain of Ownership",
        "documents": [
            {
                "id": "parent_sale_deed",
                "label": "Prior registered Sale Deed (parent deed) by which the Vendor acquired the property.",
                "required": True,
                "extracts": ["prior_deed_document_no", "prior_deed_book_no",
                             "prior_deed_volume_no", "prior_deed_pages",
                             "prior_deed_date", "prior_deed_sro",
                             "property_description", "survey_number",
                             "sub_division_number", "property_area",
                             "village_or_city", "taluka", "district", "state"],
            },
            {
                "id": "mother_deed",
                "label": "Mother Deed / chain of title documents tracing ownership for the preceding 30 years.",
                "required": False,
                "extracts": ["title_recital"],
            },
            {
                "id": "encumbrance_certificate",
                "label": "Encumbrance Certificate (EC) establishing the property is free of mortgage, lien or charge.",
                "required": True,
                "extracts": [],
            },
            {
                "id": "rtc_khata_extract",
                "label": "RTC / Khata Extract / Mutation Register / 7-12 Extract standing in the name of the Vendor.",
                "required": True,
                "extracts": ["survey_number", "sub_division_number", "property_area",
                             "village_or_city", "taluka", "district", "local_authority"],
            },
            {
                "id": "property_card",
                "label": "Property Card / P.T. Sheet / Chalta extract (cities) or Survey & Sub-division sketch (villages).",
                "required": True,
                "extracts": ["pt_sheet_number", "chalta_number", "property_area",
                             "boundary_east", "boundary_west",
                             "boundary_north", "boundary_south"],
            },
        ],
    },
    {
        "phase": "Phase 3: Statutory Clearances & Property Status",
        "documents": [
            {
                "id": "property_tax_receipt",
                "label": "Latest Property Tax paid receipt (house tax / municipal tax) up to the date of execution.",
                "required": True,
                "extracts": ["local_authority", "property_description"],
            },
            {
                "id": "khata_certificate",
                "label": "Khata Certificate from the Village Panchayat or Municipality.",
                "required": False,
                "extracts": ["local_authority"],
            },
            {
                "id": "approved_plan",
                "label": "Approved Building Plan / Layout Sanction, if the property is constructed upon.",
                "required": False,
                "extracts": [],
            },
            {
                "id": "conversion_order",
                "label": "Land Conversion Order (DC Conversion), if the land was classified as agricultural.",
                "required": False,
                "extracts": [],
            },
            {
                "id": "utility_bills",
                "label": "Latest electricity and water bills for the said property, showing no arrears.",
                "required": False,
                "extracts": ["property_description"],
            },
        ],
    },
    {
        "phase": "Phase 4: Consideration, Valuation & Stamp Duty",
        "documents": [
            {
                "id": "agreement_to_sell",
                "label": "Agreement to Sell executed between the parties, if any.",
                "required": False,
                "extracts": ["sale_consideration_amount", "mode_of_payment",
                             "property_description"],
            },
            {
                "id": "payment_proof",
                "label": "Proof of payment of the sale consideration: RTGS / NEFT advice, cheque record or bank statement.",
                "required": True,
                "extracts": ["sale_consideration_amount", "mode_of_payment"],
            },
            {
                "id": "valuation_challan",
                "label": "Guidance-value assessment and Stamp Duty / Registration Fee challan or e-Stamp certificate.",
                "required": True,
                "extracts": ["market_value", "stamp_duty_paid", "registration_fee"],
            },
            {
                "id": "tds_certificate",
                "label": "Form 26QB / TDS certificate, where the consideration exceeds Rs. 50,00,000.",
                "required": False,
                "extracts": ["sale_consideration_amount"],
            },
        ],
    },
    {
        "phase": "Phase 5: Attesting Witnesses",
        "documents": [
            {
                "id": "witness_ids",
                "label": "Proof of Identity and Address of the two attesting witnesses.",
                "required": True,
                "extracts": ["witness_1_name", "witness_1_address",
                             "witness_2_name", "witness_2_address"],
            },
        ],
    },
]

GIFT_DEED_REQUIREMENTS: List[Dict[str, Any]] = [
    {
        "phase": "Phase 1: Identity, Capacity & Relationship",
        "documents": [
            {
                "id": "donor_id",
                "label": "Proof of Identity of the Donor: Aadhaar, PAN Card, Passport or Voter ID.",
                "required": True,
                "extracts": ["donor_name", "donor_father_name", "donor_age",
                             "donor_address", "donor_pan", "donor_aadhaar",
                             "donor_passport"],
            },
            {
                "id": "donee_id",
                "label": "Proof of Identity of the Donee: Aadhaar, PAN Card, Passport or Voter ID.",
                "required": True,
                "extracts": ["donee_name", "donee_father_name", "donee_age",
                             "donee_address", "donee_pan", "donee_aadhaar",
                             "donee_passport"],
            },
            {
                "id": "donor_address_proof",
                "label": "Proof of Address of the Donor: utility bill, bank statement or registered rent agreement.",
                "required": True,
                "extracts": ["donor_address"],
            },
            {
                "id": "donee_address_proof",
                "label": "Proof of Address of the Donee: utility bill, bank statement or registered rent agreement.",
                "required": True,
                "extracts": ["donee_address"],
            },
            {
                "id": "relationship_proof",
                "label": "Proof of relationship between the Donor and the Donee: birth certificate, "
                         "ration card, family register or school record naming both.",
                "required": True,
                "extracts": ["donee_relationship", "donor_relationship",
                             "donor_name", "donee_name"],
            },
            {
                "id": "party_photographs",
                "label": "Passport-size photographs of the Donor and the Donee, for affixing on the deed.",
                "required": False,
                "extracts": [],
            },
        ],
    },
    {
        "phase": "Phase 2: Title & Chain of Ownership",
        "documents": [
            {
                "id": "parent_agreement",
                "label": "Registered Agreement / Sale Deed by which the Donor acquired the flat, "
                         "together with any deed of ratification recording the shareholding ratio.",
                "required": True,
                "extracts": ["prior_agreement_date", "prior_agreement_parties",
                             "flat_number", "floor_number", "building_name",
                             "carpet_area", "plot_number", "survey_number",
                             "cts_number", "village_or_city", "taluka",
                             "district", "state", "co_owner_name",
                             "co_owner_share", "gift_share_percentage",
                             "property_description"],
            },
            {
                "id": "chain_of_title",
                "label": "Chain of title documents tracing ownership for the preceding 30 years.",
                "required": False,
                "extracts": ["title_recital"],
            },
            {
                "id": "share_certificate",
                "label": "Share Certificate issued by the Society in the name of the Donor.",
                "required": True,
                "extracts": ["share_certificate_no", "share_count",
                             "share_face_value", "share_distinctive_nos",
                             "society_name", "flat_number"],
            },
            {
                "id": "society_registration_certificate",
                "label": "Registration Certificate of the Co-operative Housing Society.",
                "required": True,
                "extracts": ["society_name", "society_registration_no",
                             "society_registration_date", "society_address"],
            },
            {
                "id": "index_ii_or_property_card",
                "label": "Index-II of the parent agreement, or the Property Card / C.T.S. extract for the plot.",
                "required": False,
                "extracts": ["cts_number", "plot_number", "survey_number",
                             "street_number"],
            },
        ],
    },
    {
        "phase": "Phase 3: Society & Statutory Clearances",
        "documents": [
            {
                "id": "society_noc",
                "label": "No-Objection Certificate from the Society for the transfer of the shares and interest by gift.",
                "required": True,
                "extracts": ["society_name", "society_address"],
            },
            {
                "id": "encumbrance_certificate",
                "label": "Encumbrance Certificate establishing the flat is free of mortgage, lien or charge.",
                "required": True,
                "extracts": [],
            },
            {
                "id": "property_tax_receipt",
                "label": "Latest municipal property tax paid receipt for the said flat.",
                "required": True,
                "extracts": ["flat_number", "building_name", "village_or_city"],
            },
            {
                "id": "maintenance_noc",
                "label": "Society certificate that maintenance and sinking-fund dues stand cleared.",
                "required": False,
                "extracts": [],
            },
            {
                "id": "occupancy_certificate",
                "label": "Occupancy / Completion Certificate for the building.",
                "required": False,
                "extracts": ["year_of_construction", "building_floors",
                             "lift_available"],
            },
        ],
    },
    {
        "phase": "Phase 4: Valuation & Stamp Duty",
        "documents": [
            {
                "id": "market_valuation",
                "label": "Ready-reckoner valuation or registered valuer's report for the share being gifted.",
                "required": True,
                "extracts": ["market_value", "carpet_area"],
            },
            {
                "id": "stamp_duty_challan",
                "label": "Stamp Duty / Registration Fee challan, e-Stamp certificate or adjudication order.",
                "required": True,
                "extracts": ["stamp_duty_paid", "registration_fee",
                             "stamp_duty_borne_by"],
            },
            {
                "id": "donor_declaration",
                "label": "Donor's declaration that the gift is voluntary, without consideration and irrevocable.",
                "required": False,
                "extracts": ["gift_recital", "gift_share_percentage"],
            },
            {
                "id": "heirs_noc",
                "label": "Consent or no-objection of the Donor's other legal heirs, where obtained.",
                "required": False,
                "extracts": [],
            },
        ],
    },
    {
        "phase": "Phase 5: Attesting Witnesses",
        "documents": [
            {
                "id": "witness_ids",
                "label": "Proof of Identity and Address of the two attesting witnesses.",
                "required": True,
                "extracts": ["witness_1_name", "witness_1_address",
                             "witness_2_name", "witness_2_address"],
            },
        ],
    },
]

# Pre-existing checklist, kept verbatim so the Divorce Case flow is unchanged.
DIVORCE_REQUIREMENTS: List[Dict[str, Any]] = [
    {
        "phase": "Phase 1: The Initial Filing (Identity & Marriage Proof)",
        "documents": [
            {"id": "spouse_ids", "required": True, "extracts": [],
             "label": "Proof of Identity: Aadhaar, PAN Card, Passport, or Voter ID for both spouses."},
            {"id": "spouse_address", "required": True, "extracts": [],
             "label": "Proof of Address: Recent utility bills, bank statements, or registered rent agreements for both spouses."},
            {"id": "spouse_age", "required": True, "extracts": [],
             "label": "Proof of Age: Birth certificate, Passport, or 10th standard mark sheet."},
            {"id": "marriage_certificate", "required": True, "extracts": [],
             "label": "Proof of Marriage: The official Marriage Certificate. (If not registered, provide wedding invitation card, wedding photographs, or witness affidavits)."},
            {"id": "spouse_photographs", "required": False, "extracts": [],
             "label": "Photographs: 4 recent passport-sized photographs of both the husband and the wife."},
        ],
    },
    {
        "phase": "Phase 2: The Core Petition",
        "documents": [
            {"id": "joint_petition", "required": False, "extracts": [],
             "label": "Joint Petition (Mutual): A drafted legal petition signed by both parties stating they agree to dissolve the marriage."},
            {"id": "separation_proof", "required": False, "extracts": [],
             "label": "Proof of Separation (Mutual): Documents proving the couple has been living separately for at least one continuous year."},
            {"id": "settlement_mou", "required": False, "extracts": [],
             "label": "Memorandum of Understanding / Settlement (Mutual): A legally binding document detailing alimony, asset division, and child custody."},
            {"id": "divorce_petition", "required": False, "extracts": [],
             "label": "The Divorce Petition (Contested): A detailed legal document outlining exact legal grounds for divorce (e.g., cruelty, adultery, desertion)."},
            {"id": "grounds_evidence", "required": False, "extracts": [],
             "label": "Documentary Evidence of Grounds (Contested): Medical records, FIRs, investigator reports, hotel bills, or legal notices."},
            {"id": "witness_affidavits", "required": False, "extracts": [],
             "label": "Witness Affidavits (Contested): Sworn written statements from family, neighbors, or doctors corroborating the claims."},
        ],
    },
    {
        "phase": "Phase 3: Financial & Alimony Assessment",
        "documents": [
            {"id": "income_proof", "required": True, "extracts": [],
             "label": "Income Proof: Salary slips for the last 3 to 6 months for employed individuals."},
            {"id": "tax_records", "required": True, "extracts": [],
             "label": "Tax Records: Income Tax Returns (ITR) and Form 16 for the past 2 to 3 years."},
            {"id": "banking_records", "required": True, "extracts": [],
             "label": "Banking Records: Statements for all joint and individual bank accounts for the past 6 months."},
            {"id": "asset_documents", "required": False, "extracts": [],
             "label": "Asset Documents: Sale deeds for owned properties, vehicle registration certificates, mutual fund statements, and insurance policies."},
        ],
    },
    {
        "phase": "Phase 4: Child Custody & Welfare (If Applicable)",
        "documents": [
            {"id": "children_id", "required": False, "extracts": [],
             "label": "Identity & Age Proof of Children: Birth certificates and school ID cards."},
            {"id": "children_education", "required": False, "extracts": [],
             "label": "Educational Records: School fee receipts and progress reports."},
            {"id": "children_medical", "required": False, "extracts": [],
             "label": "Medical Records: General health history or documents for special medical needs."},
            {"id": "custody_proof", "required": False, "extracts": [],
             "label": "Current Custody Proof: Documentation or witness statements proving who currently provides daily physical care."},
        ],
    },
]

REQUIREMENTS_BY_CASE_TYPE: Dict[str, List[Dict[str, Any]]] = {
    SALE_DEED: SALE_DEED_REQUIREMENTS,
    GIFT_DEED: GIFT_DEED_REQUIREMENTS,
    DIVORCE_CASE: DIVORCE_REQUIREMENTS,
}

# Conveyances have a court-ready generator behind them; the Divorce Case keeps
# the upload-and-file behaviour it already had.
DRAFTABLE_CASE_TYPES = [SALE_DEED, GIFT_DEED]


def requirements_for(case_type: str) -> List[Dict[str, Any]]:
    return REQUIREMENTS_BY_CASE_TYPE.get(case_type, [])


def document_by_id(case_type: str, doc_id: str) -> Dict[str, Any]:
    for phase in requirements_for(case_type):
        for doc in phase["documents"]:
            if doc["id"] == doc_id:
                return doc
    return {}
