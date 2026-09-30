"""Court-ready PDF rendering of the Sale Deed.

Laid out to match the model draft in ``Sale-Deed.pdf`` and to survive being
printed on legal or green paper and bound: a wide left margin for the binding,
Times throughout, justified body text, hanging-indent numbered clauses, and the
signature and thumb-impression pages the Sub-Registrar's office expects.

``first_page_top_offset`` leaves the head of page one clear when the deed is
printed onto e-stamp paper that already carries the stamp certificate.
"""

import io
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from .generator import build_sections

# Binding margin on the left, comfortable gutter on the right.
LEFT_MARGIN = 1.6 * inch
RIGHT_MARGIN = 0.9 * inch
TOP_MARGIN = 1.0 * inch
BOTTOM_MARGIN = 1.0 * inch

BODY_FONT = "Times-Roman"
BOLD_FONT = "Times-Bold"

_FINGERS = ["Thumb", "Index Finger", "Middle Finger", "Fore Finger", "Little Finger"]


def _styles() -> Dict[str, ParagraphStyle]:
    base = ParagraphStyle(
        "deed-body",
        fontName=BODY_FONT,
        fontSize=12,
        leading=19.5,
        alignment=TA_JUSTIFY,
        spaceAfter=10,
    )
    return {
        "title": ParagraphStyle(
            "deed-title", parent=base, fontName=BOLD_FONT, fontSize=18,
            leading=24, alignment=TA_CENTER, spaceBefore=6, spaceAfter=22,
        ),
        "preamble": base,
        "party-label": ParagraphStyle(
            "deed-party-label", parent=base, fontName=BOLD_FONT, fontSize=12.5,
            alignment=TA_CENTER, spaceBefore=6, spaceAfter=10,
        ),
        "party": ParagraphStyle("deed-party", parent=base, leftIndent=0),
        "recital": ParagraphStyle("deed-recital", parent=base, spaceBefore=6),
        "operative-heading": ParagraphStyle(
            "deed-operative", parent=base, fontName=BOLD_FONT, fontSize=12.5,
            alignment=TA_LEFT, spaceBefore=16, spaceAfter=12,
        ),
        # Hanging indent so wrapped clause text aligns under the first word
        # rather than under the clause number.
        "clause": ParagraphStyle(
            "deed-clause", parent=base, leftIndent=0.32 * inch,
            firstLineIndent=-0.32 * inch, spaceAfter=11,
        ),
        "schedule-heading": ParagraphStyle(
            "deed-schedule-heading", parent=base, fontName=BOLD_FONT,
            fontSize=14, leading=20, alignment=TA_CENTER,
            spaceBefore=20, spaceAfter=8,
        ),
        "schedule-note": ParagraphStyle(
            "deed-schedule-note", parent=base, fontSize=10, leading=14,
            alignment=TA_CENTER, textColor=colors.HexColor("#333333"),
            spaceAfter=12,
        ),
        "schedule": ParagraphStyle(
            "deed-schedule", parent=base, alignment=TA_LEFT,
            leftIndent=0.25 * inch,
        ),
        "boundaries-heading": ParagraphStyle(
            "deed-boundaries-heading", parent=base, fontName=BOLD_FONT,
            alignment=TA_LEFT, spaceBefore=10, spaceAfter=6,
        ),
        "attestation": ParagraphStyle(
            "deed-attestation", parent=base, spaceBefore=18, spaceAfter=14,
        ),
        "signature-heading": ParagraphStyle(
            "deed-signature-heading", parent=base, fontName=BOLD_FONT,
            alignment=TA_LEFT, spaceBefore=6, spaceAfter=14,
        ),
        "witness-heading": ParagraphStyle(
            "deed-witness-heading", parent=base, fontName=BOLD_FONT,
            alignment=TA_LEFT, spaceBefore=18, spaceAfter=10,
        ),
        "witness-body": ParagraphStyle(
            "deed-witness-body", parent=base, alignment=TA_LEFT,
            leading=22,
        ),
        "cell": ParagraphStyle(
            "deed-cell", fontName=BODY_FONT, fontSize=7.5, leading=9.5,
            alignment=TA_CENTER,
        ),
    }


def _escape(text: str) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _paragraphs(text: str, style: ParagraphStyle) -> List[Paragraph]:
    """One Paragraph per line, so the Schedule's labelled lines stay on their own lines."""
    out = []
    for line in str(text or "").split("\n"):
        stripped = line.strip()
        if stripped:
            out.append(Paragraph(_escape(stripped), style))
        else:
            out.append(Spacer(1, 7))
    return out


def _impression_grid(styles: Dict[str, ParagraphStyle], width: float) -> Table:
    """The ten-cell finger-impression grid each executant signs."""
    col_width = width / 5.0
    rows = []
    for hand in ("Right", "Left"):
        rows.append([
            Paragraph(f"{finger}<br/>of {hand} Hand", styles["cell"])
            for finger in _FINGERS
        ])
        rows.append([""] * 5)

    table = Table(
        rows,
        colWidths=[col_width] * 5,
        rowHeights=[0.42 * inch, 0.78 * inch, 0.42 * inch, 0.78 * inch],
    )
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F2F2F2")),
        ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#F2F2F2")),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    return table


