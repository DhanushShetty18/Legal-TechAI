"""Case-type registry for the Camera Filing drafting engine.

Everything the UI needs to drive the flow lives here: which documents a case
type requires, and which fields the final deed needs. The Sale Deed entry is
derived from the model draft in ``Sale-Deed.pdf`` at the repository root, and
the Gift Deed entry from ``GIFT DEED (50-50).pdf``; both are the gold standard
for structure, language and field coverage of their respective instruments.
"""

from typing import Any, Dict, List, Optional

SALE_DEED = "Sale Deed"
GIFT_DEED = "Gift Deed"
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
          help_text="Printed in full on the deed, as the Sub-Registrar requires."),

    Field("purchaser_name", "Full Name", _PURCHASER, True),
    Field("purchaser_father_name", "Father's / Husband's Name", _PURCHASER, True),
    Field("purchaser_age", "Age", _PURCHASER, True, kind="number"),
    Field("purchaser_marital_status", "Marital Status", _PURCHASER),
    Field("purchaser_occupation", "Professional Status", _PURCHASER),
    Field("purchaser_nationality", "Nationality", _PURCHASER, placeholder="Indian"),
    Field("purchaser_address", "Residential Address", _PURCHASER, True, kind="textarea"),
    Field("purchaser_pan", "PAN Card No.", _PURCHASER, True),
    Field("purchaser_aadhaar", "Aadhaar No.", _PURCHASER,
          help_text="Printed in full on the deed, as the Sub-Registrar requires."),

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


# --------------------------------------------------------------------------
# Gift Deed field set
# --------------------------------------------------------------------------
# A gift conveys without consideration, so there is no price to capture. What
# takes its place is the relationship between the parties (the natural love and
# affection that is the whole basis of the instrument), the share being gifted,
# and - because the reference deed gifts a flat in a co-operative housing
# society - the society's share certificate particulars.
_DONOR = "Donor"
_DONEE = "Donee"
_GIFT = "Gift & Relationship"
_SOCIETY = "Society & Shares"
_GIFT_TITLE = "Title & Chain of Ownership"
_GIFT_PROPERTY = "Property Schedule"

