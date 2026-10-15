"""Gift Deed generation.

The skeleton mirrors ``GIFT DEED (50-50).pdf`` at the repository root, which is
the gold standard for a deed gifting an undivided share in a flat held through
a co-operative housing society: the same recital order, the same covenant and
declaration structure, the same before-and-after shareholding table, and the
same Schedule with its particulars block.

A gift is not a sale. There is no consideration to recite, no receipt to
acknowledge and no discharge to grant; what carries the instrument instead is
the relationship between the parties and the statement that the transfer is
voluntary, without monetary consideration and irrevocable. Those words are
load-bearing - a gift that reads as revocable, or that recites consideration,
is not a gift - so they are template-locked here and the model is only allowed
to author the title recital, the gift recital and the Schedule description.

Styles are deliberately reused from the Sale Deed, so the PDF, the DOCX and the
live canvas render this deed without a single new renderer.
"""

from typing import Any, Dict, List, Optional, Tuple

from .formatting import (
    blank,
    deed_date_parts,
    format_aadhaar,
    format_indian_currency,
    format_long_date,
    parse_amount,
)
from .generator import Section, _has, _v

# The expression clause that follows each party's description in the reference
# deed, binding the gift on their successors.
_EXPRESSION = (
    "which expression shall, unless it be repugnant to the context or meaning "
    "thereof, mean and include his / her legal heirs, executors, "
    "administrators and assigns"
)


def _pct(value: Any, width: int = 6) -> str:
    """'50' or '50%' or 50 -> '50%'; nothing -> a dotted fill."""
    text = str(value or "").strip().rstrip("%").strip()
    return f"{text}%" if text else blank(width)


def _gift_share(fields: Dict[str, Any]) -> str:
    return _pct(fields.get("gift_share_percentage"))


def _party_block(fields: Dict[str, Any], role: str, caption: str,
                 part: str) -> str:
    """One party's description, in the register-ready form the reference uses.

    PAN is the usual identifier; a passport number is recited as well when the
    party is resident abroad, which is how the reference deed describes a donee
    inhabiting the United States.
    """
    name = _v(fields, f"{role}_name", 28).upper()
    age = _v(fields, f"{role}_age", 4)
    religion = str(fields.get(f"{role}_religion") or "").strip()
    nationality = str(fields.get(f"{role}_nationality") or "Indian").strip()
    address = _v(fields, f"{role}_address", 40)

    identifiers: List[str] = [f"PAN NO. {_v(fields, f'{role}_pan', 12)}"]
    if _has(fields, f"{role}_passport"):
        identifiers.append(f"PASSPORT NO. {str(fields[f'{role}_passport']).strip()}")
    aadhaar = format_aadhaar(fields.get(f"{role}_aadhaar"))
    if aadhaar:
        identifiers.append(f"AADHAAR NO. {aadhaar}")

    descriptor = " ".join(
        part for part in ("an adult", religion, nationality, "Inhabitant") if part
    )
    occupation = (
        f"by occupation {str(fields[f'{role}_occupation']).strip()}, "
        if _has(fields, f"{role}_occupation") else ""
    )
    parentage = (
        f"son / daughter / wife of {str(fields[f'{role}_father_name']).strip()}, "
        if _has(fields, f"{role}_father_name") else ""
    )

    return (
        f"{name}, ({'), ('.join(identifiers)}), {parentage}age {age} years, "
        f"{descriptor}, {occupation}having address at {address}, hereinafter "
        f"called and referred to as the “{caption}” [{_EXPRESSION}] party of "
        f"the {part}."
    )


# --------------------------------------------------------------------------
# Recitals
# --------------------------------------------------------------------------
def _flat_phrase(fields: Dict[str, Any]) -> str:
    """'Flat No. 101, on the 1st Floor, in the building known as ...' - the
    description every recital refers back to as the SAID FLAT."""
    parts = [f"Flat No. {_v(fields, 'flat_number', 8)}"]
    if _has(fields, "floor_number"):
        parts.append(f"on the {str(fields['floor_number']).strip()}")
    if _has(fields, "carpet_area"):
        parts.append(f"admeasuring {str(fields['carpet_area']).strip()} carpet area")
    parts.append(f"in the building known as {_v(fields, 'building_name', 24)}")
    if _has(fields, "society_name"):
        parts.append(f"of {str(fields['society_name']).strip()}")

    located = [
        f"{label} {str(fields[key]).strip()}"
        for label, key in (
            ("standing on Plot No.", "plot_number"),
            ("Survey No.", "survey_number"),
            ("C.T.S. No.", "cts_number"),
        )
        if _has(fields, key)
    ]
    if located:
        parts.append(", ".join(located))

    place = [
        f"{label} {str(fields[key]).strip()}"
        for label, key in (
            ("Village", "village_or_city"),
            ("Taluka", "taluka"),
            ("District", "district"),
        )
        if _has(fields, key)
    ]
    if place:
        parts.append("of " + ", ".join(place))
    if _has(fields, "state"):
        parts.append(str(fields["state"]).strip())

    return ", ".join(parts)


