"""Sale Deed generation.

The deed is assembled from a deterministic skeleton that mirrors the model
draft in ``Sale-Deed.pdf``: the same recital order, the same operative clauses,
the same Schedule and the same attestation and thumb-impression pages.

Only the three genuinely bespoke passages - the title recital, the agreement
recital and the Schedule's property description - are authored by the model.
The operative clauses are template-locked, because a clause that drifts is a
clause that has to be re-registered. When the model is unavailable or returns
something unusable, the deterministic wording for those three passages is used
and the deed is still complete and court-ready.
"""

import logging
import re
from typing import Any, Dict, Iterator, List, Optional

from ..gemini import extract_json, retry_on_failure
from .formatting import (
    blank,
    deed_date_parts,
    format_indian_currency,
    format_long_date,
    mask_aadhaar,
    parse_amount,
    rupees_in_words,
)

logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-2.5-flash"

# Sections the model is allowed to author.
NARRATIVE_SECTIONS = ("title_recital", "agreement_recital", "schedule_body")

# Roughly how many rendered words fit on a printed page of the deed, used to
# report progress to the UI. Signature pages are counted separately.
WORDS_PER_PAGE = 330
SIGNATURE_PAGES = 2


class Section(dict):
    """A block of the deed. ``style`` drives both the on-screen and PDF layout."""

    def __init__(self, id: str, style: str, body: str = "", heading: str = ""):
        super().__init__(id=id, style=style, heading=heading, body=body)


def _v(fields: Dict[str, Any], key: str, width: int = 24) -> str:
    """Field value, or the dotted fill a deed leaves for registration-time detail."""
    value = fields.get(key)
    if value is None:
        return blank(width)
    text = str(value).strip()
    return text or blank(width)


def _has(fields: Dict[str, Any], key: str) -> bool:
    return bool(str(fields.get(key) or "").strip())


def _party_block(fields: Dict[str, Any], role: str, caption: str, part: str) -> str:
    name = _v(fields, f"{role}_name", 28).upper()
    father = _v(fields, f"{role}_father_name", 24)
    age = _v(fields, f"{role}_age", 4)
    marital = _v(fields, f"{role}_marital_status", 12)
    occupation = _v(fields, f"{role}_occupation", 16)
    nationality = str(fields.get(f"{role}_nationality") or "Indian").strip()
    address = _v(fields, f"{role}_address", 40)
    pan = _v(fields, f"{role}_pan", 12)
    aadhaar = mask_aadhaar(fields.get(f"{role}_aadhaar")) or blank(12)

    return (
        f"{name}, son / daughter / wife of {father}, aged about {age} years, "
        f"{marital} by marital status, by occupation {occupation}, "
        f"{nationality} National, residing at {address}, holding PAN Card "
        f"No. {pan} and Aadhaar Card No. {aadhaar} "
        f"(hereinafter called “the {caption}”) of the {part}."
    )


def _consideration_phrase(fields: Dict[str, Any]) -> str:
    amount = parse_amount(fields.get("sale_consideration_amount"))
    if amount is None:
        return f"Rs. {blank(16)}/- ({blank(40)})"
    words = str(fields.get("sale_consideration_words") or "").strip() or rupees_in_words(amount)
    return f"Rs. {format_indian_currency(amount)}/- ({words})"


def _market_value_phrase(fields: Dict[str, Any]) -> str:
    amount = parse_amount(fields.get("market_value"))
    if amount is None:
        return f"Rs. {blank(16)}/-"
    return f"Rs. {format_indian_currency(amount)}/- ({rupees_in_words(amount)})"


def _default_title_recital(fields: Dict[str, Any]) -> str:
    supplied = str(fields.get("title_recital") or "").strip()
    if supplied:
        return supplied
    return (
        f"WHEREAS the Vendor is the absolute owner of and is in lawful, "
        f"peaceful and vacant possession and enjoyment of the property more "
        f"particularly described in the Schedule hereunder written, having "
        f"acquired the same by and under a registered Sale Deed bearing "
        f"Document No. {_v(fields, 'prior_deed_document_no', 18)}, registered "
        f"in Addl. Book No. {_v(fields, 'prior_deed_book_no', 8)}, Volume "
        f"No. {_v(fields, 'prior_deed_volume_no', 8)}, at Pages "
        f"{_v(fields, 'prior_deed_pages', 14)}, dated "
        f"{format_long_date(fields.get('prior_deed_date')) or blank(18)}, duly "
        f"registered in the Office of the Sub-Registrar, "
        f"{_v(fields, 'prior_deed_sro', 18)}, and the Vendor has since then "
        f"been holding the said property as its absolute owner, paying all "
        f"taxes and outgoings in respect thereof, and the revenue records in "
        f"respect of the said property stand mutated in the name of the Vendor."
    )


