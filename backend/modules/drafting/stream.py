"""Live, section-by-section generation of the deed.

The event stream is what drives the typing animation on screen. Two things are
worth knowing about the shape of it:

* The model call that authors the recitals and the Schedule is started in a
  background thread and only joined when the walker actually reaches the first
  model-authored section. By then the client has been typing out the title,
  preamble and party blocks for several seconds, so the model latency is spent
  behind the animation instead of in front of it.
* Bodies are emitted as small word-group deltas rather than whole sections.
  The client still paces the characters itself, but content genuinely arrives
  progressively, so a 5-10 page deed starts rendering immediately instead of
  after the whole document is built.
"""

import logging
import os
import re
import time
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any, Dict, Iterator, List, Optional

from ..gemini import extract_json, retry_on_failure
from .generator import (
    MODEL_NAME,
    NARRATIVE_SECTIONS,
    build_sections,
    estimate_pages,
    narrative_sections_for,
    render_plain_text,
)
from .extraction import missing_required_fields
from .schema import GIFT_DEED, SALE_DEED

logger = logging.getLogger(__name__)

# Words per delta. Small enough to look like writing, large enough that a
# 10-page deed does not become ten thousand SSE frames.
WORDS_PER_DELTA = 6

# How long the walker is prepared to wait for the model once it reaches the
# first model-authored section. Past this the template wording is used.
NARRATIVE_TIMEOUT_SECONDS = 45

_NARRATIVE_SYSTEM_PROMPT = """
You are a senior conveyancing draftsman in India who prepares Sale Deeds for
registration before the Sub-Registrar.

You write only the three bespoke passages of a Sale Deed. You never write the
operative clauses - those are settled by the firm's precedent and are supplied
separately.

House style, which you follow without exception:
- Formal Indian conveyancing English, in the register of a registered deed:
  "WHEREAS", "doth hereby", "more particularly described in the Schedule
  hereunder written", "free from all encumbrances".
- Refer to the parties only as "the Vendor" and "the Purchaser".
- Use only the particulars supplied. Never invent a document number, a survey
  number, a date, an extent or a boundary. Where a particular is missing,
  write the passage so that it reads correctly without it - do not substitute a
  placeholder and do not draw attention to the omission.
- Continuous prose, no bullet points, no markdown, no headings.
- Each passage is one paragraph, between 90 and 200 words, except the Schedule
  description which may use short labelled lines.
""".strip()


def _narrative_prompt(fields: Dict[str, Any]) -> str:
    supplied = "\n".join(
        f"- {key}: {value}"
        for key, value in sorted(fields.items())
        if str(value or "").strip()
    ) or "- (no particulars supplied)"

    return f"""
Particulars extracted from the parties' documents:
{supplied}

Draft the three bespoke passages of this Sale Deed and return them as a single
JSON object with exactly these keys:

{{
  "title_recital": "The WHEREAS recital. Opens with the word WHEREAS. States that the Vendor is the absolute owner in lawful, peaceful and vacant possession of the property described in the Schedule, and recites precisely how the Vendor acquired title - the prior registered Sale Deed, its document number, book, volume, pages, date and the Sub-Registrar's office - followed by the Vendor's uninterrupted possession and the mutation of the revenue records.",
  "agreement_recital": "The AND WHEREAS recital. Opens with the words AND WHEREAS. Recites that the Vendor, for bonafide needs and legal requirements, of free will and in a sound and disposing state of mind, without pressure, force, compulsion or coercion, has agreed to sell the Schedule property to the Purchaser for the stated consideration, and that the Purchaser, having inspected the property and scrutinised the title and revenue records and being satisfied as to the Vendor's marketable title, has agreed to purchase it.",
  "schedule_body": "The Schedule description of the property. Begin with short labelled lines for the identifiers that were supplied (Survey No., Sub-Division No., P.T. Sheet No., Chalta No., Extent / Area, Village / City, Taluka, District, State), one per line, omitting any that were not supplied. Then a blank line, then one descriptive paragraph identifying the property as a conveyance would."
}}

Return the JSON object only.
""".strip()