def default_title_recital(fields: Dict[str, Any]) -> str:
    supplied = str(fields.get("title_recital") or "").strip()
    if supplied:
        return supplied

    share = _gift_share(fields)
    acquisition = ""
    if _has(fields, "prior_agreement_date") or _has(fields, "prior_agreement_parties"):
        parties = (
            f" executed between {str(fields['prior_agreement_parties']).strip()}"
            if _has(fields, "prior_agreement_parties") else ""
        )
        acquisition = (
            f", having acquired the same by and under a registered Agreement "
            f"dated {format_long_date(fields.get('prior_agreement_date')) or blank(18)}"
            f"{parties}, under which the shares of the holders thereof came to "
            f"be recorded"
        )

    return (
        f"WHEREAS the DONOR is seized and possessed of and otherwise well and "
        f"sufficiently entitled to {share} undivided share, right, title and "
        f"interest in the residential flat being {_flat_phrase(fields)} "
        f"(hereinafter referred to as “the SAID FLAT”){acquisition}; and the "
        f"DONOR has since then been in lawful, peaceful and uninterrupted "
        f"possession and enjoyment of the DONOR's said undivided share in the "
        f"SAID FLAT, paying all taxes, maintenance charges and outgoings "
        f"payable in respect thereof."
    )


def _society_recital(fields: Dict[str, Any]) -> str:
    registration = ""
    if _has(fields, "society_registration_no"):
        dated = (
            f" dated {format_long_date(fields.get('society_registration_date'))}"
            if _has(fields, "society_registration_date") else ""
        )
        registration = (
            f" bearing Registration No. "
            f"{str(fields['society_registration_no']).strip()}{dated}"
        )
    situated = (
        f", situated at {str(fields['society_address']).strip()}"
        if _has(fields, "society_address") else ""
    )

    shares = f"Share Certificate No. {_v(fields, 'share_certificate_no', 8)}"
    if _has(fields, "share_count"):
        face = (
            f" of Rs. {format_indian_currency(fields['share_face_value'])}/- each"
            if parse_amount(fields.get("share_face_value")) is not None else ""
        )
        shares = (
            f"{str(fields['share_count']).strip()} fully paid-up shares"
            f"{face} comprised in {shares}"
        )
    if _has(fields, "share_distinctive_nos"):
        shares += (
            f", bearing distinctive Nos. "
            f"{str(fields['share_distinctive_nos']).strip()}"
        )

    return (
        f"AND WHEREAS the SAID FLAT forms part of the property of "
        f"{_v(fields, 'society_name', 28)}, a co-operative housing society "
        f"registered under the provisions of the Maharashtra Co-operative "
        f"Societies Act, 1960{registration}{situated} (hereinafter referred to "
        f"as “the SAID SOCIETY”); and the DONOR holds, in respect of the SAID "
        f"FLAT, {shares} (hereinafter referred to as “the SAID SHARES”)."
    )


def _gift_property_recital(fields: Dict[str, Any]) -> str:
    share = _gift_share(fields)
    return (
        f"AND WHEREAS the {share} undivided share, right, title and interest of "
        f"the DONOR in the SAID FLAT, together with the proportionate part of "
        f"the SAID SHARES and the proportionate share of the DONOR in the "
        f"share capital, sinking fund, repair fund and all other funds and "
        f"deposits standing to the credit of the SAID FLAT with the SAID "
        f"SOCIETY, and all rights, benefits, easements and appurtenances "
        f"belonging thereto, is hereinafter collectively referred to as “the "
        f"SAID GIFT PROPERTY”."
    )


