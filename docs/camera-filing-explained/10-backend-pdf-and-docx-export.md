# 10 — `backend/modules/drafting/pdf.py` and `docx_export.py`

The last two files in the flow: taking the exact sections the user approved
on screen and rendering them as a real, downloadable file. Read
[00-prerequisites.md](./00-prerequisites.md) sections B9 (ReportLab) and
B10 (python-docx) first.

## Why there are two separate renderers, and what breaks without them

Per `DECISIONS.md` decision 11: "PDF for filing, DOCX for amendment." A PDF
is not an editable format — it's the thing that gets printed and taken to
the Sub-Registrar's office. A `.docx` is what an advocate opens to make a
final wording tweak before that happens. Both files independently implement
the same per-`style` rendering decisions seen already in `LiveDeedCanvas.tsx`
(document 04) and, deterministically, in `generator.py` (document 08) —
there is deliberately no shared "layout engine" between them, because
ReportLab's flowable/frame model and python-docx's direct
mutate-the-document model are different enough that a shared abstraction
would likely be more complex than just writing each renderer against its
own library directly. **What breaks without these files:** the "Download
PDF" and "Editable DOCX" buttons in `page.tsx` have nothing to call — the
`/export/pdf` and `/export/docx` endpoints in `routers/drafting.py` would
error on every request.

---

## `backend/modules/drafting/pdf.py`

### The margin/font constants

```python
LEFT_MARGIN = 1.6 * inch
RIGHT_MARGIN = 0.9 * inch
TOP_MARGIN = 1.0 * inch
BOTTOM_MARGIN = 1.0 * inch
BODY_FONT = "Times-Roman"
BOLD_FONT = "Times-Bold"
```

These are decision 10's "PDF geometry targets legal/green paper and
binding" made literal: a markedly wider **left** margin than right (1.6" vs
0.9") — not a mistake, not a symmetric "web style" margin — because the
finished deed is physically bound along its left edge at the registrar's
office, and a symmetric margin would put clause text into the binding
itself, making it unreadable once bound. `Times-Roman`/`Times-Bold` are
ReportLab's built-in names for the Times font family — no font file needs
to be shipped with the app; these are among the 14 standard fonts every PDF
viewer is guaranteed to support.

### `_styles()`

```python
def _styles() -> Dict[str, ParagraphStyle]:
    base = ParagraphStyle("deed-body", fontName=BODY_FONT, fontSize=12, leading=19.5, alignment=TA_JUSTIFY, spaceAfter=10)
    return {
        "title": ParagraphStyle("deed-title", parent=base, fontName=BOLD_FONT, fontSize=18, leading=24, alignment=TA_CENTER, spaceBefore=6, spaceAfter=22),
        "preamble": base,
        "party-label": ParagraphStyle("deed-party-label", parent=base, fontName=BOLD_FONT, fontSize=12.5, alignment=TA_CENTER, spaceBefore=6, spaceAfter=10),
        "party": ParagraphStyle("deed-party", parent=base, leftIndent=0),
        "recital": ParagraphStyle("deed-recital", parent=base, spaceBefore=6),
        "operative-heading": ParagraphStyle("deed-operative", parent=base, fontName=BOLD_FONT, fontSize=12.5, alignment=TA_LEFT, spaceBefore=16, spaceAfter=12),
        "clause": ParagraphStyle("deed-clause", parent=base, leftIndent=0.32 * inch, firstLineIndent=-0.32 * inch, spaceAfter=11),
        "schedule-heading": ParagraphStyle(..., fontSize=14, alignment=TA_CENTER, ...),
        "schedule-note": ParagraphStyle(..., fontSize=10, alignment=TA_CENTER, textColor=colors.HexColor("#333333"), ...),
        "schedule": ParagraphStyle("deed-schedule", parent=base, alignment=TA_LEFT, leftIndent=0.25 * inch),
        "boundaries-heading": ParagraphStyle(..., fontName=BOLD_FONT, alignment=TA_LEFT, ...),
        "attestation": ParagraphStyle("deed-attestation", parent=base, spaceBefore=18, spaceAfter=14),
        "signature-heading": ParagraphStyle(..., fontName=BOLD_FONT, alignment=TA_LEFT, ...),
        "witness-heading": ParagraphStyle(..., fontName=BOLD_FONT, alignment=TA_LEFT, spaceBefore=18, ...),
        "witness-body": ParagraphStyle(..., alignment=TA_LEFT, leading=22),
        "cell": ParagraphStyle("deed-cell", fontName=BODY_FONT, fontSize=7.5, leading=9.5, alignment=TA_CENTER),
    }
```

