import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import crypto from "crypto";
import url from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import os from "os";
import { Bonjour } from "bonjour-service";

dotenv.config();

const app = express();
const PORT = 3000;

const bonjour = new Bonjour();
const bonjourService = bonjour.publish({
  name: "AI Android Technician Service",
  type: "otgtech",
  protocol: "tcp",
  port: PORT
});
console.log(`[mDNS] Advertising service _otgtech._tcp.local on port ${PORT}`);

process.on("SIGINT", () => {
  try {
    bonjour.destroy();
  } catch (e) {}
  process.exit();
});
process.on("SIGTERM", () => {
  try {
    bonjour.destroy();
  } catch (e) {}
  process.exit();
});

app.use(express.json());

// Multi-Target State Management
interface RepairAction {
  id: string;
  description: string;
  risk: string;
  reversible: boolean;
  requires_device_confirmation: boolean;
}

interface RepairPlan {
  approval_id: string;
  problem: string;
  summary: string;
  actions: RepairAction[];
  risk: string;
  reversible: boolean;
  confirmation_required: boolean;
  status: string;
  dispatch_status?: string;
}

interface DeviceState {
  device_id: string;
  manufacturer: string;
  model: string;
  android_version: string;
  sdk: string;
  connectionState: "DISCOVERING" | "FOUND" | "CONNECTING" | "PAIRING_REQUIRED" | "AUTHENTICATING" | "CONNECTED" | "DISCONNECTED" | "RECONNECTING" | "ERROR";
  pairingState: "REQUIRED" | "PENDING" | "PAIRED";
  diagnosticState: "READY" | "COLLECTING" | "COMPLETED";
  screenSessionActive: boolean;
  repairState: "READY" | "PENDING" | "APPROVED" | "DISPATCHED" | "COMPLETED" | "FAILED";
  lastSeen: number;
  batteryLevel?: number;
  storageUsedPercent?: number;
  network?: any;
  diagnosticReport?: any;
  aiAnalysis?: any;
  pairingPin?: string;
  lastScreenFrame?: Buffer | null;
  ws?: WebSocket | null;
}

const devices = new Map<string, DeviceState>();
const socketToDeviceId = new Map<WebSocket, string>();
const viewerClients = new Set<WebSocket>();
const viewerSubscribers = new Map<WebSocket, string>(); // viewer socket -> device_id subscription

const repairPlans = new Map<string, RepairPlan>();

const BLOCKED_ACTIONS = new Set([
  "arbitrary_shell",
  "security_bypass",
  "credential_access",
  "lockscreen_bypass",
  "silent_factory_reset",
]);

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY || "";
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Redact sensitive patterns helper
function redactSensitive(text: string): string {
  const patterns = [
    /(password|passwd|token|secret|api[-_]?key)\s*[:=]\s*\S+/gi,
    /\bBearer\s+[A-Za-z0-9._-]+/gi,
  ];
  let redacted = text;
  for (const pattern of patterns) {
    redacted = redacted.replace(pattern, (match, p1) => {
      return p1 ? `${p1}: [REDACTED]` : "[REDACTED]";
    });
  }
  return redacted;
}

// Broadcast helper
function broadcastToViewers(data: string | Buffer, isBinary: boolean = false) {
  for (const client of viewerClients) {
    if (client.readyState === WebSocket.OPEN) {
      if (isBinary) {
        client.send(data, { binary: true });
      } else {
        client.send(data);
      }
    }
  }
}

// Broadcast active device state updates
function broadcastDevicesUpdate() {
  const payload = JSON.stringify({
    type: "devices_update",
    devices: Array.from(devices.values()).map(d => ({
      device_id: d.device_id,
      manufacturer: d.manufacturer,
      model: d.model,
      android_version: d.android_version,
      sdk: d.sdk,
      connectionState: d.connectionState,
      pairingState: d.pairingState,
      diagnosticState: d.diagnosticState,
      screenSessionActive: d.screenSessionActive,
      repairState: d.repairState,
      lastSeen: d.lastSeen,
      batteryLevel: d.batteryLevel,
      storageUsedPercent: d.storageUsedPercent,
      network: d.network,
      diagnosticReport: d.diagnosticReport,
      aiAnalysis: d.aiAnalysis,
      pairingPin: d.pairingPin
    }))
  });
  broadcastToViewers(payload);
}