# Relationships whose reciprocal is unambiguous without knowing the donor's
# gender. Anything else is left as a fill for the draftsman, because guessing
# "father" where the donor is the mother misdescribes a party to the deed.
_RECIPROCALS = {
    "wife": "husband",
    "husband": "wife",
    "brother": "brother",
    "sister": "sister",
}


def _relationship_recital(fields: Dict[str, Any]) -> str:
    donee_is = str(fields.get("donee_relationship") or "").strip() or blank(12)
    donor_is = str(fields.get("donor_relationship") or "").strip()
    if not donor_is:
        donor_is = _RECIPROCALS.get(donee_is.strip().lower(), "") or blank(12)
    return (
        f"AND WHEREAS the DONEE is the {donee_is.upper()} of the DONOR and the "
        f"DONOR is the {donor_is.upper()} of the DONEE, and the DONOR bears "
        f"natural love and affection towards the DONEE."
    )


def default_gift_recital(fields: Dict[str, Any]) -> str:
    supplied = str(fields.get("gift_recital") or "").strip()
    if supplied:
        return supplied

    share = _gift_share(fields)
    donee_is = str(fields.get("donee_relationship") or "").strip()
    because = f", the DONEE being the {donee_is} of the DONOR" if donee_is else ""
    return (
        f"AND WHEREAS the DONOR, being absolutely entitled to deal with and "
        f"dispose of the SAID GIFT PROPERTY, and out of the natural love and "
        f"affection which the DONOR bears towards the DONEE{because}, is "
        f"desirous of voluntarily, freely, unconditionally, irrevocably and "
        f"absolutely granting, conveying and transferring forever the DONOR's "
        f"{share} undivided share, right, title and interest in the SAID FLAT "
        f"unto the DONEE by way of GIFT, without accepting any monetary "
        f"consideration whatsoever from the DONEE or from any person on the "
        f"DONEE's behalf."
    )


def _acceptance_recital(fields: Dict[str, Any]) -> str:
    return (
        "AND WHEREAS the DONEE has signified the DONEE's acceptance of the GIFT "
        "hereby made and has agreed to accept the SAID GIFT PROPERTY on the "
        "terms and conditions hereinafter appearing; AND WHEREAS upon the "
        "execution and registration of these presents the SAID SOCIETY shall "
        "transfer the SAID SHARES and record the DONEE as the holder of the "
        "SAID GIFT PROPERTY, and the shareholding in respect of the SAID FLAT "
        "shall stand varied in the manner set out in the table hereinafter "
        "appearing; AND WHEREAS the DONOR is desirous of executing these "
        "presents on the terms and conditions following."
    )


def _granting_clause(fields: Dict[str, Any]) -> str:
    return (
        f"NOW THIS INDENTURE WITNESSETH that for effectuating the DONOR's said "
        f"desire, and WITHOUT ACCEPTING ANY MONETARY CONSIDERATION whatsoever, "
        f"and solely in consideration of the natural love and affection which "
        f"the DONOR bears towards the DONEE, the DONOR doth hereby grant, "
        f"convey, transfer and assure unto the DONEE the SAID GIFT PROPERTY, "
        f"being the DONOR's {_gift_share(fields)} undivided share, right, title "
        f"and interest in the SAID FLAT, TO HAVE AND TO HOLD the same unto and "
        f"for the use of the DONEE absolutely and forever, free from all "
        f"encumbrances."
    )


