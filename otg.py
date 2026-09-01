import os
import re
import json
from google import genai
from google.genai import types

class OTGDiagnosticHelper:
    @staticmethod
    def redact_sensitive_data(telemetry_str: str) -> str:
        """
        Scans and redacts passwords, credentials, auth tokens, wifi keys, and secrets from diagnostic dumps.
        """
        # Redact password and API key key-value structures
        patterns = [
            (r"(password|passwd|token|secret|api[-_]?key|auth|private_key|ssid_password|wpa_key)\s*[:=]\s*\"?[^\s,\"}]+?[,\"} \n]", r"\1: [REDACTED]"),
            (r"\bBearer\s+[A-Za-z0-9._-]+", "Bearer [REDACTED]")
        ]
        redacted = telemetry_str
        for pattern, replacement in patterns:
            redacted = re.sub(pattern, replacement, redacted, flags=re.IGNORECASE)
        return redacted

    @staticmethod
    def run_ai_analysis(problem: str, report_dict: dict) -> dict:
        """
        Uses the modern google-genai SDK to analyze the redacted diagnostic report cautious and structured.
        """
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return {
                "status": "ai_unavailable",
                "message": "GEMINI_API_KEY environment variable is not configured. The diagnostic report is still available."
            }

        try:
            # 1. Clean report dict
            report_str = json.dumps(report_dict, indent=2)
            redacted_report = OTGDiagnosticHelper.redact_sensitive_data(report_str)

            # 2. Build model prompt
            prompt = f"""
You are a highly cautious and methodical Android technician assistant.
A user or field technician has reported the following problem symptoms on an active target device:
Symptom: {problem}

Below is the verified diagnostic telemetry gathered live from the device. Under no circumstances should you invent, assume, or hallucinate any parameters, settings, or values not explicitly recorded in this telemetry.

--- Telemetry Data Start ---
{redacted_report}
--- Telemetry Data End ---

Please return a structured diagnosis identifying:
1. SUMMARY: A concise technical summary of the symptom and current state.
2. CAUSATION: Categorize potential failure origins with reasoning based strictly on the telemetry evidence:
   - SOFTWARE (e.g. applications, processes, core services)
   - CONFIGURATION (e.g. system settings, network profiles)
   - CARRIER & NETWORK (e.g. cellular bands, wifi connectivity)
   - PHYSICAL HARDWARE (e.g. battery degradation, memory blocks)
3. SAFE PROBING CHECKS: Describe subsequent read-only indicators or tests that could confirm the diagnosis.
4. ACTION PLAN: Propose sequential, non-destructive, and reversible remedial actions.

IMPORTANT SAFETY INSTRUCTIONS:
- You must NOT propose arbitrary shell code execution, security bypasses, or silent factory resets.
- If the telemetry is insufficient to make a definitive conclusion, explicitly flag it as UNRESOLVED and recommend specific safely inspectable parameters.
"""

            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
            )

            return {
                "status": "ok",
                "message": response.text.strip() if response.text else "No diagnostic summary could be structured."
            }
        except Exception as e:
            return {
                "status": "failed",
                "error": f"AI Expert Analysis Exception: {str(e)}"
            }
