# AI-Powered Android OTG & Web Controller

AI-assisted Android diagnostics for technicians using ADB, Gemini, and a local Flask dashboard.

## Current foundation

- Detect authorized ADB devices.
- Collect read-only device diagnostics.
- Send a technician's natural-language problem and the diagnostic report to Gemini for analysis.
- Expose diagnostics through a local Flask API.

## Setup

```bash
python -m pip install -r requirements.txt
```

Set your Gemini API key as an environment variable. Never commit an API key to GitHub.

Linux/macOS:

```bash
export GEMINI_API_KEY="YOUR_KEY"
```

Windows PowerShell:

```powershell
$env:GEMINI_API_KEY="YOUR_KEY"
```

Install Android SDK Platform-Tools (`adb`) separately and authorize the target phone for debugging.

Run the CLI:

```bash
python otg.py
```

Run the local web API:

```bash
python app.py
```

The first implementation is intentionally diagnostic/read-only. Repair actions will be added only through explicit, validated operations and confirmation for sensitive changes.

## Architecture

```text
Target Android Phone
        |
      ADB
        |
        v
  Python Diagnostic Layer
        |
   +----+----+
   |         |
 Gemini    Flask API
   |         |
   +----+----+
        |
 Technician Dashboard
```