# --------------------------------------------------------------------------
# Operative clauses - template-locked
# --------------------------------------------------------------------------
def gift_operative_clauses(fields: Dict[str, Any]) -> List[Tuple[str, str]]:
    """``(number, text)`` pairs. Sub-numbering is carried in the number so the
    clause renderer needs no notion of nesting."""
    share = _gift_share(fields)
    borne_by = str(fields.get("stamp_duty_borne_by") or "DONOR").strip().upper()

    duty = ""
    stamp = parse_amount(fields.get("stamp_duty_paid"))
    reg_fee = parse_amount(fields.get("registration_fee"))
    market = parse_amount(fields.get("market_value"))
    if market is not None:
        duty += (
            f" The value of the SAID GIFT PROPERTY for the purpose of stamp "
            f"duty is Rs. {format_indian_currency(market)}/-."
        )
    if stamp is not None:
        duty += f" Stamp duty of Rs. {format_indian_currency(stamp)}/- has been paid hereon."
    if reg_fee is not None:
        duty += f" Registration fee of Rs. {format_indian_currency(reg_fee)}/- has been paid."

    return [
        ("1", "That the DONOR doth hereby covenant with the DONEE that, "
              "notwithstanding any act, deed, matter or thing heretofore done, "
              "executed or knowingly suffered to the contrary:-"),
        ("1(I)", "That the DONOR now has good right, full power and absolute "
                 "authority to grant, convey, transfer and assure the SAID GIFT "
                 "PROPERTY unto the DONEE in the manner aforesaid."),
        ("1(II)", "That the DONOR has a clear, good and marketable title to the "
                  "SAID GIFT PROPERTY, and the same is not subject to any claim, "
                  "demand, right or interest of any third person whomsoever."),
        ("1(III)", "That the DONOR shall at all times hereafter, at the request "
                   "and at the cost of the DONEE, do and execute, or cause to be "
                   "done and executed, all such further acts, deeds, documents, "
                   "writings, declarations and assurances as may reasonably be "
                   "required for more perfectly assuring the SAID GIFT PROPERTY "
                   "unto the DONEE."),

        ("2", "That the DONOR doth hereby declare, represent and assure unto "
              "the DONEE as follows:-"),
        ("2(a)", "That the DONOR has not at any time heretofore gifted, "
                 "bequeathed, willed, sold, pledged, leased, mortgaged, charged, "
                 "created any lien or encumbrance upon, or otherwise alienated "
                 "or parted with the SAID GIFT PROPERTY or any part thereof, and "
                 "that there is no suit, litigation, proceeding, attachment, "
                 "acquisition, requisition or prohibitory order pending or "
                 "threatened in respect thereof."),
        ("2(b)", "That the SAID GIFT PROPERTY is free and clear of all "
                 "encumbrances, liens, charges, claims and demands whatsoever; "
                 "and the DONOR doth hereby indemnify and agree to keep "
                 "indemnified the DONEE against all loss, costs, charges, "
                 "expenses and damages that the DONEE may suffer or incur by "
                 "reason of any defect in the title of the DONOR or any breach "
                 "of the declarations herein contained."),
        ("2(c)", "That any will, nomination, assignment, declaration or other "
                 "disposition heretofore made by the DONOR in respect of the "
                 "SAID GIFT PROPERTY shall, upon the execution and registration "
                 "of these presents, stand revoked and be deemed to be null and "
                 "void and of no force or effect whatsoever."),
        ("2(d)", "That the legal heirs and relatives of the DONOR have no "
                 "objection whatsoever to the GIFT hereby made, and that none of "
                 "them has or shall hereafter have any right, title, interest, "
                 "claim or demand of any nature whatsoever in or upon the SAID "
                 "GIFT PROPERTY."),
        ("2(e)", "That the SAID SOCIETY has been duly notified of the GIFT "
                 "hereby made, and its consent and no-objection have been "
                 "obtained for the transfer of the SAID SHARES and of the "
                 "interest of the DONOR in the SAID FLAT in favour of the DONEE."),
        ("2(f)", "That the DONOR shall co-operate with the DONEE and shall "
                 "furnish, sign and lodge all such applications, forms, papers "
                 "and writings as may be required by the SAID SOCIETY or by any "
                 "authority for recording the DONEE as the holder of the SAID "
                 "GIFT PROPERTY and for admitting the DONEE as a bonafide member "
                 "of the SAID SOCIETY."),
        ("2(g)", "That any appreciation in the value of the SAID GIFT PROPERTY "
                 "from the date of these presents shall belong to and be for the "
                 "sole benefit of the DONEE."),
        ("2(h)", "That the DONOR has no objection whatsoever to the transfer in "
                 "favour of the DONEE of the proportionate share of the DONOR in "
                 "the sinking fund, repair fund, share capital and all other "
                 "funds and deposits standing to the credit of the SAID FLAT with "
                 "the SAID SOCIETY."),
        ("2(i)", "That the DONOR shall attend before the Sub-Registrar of "
                 "Assurances and shall do all acts and things necessary for the "
                 "due execution and registration of these presents."),

        ("3", "That the DONEE doth hereby covenant with the DONOR as follows:-"),
        ("3(i)", f"That the DONEE shall, upon the execution and registration of "
                 f"these presents, be absolutely entitled to hold the said "
                 f"{share} undivided share, right, title and interest in the "
                 f"SAID FLAT together with the SAID SHARES, and shall be "
                 f"admitted as a bonafide member of the SAID SOCIETY in respect "
                 f"thereof."),
        ("3(ii)", "That the DONEE shall hold and enjoy peaceful possession of "
                  "the SAID GIFT PROPERTY without any let, suit, hindrance, "
                  "eviction, interruption, claim or demand whatsoever from or by "
                  "the DONOR or any person lawfully or equitably claiming "
                  "through, under or in trust for the DONOR."),
        ("3(iii)", "That the DONEE shall be entitled quietly to enter upon, "
                   "hold, occupy, possess and enjoy the SAID GIFT PROPERTY and to "
                   "receive the rents, issues and profits thereof for the DONEE's "
                   "own use and benefit."),
        ("3(iv)", "That the DONEE shall be entitled to use and enjoy the SAID "
                  "GIFT PROPERTY for the DONEE and for the DONEE's heirs, "
                  "executors, administrators and assigns, and to deal with the "
                  "same as the absolute owner thereof."),
        ("3(v)", "That the DONEE has, on the date of these presents, been placed "
                 "in quiet, peaceful and vacant possession of the DONOR's said "
                 "undivided share in the SAID FLAT."),

        ("4", "That upon the execution and registration of these presents the "
              "shareholding in respect of the SAID FLAT shall stand varied in "
              "the manner set out in the table hereinafter appearing, and the "
              "SAID SOCIETY shall transfer the SAID SHARES accordingly."),

        ("5", "That both the DONOR and the DONEE are fully aware of the "
              "contents, purport and effect of these presents, and that they "
              "have executed the same out of their own free wish and will, in "
              "sound physical and mental health, and without any force, "
              "coercion, threat, misrepresentation or undue influence from any "
              "person whomsoever; and these presents shall be binding upon them "
              "and shall never be repudiated by either of them."),

        ("6", f"That all expenses of and incidental to these presents, "
              f"including the stamp duty and the registration charges payable "
              f"hereon, have been borne and paid by the {borne_by}.{duty}"),

        ("7", "That the GIFT hereby made is absolute and irrevocable, and the "
              "DONOR shall not at any time hereafter revoke, cancel, repudiate "
              "or question the same on any ground whatsoever."),
    ]


