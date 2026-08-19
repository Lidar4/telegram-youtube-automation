# Android Companion

This app is the target-device side of the AI Android Technician system.

## First milestone

The companion app is intentionally permission-driven. It does not silently enable Wireless Debugging, bypass Android security, or obtain hidden device access.

Flow:

1. Target phone joins the technician phone's hotspot/local network.
2. User opens this companion app.
3. The app shows the permissions/capabilities it needs and asks Android for only the permissions supported by the platform and required by the feature.
4. The app exposes a small local diagnostic service to the technician dashboard after the user explicitly starts/authorizes it.
5. The technician dashboard can request read-only diagnostics.

The companion is designed to work alongside ADB when an authorized ADB connection is available. It is not a replacement for Android's security model.

## Planned diagnostic contract

`GET /health` — connection/service status.

`GET /diagnostics` — non-sensitive, read-only device diagnostics available to the companion app.

Future repair endpoints will be added only for actions that Android permits safely and will require explicit user confirmation where appropriate.
