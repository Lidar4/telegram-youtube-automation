import os
import shlex
import subprocess
from dataclasses import dataclass, asdict
from typing import Optional

import google.generativeai as genai


@dataclass
class DeviceReport:
    connected: bool
    serial: Optional[str] = None
    model: Optional[str] = None
    manufacturer: Optional[str] = None
    android_version: Optional[str] = None
    battery: Optional[str] = None
    storage: Optional[str] = None
    ram: Optional[str] = None
    wifi: Optional[str] = None
    mobile_data: Optional[str] = None

    def to_dict(self):
        return asdict(self)


class OTGAIPhoneController:
    """Read-only Android diagnostics with optional, explicitly approved actions."""

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
        return subprocess.run(command, capture_output=True, text=True, timeout=15)

    def check_adb_connection(self):
        try:
            result = self._adb("devices")
            devices = []
            for line in result.stdout.splitlines()[1:]:
                parts = line.split()
                if len(parts) >= 2 and parts[1] == "device":
                    devices.append(parts[0])
            return devices
        except (FileNotFoundError, subprocess.SubprocessError) as exc:
            print(f"[ADB ERROR] {exc}")
            return []

    def _prop(self, serial, name):
        result = self._adb("shell", "getprop", name, serial=serial)
        return result.stdout.strip() if result.returncode == 0 else None

    def collect_report(self, serial=None):
        devices = self.check_adb_connection()
        serial = serial or (devices[0] if devices else None)
        if not serial:
            return DeviceReport(connected=False)

        battery = self._adb("shell", "dumpsys", "battery", serial=serial)
        storage = self._adb("shell", "df", "-h", "/data", serial=serial)
        ram = self._adb("shell", "cat", "/proc/meminfo", serial=serial)
        wifi = self._adb("shell", "cmd", "wifi", "status", serial=serial)
        mobile = self._adb("shell", "cmd", "phone", "get-data-state", serial=serial)

        return DeviceReport(
            connected=True,
            serial=serial,
            model=self._prop(serial, "ro.product.model"),
            manufacturer=self._prop(serial, "ro.product.manufacturer"),
            android_version=self._prop(serial, "ro.build.version.release"),
            battery=battery.stdout.strip() if battery.returncode == 0 else None,
            storage=storage.stdout.strip() if storage.returncode == 0 else None,
            ram=ram.stdout.strip() if ram.returncode == 0 else None,
            wifi=wifi.stdout.strip() if wifi.returncode == 0 else None,
            mobile_data=mobile.stdout.strip() if mobile.returncode == 0 else None,
        )

    def diagnose(self, user_problem, report):
        if not self.model:
            return "GEMINI_API_KEY is not configured. The device report is still available for local inspection."

        prompt = f"""
You are a cautious Android technician assistant.
The technician reported: {user_problem}

Device diagnostic report:
{report}

Analyze only the supplied evidence. Identify likely causes, confidence, and safe next diagnostic checks.
Do not invent unavailable device information. Do not output raw shell commands.
If a fix requires user confirmation, clearly say so.
"""
        response = self.model.generate_content(prompt)
        return response.text.strip()


if __name__ == "__main__":
    controller = OTGAIPhoneController()
    devices = controller.check_adb_connection()
    print(f"[SYSTEM] Connected devices: {len(devices)}")
    report = controller.collect_report()
    print(report.to_dict())
    if devices:
        problem = input("[Problem] ").strip()
        if problem:
            print("\n[AI DIAGNOSIS]\n" + controller.diagnose(problem, report.to_dict()))
