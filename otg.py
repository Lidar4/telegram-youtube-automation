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

    def to_dict(self):
        return asdict(self)


class OTGAIPhoneController:
    """Read-only Android diagnostics with AI-assisted analysis.

    This phase intentionally does not execute AI-generated shell commands.
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
        return subprocess.run(command, capture_output=True, text=True, timeout=15, check=False)

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

    def _prop(self, serial, name):
        result = self._adb("shell", "getprop", name, serial=serial)
        return result.stdout.strip() if result.returncode == 0 else None

    def _output(self, serial, *args):
        result = self._adb("shell", *args, serial=serial)
        return result.stdout.strip() if result.returncode == 0 else None

    def collect_report(self, serial=None):
        devices = self.check_adb_connection()
        serial = serial or (devices[0] if devices else None)
        if not serial:
            return DeviceReport(connected=False)

        return DeviceReport(
            connected=True,
            serial=serial,
            model=self._prop(serial, "ro.product.model"),
            manufacturer=self._prop(serial, "ro.product.manufacturer"),
            android_version=self._prop(serial, "ro.build.version.release"),
            sdk=self._prop(serial, "ro.build.version.sdk"),
            battery=self._output(serial, "dumpsys", "battery"),
            storage=self._output(serial, "df", "-h", "/data"),
            ram=self._output(serial, "cat", "/proc/meminfo"),
            wifi=self._output(serial, "cmd", "wifi", "status"),
            mobile_data=self._output(serial, "cmd", "phone", "get-data-state"),
            connectivity=self._output(serial, "dumpsys", "connectivity"),
            ip_addresses=self._output(serial, "ip", "addr", "show"),
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