_GIFT_SYSTEM_PROMPT = """
You are a senior conveyancing draftsman in India who prepares Deeds of Gift
for registration before the Sub-Registrar of Assurances.

You write only the three bespoke passages of a Gift Deed. You never write the
operative covenants, declarations or the irrevocability clause - those are
settled by the firm's precedent and are supplied separately.

House style, which you follow without exception:
- Formal Indian conveyancing English, in the register of a registered deed:
  "WHEREAS", "AND WHEREAS", "seized and possessed of and otherwise well and
  sufficiently entitled to", "doth hereby grant, convey and transfer",
  "free from all encumbrances".
- Refer to the parties only as "the DONOR" and "the DONEE", in capitals.
- A gift passes WITHOUT monetary consideration. Never recite a price, a
  consideration, a receipt, a discharge or a payment. The only consideration
  you may recite is natural love and affection.
- Say that the gift is voluntary, free, unconditional, irrevocable and
  absolute. Never write anything that suggests it may be revoked or is
  conditional on anything.
- Refer to the flat as "the SAID FLAT", the society shares as "the SAID
  SHARES", the society as "the SAID SOCIETY" and the subject matter of the gift
  as "the SAID GIFT PROPERTY" - those terms are defined elsewhere in the deed.
- Use only the particulars supplied. Never invent a flat number, a survey
  number, a share certificate number, a date or an area. Where a particular is
  missing, write the passage so that it reads correctly without it - do not
  substitute a placeholder and do not draw attention to the omission.
- Continuous prose, no bullet points, no markdown, no headings.
- Each passage is one paragraph, between 90 and 200 words, except the Schedule
  description which may use short labelled lines.
""".strip()


def _gift_narrative_prompt(fields: Dict[str, Any]) -> str:
    supplied = "\n".join(
        f"- {key}: {value}"
        for key, value in sorted(fields.items())
        if str(value or "").strip()
    ) or "- (no particulars supplied)"

    return f"""
Particulars extracted from the parties' documents:
{supplied}

Draft the three bespoke passages of this Gift Deed and return them as a single
JSON object with exactly these keys:

{{
  "title_recital": "The opening WHEREAS recital. Opens with the word WHEREAS. States that the DONOR is seized and possessed of and otherwise well and sufficiently entitled to the stated undivided share, right, title and interest in the residential flat - identifying it by flat number, floor, carpet area, building, society, plot, survey and C.T.S. numbers and its village, taluka and district as supplied - defines it as 'the SAID FLAT', recites how the DONOR acquired that share under the prior registered agreement and its date and parties, and closes with the DONOR's lawful, peaceful and uninterrupted possession and the payment of all taxes, maintenance charges and outgoings.",
  "gift_recital": "The AND WHEREAS recital that establishes the gift. Opens with the words AND WHEREAS. Recites that the DONOR is absolutely entitled to deal with and dispose of the SAID GIFT PROPERTY, that out of the natural love and affection the DONOR bears towards the DONEE - naming the relationship supplied - the DONOR is desirous of voluntarily, freely, unconditionally, irrevocably and absolutely granting, conveying and transferring forever the stated undivided share in the SAID FLAT unto the DONEE by way of GIFT, without accepting any monetary consideration whatsoever from the DONEE or from any person on the DONEE's behalf.",
  "schedule_body": "The Schedule description of the share being gifted. Open with 'All THAT PIECE AND PARCEL of' followed by the stated undivided share with the rights, title and interest of the DONOR therein in the residential flat, identified in full from the particulars supplied, together with the proportionate part of the SAID SHARES comprised in the share certificate. Then a blank line, then short labelled lines for the particulars that were supplied (Year of Construction, No. of Building Floors, Lift, Flat No., Total area of Flat, Survey No., C.T.S. No., Plot No., Street No., Village, Taluka), one per line, omitting any that were not supplied."
}}

Return the JSON object only.
""".strip()


_PROMPTS_BY_CASE_TYPE = {
    SALE_DEED: (_NARRATIVE_SYSTEM_PROMPT, _narrative_prompt),
    GIFT_DEED: (_GIFT_SYSTEM_PROMPT, _gift_narrative_prompt),
}


@retry_on_failure(retries=2, delay=2)
def author_narrative(fields: Dict[str, Any],
                     case_type: str = SALE_DEED) -> Dict[str, str]:
    """Ask the model for the three bespoke passages. Raises on failure."""
    import google.generativeai as genai

    system_prompt, build_prompt = _PROMPTS_BY_CASE_TYPE.get(
        case_type, _PROMPTS_BY_CASE_TYPE[SALE_DEED]
    )
    model = genai.GenerativeModel(
        model_name=MODEL_NAME, system_instruction=system_prompt
    )
    response = model.generate_content(build_prompt(fields))
    data = extract_json(response.text)
    if not isinstance(data, dict):
        raise ValueError(f"Expected a JSON object, got {type(data).__name__}")

    narrative = {}
    for key in narrative_sections_for(case_type):
        text = str(data.get(key) or "").strip()
        # A one-line answer means the model gave up on the passage; the
        # template wording is better than a stub in a registered deed.
        if len(text.split()) >= 25:
            narrative[key] = _strip_markdown(text)
    if not narrative:
        raise ValueError("Model returned no usable passage")
    return narrative


