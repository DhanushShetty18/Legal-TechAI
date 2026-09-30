"""Presentation helpers shared by the extractor, the generator and the PDF.

Deeds are read aloud at the Sub-Registrar's office and the figures are recited
in words, so the number-to-words conversion follows the Indian lakh/crore
grouping rather than the international thousand/million grouping.
"""

import re
from datetime import date, datetime
from typing import Optional

_UNITS = [
    "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
    "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
    "Sixteen", "Seventeen", "Eighteen", "Nineteen",
]
_TENS = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy",
    "Eighty", "Ninety",
]

# Indian grouping, largest first. Each entry is (divisor, name).
_SCALES = [
    (10 ** 7, "Crore"),
    (10 ** 5, "Lakh"),
    (10 ** 3, "Thousand"),
    (10 ** 2, "Hundred"),
]

# An amount begins with a digit, may carry Indian digit grouping, and ends with
# at most two decimal places.
_AMOUNT_RE = re.compile(r"\d[\d,]*(?:\.\d{1,2})?")

_MONTHS = [
    "January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December",
]


def _below_hundred(n: int) -> str:
    if n < 20:
        return _UNITS[n]
    tens, unit = divmod(n, 10)
    return _TENS[tens] + (f" {_UNITS[unit]}" if unit else "")


def number_to_words(n: int) -> str:
    """Render an integer in Indian English words, e.g. 4512000 -> 'Forty Five Lakh Twelve Thousand'."""
    n = int(n)
    if n < 0:
        return "Minus " + number_to_words(-n)
    if n < 100:
        return _below_hundred(n)

    parts = []
    for divisor, name in _SCALES:
        count, n = divmod(n, divisor)
        if count:
            parts.append(f"{_below_hundred(count) if divisor == 100 else number_to_words(count)} {name}")
    if n:
        parts.append(_below_hundred(n))
    return " ".join(parts)


def rupees_in_words(amount) -> str:
    """'Rupees Forty Five Lakh Only' - the phrasing a deed uses for consideration."""
    value = parse_amount(amount)
    if value is None:
        return ""
    rupees = int(value)
    paise = int(round((value - rupees) * 100))
    words = f"Rupees {number_to_words(rupees)}"
    if paise:
        words += f" and {number_to_words(paise)} Paise"
    return words + " Only"


def parse_amount(value) -> Optional[float]:
    """Accept 4500000, '4500000', 'Rs. 45,00,000/-' and return a float.

    The number is located rather than filtered out: stripping non-digits would
    turn the full stop in "Rs." into a decimal point.
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    match = _AMOUNT_RE.search(str(value))
    if match is None:
        return None
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return None


def format_indian_currency(value) -> str:
    """45000000 -> '4,50,00,000' using the Indian digit grouping."""
    amount = parse_amount(value)
    if amount is None:
        return ""
    rupees = int(amount)
    tail = str(rupees)[-3:]
    head = str(rupees)[:-3]
    if head:
        head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
        grouped = f"{head},{tail}"
    else:
        grouped = tail
    paise = int(round((amount - rupees) * 100))
    return f"{grouped}.{paise:02d}" if paise else grouped


def _ordinal(day: int) -> str:
    if 10 <= day % 100 <= 20:
        suffix = "th"
    else:
        suffix = {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    return f"{day}{suffix}"


def parse_date(value) -> Optional[date]:
    """Parse the date formats that arrive from OCR, the UI date picker and users."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y", "%Y/%m/%d",
                "%d %B %Y", "%d %b %Y", "%B %d, %Y", "%b %d, %Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def deed_date_parts(value):
    """Split a date into the ('15th', 'March', '2026') triple the preamble needs."""
    parsed = parse_date(value)
    if parsed is None:
        return ("__________", "________________", "20____")
    return (_ordinal(parsed.day), _MONTHS[parsed.month - 1], str(parsed.year))


def format_long_date(value) -> str:
    """'15th March 2026', or the raw text when it cannot be parsed."""
    parsed = parse_date(value)
    if parsed is None:
        return str(value or "").strip()
    day, month, year = deed_date_parts(parsed)
    return f"{day} {month} {year}"


def mask_aadhaar(value) -> str:
    """Aadhaar must never be reproduced in full; print only the last 4 digits."""
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) < 4:
        return ""
    return f"XXXX XXXX {digits[-4:]}"


def normalise_pan(value) -> str:
    candidate = re.sub(r"[^A-Za-z0-9]", "", str(value or "")).upper()
    return candidate if re.fullmatch(r"[A-Z]{5}\d{4}[A-Z]", candidate) else str(value or "").strip()


def blank(width: int = 20) -> str:
    """The dotted fill a model deed leaves for details supplied at registration."""
    return "_" * width