**Job:** build the complete dictionary of named `ParagraphStyle`s used
across the whole document — called once per PDF render
(`render_sale_deed_pdf` calls it exactly once and threads the result
through every other function in this file).
**Calls:** nothing; constructs `ParagraphStyle` objects directly.
**Line by line worth calling out:**
- `base` — the body style every other style inherits from via
  `parent=base` (ReportLab's `ParagraphStyle` supports inheritance the same
  way CSS does): 12pt Times-Roman, 19.5pt line leading (roughly 1.6×
  line-height, for comfortable legal-document readability), **justified**
  alignment (`TA_JUSTIFY` — both left and right edges align, which is why
  this is the style every paragraph defaults to unless overridden), and
  10pt of space after each paragraph.
- `"clause"`: `leftIndent=0.32 * inch, firstLineIndent=-0.32 * inch` —
  this is a **hanging indent**: the whole paragraph is indented 0.32" from
  the left margin, *except* the first line, which is pulled back by the
  same 0.32" via a *negative* first-line indent. The net effect: the clause
  number (`"3."`) sits in that 0.32" gap on the first line, and every
  wrapped line of the clause's body aligns under the first word of text,
  not under the number — the standard professional layout for numbered
  legal clauses.
- `"schedule-note"`: a distinct, slightly muted grey colour
  (`#333333`, dark grey rather than pure black) and smaller 10pt italic-style
  sizing — visually distinguishing the explanatory parenthetical from the
  Schedule's actual substantive content.
- `"cell"`: the smallest font (7.5pt) in the whole set — sized for the
  narrow finger-impression grid cells, where five columns need to fit
  across the page width alongside their labels.

### `_escape(text)`

```python
def _escape(text: str) -> str:
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
```