# --------------------------------------------------------------------------
# Tables rendered as labelled lines
# --------------------------------------------------------------------------
def _share_devolution_body(fields: Dict[str, Any]) -> str:
    """The before-and-after shareholding the reference deed sets out as a table.

    Rendered as labelled lines because every surface - PDF, DOCX and the live
    canvas - already knows how to lay those out.
    """
    share = _gift_share(fields)
    rows: List[Tuple[str, str, str]] = []
    if _has(fields, "co_owner_name"):
        retained = _pct(fields.get("co_owner_share"))
        rows.append((str(fields["co_owner_name"]).strip(), retained, retained))
    rows.append((_v(fields, "donor_name", 24), share, "0%"))
    rows.append((_v(fields, "donee_name", 24), "0%", share))

    lines = ["Holder — Before execution of this GIFT DEED — After execution of this GIFT DEED"]
    lines.extend(f"{name} — {before} — {after}" for name, before, after in rows)
    lines.append("Total — 100% — 100%")
    return "\n".join(lines)


def default_schedule_body(fields: Dict[str, Any]) -> str:
    share = _gift_share(fields)
    shares_clause = ""
    if _has(fields, "share_count") or _has(fields, "share_certificate_no"):
        shares_clause = (
            f", together with the proportionate part of the SAID SHARES "
            f"comprised in Share Certificate No. "
            f"{_v(fields, 'share_certificate_no', 8)} issued by the SAID SOCIETY"
        )

    described = str(fields.get("property_description") or "").strip()
    opening = (
        f"All THAT PIECE AND PARCEL of {share} undivided share, with the "
        f"rights, title and interest of the DONOR therein, in the residential "
        f"flat being {_flat_phrase(fields)}{shares_clause}."
    )
    return f"{opening}\n\n{described}" if described else opening


