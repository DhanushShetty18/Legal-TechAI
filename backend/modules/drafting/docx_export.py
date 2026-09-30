"""Editable DOCX export of the Sale Deed.

The PDF is the artefact that gets printed and registered; this is the copy an
advocate opens to make the last few amendments before registration. It carries
the same margins and Times body so that what comes out of Word matches what
comes out of the PDF.
"""

import io
from typing import Any, Dict, List, Optional

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt

from .generator import build_sections

_FINGERS = ["Thumb", "Index Finger", "Middle Finger", "Fore Finger", "Little Finger"]


def _configure(document: "Document") -> None:
    style = document.styles["Normal"]
    style.font.name = "Times New Roman"
    style.font.size = Pt(12)
    style.paragraph_format.space_after = Pt(10)
    style.paragraph_format.line_spacing = 1.4

    for section in document.sections:
        section.left_margin = Inches(1.6)
        section.right_margin = Inches(0.9)
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)


def _add(document: "Document", text: str, *, bold: bool = False,
         align=WD_ALIGN_PARAGRAPH.JUSTIFY, size: Optional[int] = None,
         space_before: int = 0):
    paragraph = document.add_paragraph()
    paragraph.alignment = align
    paragraph.paragraph_format.space_before = Pt(space_before)
    run = paragraph.add_run(text)
    run.bold = bold
    if size is not None:
        run.font.size = Pt(size)
    return paragraph


def _impression_table(document: "Document") -> None:
    table = document.add_table(rows=4, cols=5)
    table.style = "Table Grid"
    for row_offset, hand in ((0, "Right"), (2, "Left")):
        for column, finger in enumerate(_FINGERS):
            cell = table.cell(row_offset, column)
            cell.text = f"{finger} of {hand} Hand"
            for paragraph in cell.paragraphs:
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for run in paragraph.runs:
                    run.font.size = Pt(7.5)
        for column in range(5):
            table.cell(row_offset + 1, column).text = "\n\n"


def render_sale_deed_docx(
    sections: Optional[List[Dict[str, Any]]] = None,
    fields: Optional[Dict[str, Any]] = None,
) -> io.BytesIO:
    if sections is None:
        sections = [dict(s) for s in build_sections(fields or {})]

    document = Document()
    _configure(document)

    for section in sections:
        style_name = section.get("style") or "preamble"
        heading = str(section.get("heading") or "").strip()
        body = str(section.get("body") or "")

        if style_name == "title":
            _add(document, body, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, size=18)

        elif style_name == "party-label":
            _add(document, body, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)

        elif style_name == "clause":
            paragraph = _add(document, f"{heading}.   {body}")
            paragraph.paragraph_format.left_indent = Inches(0.32)
            paragraph.paragraph_format.first_line_indent = Inches(-0.32)

        elif style_name == "operative-heading":
            _add(document, body, bold=True, align=WD_ALIGN_PARAGRAPH.LEFT,
                 space_before=14)

        elif style_name == "schedule-heading":
            _add(document, body, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER,
                 size=14, space_before=18)

        elif style_name == "schedule-note":
            _add(document, body, align=WD_ALIGN_PARAGRAPH.CENTER, size=10)

        elif style_name in ("schedule", "boundaries"):
            if heading:
                _add(document, heading, bold=True, align=WD_ALIGN_PARAGRAPH.LEFT)
            for line in body.split("\n"):
                if line.strip():
                    _add(document, line.strip(), align=WD_ALIGN_PARAGRAPH.LEFT)

        elif style_name == "signature-block":
            document.add_section(WD_SECTION.NEW_PAGE)
            _configure(document)
            _add(document, heading, bold=True, align=WD_ALIGN_PARAGRAPH.LEFT)
            _add(document, f"Name: {body}", align=WD_ALIGN_PARAGRAPH.LEFT)
            _add(document, "Signature: ______________________________",
                 align=WD_ALIGN_PARAGRAPH.LEFT, space_before=24)
            _impression_table(document)

        elif style_name == "witnesses":
            _add(document, heading or "WITNESSES:-", bold=True,
                 align=WD_ALIGN_PARAGRAPH.LEFT, space_before=18)
            for line in body.split("\n"):
                if line.strip():
                    _add(document, line.strip(), align=WD_ALIGN_PARAGRAPH.LEFT)

        else:
            if heading:
                _add(document, heading, bold=True, align=WD_ALIGN_PARAGRAPH.LEFT)
            _add(document, body)

    buffer = io.BytesIO()
    document.save(buffer)
    buffer.seek(0)
    return buffer