**Job:** a **security- and correctness-critical** function — ReportLab's
`Paragraph` interprets a small set of HTML-like tags inside its text
(`<br/>`, `<b>`, and so on) for intentional formatting markup. If a user's
own edited clause text happens to contain a literal `<`, `>`, or `&` (very
plausible — a property description might legitimately contain an `&`, or an
edited clause might reference a cross-reference using `<`/`>`-like
notation), passing it unescaped into `Paragraph` would either corrupt the
layout (ReportLab tries to interpret it as markup) or, at minimum, silently
drop or mis-render those characters.
**Calls:** nothing.
**Line by line:** three sequential `.replace()` calls — ampersand first
(crucially, **before** the other two — if `<` were escaped to `&lt;`
*first*, then escaping `&` afterward would double-escape it into
`&amp;lt;`, which is wrong; escaping `&` first avoids this ordering bug
entirely), then `<` to `&lt;`, then `>` to `&gt;`. This is the standard,
minimal HTML-escaping needed for ReportLab's markup subset — note this is
**not** full HTML escaping (it doesn't escape quotes, for instance), because
it only needs to be safe for the specific tag syntax ReportLab actually
parses.

### `_paragraphs(text, style)`

```python
def _paragraphs(text: str, style: ParagraphStyle) -> List[Paragraph]:
    out = []
    for line in str(text or "").split("\n"):
        stripped = line.strip()
        if stripped:
            out.append(Paragraph(_escape(stripped), style))
        else:
            out.append(Spacer(1, 7))
    return out
```

**Job:** turn a block of text that may contain multiple lines (like the
Schedule's labelled descriptor lines, or the witnesses' name-and-address
block) into one `Paragraph` flowable per line, so each line stays on its
own line in the PDF rather than being rewrapped into one continuous
justified block — which would destroy the Schedule's labelled-line layout.
**Calls:** `_escape`.
**Line by line:** splits on `\n`, and for each resulting line: if it has
real content after stripping whitespace, wrap it (escaped) in a `Paragraph`
with the given style; if the line is blank (an intentional blank separator
line, as `_default_schedule_body` in `generator.py` inserts between the
descriptor lines and the free-text description), insert a `Spacer(1, 7)`
instead — a small fixed vertical gap (7 points tall, 1 point wide — the
width is irrelevant for a vertical spacer) rather than an empty `Paragraph`,
which would render inconsistently across different PDF viewers.

### `_impression_grid(styles, width)`

```python
def _impression_grid(styles, width: float) -> Table:
    col_width = width / 5.0
    rows = []
    for hand in ("Right", "Left"):
        rows.append([Paragraph(f"{finger}<br/>of {hand} Hand", styles["cell"]) for finger in _FINGERS])
        rows.append([""] * 5)
    table = Table(rows, colWidths=[col_width] * 5, rowHeights=[0.42 * inch, 0.78 * inch, 0.42 * inch, 0.78 * inch])
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.6, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F2F2F2")),
        ("BACKGROUND", (0, 2), (-1, 2), colors.HexColor("#F2F2F2")),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    return table
```

**Job:** build the ten-cell (five fingers × two hands) thumb/finger
impression grid each signature page needs — this is the PDF counterpart to
`LiveDeedCanvas.tsx`'s `SignatureBlock` (document 04).
**Calls:** nothing; builds a ReportLab `Table` directly.
**Line by line:**
- `col_width = width / 5.0` — divides the available page width evenly
  across five finger columns.
- The loop builds **four rows per hand pairing**: a label row (`f"{finger}<br/>of
  {hand} Hand"` — note `<br/>` here, which *is* intentional ReportLab
  markup, not user text, so it's not run through `_escape`) and an empty
  row immediately below it (`[""] * 5` — five empty strings) that becomes
  the actual blank box where an impression would physically go.
- `rowHeights=[0.42 * inch, 0.78 * inch, 0.42 * inch, 0.78 * inch]` —
  explicit heights for all four rows (two label rows at 0.42", two blank
  impression rows at a taller 0.78", giving a real fingertip enough
  physical space to be pressed onto the printed page).
- `TableStyle`: `GRID` draws a 0.6pt black border around every cell;
  `BACKGROUND` on rows 0 and 2 (the two label rows, by their row index)
  shades them light grey (`#F2F2F2`) to visually distinguish labels from
  the blank impression rows; `LEFTPADDING`/`RIGHTPADDING` of 2 points keep
  the narrow columns from having wasteful default padding eating into the
  already-tight column width.

### `_signature_page(section, styles, width, role)`

```python
def _signature_page(section, styles, width: float, role: str) -> List[Any]:
    name = str(section.get("body") or "").strip() or "_" * 30
    photo_width = 1.45 * inch
    header = Table([[
        Paragraph(f"Name: {_escape(name)}<br/><br/><br/>Signature: ______________________________", styles["witness-body"]),
        Paragraph(f"Photograph<br/>of the<br/>{_escape(role)}", styles["cell"]),
    ]], colWidths=[width - photo_width, photo_width], rowHeights=[1.75 * inch])
    header.setStyle(TableStyle([("BOX", (1, 0), (1, 0), 0.6, colors.black), ("VALIGN", (0, 0), (0, 0), "TOP"),
        ("VALIGN", (1, 0), (1, 0), "MIDDLE"), ("LEFTPADDING", (0, 0), (0, 0), 0)]))
    return [Paragraph(_escape(section.get("heading") or ""), styles["signature-heading"]),
            header, Spacer(1, 16), _impression_grid(styles, width)]
```

**Job:** assemble one complete signature page's content — heading, a
two-column header (name/signature line beside a photograph placeholder
box), and the impression grid — as a list of flowables ready to be added to
the document.
**Calls:** `_escape`, `_impression_grid`.
**Line by line:**
- `name = ... or "_" * 30` — if the section's body (the party's name, set
  by `generator.py`'s `build_sections`) is somehow empty, a 30-character
  blank line is used instead, so the signature page never shows a bare
  `"Name:"` with nothing after it.
- `header` is itself a two-cell `Table` (not two separate flowables placed
  side by side — ReportLab's flowable model stacks things vertically by
  default, so a side-by-side layout specifically requires a `Table`): the
  left cell holds the name/signature-line text, the right holds the
  photograph placeholder label, with `colWidths=[width - photo_width,
  photo_width]` giving the photo box a fixed 1.45" width and the text
  column everything else.
- The `TableStyle`: `BOX` draws a border **only around the second column**
  (`(1, 0), (1, 0)` — row 0, column 1 specifically) — the photograph
  placeholder visually looks like an actual box to paste a photo into,
  while the text column deliberately has no border. `VALIGN` top-aligns
  the text column (so "Name:" starts right at the top) but middle-aligns
  the photo label (centred within its box). `LEFTPADDING` of 0 on the text
  column removes ReportLab's default cell padding so the text starts
  flush with the page's own margin.
- The function returns a flat Python list of four flowables — the caller
  (`build_story`, below) extends its own running list with these.

### `build_story(sections, styles, width)`

```python
def build_story(sections, styles, width: float) -> List[Any]:
    story: List[Any] = [NextPageTemplate("later")]
    for section in sections:
        style_name = section.get("style") or "preamble"
        heading = str(section.get("heading") or "").strip()
        body = str(section.get("body") or "")

        if style_name == "title":
            story.append(Paragraph(_escape(body), styles["title"]))
        elif style_name == "clause":
            number = heading or ""
            story.append(Paragraph(f"{_escape(number)}.&nbsp;&nbsp;&nbsp;{_escape(body)}", styles["clause"]))
        elif style_name == "boundaries":
            block = [Paragraph(_escape(heading or "BOUNDED ON THE"), styles["boundaries-heading"])]
            block.extend(_paragraphs(body, styles["schedule"]))
            story.append(KeepTogether(block))
        elif style_name == "signature-block":
            role = "Vendor" if section.get("id") == "sign_vendor" else "Purchaser"
            story.append(PageBreak())
            story.extend(_signature_page(section, styles, width, role))
        elif style_name == "witnesses":
            block = [Paragraph(_escape(heading or "WITNESSES:-"), styles["witness-heading"])]
            block.extend(_paragraphs(body, styles["witness-body"]))
            story.append(Spacer(1, 26))
            story.append(KeepTogether(block))
        else:
            style = styles.get(style_name, styles["preamble"])
            if heading and style_name not in ("party-label",):
                story.append(Paragraph(_escape(heading), styles["operative-heading"]))
            story.extend(_paragraphs(body, style))
    return story
```

**Job:** this is **the** PDF-rendering decision point — walk every section
in order and build ReportLab's "story" (the flat list of flowables that,
handed to `doc.build(...)`, becomes the actual paginated document). It is
the PDF's direct counterpart to `LiveDeedCanvas.tsx`'s `DeedBlock` (document
04) and `docx_export.py`'s per-style branching below — all three switch on
the exact same `style` tag vocabulary that `generator.py` assigns.
**Calls:** `_escape`, `_paragraphs`, `_signature_page`.
**Line by line:**
- `story: List[Any] = [NextPageTemplate("later")]` — the very first item in
  the story isn't content at all; it's an instruction telling ReportLab
  "every page *after* the current one should use the page template named
  `'later'`" (the two named templates, `"first"` and `"later"`, are set up
  in `render_sale_deed_pdf` below) — this is how page one can have a taller
  top margin (to clear pre-printed e-stamp paper) while every subsequent
  page uses the standard margin.