def _signature_page(section: Dict[str, Any], styles: Dict[str, ParagraphStyle],
                    width: float, role: str) -> List[Any]:
    """Name, signature line, photograph box and impression grid for one executant."""
    name = str(section.get("body") or "").strip() or "_" * 30
    photo_width = 1.45 * inch

    header = Table(
        [[
            Paragraph(
                f"Name: {_escape(name)}<br/><br/><br/>"
                f"Signature: ______________________________",
                styles["witness-body"],
            ),
            Paragraph(f"Photograph<br/>of the<br/>{_escape(role)}", styles["cell"]),
        ]],
        colWidths=[width - photo_width, photo_width],
        rowHeights=[1.75 * inch],
    )
    header.setStyle(TableStyle([
        ("BOX", (1, 0), (1, 0), 0.6, colors.black),
        ("VALIGN", (0, 0), (0, 0), "TOP"),
        ("VALIGN", (1, 0), (1, 0), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
    ]))

    return [
        Paragraph(_escape(section.get("heading") or ""), styles["signature-heading"]),
        header,
        Spacer(1, 16),
        _impression_grid(styles, width),
    ]


def build_story(sections: List[Dict[str, Any]], styles: Dict[str, ParagraphStyle],
                width: float) -> List[Any]:
    # Page one may sit lower to clear e-stamp paper; every later page uses the
    # standard frame.
    story: List[Any] = [NextPageTemplate("later")]

    for section in sections:
        style_name = section.get("style") or "preamble"
        heading = str(section.get("heading") or "").strip()
        body = str(section.get("body") or "")

        if style_name == "title":
            story.append(Paragraph(_escape(body), styles["title"]))

        elif style_name == "clause":
            number = heading or ""
            story.append(Paragraph(
                f"{_escape(number)}.&nbsp;&nbsp;&nbsp;{_escape(body)}",
                styles["clause"],
            ))

        elif style_name == "boundaries":
            block = [Paragraph(_escape(heading or "BOUNDED ON THE"),
                               styles["boundaries-heading"])]
            block.extend(_paragraphs(body, styles["schedule"]))
            story.append(KeepTogether(block))

        elif style_name == "signature-block":
            role = "Vendor" if section.get("id") == "sign_vendor" else "Purchaser"
            story.append(PageBreak())
            story.extend(_signature_page(section, styles, width, role))

        elif style_name == "witnesses":
            block = [Paragraph(_escape(heading or "WITNESSES:-"),
                               styles["witness-heading"])]
            block.extend(_paragraphs(body, styles["witness-body"]))
            story.append(Spacer(1, 26))
            story.append(KeepTogether(block))

        else:
            style = styles.get(style_name, styles["preamble"])
            if heading and style_name not in ("party-label",):
                story.append(Paragraph(_escape(heading), styles["operative-heading"]))
            story.extend(_paragraphs(body, style))

    return story


def _page_furniture(canvas, doc):
    """Running footer: page number, and the deed name from page two onwards."""
    canvas.saveState()
    width, height = A4
    canvas.setFont(BODY_FONT, 9)
    canvas.setFillColor(colors.HexColor("#444444"))
    canvas.drawCentredString(width / 2.0, 0.6 * inch, f"Page {doc.page}")
    if doc.page > 1:
        canvas.drawRightString(width - RIGHT_MARGIN, height - 0.62 * inch, "SALE DEED")
        canvas.setStrokeColor(colors.HexColor("#999999"))
        canvas.setLineWidth(0.4)
        canvas.line(LEFT_MARGIN, height - 0.72 * inch,
                    width - RIGHT_MARGIN, height - 0.72 * inch)
    canvas.restoreState()


def render_sale_deed_pdf(
    sections: Optional[List[Dict[str, Any]]] = None,
    fields: Optional[Dict[str, Any]] = None,
    first_page_top_offset: float = 0.0,
) -> io.BytesIO:
    """Render the deed. ``sections`` is what the user actually saw and approved;
    when omitted the deed is rebuilt from ``fields``."""
    if sections is None:
        sections = [dict(s) for s in build_sections(fields or {})]

    buffer = io.BytesIO()
    width, height = A4
    frame_width = width - LEFT_MARGIN - RIGHT_MARGIN

    doc = BaseDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=LEFT_MARGIN,
        rightMargin=RIGHT_MARGIN,
        topMargin=TOP_MARGIN,
        bottomMargin=BOTTOM_MARGIN,
        title="Sale Deed",
        author="Legal-TechAI",
        subject="Deed of Absolute Sale",
    )

    first_top = TOP_MARGIN + max(0.0, first_page_top_offset)
    first_frame = Frame(
        LEFT_MARGIN, BOTTOM_MARGIN, frame_width,
        height - first_top - BOTTOM_MARGIN, id="first",
    )
    later_frame = Frame(
        LEFT_MARGIN, BOTTOM_MARGIN, frame_width,
        height - TOP_MARGIN - BOTTOM_MARGIN, id="later",
    )
    doc.addPageTemplates([
        PageTemplate(id="first", frames=[first_frame], onPage=_page_furniture),
        PageTemplate(id="later", frames=[later_frame], onPage=_page_furniture),
    ])

    styles = _styles()
    doc.build(build_story(sections, styles, frame_width))
    buffer.seek(0)
    return buffer