def _default_agreement_recital(fields: Dict[str, Any]) -> str:
    return (
        f"AND WHEREAS the Vendor, for his / her bonafide needs and legal "
        f"requirements, of his / her own free will and volition, in a sound and "
        f"disposing state of mind, and without any pressure, force, compulsion, "
        f"coercion, fraud or undue influence from any person whomsoever, has "
        f"agreed to sell, convey and transfer the property more particularly "
        f"described in the Schedule hereunder written unto the Purchaser for a "
        f"total sale consideration of {_consideration_phrase(fields)}, and the "
        f"Purchaser, after having inspected the said property, scrutinised the "
        f"title deeds and revenue records pertaining thereto, and having "
        f"fully satisfied himself / herself as to the marketable title of the "
        f"Vendor thereto, has agreed to purchase the same for the said "
        f"consideration, free from all encumbrances."
    )


def _default_schedule_body(fields: Dict[str, Any]) -> str:
    """The Schedule: identifiers first, then the descriptive text."""
    lines: List[str] = []
    descriptors = [
        ("Survey No.", "survey_number"),
        ("Sub-Division No.", "sub_division_number"),
        ("P.T. Sheet No.", "pt_sheet_number"),
        ("Chalta No.", "chalta_number"),
        ("Extent / Area", "property_area"),
        ("Village / City", "village_or_city"),
        ("Taluka", "taluka"),
        ("District", "district"),
        ("State", "state"),
    ]
    for label, key in descriptors:
        if _has(fields, key):
            lines.append(f"{label}: {str(fields[key]).strip()}")

    described = str(fields.get("property_description") or "").strip()
    if described:
        lines.append("")
        lines.append(described)
    elif not lines:
        lines.append(blank(60))

    return "\n".join(lines)


def _boundaries_body(fields: Dict[str, Any]) -> str:
    return "\n".join(
        f"{label}: {_v(fields, key, 34)}"
        for label, key in (
            ("East", "boundary_east"),
            ("West", "boundary_west"),
            ("North", "boundary_north"),
            ("South", "boundary_south"),
        )
    )