- `style_name = section.get("style") or "preamble"` — defaults to
  `"preamble"` if a section somehow has no style at all (defensive; every
  section `generator.py` actually produces has one).
- `"title"` — a simple centred, bold, large `Paragraph`.
- `"clause"` — builds one string combining the clause number and body with
  **three explicit `&nbsp;` (non-breaking space) entities** between them,
  rather than plain spaces: this guarantees visible separation between the
  number and the clause text regardless of how ReportLab might otherwise
  collapse or wrap whitespace right at the start of a hanging-indented
  paragraph.
- `"boundaries"` — wraps the heading and the body's paragraphs together in
  a **`KeepTogether`** — this is deliberate: a boundaries block (four short
  lines: East/West/North/South) reads badly if a page break happens to fall
  between its heading and its content, or in the middle of its four lines,
  so this forces ReportLab to either fit the whole block on the current
  page or push the *entire* block to the next page, never splitting it.
- `"signature-block"` — **always starts with an explicit `PageBreak()`** —
  each party's signature page is guaranteed to start on a fresh page,
  regardless of how much room was left on whatever page came before it
  (the deed's main text could end anywhere); `role` is derived from the
  section's `id` (`"sign_vendor"` vs. anything else, i.e. `"sign_purchaser"`)
  purely to label the photograph placeholder correctly.
- `"witnesses"` — also wrapped in `KeepTogether`, preceded by a `Spacer(1,
  26)` for visual breathing room after the signature pages, before the
  witnesses block.
- The `else` branch handles every other style (`preamble`,
  `party-label`, `party`, `recital`, `operative-heading`,
  `schedule-heading`, `schedule-note`, `schedule`, `attestation`) uniformly:
  look up the named style (falling back to `"preamble"` if somehow
  unrecognised), optionally render the heading as its own bold paragraph
  **unless** the style is specifically `"party-label"` (whose "heading"
  concept doesn't apply — a party-label section's entire content *is* its
  body, e.g. `"BETWEEN"`), then render the body via `_paragraphs` (handling
  any embedded newlines correctly, as covered above).

### `_page_furniture(canvas, doc)`

```python
def _page_furniture(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFont(BODY_FONT, 9)
    canvas.setFillColor(colors.HexColor("#444444"))
    canvas.drawCentredString(width / 2.0, 0.6 * inch, f"Page {doc.page}")
    if doc.page > 1:
        canvas.drawRightString(width - RIGHT_MARGIN, height - 0.62 * inch, "SALE DEED")
        canvas.setStrokeColor(colors.HexColor("#999999"))
        canvas.setLineWidth(0.4)
        canvas.line(LEFT_MARGIN, height - 0.72 * inch, width - RIGHT_MARGIN, height - 0.72 * inch)
    canvas.restoreState()
```

**Job:** this function is registered as the `onPage` callback for both page
templates — ReportLab calls it automatically for **every single page**,
after the main content for that page has been laid out, giving it a chance
to draw running furniture (page numbers, headers) directly onto the raw
page canvas.
**Calls:** nothing; draws directly via the low-level `canvas` drawing API
(a different, lower-level API from the `Paragraph`/`Table` flowables used
everywhere else in this file — this is ReportLab's raw PDF-drawing layer,
used here specifically because running headers/footers need to be
positioned at exact coordinates on every page, not flowed as part of the
document's content).
**Line by line:**
- `canvas.saveState()` / `canvas.restoreState()` — bracket every drawing
  operation; this preserves whatever font/colour/line settings were active
  before this function ran and restores them afterward, so these
  furniture-drawing operations can never accidentally leak a colour or font
  change into the main document content.
- `canvas.drawCentredString(width / 2.0, 0.6 * inch, f"Page {doc.page}")` —
  draws the page number, horizontally centred, near the bottom of
  **every** page (`doc.page` is ReportLab's current page counter,
  incremented automatically).
- `if doc.page > 1:` — the running header (`"SALE DEED"` in the top-right,
  with a horizontal rule beneath it) is drawn only from page **two**
  onward — page one already has the large centred title at the top of its
  actual content, so repeating a running header there would be redundant.

### `render_sale_deed_pdf(sections, fields, first_page_top_offset)`

```python
def render_sale_deed_pdf(sections=None, fields=None, first_page_top_offset=0.0) -> io.BytesIO:
    if sections is None:
        sections = [dict(s) for s in build_sections(fields or {})]

    buffer = io.BytesIO()
    width, height = A4
    frame_width = width - LEFT_MARGIN - RIGHT_MARGIN

    doc = BaseDocTemplate(buffer, pagesize=A4, leftMargin=LEFT_MARGIN, rightMargin=RIGHT_MARGIN,
        topMargin=TOP_MARGIN, bottomMargin=BOTTOM_MARGIN, title="Sale Deed", author="Legal-TechAI",
        subject="Deed of Absolute Sale")

    first_top = TOP_MARGIN + max(0.0, first_page_top_offset)
    first_frame = Frame(LEFT_MARGIN, BOTTOM_MARGIN, frame_width, height - first_top - BOTTOM_MARGIN, id="first")
    later_frame = Frame(LEFT_MARGIN, BOTTOM_MARGIN, frame_width, height - TOP_MARGIN - BOTTOM_MARGIN, id="later")
    doc.addPageTemplates([
        PageTemplate(id="first", frames=[first_frame], onPage=_page_furniture),
        PageTemplate(id="later", frames=[later_frame], onPage=_page_furniture),
    ])

    styles = _styles()
    doc.build(build_story(sections, styles, frame_width))
    buffer.seek(0)
    return buffer
```

**Job:** the top-level function — exactly what `routers/drafting.py`'s
`export_pdf` endpoint calls, and the function that ties together everything
above into one actual PDF file in memory.
**Calls:** `build_sections` (document 08, only if no sections were
supplied), `_styles`, `build_story`.
**Line by line:**
- `if sections is None: sections = [dict(s) for s in build_sections(fields or {})]`
  — exactly mirrors `routers/drafting.py`'s `_sections_payload` logic
  (document 05): if the caller didn't supply specific sections (the
  approved, possibly-edited content from the screen), fall back to
  building a fresh deed from `fields` alone.
- `buffer = io.BytesIO()` — an in-memory binary buffer; the PDF is built
  **entirely in memory**, never touching the filesystem, which is what
  lets this run safely on a server with no persistent/writable disk and
  what lets the result be streamed straight back as an HTTP response.
- `frame_width = width - LEFT_MARGIN - RIGHT_MARGIN` — the actual usable
  text width, computed once from the A4 page width and the two margins, and
  threaded through to both `Frame` constructions and `build_story` (needed
  there for the impression grid and signature header table widths).
- `BaseDocTemplate(..., title="Sale Deed", author="Legal-TechAI", subject="Deed of Absolute Sale")`
  — these three are the PDF file's own embedded metadata (visible in a PDF
  viewer's "document properties," and in search indexing) — not
  content that appears on any page.
- `first_top = TOP_MARGIN + max(0.0, first_page_top_offset)` — this is
  decision 10's `first_page_top_offset` mechanism: the *first* page's
  effective top margin is the standard `TOP_MARGIN` **plus** whatever extra
  offset was requested (clamped non-negative), leaving room at the head of
  page one for a pre-printed e-stamp certificate; `max(0.0, ...)` guards
  against a negative value (which `routers/drafting.py`'s `export_pdf`
  already also clamps, so this is a second, redundant safety net — a
  defensive-programming choice rather than strictly necessary given the
  caller already does it).
- Two `Frame`s are constructed with the **same** horizontal position and
  width, but different available heights — `first_frame` is shorter (its
  top starts lower, at `first_top`), `later_frame` uses the standard
  margin throughout. Two `PageTemplate`s, each wrapping one frame and
  sharing the same `onPage=_page_furniture` callback, are registered on the
  document — this is the mechanism `NextPageTemplate("later")` (the very
  first item `build_story` puts into the story) switches *away from* the
  document's initial default template (`"first"`, used automatically for
  page one) to.