def _schedule_particulars_body(fields: Dict[str, Any]) -> str:
    particulars = [
        ("Year of Construction", "year_of_construction"),
        ("No. of Building Floors", "building_floors"),
        ("Lift", "lift_available"),
        ("Flat No.", "flat_number"),
        ("Floor", "floor_number"),
        ("Total area of Flat (Carpet)", "carpet_area"),
        ("Survey No.", "survey_number"),
        ("C.T.S. No.", "cts_number"),
        ("Plot No.", "plot_number"),
        ("Street No.", "street_number"),
        ("Village / City", "village_or_city"),
        ("Taluka", "taluka"),
        ("District", "district"),
        ("State", "state"),
    ]
    lines = [
        f"{label}: {str(fields[key]).strip()}"
        for label, key in particulars
        if _has(fields, key)
    ]
    return "\n".join(lines) if lines else blank(60)


# --------------------------------------------------------------------------
# Skeleton
# --------------------------------------------------------------------------
def build_gift_deed_sections(
    fields: Dict[str, Any],
    narrative: Optional[Dict[str, str]] = None,
) -> List[Section]:
    """The complete Gift Deed, in reading order."""
    narrative = narrative or {}
    place = _v(fields, "place_of_execution", 18)
    day, month, year = deed_date_parts(fields.get("date_of_execution"))

    sections: List[Section] = [
        Section("title", "title", "GIFT DEED"),
        Section(
            "preamble", "preamble",
            f"THIS DEED OF GIFT is made and executed at {place} on this {day} "
            f"day of {month}, {year}.",
        ),
        Section("between_label", "party-label", "BETWEEN"),
        Section("donor", "party",
                _party_block(fields, "donor", "DONOR", "ONE PART")),
        Section("and_label", "party-label", "AND"),
        Section("donee", "party",
                _party_block(fields, "donee", "DONEE", "OTHER PART")),
        Section("whereas_heading", "operative-heading", "AND WHEREAS:-"),
        Section("title_recital", "recital",
                narrative.get("title_recital") or default_title_recital(fields)),
        Section("society_recital", "recital", _society_recital(fields)),
        Section("gift_property_recital", "recital", _gift_property_recital(fields)),
        Section("relationship_recital", "recital", _relationship_recital(fields)),
        Section("gift_recital", "recital",
                narrative.get("gift_recital") or default_gift_recital(fields)),
        Section("acceptance_recital", "recital", _acceptance_recital(fields)),
        Section("witnesseth", "operative-heading",
                "NOW THIS INDENTURE WITNESSETH AS UNDER:-"),
        Section("granting", "preamble", _granting_clause(fields)),
    ]

    for number, text in gift_operative_clauses(fields):
        sections.append(
            Section(f"clause_{number}", "clause", text, heading=number)
        )

    sections.extend([
        Section("share_devolution", "boundaries", _share_devolution_body(fields),
                heading="SHAREHOLDING IN RESPECT OF THE SAID FLAT"),
        Section("schedule_heading", "schedule-heading",
                "THE SCHEDULE OF THE PROPERTY ABOVE REFERRED TO"),
        Section("schedule_note", "schedule-note",
                f"({_gift_share(fields)} UNDIVIDED SHARE OF THE DONOR)"),
        Section("schedule_body", "schedule",
                narrative.get("schedule_body") or default_schedule_body(fields)),
        Section("schedule_particulars", "boundaries",
                _schedule_particulars_body(fields),
                heading="PARTICULARS OF THE SAID FLAT"),
        Section(
            "attestation", "attestation",
            "IN WITNESS WHEREOF the DONOR as well as the DONEE (by acceptance) "
            "have, after having read and fully understood the contents hereof, "
            "put their respective hands and thumb impressions on this GIFT "
            "DEED on the day and year first hereinabove written, in the "
            "presence of the witnesses mentioned hereunder.",
        ),
        Section("sign_donor", "signature-block",
                _v(fields, "donor_name", 28).upper(),
                heading="1. SIGNED AND DELIVERED by the withinnamed DONOR"),
        Section("sign_donee", "signature-block",
                _v(fields, "donee_name", 28).upper(),
                heading="2. SIGNED AND DELIVERED by the withinnamed DONEE "
                        "(by way of acceptance of the GIFT)"),
        Section(
            "witnesses", "witnesses",
            f"1. {_v(fields, 'witness_1_name', 26)}\n"
            f"   {_v(fields, 'witness_1_address', 40)}\n\n"
            f"2. {_v(fields, 'witness_2_name', 26)}\n"
            f"   {_v(fields, 'witness_2_address', 40)}",
            heading="IN THE PRESENCE OF WITNESSES:-",
        ),
    ])
    return sections
