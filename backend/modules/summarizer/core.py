from typing import List, Dict, Any
from modules.infrastructure.schemas import Case, Evidence

class CaseSummarizer:
    def __init__(self):
        self.model_name = "gemini-2.5-flash"

    def summarize_case(self, case_data: Dict[str, Any]) -> str:
        """
        Summarizes a case.
        CRITICAL: Must detect contradictory facts across documents.
        """
        facts = self._extract_facts(case_data)
        contradictions = self._detect_contradictions(facts)
        
        if contradictions:
            return self._format_divergent_facts_report(contradictions)
        
        return "Case Summary: All facts align. Proceeding with standard summary..."

    def _extract_facts(self, case_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        # Mock extraction
        return case_data.get("extracted_facts", [])

    def _detect_contradictions(self, facts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Compare facts for inconsistencies.
        """
        # specialized logic for time contradictions
        times = [f for f in facts if f.get("type") == "incident_time"]
        if len(times) > 1:
            first_time = times[0]["value"]
            for t in times[1:]:
                if t["value"] != first_time:
                    return [{
                        "type": "divergent_fact",
                        "field": "incident_time",
                        "sources": [times[0]["source"], t["source"]],
                        "values": [times[0]["value"], t["value"]]
                    }]
        return []

    def _format_divergent_facts_report(self, contradictions: List[Dict[str, Any]]) -> str:
        report = "⚠️ CRITICAL ALERT: DIVERGENT FACTS DETECTED ⚠️\n"
        for c in contradictions:
            report += f"- Discrepancy in '{c['field']}':\n"
            for i, source in enumerate(c['sources']):
                report += f"  * Source: {source} -> Claims: {c['values'][i]}\n"
        report += "\nACTION REQUIRED: Judicial Review needed to resolve ambiguity."
        return report