// Get primary fallback active device ID
function getActiveDeviceId(): string {
  for (const [id, dev] of devices.entries()) {
    if (dev.connectionState === "CONNECTED" && dev.pairingState === "PAIRED") {
      return id;
    }
  }
  for (const [id, dev] of devices.entries()) {
    if (dev.ws && dev.ws.readyState === WebSocket.OPEN) {
      return id;
    }
  }
  let newestId = "";
  let newestTime = 0;
  for (const [id, dev] of devices.entries()) {
    if (dev.lastSeen > newestTime) {
      newestTime = dev.lastSeen;
      newestId = id;
    }
  }
  return newestId;
}

// --- API ROUTES ---

// GET /api/health
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "ai-android-technician", version: "6" });
});

// GET /api/network-status
app.get("/api/network-status", (req, res) => {
  const interfaces = os.networkInterfaces();
  const results: any[] = [];
  for (const [name, info] of Object.entries(interfaces)) {
    if (!info) continue;
    for (const addr of info) {
      if (addr.family === "IPv4") {
        results.push({
          interface: name,
          ip: addr.address,
          netmask: addr.netmask,
          internal: addr.internal
        });
      }
    }
  }
  res.json({
    hotspot_detected: results.some(i => i.interface.includes("wlan") || i.interface.includes("ap")),
    interfaces: results,
    timestamp: Date.now()
  });
});

// GET /api/devices (List all connected/historic target devices)
app.get("/api/devices", (req, res) => {
  const list = Array.from(devices.values()).map(d => ({
    device_id: d.device_id,
    manufacturer: d.manufacturer,
    model: d.model,
    android_version: d.android_version,
    sdk: d.sdk,
    connectionState: d.connectionState,
    pairingState: d.pairingState,
    diagnosticState: d.diagnosticState,
    screenSessionActive: d.screenSessionActive,
    repairState: d.repairState,
    lastSeen: d.lastSeen,
    batteryLevel: d.batteryLevel,
    storageUsedPercent: d.storageUsedPercent,
    network: d.network,
    diagnosticReport: d.diagnosticReport,
    aiAnalysis: d.aiAnalysis,
    pairingPin: d.pairingPin
  }));
  res.json({ devices: list });
});

// DELETE /api/device/:device_id (Delete historic/offline device)
app.delete("/api/device/:device_id", (req, res) => {
  const { device_id } = req.params;
  const dev = devices.get(device_id);
  if (dev) {
    if (dev.ws) {
      try { dev.ws.close(); } catch (e) {}
    }
    devices.delete(device_id);
    broadcastDevicesUpdate();
    return res.json({ success: true, message: "Device profile removed." });
  }
  res.status(404).json({ error: "Device not found." });
});

// POST /api/device/:device_id/pair/initiate (Generate pairing pin and send security challenge)
app.post("/api/device/:device_id/pair/initiate", (req, res) => {
  const { device_id } = req.params;
  const dev = devices.get(device_id);
  if (!dev || !dev.ws || dev.ws.readyState !== WebSocket.OPEN) {
    return res.status(404).json({ error: "Device not active or connected." });
  }

  const pin = Math.floor(1000 + Math.random() * 9000).toString();
  dev.pairingPin = pin;
  dev.pairingState = "PENDING";
  dev.connectionState = "AUTHENTICATING";

  try {
    dev.ws.send(JSON.stringify({
      type: "pairing_challenge",
      pin: pin
    }));
    broadcastDevicesUpdate();
    res.json({ success: true, pin });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to dispatch pairing challenge: " + err.message });
  }
});

// POST /api/device/:device_id/pair/confirm (Match PIN from Master and mark as paired)
app.post("/api/device/:device_id/pair/confirm", (req, res) => {
  const { device_id } = req.params;
  const { pin } = req.body;
  const dev = devices.get(device_id);
  if (!dev) {
    return res.status(404).json({ error: "Device not registered." });
  }
  if (dev.pairingPin && dev.pairingPin === String(pin).trim()) {
    dev.pairingState = "PAIRED";
    dev.connectionState = "CONNECTED";
    dev.pairingPin = undefined; // clear pin after success
    broadcastDevicesUpdate();
    return res.json({ success: true });
  }
  res.status(400).json({ error: "Incorrect Pairing Code." });
});