GIFT_DEED_FIELDS: List[Field] = [
    Field("place_of_execution", "Place of Execution", _EXECUTION, True,
          placeholder="e.g. Mumbai"),
    Field("date_of_execution", "Date of Execution", _EXECUTION, True, kind="date"),

    Field("donor_name", "Full Name", _DONOR, True,
          placeholder="e.g. Mr. Prakash Hiralal Desai"),
    Field("donor_father_name", "Father's / Husband's Name", _DONOR),
    Field("donor_age", "Age", _DONOR, True, kind="number"),
    Field("donor_occupation", "Professional Status", _DONOR,
          placeholder="e.g. Retired"),
    Field("donor_religion", "Religion", _DONOR, placeholder="Hindu",
          help_text="Recited as 'an adult Hindu Indian Inhabitant'."),
    Field("donor_nationality", "Nationality", _DONOR, placeholder="Indian"),
    Field("donor_address", "Residential Address", _DONOR, True, kind="textarea"),
    Field("donor_pan", "PAN Card No.", _DONOR, True, placeholder="ABCDE1234F"),
    Field("donor_aadhaar", "Aadhaar No.", _DONOR,
          help_text="Printed in full on the deed, as the Sub-Registrar requires."),
    Field("donor_passport", "Passport No.", _DONOR,
          help_text="Recited instead of PAN where the party is resident abroad."),

    Field("donee_name", "Full Name", _DONEE, True),
    Field("donee_father_name", "Father's / Husband's Name", _DONEE),
    Field("donee_age", "Age", _DONEE, True, kind="number"),
    Field("donee_occupation", "Professional Status", _DONEE),
    Field("donee_religion", "Religion", _DONEE, placeholder="Hindu"),
    Field("donee_nationality", "Nationality", _DONEE, placeholder="Indian"),
    Field("donee_address", "Residential Address", _DONEE, True, kind="textarea"),
    Field("donee_pan", "PAN Card No.", _DONEE, True),
    Field("donee_aadhaar", "Aadhaar No.", _DONEE,
          help_text="Printed in full on the deed, as the Sub-Registrar requires."),
    Field("donee_passport", "Passport No.", _DONEE),

    Field("donee_relationship", "The Donee is the Donor's", _GIFT, True,
          placeholder="e.g. Son",
          help_text="Recited as the natural love and affection founding the gift."),
    Field("donor_relationship", "The Donor is the Donee's", _GIFT,
          placeholder="e.g. Father",
          help_text="Left blank, the reciprocal is taken from the Donee's relationship."),
    Field("gift_share_percentage", "Share Gifted (%)", _GIFT, True,
          placeholder="e.g. 50",
          help_text="The undivided share of the Donor passing under this deed."),
    Field("gift_recital", "Why the gift is being made", _GIFT, kind="textarea",
          help_text="Left blank, this recital is drafted from the relationship."),
    Field("market_value", "Market Value (Rs.)", _GIFT, kind="number",
          help_text="Stamp duty on a gift is charged on the value of the share gifted."),
    Field("stamp_duty_paid", "Stamp Duty Paid (Rs.)", _GIFT, kind="number"),
    Field("registration_fee", "Registration Fee (Rs.)", _GIFT, kind="number"),
    Field("stamp_duty_borne_by", "Stamp Duty & Registration Borne By", _GIFT,
          placeholder="Donor",
          help_text="The reference deed places the whole burden on the Donor."),

    Field("prior_agreement_date", "Date of Prior Agreement", _GIFT_TITLE, kind="date",
          help_text="The agreement under which the Donor acquired the property."),
    Field("prior_agreement_parties", "Parties to the Prior Agreement", _GIFT_TITLE,
          kind="textarea"),
    Field("title_recital", "How the Donor acquired title", _GIFT_TITLE, kind="textarea",
          help_text="Left blank, this recital is drafted from the prior agreement."),
    Field("co_owner_name", "Co-owner Retaining a Share", _GIFT_TITLE,
          help_text="Named in the before-and-after share table."),
    Field("co_owner_share", "Co-owner's Share (%)", _GIFT_TITLE,
          placeholder="e.g. 50"),

    Field("society_name", "Co-operative Housing Society", _SOCIETY, True,
          placeholder="e.g. Vishwashanti Co-op. Hsg. Soc. Ltd."),
    Field("society_registration_no", "Society Registration No.", _SOCIETY),
    Field("society_registration_date", "Society Registration Date", _SOCIETY,
          kind="date"),
    Field("society_address", "Society Address", _SOCIETY, kind="textarea"),
    Field("share_certificate_no", "Share Certificate No.", _SOCIETY, True),
    Field("share_count", "Number of Shares", _SOCIETY, placeholder="e.g. 5"),
    Field("share_face_value", "Face Value per Share (Rs.)", _SOCIETY,
          placeholder="e.g. 50"),
    Field("share_distinctive_nos", "Distinctive Share Nos.", _SOCIETY,
          placeholder="e.g. 021 to 025"),

    Field("flat_number", "Flat No.", _GIFT_PROPERTY, True, placeholder="e.g. 101"),
    Field("floor_number", "Floor", _GIFT_PROPERTY, placeholder="e.g. 1st Floor"),
    Field("building_name", "Building Name", _GIFT_PROPERTY, True),
    Field("carpet_area", "Carpet Area", _GIFT_PROPERTY, True,
          placeholder="e.g. 540 sq. ft."),
    Field("year_of_construction", "Year of Construction", _GIFT_PROPERTY),
    Field("building_floors", "No. of Floors in the Building", _GIFT_PROPERTY),
    Field("lift_available", "Lift", _GIFT_PROPERTY, placeholder="Yes / No"),
    Field("plot_number", "Plot No.", _GIFT_PROPERTY),
    Field("survey_number", "Survey No.", _GIFT_PROPERTY),
    Field("cts_number", "C.T.S. No.", _GIFT_PROPERTY),
    Field("street_number", "Street No. / Road", _GIFT_PROPERTY),
    Field("village_or_city", "Village / City", _GIFT_PROPERTY, True),
    Field("taluka", "Taluka", _GIFT_PROPERTY),
    Field("district", "District", _GIFT_PROPERTY, True),
    Field("state", "State", _GIFT_PROPERTY, True),
    Field("property_description", "Property Description", _GIFT_PROPERTY,
          kind="textarea",
          help_text="Left blank, the schedule is drafted from the particulars above."),

    Field("witness_1_name", "Witness 1 - Name", _WITNESSES, True),
    Field("witness_1_address", "Witness 1 - Address", _WITNESSES),
    Field("witness_2_name", "Witness 2 - Name", _WITNESSES, True),
    Field("witness_2_address", "Witness 2 - Address", _WITNESSES),
]

GIFT_DEED_FIELD_KEYS = [f.key for f in GIFT_DEED_FIELDS]

FIELDS_BY_CASE_TYPE: Dict[str, List[Field]] = {
    SALE_DEED: SALE_DEED_FIELDS,
    GIFT_DEED: GIFT_DEED_FIELDS,
    DIVORCE_CASE: [],
}


def fields_for(case_type: str) -> List[Field]:
    """The field set for a case type; empty for types with no generator."""
    return FIELDS_BY_CASE_TYPE.get(case_type, [])


def field_keys_for(case_type: str) -> List[str]:
    return [f.key for f in fields_for(case_type)]


# Fields the generator can synthesise itself, so the review form must not block
# on them even though the deed reads better with them filled in.
DERIVABLE_FIELDS = {"sale_consideration_words", "title_recital", "gift_recital"}
