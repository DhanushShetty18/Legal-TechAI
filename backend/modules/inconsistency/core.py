"""
Inconsistency Detection Engine — 4-step sequential Gemini pipeline
with Level 2 physical-impossibility reasoning.
"""

import os
import json
import re
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

import pydantic
import google.generativeai as genai
from dotenv import load_dotenv

from .schemas import (
    Entity,
    DocumentEntities,
    Claim,
    ExtractedClaims,
    ContradictionCandidate,
    DetectedContradictions,
    FinalContradiction,
    CleanFact,
    InconsistencyReport,
)

# Load .env so GEMINI_API_KEY is available
load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Known distances for Level 2 physical-impossibility reasoning
# Format: frozenset({city_a, city_b}) -> (distance_km, min_hours_by_road)
# ---------------------------------------------------------------------------
KNOWN_DISTANCES: Dict[frozenset, Tuple[float, float]] = {
    frozenset({"mumbai", "pune"}): (150, 2.5),
    frozenset({"mumbai", "nashik"}): (167, 3.0),
    frozenset({"mumbai", "nagpur"}): (840, 11.0),
    frozenset({"mumbai", "thane"}): (25, 0.75),
    frozenset({"mumbai", "surat"}): (284, 4.5),
    frozenset({"delhi", "noida"}): (25, 0.75),
    frozenset({"delhi", "gurgaon"}): (32, 1.0),
    frozenset({"delhi", "agra"}): (233, 3.5),
    frozenset({"delhi", "jaipur"}): (281, 4.5),
    frozenset({"delhi", "lucknow"}): (555, 7.5),
    frozenset({"chennai", "bangalore"}): (346, 5.5),
    frozenset({"hyderabad", "bangalore"}): (570, 7.5),
    frozenset({"kolkata", "patna"}): (600, 8.0),
}

# Average max speed within a single city (km/h)
CITY_MAX_SPEED_KMH = 50

# ---------------------------------------------------------------------------
# Lazy Gemini configuration — only runs once, at first use
# ---------------------------------------------------------------------------
_gemini_configured = False


def _ensure_gemini_configured():
    """Configure Gemini exactly once. Raises RuntimeError if no API key."""
    global _gemini_configured
    if _gemini_configured:
        return
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY environment variable is not set. "
            "Set it in your .env file or Render environment variables."
        )
    genai.configure(api_key=api_key)
    _gemini_configured = True
    logger.info("Gemini API configured successfully for inconsistency engine.")