// POST /api/device/:device_id/unpair (Reset pairing state)
app.post("/api/device/:device_id/unpair", (req, res) => {
  const { device_id } = req.params;
  const dev = devices.get(device_id);
  if (dev) {
    dev.pairingState = "REQUIRED";
    dev.connectionState = "PAIRING_REQUIRED";
    broadcastDevicesUpdate();
    return res.json({ success: true });
  }
  res.status(404).json({ error: "Device not registered." });
});

// GET /api/target/status (Backward compatibility endpoint)
app.get("/api/target/status", (req, res) => {
  const activeId = getActiveDeviceId();
  if (!activeId) {
    return res.json({ connected: false, message: "waiting_for_target" });
  }
  const dev = devices.get(activeId)!;
  const payload: any = {
    connected: dev.connectionState === "CONNECTED" && dev.pairingState === "PAIRED",
    device_id: dev.device_id,
    manufacturer: dev.manufacturer,
    model: dev.model,
    android_version: dev.android_version,
    sdk: dev.sdk,
    connectionState: dev.connectionState,
    pairingState: dev.pairingState,
    diagnosticState: dev.diagnosticState,
    report: dev.diagnosticReport,
    ai_analysis: dev.aiAnalysis,
    message: dev.connectionState === "CONNECTED" ? "target_connected" : "waiting_for_target"
  };
  res.json(payload);
});

// GET /api/diagnostics
app.get("/api/diagnostics", (req, res) => {
  const activeId = getActiveDeviceId();
  if (activeId) {
    const dev = devices.get(activeId)!;
    if (dev.diagnosticReport) {
      return res.json(dev.diagnosticReport);
    }
  }
  res.status(404).json({ error: "No diagnostics report collected yet." });
});

// POST /api/diagnostics/request (Request diagnostic report)
app.post("/api/diagnostics/request", (req, res) => {
  const { problem, device_id } = req.body;
  const targetId = device_id || getActiveDeviceId();
  if (!targetId) {
    return res.status(503).json({ error: "No device connected." });
  }
  const dev = devices.get(targetId);
  if (!dev || !dev.ws || dev.ws.readyState !== WebSocket.OPEN) {
    return res.status(503).json({ error: "Selected companion offline." });
  }
  if (dev.pairingState !== "PAIRED") {
    return res.status(403).json({ error: "Device pairing required." });
  }

  if (!problem || typeof problem !== "string" || !problem.trim()) {
    return res.status(400).json({ error: "problem is required" });
  }

  const requestId = crypto.randomBytes(8).toString("hex");
  const payload = {
    type: "diagnostic_request",
    request_id: requestId,
    problem: problem.trim(),
    timestamp: Date.now(),
  };

  try {
    dev.ws.send(JSON.stringify(payload));
    dev.diagnosticState = "COLLECTING";
    broadcastDevicesUpdate();
    res.json({ ok: true, request_id: requestId });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to transmit request: " + err.message });
  }
});