# --------------------------------------------------------------------------
# Operative clauses - template-locked
# --------------------------------------------------------------------------
def _operative_clauses(fields: Dict[str, Any]) -> List[str]:
    consideration = _consideration_phrase(fields)
    payment = str(fields.get("mode_of_payment") or "").strip()
    payment_clause = (
        f" The said consideration has been paid by way of {payment}."
        if payment else ""
    )
    authority = _v(fields, "local_authority", 22)
    stamp = parse_amount(fields.get("stamp_duty_paid"))
    reg_fee = parse_amount(fields.get("registration_fee"))
    duty_particulars = ""
    if stamp is not None:
        duty_particulars += f" Stamp duty of Rs. {format_indian_currency(stamp)}/- has been paid hereon."
    if reg_fee is not None:
        duty_particulars += f" Registration fee of Rs. {format_indian_currency(reg_fee)}/- has been paid."

    return [
        f"That in pursuance of the said agreement and in consideration of "
        f"{consideration}, the entire amount whereof has been received by the "
        f"Vendor from the Purchaser prior to the execution of this Sale Deed, "
        f"the receipt of which the Vendor doth hereby admit and "
        f"acknowledge, and of and from the same and every part thereof doth "
        f"hereby acquit, release and discharge the Purchaser forever."
        f"{payment_clause}",

        "That the Vendor doth hereby sell, convey, transfer, assign and assure "
        "unto the Purchaser the property more particularly described in the "
        "Schedule hereunder written, absolutely and forever, together with all "
        "rights, title, interest, easements, privileges and appurtenances "
        "belonging thereto or in any manner appertaining thereto, and the "
        "Purchaser shall hereafter be the absolute owner thereof and shall "
        "hold and enjoy the same as such, without any let, hindrance, claim or "
        "interruption whatsoever from the Vendor or any person claiming "
        "through, under or in trust for the Vendor.",

        "That the actual, physical, vacant and peaceful possession of the said "
        "property has been handed over by the Vendor to the Purchaser, and the "
        "Purchaser is in possession of the same as on the date of registration "
        "of this Sale Deed.",

        f"That all expenses of and incidental to this Sale Deed, including the "
        f"stamp duty, execution charges and registration fees, have been borne "
        f"and paid by the Purchaser.{duty_particulars}",

        "That all taxes, cesses, charges, dues, demands, arrears, electricity "
        "charges, water charges, outstanding bills, house tax, development "
        "charges and other outgoings whatsoever in respect of the said "
        "property, for the period prior to the date of execution of this Sale "
        "Deed, shall be paid and borne by the Vendor, and thereafter the same "
        "shall be paid and borne by the Purchaser.",

        f"That the Vendor doth hereby convey a NO OBJECTION CERTIFICATE for "
        f"getting the said property transferred and mutated in the relevant "
        f"Record of Rights pertaining to the Village Panchayat / Municipality "
        f"of {authority}, and the Purchaser shall have full right and liberty "
        f"to get the said property transferred and mutated into his / her own "
        f"name in the records of the concerned department, without any further "
        f"written consent of the Vendor.",

        "That all rights, liberties, easements and appurtenances attached to "
        "or enjoyed with the said property have also been conveyed and "
        "transferred along with the said property unto the Purchaser.",

        "That the Vendor has assured and declared unto the Purchaser that the "
        "said property hereby sold is free from all sorts of encumbrances, "
        "such as sale, mortgage, gift, exchange, transfer, charge, lien, "
        "decree, litigation, lease, tenancy, maintenance claim, injunction, "
        "acquisition or notification whatsoever, and that there is no defect "
        "in the title of the Vendor thereto; and if it is proved otherwise at "
        "any time hereafter and the Purchaser suffers any loss on that "
        "account, the Vendor shall be fully liable and responsible for the "
        "same, and the Purchaser shall be entitled to recover all such losses, "
        "costs and damages from the Vendor and from his / her other assets and "
        "properties.",

        "That the Purchaser shall have full right to apply for and obtain "
        "water, electricity, drainage and sewerage connections in respect of "
        "the said property from the concerned authorities, and also to get the "
        "existing connections and the names thereon changed into his / her own "
        "name, without any further written consent of the Vendor.",

        "That the Vendor has, simultaneously with the execution hereof, "
        "delivered unto the Purchaser all the original previous title deeds "
        "and documents relating to the said property that are in his / her "
        "possession, power or custody.",

        "That the Vendor doth hereby declare and assure unto the Purchaser "
        "that the said property has not been acquired or requisitioned by the "
        "Government or any statutory authority, and that there is no "
        "injunction, attachment or prohibitory order of any Court, Tribunal or "
        "Department subsisting in respect thereof.",

        f"That the market value of the said property is "
        f"{_market_value_phrase(fields)}. All facts relating to its market "
        f"value, the consideration passing hereunder, and its chargeability to "
        f"stamp duty and registration fees have been fully and truly set forth "
        f"in this Sale Deed, and nothing has been concealed or suppressed.",

        "That the Vendor doth hereby covenant with the Purchaser that the "
        "Vendor shall, at all times hereafter and at the cost of the "
        "Purchaser, execute and register such further deeds, documents, "
        "declarations, affidavits and assurances as may reasonably be required "
        "for more perfectly assuring the said property unto the Purchaser.",

        "That the Vendor doth hereby declare that he / she has not entered "
        "into any prior agreement to sell, exchange, mortgage, lease or "
        "otherwise deal with the said property or any part thereof with any "
        "other person, and that no other person has any right, title, "
        "interest, claim or demand in, upon or against the said property.",

        "That the Vendor and the Purchaser hereby declare that they are Indian "
        "Nationals, and that the transaction recorded herein is not in "
        "contravention of any law in force, including the Foreign Exchange "
        "Management Act, 1999.",
    ]


