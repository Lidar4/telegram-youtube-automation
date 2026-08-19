import os
import re
import subprocess
from dataclasses import asdict, dataclass, field
from typing import Dict, List, Optional

import google.generativeai as genai


@dataclass
class CheckResult:
    name: str
    status: str
    value: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self):
        return asdict(self)


@dataclass
class DeviceReport:
    connected: bool
    serial: Optional[str] = None
    model: Optional[str] = None
    manufacturer: Optional[str] = None
    android_version: Optional[str] = None
    sdk: Optional[str] = None
    checks: List[CheckResult] = field(default_factory=list)

    def to_dict(self):
        data = asdict(self)
        data["checks"] = [c.to_dict() for c in self.checks]
        return data


class OTGAIPhoneController:
    """Authorized-device, read-only Android diagnostics with AI analysis."""

    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY", "")
        self.model = None
        if self.api_key:
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel("gemini-1.5-flash")

    def _adb(self, *args: str, serial: Optional[str] = None):
        command = ["adb"]
        if serial:
            command += ["-s", serial]
        command += list(args)
        return subprocess.run(
            command, capture_output=True, text=True, timeout=15, check=False
        )

    def check_adb_connection(self) -> List[str]:
        try:
            result = self._adb("devices")
            devices = []
            for line in result.stdout.splitlines()[1:]:
                parts = line.split()
                if len(parts) >= 2 and parts[1] == "device":
                    devices.append(parts[0])
            return devices
        except (FileNotFoundError, subprocess.SubprocessError):
            return []

    def _prop(self, serial: str, name: str) -> CheckResult:
        try:
            result = self._adb("shell", "getprop", name, serial=serial)
            if result.returncode == 0:
                return CheckResult(name, "ok", result.stdout.strip() or None)
            return CheckResult(name, "error", error=result.stderr.strip() or "ADB command failed")
        except subprocess.SubprocessError as exc:
            return CheckResult(name, "error", error=str(exc))

    def _output(self, serial: str, name: str, *args: str) -> CheckResult:
        try:
            result = self._adb("shell", *args, serial=serial)
            if result.returncode == 0:
                return CheckResult(name, "ok", result.stdout.strip() or None)
            return CheckResult(name, "error", error=result.stderr.strip() or "ADB command failed")
        except subprocess.SubprocessError as exc:
            return CheckResult(name, "error", error=str(exc))

    def collect_report(self, serial: Optional[str] = None) -> DeviceReport:
        devices = self.check_adb_connection()
        serial = serial or (devices[0] if devices else None)
        if not serial:
            return DeviceReport(connected=False)

        model = self._prop(serial, "ro.product.model")
        manufacturer = self._prop(serial, "ro.product.manufacturer")
        android = self._prop(serial, "ro.build.version.release")
        sdk = self._prop(serial, "ro.build.version.sdk")

        checks = [
            self._output(serial, "battery", "dumpsys", "battery"),
            self._output(serial, "storage", "df", "-h", "/data"),
            self._output(serial, "memory", "cat", "/proc/meminfo"),
            self._output(serial, "wifi", "cmd", "wifi", "status"),
            self._output(serial, "mobile_data", "cmd", "phone", "get-data-state"),
            self._output(serial, "connectivity", "dumpsys", "connectivity"),
            self._output(serial, "ip_addresses", "ip", "addr", "show"),
            self._output(serial, "telephony", "dumpsys", "telephony.registry"),
            self._output(serial, "audio", "dumpsys", "audio"),
            self._output(serial, "display", "wm", "size"),
        ]

        return DeviceReport(
            connected=True,
            serial=serial,
            model=model.value,
            manufacturer=manufacturer.value,
            android_version=android.value,
            sdk=sdk.value,
            checks=checks,
        )

    @staticmethod
    def _redact_sensitive(text: str) -> str:
        patterns = [
            r"(?i)(password|passwd|token|secret|api[_ -]?key)\s*[:=]\s*\S+",
            r"(?i)\bBearer\s+[A-Za-z0-9._-]+",
        ]
        redacted = text
        for pattern in patterns:
            redacted = re.sub(
                pattern,
                lambda m: m.group(1) + ": [REDACTED]" if m.lastindex else "[REDACTED]",
                redacted,
            )
        return redacted

    def diagnose(self, user_problem: str, report: Dict):
        if not self.model:
            return {
                "status": "ai_unavailable",
                "message": "GEMINI_API_KEY is not configured. The diagnostic report is still available.",
            }

        safe_report = self._redact_sensitive(str(report))
        prompt = f"""
You are a cautious Android technician assistant for an authorized device.
Technician problem: {user_problem}

Read-only diagnostic evidence:
{safe_report}

Return a concise structured analysis with:
- summary
- likely_causes (ranked, with confidence)
- evidence
- additional_safe_checks
- recommended_next_step
- repair_possible: yes/no/unknown
- requires_user_confirmation: yes/no

Only use supplied evidence. Never invent device state.
Do not output shell commands, credential material, or security-bypass instructions.
Clearly distinguish software, configuration, network/carrier, and possible hardware causes.
"""
        try:
            response = self.model.generate_content(prompt)
            return {"status": "ok", "message": response.text.strip()}
        except Exception as exc:
            return {"status": "ai_error", "message": str(exc)}

    def repair_plan(self, user_problem: str, report: Dict, analysis: Dict):
        """Generate a confirmation-first repair plan; never executes device changes."""
        if not self.model:
            return {
                "status": "ai_unavailable",
                "message": "GEMINI_API_KEY is not configured.",
                "requires_user_confirmation": True,
                "actions": [],
            }

        safe_report = self._redact_sensitive(str(report))
        safe_analysis = self._redact_sensitive(str(analysis))
        prompt = f"""
You are an Android technician assistant for an authorized device.
Create a SAFE, confirmation-first repair plan.

Problem:
{user_problem}

Diagnostic evidence:
{safe_report}

Previous analysis:
{safe_analysis}

Return only a JSON object with these keys:
summary, confidence, actions, requires_user_confirmation, blocked_actions.
Each item in actions must contain: id, description, risk (low/medium/high), reversible (yes/no), confirmation_required (yes/no).

Rules:
- Do not execute anything.
- Do not provide shell/ADB commands.
- Do not bypass Android permissions, security controls, lock screens, carrier restrictions, or authentication.
- Prefer reversible, user-visible settings changes.
- High-risk or irreversible actions must be blocked rather than proposed.
- If evidence is insufficient, actions must be empty and explain what additional safe evidence is needed.
"""
        try:
            response = self.model.generate_content(prompt)
            return {
                "status": "ok",
                "message": response.text.strip(),
                "requires_user_confirmation": True,
            }
        except Exception as exc:
            return {"status": "ai_error", "message": str(exc), "actions": []}


if __name__ == "__main__":
    controller = OTGAIPhoneController()
    devices = controller.check_adb_connection()
    print(f"[SYSTEM] Connected authorized devices: {len(devices)}")
    report = controller.collect_report()
    print(report.to_dict())
    if devices:
        problem = input("[Problem] ").strip()
        if problem:
            print("\n[AI DIAGNOSIS]")
            print(controller.diagnose(problem, report.to_dict()))