// POST /api/diagnostics/analyze (AI diagnostics analysis)
app.post("/api/diagnostics/analyze", async (req, res) => {
  const { problem, report, device_id } = req.body;
  const targetId = device_id || getActiveDeviceId();
  const dev = targetId ? devices.get(targetId) : null;
  const targetReport = report || (dev ? dev.diagnosticReport : null);

  if (!problem || typeof problem !== "string" || !problem.trim()) {
    return res.status(400).json({ error: "problem is required" });
  }
  if (!targetReport) {
    return res.status(409).json({ error: "No diagnostic report is available yet" });
  }

  if (!ai) {
    const backupResult = {
      status: "ai_unavailable",
      message: "GEMINI_API_KEY is not configured. The diagnostic report is still available.",
    };
    if (dev) {
      dev.aiAnalysis = backupResult;
      broadcastDevicesUpdate();
    }
    return res.json(backupResult);
  }

  try {
    const safeReport = redactSensitive(JSON.stringify(targetReport, null, 2));
    const prompt = `
You are an expert Android diagnostic engineer reviewing client telemetry evidence.
Technician problem: ${problem.trim()}

Telemetry checklist data:
${safeReport}

Analyze the data and return a professional diagnostic assessment structure containing:
- **Summary**: Key observation.
- **Root Cause Categorization**:
  - [Software Issue]: analysis
  - [Configuration Issue]: analysis
  - [Carrier/Network Link]: analysis
  - [Possible Hardware Degradation]: analysis
- **Likely Causes**: Ranked items.
- **Verification steps / Next Safe Checks**.
- **Repair feasibility**: yes/no/unknown
- **Safety Risk Assessment**: low/medium/high
- **User Permission Requirements**: yes/no

Only base reasoning on explicit telemetry metrics. Do not suggest arbitrary terminal commands.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
    });

    const text = response.text || "No response received.";
    const analysisResult = {
      status: "ok",
      message: text.trim(),
    };

    if (dev) {
      dev.aiAnalysis = analysisResult;
      broadcastDevicesUpdate();
    }

    res.json(analysisResult);
  } catch (err: any) {
    res.status(500).json({ error: "AI diagnostics call failed: " + err.message });
  }
});

// POST /api/repair/requests (creates a plan)
app.post("/api/repair/requests", (req, res) => {
  const { problem, summary, actions, device_id } = req.body;
  const targetId = device_id || getActiveDeviceId();
  if (!problem || !summary) {
    return res.status(400).json({ error: "problem and summary are required" });
  }

  const approvalId = crypto.randomBytes(4).toString("hex");
  const processedActions: RepairAction[] = [];

  const rawActions = Array.isArray(actions) ? actions : [];
  rawActions.forEach((raw: any, index: number) => {
    if (!raw || typeof raw !== "object") return;
    const actionId = String(raw.id || `act_${index}`).trim();
    const description = String(raw.description || "Standard diagnostic adjustment").trim();
    if (!actionId || !description) return;

    const lowered = `${actionId} ${description}`.toLowerCase();
    if (
      BLOCKED_ACTIONS.has(actionId) ||
      lowered.includes("security bypass") ||
      lowered.includes("credential access") ||
      lowered.includes("lockscreen bypass") ||
      lowered.includes("silent factory reset")
    ) {
      return; // filter out unsafe actions
    }

    let risk = String(raw.risk || "high").toLowerCase();
    if (risk !== "low" && risk !== "medium" && risk !== "high") {
      risk = "high";
    }
    const reversible = Boolean(raw.reversible !== false);
    let requiresConfirmation = Boolean(raw.requires_device_confirmation || raw.confirmation_required);
    if (risk === "high" || !reversible) {
      requiresConfirmation = true;
    }

    processedActions.push({
      id: actionId,
      description,
      risk,
      reversible,
      requires_device_confirmation: requiresConfirmation,
    });
  });

  const plan: RepairPlan = {
    approval_id: approvalId,
    problem: String(problem),
    summary: String(summary),
    actions: processedActions,
    risk: processedActions.some((a) => a.risk === "high") ? "high" : "medium",
    reversible: processedActions.every((a) => a.reversible),
    confirmation_required: true,
    status: "pending",
  };

  repairPlans.set(approvalId, plan);
  res.status(201).json(plan);
});

// GET /api/repair/:approval_id
app.get("/api/repair/:approval_id", (req, res) => {
  const { approval_id } = req.params;
  const plan = repairPlans.get(approval_id);
  if (!plan) {
    return res.status(404).json({ error: "approval request not found" });
  }
  res.json(plan);
});

// POST /api/repair/:approval_id/decision
app.post("/api/repair/:approval_id/decision", (req, res) => {
  const { approval_id } = req.params;
  const { approved, device_id } = req.body;
  const targetId = device_id || getActiveDeviceId();

  if (typeof approved !== "boolean") {
    return res.status(400).json({ error: "approved must be a boolean" });
  }

  const plan = repairPlans.get(approval_id);
  if (!plan) {
    return res.status(404).json({ error: "approval request not found" });
  }
  if (plan.status !== "pending") {
    return res.status(409).json({ error: `approval is already ${plan.status}` });
  }

  if (!approved) {
    plan.status = "rejected";
    repairPlans.set(approval_id, plan);
    return res.json(plan);
  }

  const dev = targetId ? devices.get(targetId) : null;
  if (!dev || !dev.ws || dev.ws.readyState !== WebSocket.OPEN) {
    plan.status = "failed";
    repairPlans.set(approval_id, plan);
    return res.status(503).json({
      error: "No connected companion is available for target ID: " + targetId,
      approval_id,
      status: "failed",
    });
  }

  if (dev.pairingState !== "PAIRED") {
    return res.status(403).json({ error: "Device pairing is required prior to repair dispatch." });
  }

  try {
    const payload = {
      type: "repair_request",
      approval_id: plan.approval_id,
      actions: plan.actions,
      risk: plan.risk,
      confirmation_required: true,
    };

    dev.ws.send(JSON.stringify(payload));
    plan.status = "approved";
    dev.repairState = "DISPATCHED";
    repairPlans.set(approval_id, plan);
    broadcastDevicesUpdate();

    res.json({
      ...plan,
      dispatch_status: "sent_to_companion",
    });
  } catch (err: any) {
    plan.status = "failed";
    repairPlans.set(approval_id, plan);
    res.status(500).json({ error: "Failed to dispatch repair action: " + err.message });
  }
});

// --- CLIENT STATIC ASSET SERVING ---

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Set up WebSocket route multiplexing
server.on("upgrade", (request, socket, head) => {
  const pathname = url.parse(request.url || "").pathname;

  if (pathname === "/ws/companion" || pathname === "/ws/viewer") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// WebSocket connections handling
wss.on("connection", (ws, request) => {
  const pathname = url.parse(request.url || "").pathname;

  if (pathname === "/ws/companion") {
    console.log("[WS] Companion socket connected");
    
    // Assign a temporary ID before we receive handshake
    const tempId = `TEMP_${Date.now()}`;
    socketToDeviceId.set(ws, tempId);
    
    devices.set(tempId, {
      device_id: tempId,
      manufacturer: "Android",
      model: "Companion",
      android_version: "Detecting...",
      sdk: "Detecting...",
      connectionState: "CONNECTING",
      pairingState: "REQUIRED",
      diagnosticState: "READY",
      screenSessionActive: false,
      repairState: "READY",
      lastSeen: Date.now(),
      ws: ws
    });

    broadcastDevicesUpdate();

    ws.on("message", (message, isBinary) => {
      if (isBinary) {
        const deviceId = socketToDeviceId.get(ws);
        if (deviceId) {
          const d = devices.get(deviceId);
          if (d) {
            d.lastScreenFrame = message as Buffer;
            d.lastSeen = Date.now();
          }
          // Forward screenshot buffer to subscribed viewers
          for (const viewer of viewerClients) {
            const subId = viewerSubscribers.get(viewer) || getActiveDeviceId();
            if (subId === deviceId && viewer.readyState === WebSocket.OPEN) {
              viewer.send(message, { binary: true });
            }
          }
        }
      } else {
        const text = message.toString();
        let event: any;
        try {
          event = JSON.parse(text);
        } catch {
          event = { type: "event", message: text };
        }

        const deviceId = socketToDeviceId.get(ws);
        if (deviceId) {
          const d = devices.get(deviceId);
          if (d) {
            d.lastSeen = Date.now();

            // Handshake message: identify actual device characteristics
            if (event.type === "handshake") {
              const realId = event.device_id || deviceId;
              socketToDeviceId.set(ws, realId);
              devices.delete(deviceId); // remove temporary ID key

              let existing = devices.get(realId);
              if (!existing) {
                existing = {
                  device_id: realId,
                  manufacturer: event.manufacturer || "Android",
                  model: event.model || "Device",
                  android_version: event.android_version || "Unknown",
                  sdk: event.sdk || "Unknown",
                  connectionState: "PAIRING_REQUIRED",
                  pairingState: "REQUIRED",
                  diagnosticState: "READY",
                  screenSessionActive: true,
                  repairState: "READY",
                  lastSeen: Date.now(),
                  ws: ws
                };
              } else {
                existing.manufacturer = event.manufacturer || existing.manufacturer;
                existing.model = event.model || existing.model;
                existing.android_version = event.android_version || existing.android_version;
                existing.sdk = event.sdk || existing.sdk;
                existing.ws = ws;
                existing.lastSeen = Date.now();
                existing.connectionState = existing.pairingState === "PAIRED" ? "CONNECTED" : "PAIRING_REQUIRED";
              }

              devices.set(realId, existing);
              broadcastDevicesUpdate();
              return;
            }

            if (event.type === "diagnostic_report" || event.checks) {
              d.diagnosticReport = event;
              d.diagnosticState = "COMPLETED";
            }

            if (event.type === "status") {
              if (event.message === "screen_sharing_started") {
                d.screenSessionActive = true;
              }
            }

            // Extract level percent if present in diagnostics/status
            if (event.battery?.level_percent !== undefined) {
              d.batteryLevel = event.battery.level_percent;
            }
            if (event.storage?.used_percent !== undefined) {
              d.storageUsedPercent = event.storage.used_percent;
            }
            if (event.network) {
              d.network = event.network;
            }

            // Forward text messages to subscribed viewers
            for (const viewer of viewerClients) {
              const subId = viewerSubscribers.get(viewer) || getActiveDeviceId();
              if (subId === deviceId && viewer.readyState === WebSocket.OPEN) {
                viewer.send(text);
              }
            }
          }
        }
      }
    });

    ws.on("close", () => {
      const deviceId = socketToDeviceId.get(ws);
      console.log(`[WS] Companion disconnected: ${deviceId}`);
      if (deviceId) {
        const d = devices.get(deviceId);
        if (d) {
          d.connectionState = "DISCONNECTED";
          d.screenSessionActive = false;
          d.ws = null;
        }
      }
      socketToDeviceId.delete(ws);
      broadcastDevicesUpdate();
    });

    ws.on("error", (err) => {
      console.error("[WS] Companion socket error:", err);
      ws.close();
    });

  } else if (pathname === "/ws/viewer") {
    console.log("[WS] Viewer connected");
    viewerClients.add(ws);

    // Bootstrap subscriber state with active device if available
    const activeId = getActiveDeviceId();
    if (activeId) {
      viewerSubscribers.set(ws, activeId);
      const d = devices.get(activeId)!;
      if (d.lastScreenFrame) {
        ws.send(d.lastScreenFrame, { binary: true });
      }
      if (d.diagnosticReport) {
        ws.send(JSON.stringify(d.diagnosticReport));
      }
    }

    // Send initial bootstrap devices list
    ws.send(JSON.stringify({
      type: "devices_update",
      devices: Array.from(devices.values()).map(d => ({
        device_id: d.device_id,
        manufacturer: d.manufacturer,
        model: d.model,
        android_version: d.android_version,
        sdk: d.sdk,
        connectionState: d.connectionState,
        pairingState: d.pairingState,
        diagnosticState: d.diagnosticState,
        screenSessionActive: d.screenSessionActive,
        repairState: d.repairState,
        lastSeen: d.lastSeen,
        batteryLevel: d.batteryLevel,
        storageUsedPercent: d.storageUsedPercent,
        network: d.network,
        diagnosticReport: d.diagnosticReport,
        aiAnalysis: d.aiAnalysis,
        pairingPin: d.pairingPin
      }))
    }));

    ws.on("message", (msg) => {
      try {
        const event = JSON.parse(msg.toString());
        if (event.type === "subscribe" && event.device_id) {
          viewerSubscribers.set(ws, event.device_id);
          const d = devices.get(event.device_id);
          if (d) {
            if (d.lastScreenFrame) {
              ws.send(d.lastScreenFrame, { binary: true });
            }
            if (d.diagnosticReport) {
              ws.send(JSON.stringify(d.diagnosticReport));
            }
          }
        }
      } catch (e) {}
    });

    ws.on("close", () => {
      viewerClients.delete(ws);
      viewerSubscribers.delete(ws);
      console.log("[WS] Viewer disconnected");
    });

    ws.on("error", (err) => {
      console.error("[WS] Viewer socket error:", err);
      viewerClients.delete(ws);
      viewerSubscribers.delete(ws);
    });
  }
});

// Vite / static file middleware logic for frontend
if (process.env.NODE_ENV !== "production") {
  import("vite").then(async ({ createServer: createViteServer }) => {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Fallback SPA routing
    app.use("*", (req, res, next) => {
      vite.middlewares(req, res, next);
    });
  });
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
