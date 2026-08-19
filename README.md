# AI-Powered Android OTG & Web Controller

AI-assisted Android diagnostics for technicians using ADB, Gemini, and a local Flask dashboard.

## Current foundation

- Detect authorized ADB devices.
- Collect broad, read-only device diagnostics.
- Accept a technician's problem in natural language.
- Send the supplied evidence to Gemini for ranked analysis and next safe checks.
- Provide a simple browser dashboard for diagnostics and questions.
- Keep AI-generated shell commands out of the execution path.

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

Install Android SDK Platform-Tools (`adb`) separately. The target phone must be authorized for debugging; a hotspot connection alone does not grant ADB access on modern Android.

## Run the CLI

```bash
python otg.py
```

## Run the technician dashboard

For the same machine:

```bash
python app.py
```

For a local network/hotspot connection, expose Flask on the machine's network interface:

```bash
OTG_HOST=0.0.0.0 python app.py
```

Then open the host machine's local IP address on the technician browser.

## Safety model

The first implementation is intentionally diagnostic/read-only. Gemini does not produce raw shell commands for automatic execution. Future repair actions will use an explicit allowlist, validation, and confirmation for sensitive changes.

The system can only inspect information that Android/ADB exposes to an authorized connection. Hardware faults, carrier-side problems, or protected Android state may require a manual technician check.

## Architecture

```text
Target Android Phone
        |
      ADB / authorized connection
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

## Next stages

1. Improve diagnostic collectors and normalize results.
2. Add a richer technician dashboard.
3. Build an Android companion app for the supported, user-approved device access flow.
4. Add validated repair actions with confirmation.
5. Add optional remote/public access only after the local workflow is stable.
