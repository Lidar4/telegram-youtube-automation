import os
import subprocess
from dataclasses import asdict, dataclass
from typing import Optional

import google.generativeai as genai


@dataclass
class DeviceReport:
    connected: bool
    serial: Optional[str] = None
    model: Optional[str] = None
    manufacturer: Optional[str] = None
    android_version: Optional[str] = None
    sdk: Optional[str] = None
    battery: Optional[str] = None
    storage: Optional[str] = None
    ram: Optional[str] = None
    wifi: Optional[str] = None
    mobile_data: Optional[str] = None
    connectivity: Optional[str] = None
    ip_addresses: Optional[str] = None
    diagnostics_errors: Optional[dict] = None

    def to_dict(self):
        return asdict(self)


class OTGAIPhoneController:
    """Read-only Android diagnostics with AI-assisted analysis.

    AI output is analysis only in this phase. No AI-generated shell command
    is executed automatically.
    """

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
            command,
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )

    def check_adb_connection(self):
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

    def _prop(self, serial: str, name: str):
        try:
            result = self._adb("shell", "getprop", name, serial=serial)
            return result.stdout.strip() if result.returncode == 0 else None
        except subprocess.SubprocessError:
            return None

    def _output(self, serial: str, *args: str):
        try:
            result = self._adb("shell", *args, serial=serial)
            if result.returncode == 0:
                return result.stdout.strip() or None
            return None
        except subprocess.SubprocessError:
            return None

    def _checked_output(self, serial: str, *args: str):
        """Return command output plus a small, non-sensitive error marker."""
        try:
            result = self._adb("shell", *args, serial=serial)
            if result.returncode == 0:
                return result.stdout.strip() or None, None
            return None, (result.stderr.strip() or f"exit code {result.returncode}")
        except subprocess.TimeoutExpired:
            return None, "command timed out"
        except subprocess.SubprocessError as exc:
            return None, str(exc)

    def collect_report(self, serial=None):
        devices = self.check_adb_connection()
        serial = serial or (devices[0] if devices else None)
        if not serial:
            return DeviceReport(connected=False)

        checks = {
            "battery": ("dumpsys", "battery"),
            "storage": ("df", "-h", "/data"),
            "ram": ("cat", "/proc/meminfo"),
            "wifi": ("cmd", "wifi", "status"),
            "mobile_data": ("cmd", "phone", "get-data-state"),
            "connectivity": ("dumpsys", "connectivity"),
            "ip_addresses": ("ip", "addr", "show"),
        }
        values = {}
        errors = {}
        for key, command in checks.items():
            value, error = self._checked_output(serial, *command)
            values[key] = value
            if error:
                errors[key] = error

        return DeviceReport(
            connected=True,
            serial=serial,
            model=self._prop(serial, "ro.product.model"),
            manufacturer=self._prop(serial, "ro.product.manufacturer"),
            android_version=self._prop(serial, "ro.build.version.release"),
            sdk=self._prop(serial, "ro.build.version.sdk"),
            battery=values["battery"],
            storage=values["storage"],
            ram=values["ram"],
            wifi=values["wifi"],
            mobile_data=values["mobile_data"],
            connectivity=values["connectivity"],
            ip_addresses=values["ip_addresses"],
            diagnostics_errors=errors or None,
        )

    def diagnose(self, user_problem, report):
        if not self.model:
            return {
                "status": "ai_unavailable",
                "message": "GEMINI_API_KEY is not configured. The diagnostic report is still available.",
            }

        prompt = f"""
You are a cautious Android technician assistant.
The technician reported this problem: {user_problem}

Authorized-device diagnostic evidence:
{report}

Analyze only the supplied evidence. Return:
1. likely causes, ranked
2. confidence for each cause
3. additional safe, read-only checks that would help
4. a clear technician-friendly explanation
5. whether a repair action would require user confirmation

Do not invent unavailable information.
Do not output shell commands or instructions for bypassing Android security.
Do not claim a hardware or carrier fault unless the evidence supports it.
If a diagnostic check failed or is unavailable, say so explicitly.
"""
        try:
            response = self.model.generate_content(prompt)
            return {"status": "ok", "message": response.text.strip()}
        except Exception as exc:
            return {"status": "ai_error", "message": str(exc)}


if __name__ == "__main__":
    controller = OTGAIPhoneController()
    devices = controller.check_adb_connection()
    print(f"[SYSTEM] Connected devices: {len(devices)}")
    report = controller.collect_report()
    print(report.to_dict())
    if devices:
        problem = input("[Problem] ").strip()
        if problem:
            print("\n[AI DIAGNOSIS]")
            print(controller.diagnose(problem, report.to_dict()))