# --------------------------------------------------------------------------
# Skeleton
# --------------------------------------------------------------------------
def build_sections(fields: Dict[str, Any],
                   narrative: Optional[Dict[str, str]] = None) -> List[Section]:
    """The complete deed, in reading order. ``narrative`` overrides the
    model-authored passages; anything missing falls back to the template."""
    narrative = narrative or {}
    place = _v(fields, "place_of_execution", 18)
    day, month, year = deed_date_parts(fields.get("date_of_execution"))

    sections: List[Section] = [
        Section("title", "title", "SALE DEED"),
        Section(
            "preamble", "preamble",
            f"This SALE DEED is made, executed and entered into at {place} on "
            f"this {day} day of {month}, {year}.",
        ),
        Section("between_label", "party-label", "BETWEEN"),
        Section("vendor", "party",
                _party_block(fields, "vendor", "VENDOR", "ONE PART")),
        Section("and_label", "party-label", "AND"),
        Section("purchaser", "party",
                _party_block(fields, "purchaser", "PURCHASER", "OTHER PART")),
        Section(
            "expression", "preamble",
            "The expressions “the Vendor” and “the Purchaser” "
            "shall, wherever the context so admits, mean and include the "
            "parties themselves and their respective legal heirs, executors, "
            "successors, administrators, legal representatives, assigns and "
            "nominees.",
        ),
        Section("title_recital", "recital",
                narrative.get("title_recital") or _default_title_recital(fields)),
        Section("agreement_recital", "recital",
                narrative.get("agreement_recital") or _default_agreement_recital(fields)),
        Section("witnesseth", "operative-heading",
                "NOW THIS DEED WITNESSETH AS UNDER:-"),
    ]

    for index, clause in enumerate(_operative_clauses(fields), start=1):
        sections.append(Section(f"clause_{index}", "clause", clause,
                                heading=str(index)))

    sections.extend([
        Section("schedule_heading", "schedule-heading", "SCHEDULE"),
        Section(
            "schedule_note", "schedule-note",
            "(The complete description of the property hereby conveyed, "
            "including Survey Nos. and Sub-Division Nos. in the case of "
            "villages, or Chalta Nos. and P.T. Sheet Nos. in the case of "
            "cities, together with the area and the boundaries thereof.)",
        ),
        Section("schedule_body", "schedule",
                narrative.get("schedule_body") or _default_schedule_body(fields)),
        Section("boundaries", "boundaries", _boundaries_body(fields),
                heading="BOUNDED ON THE"),
        Section(
            "attestation", "attestation",
            "IN WITNESS WHEREOF the parties hereto have signed and affixed "
            "their respective signatures and thumb impressions on this Sale "
            "Deed, after having read and fully understood the contents "
            "hereof, on the day, month and year first above written, in the "
            "presence of the witnesses mentioned hereunder.",
        ),
        Section("sign_vendor", "signature-block",
                _v(fields, "vendor_name", 28).upper(),
                heading="1. NAME AND SIGNATURE OF THE VENDOR"),
        Section("sign_purchaser", "signature-block",
                _v(fields, "purchaser_name", 28).upper(),
                heading="2. NAME AND SIGNATURE OF THE PURCHASER"),
        Section(
            "witnesses", "witnesses",
            f"1. {_v(fields, 'witness_1_name', 26)}\n"
            f"   {_v(fields, 'witness_1_address', 40)}\n\n"
            f"2. {_v(fields, 'witness_2_name', 26)}\n"
            f"   {_v(fields, 'witness_2_address', 40)}",
            heading="WITNESSES:-",
        ),
    ])
    return sections


def render_plain_text(sections: List[Dict[str, Any]]) -> str:
    """Flatten the deed for copy-paste, search indexing and assertions."""
    out: List[str] = []
    for section in sections:
        heading = str(section.get("heading") or "").strip()
        body = str(section.get("body") or "").strip()
        if section.get("style") == "clause" and heading:
            out.append(f"{heading}. {body}")
        else:
            if heading:
                out.append(heading)
            if body:
                out.append(body)
    return "\n\n".join(out)


def estimate_pages(sections: List[Dict[str, Any]]) -> int:
    words = len(render_plain_text(sections).split())
    return max(1, -(-words // WORDS_PER_PAGE)) + SIGNATURE_PAGES