def _strip_markdown(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"(?m)^\s*#{1,6}\s*", "", text)
    text = re.sub(r"(?m)^\s*[-*]\s+", "", text)
    return text.strip()


def llm_available() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


def iter_deltas(body: str, words_per_delta: int = WORDS_PER_DELTA) -> Iterator[str]:
    """Split a body into word groups, preserving every space and newline.

    Concatenating everything this yields reproduces ``body`` byte for byte,
    which is what lets the client treat deltas as a plain append.
    """
    if not body:
        return
    tokens = re.findall(r"\S+\s*", body)
    for start in range(0, len(tokens), words_per_delta):
        yield "".join(tokens[start:start + words_per_delta])


def _status(step: str, message: str) -> Dict[str, Any]:
    return {"type": "status", "step": step, "message": message}


def stream_document(
    fields: Dict[str, Any],
    use_llm: Optional[bool] = None,
    case_type: str = SALE_DEED,
) -> Iterator[Dict[str, Any]]:
    """Yield the generation events for one deed, in document order."""
    if use_llm is None:
        use_llm = llm_available()

    narrative_keys = narrative_sections_for(case_type)
    missing = missing_required_fields(fields, case_type)
    yield _status("validate", "Verifying extracted particulars")
    if missing:
        yield {
            "type": "warning",
            "message": (
                f"{len(missing)} required particular(s) were left blank and "
                f"appear in the deed as fill-in lines."
            ),
            "missingRequired": missing,
        }

    narrative: Dict[str, str] = {}
    narrative_source = "template"
    pending: Optional[Future] = None
    executor: Optional[ThreadPoolExecutor] = None

    if use_llm:
        yield _status("draft", "Drafting the recitals and Schedule")
        executor = ThreadPoolExecutor(max_workers=1)
        pending = executor.submit(author_narrative, dict(fields), case_type)

    try:
        # The skeleton is built twice when the model is in play: once to walk
        # the leading sections while the model works, and once with the
        # authored passages folded in. Building it is cheap and pure.
        skeleton = build_sections(fields, case_type=case_type)
        deadline = time.monotonic() + NARRATIVE_TIMEOUT_SECONDS
        resolved = False

        yield {
            "type": "meta",
            "sectionCount": len(skeleton),
            "estimatedPages": estimate_pages(skeleton),
            "clauseCount": sum(1 for s in skeleton if s["style"] == "clause"),
        }
        yield _status("compose", "Composing the deed")

        emitted: List[Dict[str, Any]] = []
        for index, section in enumerate(skeleton):
            # Join the model only when its output is first needed.
            if not resolved and section["id"] in narrative_keys:
                resolved = True
                if pending is not None:
                    remaining = max(0.0, deadline - time.monotonic())
                    try:
                        narrative = pending.result(timeout=remaining)
                        narrative_source = "gemini"
                        yield _status("draft-done", "Recitals drafted")
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("Narrative drafting failed: %s", exc)
                        yield {
                            "type": "notice",
                            "message": "Drafted from the firm's precedent wording.",
                        }
                # Re-resolve the remaining sections against the authored text.
                skeleton = build_sections(fields, narrative, case_type)

            section = skeleton[index]
            yield {
                "type": "section",
                "index": index,
                "id": section["id"],
                "style": section["style"],
                "heading": section["heading"],
            }
            for delta in iter_deltas(section["body"]):
                yield {"type": "delta", "id": section["id"], "text": delta}
            yield {"type": "section_end", "id": section["id"],
                   "body": section["body"]}
            emitted.append(dict(section))

        yield {
            "type": "done",
            "sections": emitted,
            "plainText": render_plain_text(emitted),
            "estimatedPages": estimate_pages(emitted),
            "source": narrative_source,
            "missingRequired": missing,
        }
    finally:
        if executor is not None:
            executor.shutdown(wait=False)
