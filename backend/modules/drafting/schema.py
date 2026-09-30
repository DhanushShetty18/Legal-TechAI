"""Case-type registry for the Camera Filing drafting engine.

Everything the UI needs to drive the flow lives here: which documents a case
type requires, and which fields the final deed needs. The Sale Deed entry is
derived from the model draft in ``Sale-Deed.pdf`` at the repository root, which
is the gold standard for structure, language and field coverage.
"""

from typing import Any, Dict, List, Optional

SALE_DEED = "Sale Deed"
DIVORCE_CASE = "Divorce Case"


class Field:
    """A single field the deed needs, plus how the UI should ask for it."""

    def __init__(
        self,
        key: str,
        label: str,
        group: str,
        required: bool = False,
        kind: str = "text",
        placeholder: str = "",
        help_text: str = "",
    ):
        self.key = key
        self.label = label
        self.group = group
        self.required = required
        self.kind = kind
        self.placeholder = placeholder
        self.help_text = help_text

    def as_dict(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "group": self.group,
            "required": self.required,
            "kind": self.kind,
            "placeholder": self.placeholder,
            "helpText": self.help_text,
        }


# --------------------------------------------------------------------------
# Sale Deed field set
# --------------------------------------------------------------------------
# Groups are ordered the way the deed reads, so the review form mirrors the
# document the user is about to see generated.
_EXECUTION = "Execution"
_VENDOR = "Vendor (Seller)"
_PURCHASER = "Purchaser (Buyer)"
_TITLE = "Title & Prior Deed"
_CONSIDERATION = "Consideration & Valuation"
_PROPERTY = "Property Schedule"
_BOUNDARIES = "Boundaries"
_WITNESSES = "Witnesses"

SALE_DEED_FIELDS: List[Field] = [
    Field("place_of_execution", "Place of Execution", _EXECUTION, True,
          placeholder="e.g. Mangaluru"),
    Field("date_of_execution", "Date of Execution", _EXECUTION, True, kind="date"),

    Field("vendor_name", "Full Name", _VENDOR, True, placeholder="e.g. Ramesh Kumar"),
    Field("vendor_father_name", "Father's / Husband's Name", _VENDOR, True),
    Field("vendor_age", "Age", _VENDOR, True, kind="number"),
    Field("vendor_marital_status", "Marital Status", _VENDOR),
    Field("vendor_occupation", "Professional Status", _VENDOR,
          placeholder="e.g. Business"),
    Field("vendor_nationality", "Nationality", _VENDOR, placeholder="Indian"),
    Field("vendor_address", "Residential Address", _VENDOR, True, kind="textarea"),
    Field("vendor_pan", "PAN Card No.", _VENDOR, True, placeholder="ABCDE1234F"),
    Field("vendor_aadhaar", "Aadhaar No.", _VENDOR,
          help_text="Stored masked; only the last 4 digits are printed."),

    Field("purchaser_name", "Full Name", _PURCHASER, True),
    Field("purchaser_father_name", "Father's / Husband's Name", _PURCHASER, True),
    Field("purchaser_age", "Age", _PURCHASER, True, kind="number"),
    Field("purchaser_marital_status", "Marital Status", _PURCHASER),
    Field("purchaser_occupation", "Professional Status", _PURCHASER),
    Field("purchaser_nationality", "Nationality", _PURCHASER, placeholder="Indian"),
    Field("purchaser_address", "Residential Address", _PURCHASER, True, kind="textarea"),
    Field("purchaser_pan", "PAN Card No.", _PURCHASER, True),
    Field("purchaser_aadhaar", "Aadhaar No.", _PURCHASER,
          help_text="Stored masked; only the last 4 digits are printed."),

    Field("prior_deed_document_no", "Prior Deed Document No.", _TITLE, True),
    Field("prior_deed_book_no", "Addl. Book No.", _TITLE, placeholder="Book-I"),
    Field("prior_deed_volume_no", "Volume No.", _TITLE),
    Field("prior_deed_pages", "Pages", _TITLE, placeholder="e.g. 112 to 126"),
    Field("prior_deed_date", "Date of Prior Deed", _TITLE, True, kind="date"),
    Field("prior_deed_sro", "Sub-Registrar Office", _TITLE, True,
          placeholder="e.g. SR Mangaluru"),
    Field("title_recital", "How the Vendor acquired title", _TITLE, kind="textarea",
          help_text="Left blank, this recital is drafted from the prior deed details."),

    Field("sale_consideration_amount", "Sale Consideration (Rs.)", _CONSIDERATION,
          True, kind="number"),
    Field("sale_consideration_words", "Consideration in Words", _CONSIDERATION,
          help_text="Left blank, this is computed from the amount."),
    Field("market_value", "Market Value (Rs.)", _CONSIDERATION, kind="number"),
    Field("stamp_duty_paid", "Stamp Duty Paid (Rs.)", _CONSIDERATION, kind="number"),
    Field("registration_fee", "Registration Fee (Rs.)", _CONSIDERATION, kind="number"),
    Field("mode_of_payment", "Mode of Payment", _CONSIDERATION,
          placeholder="e.g. RTGS dated 04.08.2026"),

    Field("property_description", "Property Description", _PROPERTY, True,
          kind="textarea"),
    Field("survey_number", "Survey No.", _PROPERTY),
    Field("sub_division_number", "Sub-Division No.", _PROPERTY),
    Field("pt_sheet_number", "P.T. Sheet No.", _PROPERTY),
    Field("chalta_number", "Chalta No.", _PROPERTY),
    Field("property_area", "Area", _PROPERTY, True, placeholder="e.g. 2,400 sq. ft."),
    Field("village_or_city", "Village / City", _PROPERTY, True),
    Field("taluka", "Taluka", _PROPERTY),
    Field("district", "District", _PROPERTY, True),
    Field("state", "State", _PROPERTY, True),
    Field("local_authority", "Village Panchayat / Municipality", _PROPERTY,
          help_text="Named in the no-objection clause for mutation."),

    Field("boundary_east", "East", _BOUNDARIES, True),
    Field("boundary_west", "West", _BOUNDARIES, True),
    Field("boundary_north", "North", _BOUNDARIES, True),
    Field("boundary_south", "South", _BOUNDARIES, True),

    Field("witness_1_name", "Witness 1 - Name", _WITNESSES, True),
    Field("witness_1_address", "Witness 1 - Address", _WITNESSES),
    Field("witness_2_name", "Witness 2 - Name", _WITNESSES, True),
    Field("witness_2_address", "Witness 2 - Address", _WITNESSES),
]

SALE_DEED_FIELD_KEYS = [f.key for f in SALE_DEED_FIELDS]

# Fields the generator can synthesise itself, so the review form must not block
# on them even though the deed reads better with them filled in.
DERIVABLE_FIELDS = {"sale_consideration_words", "title_recital"}