class InconsistencyEngine:
    """Runs the 4-step sequential Gemini pipeline."""

    def __init__(self):
        # Model is created lazily when process() is called
        self._model = None

    # ------------------------------------------------------------------
    # Gemini JSON helper
    # ------------------------------------------------------------------
    def _call_gemini_json(
        self, prompt: str, schema_class: type[pydantic.BaseModel]
    ) -> pydantic.BaseModel:
        """Call Gemini with JSON mode and validate against *schema_class*."""
        # Lazy init: configure Gemini and create model on first call
        if self._model is None:
            _ensure_gemini_configured()
            self._model = genai.GenerativeModel("gemini-1.5-pro")

        full_prompt = (
            f"{prompt}\n\n"
            "CRITICAL: You MUST output strictly valid JSON.\n"
            "Your output must exactly match this JSON schema:\n"
            f"{json.dumps(schema_class.model_json_schema(), indent=2)}\n\n"
            "Do not wrap the JSON in markdown blocks like ```json ... ```. "
            "Just return the raw JSON string."
        )

        response = self._model.generate_content(
            full_prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.0,
                response_mime_type="application/json",
            ),
        )

        text = response.text.strip()
        # Defensive: strip markdown code fences if present
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        return schema_class.model_validate_json(text)

    # ------------------------------------------------------------------
    # Main pipeline
    # ------------------------------------------------------------------
    def process(self, documents: List[Dict[str, str]]) -> InconsistencyReport:
        """
        Execute the 4-step pipeline. Each step's output feeds the next.

        Parameters
        ----------
        documents : list of dicts
            Each dict has ``doc_id`` (filename) and ``text`` (extracted text
            with ``[Page N]`` markers).
        """
        doc_texts = []
        for doc in documents:
            doc_texts.append(
                f"--- DOCUMENT: {doc['doc_id']} ---\n{doc['text']}\n"
            )
        full_context = "\n".join(doc_texts)

        # STEP 1 — Entity Extraction
        entities = self._step1_extract_entities(full_context)

        # STEP 2 — Claim Extraction
        claims = self._step2_extract_claims(full_context, entities)

        # STEP 3 — Contradiction Detection (includes physical impossibility)
        contradictions = self._step3_detect_contradictions(claims)

        # STEP 4 — Evidence Linking
        report = self._step4_link_evidence(claims, contradictions)

        return report

    # ------------------------------------------------------------------
    # STEP 1 — Entity Extraction
    # ------------------------------------------------------------------
    def _step1_extract_entities(
        self, context: str
    ) -> List[DocumentEntities]:
        class _EntityExtractionResponse(pydantic.BaseModel):
            documents: List[DocumentEntities]

        prompt = f"""\
You are an expert Indian Legal AI performing STEP 1: ENTITY EXTRACTION.

From each document below, extract ALL entities in these categories:
- PERSON  (with role: accused / witness / victim / officer when discernible)
- DATE    (normalise to DD-MM-YYYY HH:MM where possible)
- LOCATION (specific addresses or place names)
- AMOUNT  (monetary values)
- ACTION  (what happened — verb phrases)

DOCUMENTS:
{context}
"""
        return self._call_gemini_json(prompt, _EntityExtractionResponse).documents

    # ------------------------------------------------------------------
    # STEP 2 — Claim Extraction
    # ------------------------------------------------------------------
    def _step2_extract_claims(
        self,
        context: str,
        entities: List[DocumentEntities],
    ) -> ExtractedClaims:
        entities_json = json.dumps(
            [e.model_dump() for e in entities], indent=2
        )
        prompt = f"""\
You are an expert Indian Legal AI performing STEP 2: CLAIM EXTRACTION.

Break each document into atomic claims (one fact per claim).

Rules:
- claim_type must be one of: factual / temporal / locational / quantitative
- exact_quote MUST be the verbatim sentence from the document text.
- doc_id must match the document filename.
- page_ref should reference the [Page N] marker.
- Give each claim a unique claim_id (C1, C2, …).

DOCUMENTS:
{context}

EXTRACTED ENTITIES (for reference):
{entities_json}
"""
        return self._call_gemini_json(prompt, ExtractedClaims)

    # ------------------------------------------------------------------
    # STEP 3 — Contradiction Detection  (+ physical impossibility)
    # ------------------------------------------------------------------
    def _step3_detect_contradictions(
        self, claims: ExtractedClaims
    ) -> DetectedContradictions:
        """
        First ask Gemini for FACTUAL / TEMPORAL / LOGICAL contradictions,
        then run deterministic Level 2 physical-impossibility checks and
        merge results.
        """
        prompt = f"""\
You are an expert Indian Legal AI performing STEP 3: CONTRADICTION DETECTION.

Compare claims across DIFFERENT documents and detect contradictions.

Contradiction types:
- FACTUAL: Same event described differently
    (e.g. Doc A says "gold chain", Doc B says "silver chain")
- TEMPORAL: Same event at different times
    (e.g. Doc A says "9pm", Doc B says "11pm")
- LOGICAL: One claim makes another impossible
    (e.g. Doc A: "acted alone", Doc B: phone records show 14 calls
     to co-accused in the same hour)

Rules:
- Only flag contradictions between claims from DIFFERENT documents.
- Provide the claim_a_id and claim_b_id of the clashing claims.
- Provide clear reasoning for each.
- Also list the claim_ids of all claims that remain consistent.

CLAIMS:
{claims.model_dump_json(indent=2)}
"""
        gemini_result = self._call_gemini_json(prompt, DetectedContradictions)

        # --- Level 2: Physical impossibility (deterministic) ---
        physical = self._check_physical_impossibility(claims)

        # Merge physical impossibility candidates into the Gemini result
        if physical:
            merged_candidates = list(gemini_result.candidates) + physical
            # Remove any newly-contradicted claims from consistent list
            phys_ids = set()
            for p in physical:
                phys_ids.add(p.claim_a_id)
                phys_ids.add(p.claim_b_id)
            consistent = [
                cid
                for cid in gemini_result.consistent_claim_ids
                if cid not in phys_ids
            ]
            gemini_result = DetectedContradictions(
                candidates=merged_candidates,
                consistent_claim_ids=consistent,
            )

        return gemini_result

    # ------------------------------------------------------------------
    # Level 2 — deterministic physical-impossibility check
    # ------------------------------------------------------------------
    def _check_physical_impossibility(
        self, claims: ExtractedClaims
    ) -> List[ContradictionCandidate]:
        """
        Cross-check temporal + locational claims from different documents.

        If two claims place the same person at two different locations within
        a time window that is physically impossible to traverse, flag it as
        PHYSICAL_IMPOSSIBILITY.
        """
        results: List[ContradictionCandidate] = []

        # Gather claims that have both a time and a location signal
        temporal_claims = [
            c for c in claims.claims if c.claim_type == "temporal"
        ]
        locational_claims = [
            c for c in claims.claims if c.claim_type == "locational"
        ]

        # Build (claim_id -> parsed_time) and (claim_id -> location_name)
        time_map: Dict[str, Optional[datetime]] = {}
        for tc in temporal_claims:
            time_map[tc.claim_id] = self._parse_time(tc.fact + " " + tc.exact_quote)

        loc_map: Dict[str, Optional[str]] = {}
        for lc in locational_claims:
            loc_map[lc.claim_id] = self._extract_city(lc.fact + " " + lc.exact_quote)

        # We also scan temporal claims for embedded location info and vice versa
        for tc in temporal_claims:
            city = self._extract_city(tc.fact + " " + tc.exact_quote)
            if city:
                loc_map[tc.claim_id] = city
        for lc in locational_claims:
            t = self._parse_time(lc.fact + " " + lc.exact_quote)
            if t:
                time_map[lc.claim_id] = t

        # Now also look at ALL claims for ones that mention both time and place
        for c in claims.claims:
            combined = c.fact + " " + c.exact_quote
            if c.claim_id not in time_map:
                t = self._parse_time(combined)
                if t:
                    time_map[c.claim_id] = t
            if c.claim_id not in loc_map:
                city = self._extract_city(combined)
                if city:
                    loc_map[c.claim_id] = city

        # Find claim pairs from different documents with both time + location
        all_claims = claims.claims
        claim_lookup = {c.claim_id: c for c in all_claims}

        checked: set = set()
        for cid_a, time_a in time_map.items():
            if time_a is None:
                continue
            loc_a = loc_map.get(cid_a)
            if not loc_a:
                continue
            doc_a = claim_lookup[cid_a].doc_id

            for cid_b, time_b in time_map.items():
                if time_b is None:
                    continue
                if cid_a == cid_b:
                    continue
                pair_key = frozenset({cid_a, cid_b})
                if pair_key in checked:
                    continue
                checked.add(pair_key)

                doc_b = claim_lookup[cid_b].doc_id
                if doc_a == doc_b:
                    continue  # only cross-document

                loc_b = loc_map.get(cid_b)
                if not loc_b:
                    continue
                if loc_a == loc_b:
                    continue  # same location — no travel issue

                # Calculate time gap (hours)
                time_gap_hrs = abs((time_a - time_b).total_seconds()) / 3600

                # Look up known distance
                min_travel = self._min_travel_hours(loc_a, loc_b)
                if min_travel is None:
                    continue  # unknown route — can't make a deterministic claim

                if time_gap_hrs < min_travel:
                    dist_km = self._distance_km(loc_a, loc_b)
                    reason = (
                        f"Accused cannot be in {loc_a.title()} at "
                        f"{time_a.strftime('%I:%M %p')} and "
                        f"{loc_b.title()} at {time_b.strftime('%I:%M %p')}. "
                        f"Distance is {dist_km:.0f} km; minimum travel time "
                        f"by road is {min_travel} hours. "
                        f"Time gap is only {time_gap_hrs:.2f} hours. "
                        f"One statement must be false."
                    )
                    results.append(
                        ContradictionCandidate(
                            claim_a_id=cid_a,
                            claim_b_id=cid_b,
                            contradiction_type="PHYSICAL_IMPOSSIBILITY",
                            reasoning=reason,
                        )
                    )

        return results

    # ------------------------------------------------------------------
    # Helper: parse a time from free text
    # ------------------------------------------------------------------
    @staticmethod
    def _parse_time(text: str) -> Optional[datetime]:
        """Try common Indian legal document time formats."""
        text_lower = text.lower()

        patterns = [
            # 9:00 PM, 11:00 AM, 21:00
            r'(\d{1,2}):(\d{2})\s*(am|pm)',
            r'(\d{1,2}):(\d{2})\s*hours',
            r'(\d{1,2}):(\d{2})',
            # "9 pm", "11 am"
            r'(\d{1,2})\s*(am|pm)',
        ]

        for pat in patterns:
            m = re.search(pat, text_lower)
            if m:
                groups = m.groups()
                try:
                    if len(groups) == 3:  # HH:MM AM/PM
                        h, mi, ampm = int(groups[0]), int(groups[1]), groups[2]
                        if ampm == "pm" and h != 12:
                            h += 12
                        if ampm == "am" and h == 12:
                            h = 0
                        return datetime(2000, 1, 1, h, mi)
                    elif len(groups) == 2:
                        if groups[1] in ("am", "pm"):  # H AM/PM
                            h, ampm = int(groups[0]), groups[1]
                            if ampm == "pm" and h != 12:
                                h += 12
                            if ampm == "am" and h == 12:
                                h = 0
                            return datetime(2000, 1, 1, h, 0)
                        else:  # HH:MM (24h or just digits)
                            h, mi = int(groups[0]), int(groups[1])
                            if 0 <= h <= 23 and 0 <= mi <= 59:
                                return datetime(2000, 1, 1, h, mi)
                except (ValueError, IndexError):
                    continue
        return None

    # ------------------------------------------------------------------
    # Helper: extract a city name from text (case-insensitive)
    # ------------------------------------------------------------------
    def _extract_city(self, text: str) -> Optional[str]:
        """Return the first recognised city found in *text* (lowercase)."""
        all_cities: set[str] = set()
        for pair in KNOWN_DISTANCES:
            all_cities.update(pair)

        text_lower = text.lower()
        for city in sorted(all_cities, key=len, reverse=True):
            if city in text_lower:
                return city
        return None

    # ------------------------------------------------------------------
    # Helper: look up min travel hours between two cities
    # ------------------------------------------------------------------
    @staticmethod
    def _min_travel_hours(city_a: str, city_b: str) -> Optional[float]:
        key = frozenset({city_a.lower(), city_b.lower()})
        entry = KNOWN_DISTANCES.get(key)
        if entry:
            return entry[1]
        return None

    @staticmethod
    def _distance_km(city_a: str, city_b: str) -> float:
        key = frozenset({city_a.lower(), city_b.lower()})
        entry = KNOWN_DISTANCES.get(key)
        return entry[0] if entry else 0.0

    # ------------------------------------------------------------------
    # STEP 4 — Evidence Linking
    # ------------------------------------------------------------------
    def _step4_link_evidence(
        self,
        claims: ExtractedClaims,
        contradictions: DetectedContradictions,
    ) -> InconsistencyReport:
        prompt = f"""\
You are an expert Indian Legal AI performing STEP 4: EVIDENCE LINKING.

Build the final inconsistency report from the detected contradictions.

For EACH contradiction:
- Find the exact_quote_doc_a and exact_quote_doc_b by looking up the
  claim_a_id and claim_b_id in the claims list.
- Keep the contradiction_type exactly as detected (FACTUAL, TEMPORAL,
  LOGICAL, or PHYSICAL_IMPOSSIBILITY).
- Severity:
    HIGH   — could change the outcome of the case
    MEDIUM — notable discrepancy but not case-breaking
    LOW    — minor inconsistency
- explanation: one clear, plain-language sentence.
- impossibility_reason: ONLY for PHYSICAL_IMPOSSIBILITY contradictions.
  Copy the reasoning verbatim from the contradiction candidate. For all
  other types set this to null.

For clean / consistent facts:
- Extract the fact, document_id, page_ref, and exact_quote from claims
  whose IDs appear in consistent_claim_ids.

CLAIMS:
{claims.model_dump_json(indent=2)}

DETECTED CONTRADICTIONS:
{contradictions.model_dump_json(indent=2)}
"""
        return self._call_gemini_json(prompt, InconsistencyReport)