- `doc.build(build_story(sections, styles, frame_width))` — this single
  call is where ReportLab actually performs pagination: it walks the full
  flowable list, measuring and placing each one, inserting page breaks
  wherever content would otherwise overflow a frame (or wherever an
  explicit `PageBreak()` was inserted), calling `_page_furniture` for every
  page boundary it creates along the way — all of the file's complexity up
  to this point exists purely to build the input to this one call.
- `buffer.seek(0); return buffer` — after `doc.build(...)` has written the
  complete PDF bytes into `buffer`, the buffer's internal read position is
  reset to the very beginning (`seek(0)`) — without this, anything that
  tries to read from the buffer next (`routers/drafting.py`'s
  `StreamingResponse`) would start reading from wherever the *write*
  position happened to end up, which is the end of the file, producing an
  empty download.

---

## `backend/modules/drafting/docx_export.py`

### `_configure(document)`

```python
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
```

**Job:** set up the document's default font and margins — the DOCX
equivalent of `pdf.py`'s module-level constants and base `ParagraphStyle`,
just expressed through python-docx's own API.
**Calls:** nothing; mutates the `Document` object's styles and section
geometry directly (python-docx's model, unlike ReportLab's, is "build the
document by mutating it in place" rather than "build a list, then build the
document from it in one call").
**Line by line:** `document.styles["Normal"]` is Word's built-in default
paragraph style — every paragraph that doesn't explicitly override its
font inherits from this, so setting it here once applies Times New Roman,
12pt, 10pt space-after, and 1.4× line spacing document-wide without needing
to repeat those settings on every single paragraph. `document.sections` — a
`.docx` file can be divided into multiple "sections," each with its own
page geometry (this is exactly what lets the signature pages, added via
`WD_SECTION.NEW_PAGE` below, potentially have different margins if ever
needed — though here they're deliberately given the *same* margins, for
consistency); the `for` loop applies the same four margin values to every
section that currently exists in the document at the time it's called —
which is why, as you'll see below, this function is called **again** every
time a new section is added, to make sure the newly-created section also
gets these margins (python-docx does not automatically propagate margin
settings to a freshly added section).

### `_add(document, text, bold, align, size, space_before)`

```python
def _add(document, text, *, bold=False, align=WD_ALIGN_PARAGRAPH.JUSTIFY, size=None, space_before=0):
    paragraph = document.add_paragraph()
    paragraph.alignment = align
    paragraph.paragraph_format.space_before = Pt(space_before)
    run = paragraph.add_run(text)
    run.bold = bold
    if size is not None:
        run.font.size = Pt(size)
    return paragraph
```

**Job:** the single most-used helper in this file — add one paragraph of
text with the given formatting, defaulting to justified alignment (matching
the PDF's base style) and no bold.
**Calls:** nothing; uses python-docx's `Document.add_paragraph()` /
`paragraph.add_run()` API.
**Line by line:** `document.add_paragraph()` creates and appends an empty
paragraph to the end of the document. A **run** in Word's document model is
a contiguous span of text sharing one set of formatting — `paragraph.add_run(text)`
adds the actual text as one run within that paragraph, and `run.bold = bold`
/ `run.font.size = Pt(size)` (only if an explicit size was requested — the
inherited 12pt default from `_configure` applies otherwise) set that run's
specific formatting. The function returns the `paragraph` object itself, so
callers that need to further customise it (like the clause-indent logic in
`render_sale_deed_docx` below) can do so immediately.

### `_impression_table(document)`

```python
def _impression_table(document) -> None:
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
```

**Job:** the DOCX equivalent of `pdf.py`'s `_impression_grid` — a 4-row,
5-column table for the finger-impression grid.
**Calls:** nothing; python-docx's table API directly.
**Line by line:** `document.add_table(rows=4, cols=5)` creates the whole
grid up front (unlike ReportLab's `Table`, which is built from a nested
list of cell contents all at once, python-docx tables are built empty and
then populated cell by cell). `table.style = "Table Grid"` applies Word's
built-in gridline-bordered table style — the DOCX equivalent of
ReportLab's `GRID` table-style instruction. The outer loop runs twice, once
per hand, using `row_offset` (0 for Right, 2 for Left) to address the
correct pair of rows. The inner loop sets each label cell's text and
centres/shrinks its font to 7.5pt (matching the PDF's `"cell"` style
exactly). `table.cell(row_offset + 1, column).text = "\n\n"` — the blank
impression row (immediately below each label row) is given literal
**two newline characters** as its "text," rather than left truly empty —
this is a practical workaround: an entirely empty table cell in Word tends
to collapse to a minimal height, whereas forcing in some vertical content
(even invisible blank lines) gives the cell enough height to actually be
usable as a blank space for a physical impression once printed.

### `render_sale_deed_docx(sections, fields)`

```python
def render_sale_deed_docx(sections=None, fields=None) -> io.BytesIO:
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
            _add(document, body, bold=True, align=WD_ALIGN_PARAGRAPH.LEFT, space_before=14)
        elif style_name == "schedule-heading":
            _add(document, body, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, size=14, space_before=18)
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
            _add(document, "Signature: ______________________________", align=WD_ALIGN_PARAGRAPH.LEFT, space_before=24)
            _impression_table(document)
        elif style_name == "witnesses":
            _add(document, heading or "WITNESSES:-", bold=True, align=WD_ALIGN_PARAGRAPH.LEFT, space_before=18)
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
```

**Job:** the top-level DOCX function — structurally the exact DOCX mirror
of `pdf.py`'s `build_story` + `render_sale_deed_pdf` combined into one
function (python-docx's simpler, mutate-in-place model doesn't need a
separate "build a story, then build the doc from it" split the way
ReportLab's flowable model does).
**Calls:** `build_sections` (document 08, if no sections supplied),
`_add`, `_impression_table`, `_configure` (again, on each new signature
section).
**Line by line (only what differs meaningfully from the PDF version, since
the per-style decisions are otherwise the same logic expressed in a
different API):**
- `"clause"` — rather than ReportLab's `&nbsp;&nbsp;&nbsp;` trick, this
  builds the text as `f"{heading}.   {body}"` (three literal space
  characters) and then sets `paragraph_format.left_indent` /
  `first_line_indent` directly on the resulting `Paragraph` object — the
  exact same hanging-indent *effect* (0.32" indent, negative 0.32"
  first-line indent) as the PDF's `ParagraphStyle`, just applied
  per-paragraph here rather than via a shared named style, because this
  function doesn't pre-build a styles dictionary the way `pdf.py`'s
  `_styles()` does.
- `"signature-block"`: `document.add_section(WD_SECTION.NEW_PAGE)` — this
  is Word's actual "start a new page, and a new section" operation (the
  DOCX equivalent of ReportLab's explicit `PageBreak()` for the PDF).
  **Immediately afterward, `_configure(document)` is called again** — this
  is exactly the case the earlier note about `_configure` flagged: a
  freshly added Word section does not inherit the margins set on previous
  sections, so without this second call, each signature page would
  silently revert to Word's own default margins instead of matching the
  rest of the deed.
- The final three lines (`buffer = io.BytesIO(); document.save(buffer);
  buffer.seek(0)`) are the exact same in-memory-buffer pattern as the PDF
  renderer, for the exact same reason: no filesystem access, and the
  read-position reset is equally necessary here before the buffer is
  handed to `StreamingResponse`.

---

That completes the function-by-function walkthrough of every file in the
Camera Filing feature. For the engineering decisions, trade-offs, and the
bigger architectural picture connecting all eighteen files together, read
**[`docs/system-design-of-camera-e-filing/`](../system-design-of-camera-e-filing/README.md)**.
