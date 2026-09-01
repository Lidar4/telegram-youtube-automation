import React, { useState, useEffect, useRef } from "react";
import { 
  Smartphone, 
  Cpu, 
  Battery, 
  Wifi, 
  HardDrive, 
  ShieldAlert, 
  CheckCircle, 
  XCircle, 
  Play, 
  RefreshCw, 
  Send, 
  AlertTriangle, 
  Loader2, 
  Plus, 
  Trash2, 
  Lock, 
  Unlock, 
  Key, 
  ListOrdered, 
  Terminal, 
  Pause, 
  Activity,
  Tv,
  Info,
  Layers,
  Settings,
  Radio,
  Database,
  Flame,
  Zap,
  Check,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Real device model
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
  network?: {
    connected: boolean;
    transport_wifi: boolean;
    transport_cellular: boolean;
    validated?: boolean;
  };
  diagnosticReport?: {
    checks?: Array<{
      name: string;
      status: string;
      value?: string | null;
      error?: string | null;
    }>;
  };
  aiAnalysis?: {
    status: string;
    message: string;
  };
  pairingPin?: string;
}

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

export default function App() {
  // Mode selection: REAL vs SIMULATION
  const [isSimulationMode, setIsSimulationMode] = useState<boolean>(true);

  // --- REAL DEVICE STATE CORES ---
  const [devices, setDevices] = useState<DeviceState[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [networkStatus, setNetworkStatus] = useState<any>(null);
  
  // Real active device pointer
  const realActiveDevice = devices.find(d => d.device_id === selectedDeviceId);

  // Real Screen Stream State
  const [screenFrameUrl, setScreenFrameUrl] = useState<string | null>(null);
  const [screenStreamActive, setScreenStreamActive] = useState<boolean>(true);
  const [screenEventMsg, setScreenEventMsg] = useState<string>("Waiting for viewport frame...");

  // Real Pairing State
  const [verificationPin, setVerificationPin] = useState<string>("");
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingSuccess, setPairingSuccess] = useState<boolean>(false);

  // Real Diagnostic symptom state
  const [problem, setProblem] = useState<string>("");
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  // Real repair plan state
  const [approvalId, setApprovalId] = useState<string>("");
  const [repairPlan, setRepairPlan] = useState<RepairPlan | null>(null);
  const [repairPlanError, setRepairPlanError] = useState<string | null>(null);
  const [isSubmittingPlan, setIsSubmittingPlan] = useState<boolean>(false);

  const [customProblem, setCustomProblem] = useState<string>("");
  const [customSummary, setCustomSummary] = useState<string>("");
  const [customActions, setCustomActions] = useState<Array<Partial<RepairAction>>>([
    { id: "open_network_settings", description: "Launch default wireless settings screen for carrier validation", risk: "low", reversible: true, requires_device_confirmation: false }
  ]);

  const [activeTab, setActiveTab] = useState<"diagnostics" | "repairs">("diagnostics");

  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);


  // --- SIMULATED DEVICE STATE CORES (Preview Mode) ---
  const [simDevice, setSimDevice] = useState<DeviceState>({
    device_id: "SIM-GALAXY-35-X99",
    manufacturer: "Samsung",
    model: "Galaxy Test Device",
    android_version: "15",
    sdk: "35",
    connectionState: "DISCONNECTED",
    pairingState: "REQUIRED",
    diagnosticState: "READY",
    screenSessionActive: false,
    repairState: "READY",
    lastSeen: Date.now(),
    batteryLevel: 82,
    storageUsedPercent: 45,
    network: {
      connected: true,
      transport_wifi: true,
      transport_cellular: false,
      validated: true,
    },
    diagnosticReport: undefined,
    aiAnalysis: undefined,
    pairingPin: undefined,
  });

  const [simLogs, setSimLogs] = useState<Array<{ timestamp: string; message: string; type: "info" | "success" | "warn" | "error" }>>([
    { timestamp: new Date().toLocaleTimeString(), message: "Simulation Environment ready.", type: "info" },
    { timestamp: new Date().toLocaleTimeString(), message: "Toggle 'Preview Simulation Mode' at the top to test browser controls.", type: "info" }
  ]);

  const [simVerificationPin, setSimVerificationPin] = useState<string>("");
  const [simGeneratedPin, setSimGeneratedPin] = useState<string | null>(null);
  const [simPairingError, setSimPairingError] = useState<string | null>(null);
  const [simProblem, setSimProblem] = useState<string>("");
  const [simAiLoading, setSimAiLoading] = useState<boolean>(false);

  // Simulated live animators (updates dynamically every 800ms)
  const [simTick, setSimTick] = useState<number>(0);
  const [simCarrierSignal, setSimCarrierSignal] = useState<number>(-62);
  const [simCpuTemp, setSimCpuTemp] = useState<number>(37.4);

  // Simulated repair dispatch state
  const [simRepairPlan, setSimRepairPlan] = useState<RepairPlan | null>(null);
  const [simRepairState, setSimRepairState] = useState<string>("READY");

  // Add Simulated logs helper
  const addSimLog = (msg: string, type: "info" | "success" | "warn" | "error" = "info") => {
    setSimLogs((prev) => [
      { timestamp: new Date().toLocaleTimeString(), message: msg, type },
      ...prev
    ]);
  };

  // --- EFFECTS FOR SIMULATION ANIMATION ---
  useEffect(() => {
    const interval = setInterval(() => {
      setSimTick((t) => t + 1);
      // Sligtly fluctuate metrics to verify the stream updates live
      setSimCarrierSignal(() => -55 - Math.floor(Math.random() * 15));
      setSimCpuTemp(() => parseFloat((36.5 + Math.random() * 2.5).toFixed(1)));
    }, 800);
    return () => clearInterval(interval);
  }, []);

  // --- FETCH REAL WORKSPACE METRICS ---
  const fetchNetworkStatus = async () => {
    try {
      const res = await fetch("/api/network-status");
      const data = await res.json();
      setNetworkStatus(data);
    } catch (err) {
      console.error("Failed to fetch local network interfaces:", err);
    }
  };

  const fetchDevices = async () => {
    try {
      const res = await fetch("/api/devices");
      const data = await res.json();
      setDevices(data.devices || []);
      
      if (!selectedDeviceId && data.devices && data.devices.length > 0) {
        const active = data.devices.find((d: any) => d.connectionState === "CONNECTED" || d.connectionState === "PAIRING_REQUIRED");
        if (active) {
          setSelectedDeviceId(active.device_id);
        } else {
          setSelectedDeviceId(data.devices[0].device_id);
        }
      }
    } catch (err) {
      console.error("Error fetching devices directory:", err);
    }
  };

  useEffect(() => {
    fetchNetworkStatus();
    fetchDevices();

    // Link real WebSocket Multiplexer
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.host;
    const wsUrl = `${protocol}://${host}/ws/viewer`;
    
    console.log("[WS] Connecting Master Multiplexer:", wsUrl);
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setScreenEventMsg("Dashboard linked. Directing multiplexer streams.");
      if (selectedDeviceId) {
        ws.send(JSON.stringify({ type: "subscribe", device_id: selectedDeviceId }));
      }
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        if (!screenStreamActive) return;
        const blob = new Blob([event.data], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        setScreenFrameUrl(url);
        setScreenEventMsg("Live high-fidelity viewport stream");
      } else {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "devices_update" && data.devices) {
            setDevices(data.devices);
          }

          if (data.type === "diagnostic_report" || data.checks) {
            fetchDevices();
          }

          if (data.type === "status" && data.message) {
            setScreenEventMsg(`Target companion event: ${data.message}`);
          }
        } catch (err) {
          console.error("Failed to decode dashboard message:", err);
        }
      }
    };

    ws.onclose = () => {
      console.log("[WS] Viewer connection lost, attempting reconnect...");
      setScreenEventMsg("Stream connection lost. Reconnecting...");
    };

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && selectedDeviceId) {
      wsRef.current.send(JSON.stringify({ type: "subscribe", device_id: selectedDeviceId }));
      setScreenFrameUrl(null);
      setVerificationPin("");
      setGeneratedPin(null);
      setPairingError(null);
    }
  }, [selectedDeviceId]);

  // --- REAL PHONE CONTROLS ---
  const initiateSecurePairing = async () => {
    if (!selectedDeviceId) return;
    setPairingError(null);
    setPairingSuccess(false);
    try {
      const res = await fetch(`/api/device/${encodeURIComponent(selectedDeviceId)}/pair/initiate`, {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) {
        setPairingError(data.error || "Failed to initiate secure pairing challenge.");
      } else {
        setGeneratedPin(data.pin);
      }
    } catch (err: any) {
      setPairingError(err.message || "Network error.");
    }
  };

  const verifyPairingPin = async () => {
    if (!selectedDeviceId || !verificationPin) return;
    setPairingError(null);
    try {
      const res = await fetch(`/api/device/${encodeURIComponent(selectedDeviceId)}/pair/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: verificationPin })
      });
      const data = await res.json();
      if (!res.ok) {
        setPairingError(data.error || "PIN confirmation failed.");
      } else {
        setPairingSuccess(true);
        setGeneratedPin(null);
        setVerificationPin("");
        fetchDevices();
      }
    } catch (err: any) {
      setPairingError(err.message || "Network error during verification.");
    }
  };

  const revokeDeviceTrust = async () => {
    if (!selectedDeviceId) return;
    try {
      await fetch(`/api/device/${encodeURIComponent(selectedDeviceId)}/unpair`, {
        method: "POST"
      });
      fetchDevices();
    } catch (err) {
      console.error("Error revoking trust:", err);
    }
  };

  const removeHistoricDevice = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/device/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      if (res.ok) {
        if (selectedDeviceId === id) {
          setSelectedDeviceId("");
        }
        fetchDevices();
      }
    } catch (err) {
      console.error("Failed to remove device profile:", err);
    }
  };

  const requestOnDeviceDiagnostics = async () => {
    if (!selectedDeviceId || !problem.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/diagnostics/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problem, device_id: selectedDeviceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Diagnostic dispatch request failed.");
        setAiLoading(false);
      } else {
        setScreenEventMsg("Diagnostic requested. Waiting for compiled telemetry...");
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          const checkRes = await fetch("/api/devices");
          const checkData = await checkRes.json();
          const targetDev = checkData.devices.find((d: any) => d.device_id === selectedDeviceId);
          if (targetDev?.diagnosticState === "COMPLETED" || attempts > 12) {
            clearInterval(interval);
            setDevices(checkData.devices);
            setAiLoading(false);
          }
        }, 1500);
      }
    } catch (err: any) {
      console.error(err);
      setAiLoading(false);
    }
  };

  const runAiDiagnostics = async () => {
    if (!selectedDeviceId || !problem.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/diagnostics/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          problem, 
          device_id: selectedDeviceId,
          report: realActiveDevice?.diagnosticReport 
        }),
      });
      const data = await res.json();
      setAiLoading(false);
      fetchDevices();
    } catch (err: any) {
      console.error(err);
      setAiLoading(false);
    }
  };

  const loadRepairPlan = async () => {
    if (!approvalId.trim()) return;
    setRepairPlanError(null);
    try {
      const res = await fetch(`/api/repair/${encodeURIComponent(approvalId)}`);
      const data = await res.json();
      if (!res.ok) {
        setRepairPlanError(data.error || "Plan file retrieval error.");
        setRepairPlan(null);
      } else {
        setRepairPlan(data);
      }
    } catch (err: any) {
      setRepairPlanError(err.message);
    }
  };

  const decideRepairPlan = async (approved: boolean) => {
    if (!repairPlan || !selectedDeviceId) return;
    try {
      const res = await fetch(`/api/repair/${encodeURIComponent(repairPlan.approval_id)}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved, device_id: selectedDeviceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRepairPlanError(data.error || "Decision execution failure.");
      } else {
        setRepairPlan(data);
        setRepairPlanError(null);
        fetchDevices();
      }
    } catch (err: any) {
      setRepairPlanError(err.message);
    }
  };

  const createCustomRepairRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customProblem.trim() || !customSummary.trim() || !selectedDeviceId) {
      alert("Check fields and selected device connection status.");
      return;
    }
    setIsSubmittingPlan(true);
    try {
      const res = await fetch("/api/repair/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem: customProblem,
          summary: customSummary,
          actions: customActions,
          device_id: selectedDeviceId
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRepairPlan(data);
        setApprovalId(data.approval_id);
        setCustomProblem("");
        setCustomSummary("");
        setCustomActions([
          { id: "open_network_settings", description: "Launch default wireless settings screen for carrier validation", risk: "low", reversible: true, requires_device_confirmation: false }
        ]);
        setActiveTab("repairs");
        setRepairPlanError(null);
      } else {
        alert(data.error || "Sequence compilation failed.");
      }
    } catch (err: any) {
      alert("Error compiling plan: " + err.message);
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  const addCustomActionItem = () => {
    setCustomActions([
      ...customActions,
      {
        id: `act_${customActions.length + 1}`,
        description: "",
        risk: "low",
        reversible: true,
        requires_device_confirmation: false,
      },
    ]);
  };

  const removeCustomActionItem = (index: number) => {
    setCustomActions(customActions.filter((_, i) => i !== index));
  };

  const handleActionChange = (index: number, field: keyof RepairAction, value: any) => {
    const updated = [...customActions];
    updated[index] = { ...updated[index], [field]: value };
    setCustomActions(updated);
  };


  // --- SIMULATION HANDLERS (Preview Only Testing Mode) ---
  const runSimConnectionTest = () => {
    setSimDevice((prev) => ({ ...prev, connectionState: "DISCOVERING", screenSessionActive: false }));
    addSimLog("Starting Simulated Target Connection Flow...", "info");
    
    // Discovering -> Found
    setTimeout(() => {
      setSimDevice((prev) => ({ ...prev, connectionState: "FOUND" }));
      addSimLog("[SIM] Target Found: Samsung Galaxy Test Device (SIM-GALAXY-35-X99)", "success");
    }, 1000);

    // Found -> Connecting
    setTimeout(() => {
      setSimDevice((prev) => ({ ...prev, connectionState: "CONNECTING" }));
      addSimLog("[SIM] Establishing secure socket over virtual interface...", "info");
    }, 2000);

    // Connecting -> Pairing Required
    setTimeout(() => {
      setSimDevice((prev) => ({ ...prev, connectionState: "PAIRING_REQUIRED" }));
      addSimLog("[SIM] Target requires authentication. Displaying secure Toast challenge on screen...", "warn");
      // Pre-populate simulated pin
      const mockPin = Math.floor(1000 + Math.random() * 9000).toString();
      setSimGeneratedPin(mockPin);
      addSimLog(`[SIM] Simulated Target Pairing PIN: ${mockPin} (Showing as Overlay on virtual device screen)`, "info");
    }, 3200);
  };

  const verifySimPairingPin = () => {
    setSimPairingError(null);
    if (!simGeneratedPin) {
      setSimPairingError("No pairing PIN has been generated yet.");
      return;
    }
    if (simVerificationPin.trim() === simGeneratedPin) {
      setSimDevice((prev) => ({
        ...prev,
        pairingState: "PAIRED",
        connectionState: "CONNECTED",
        screenSessionActive: true
      }));
      addSimLog("[SIM] Pairing verified successfully! Virtual target is now PAIRED & trusted.", "success");
      setSimVerificationPin("");
    } else {
      setSimPairingError("Incorrect Pairing Code.");
      addSimLog("[SIM] Pairing failed: Pin Mismatch.", "error");
    }
  };

  const runSimDiagnosticsTest = () => {
    if (simDevice.pairingState !== "PAIRED") {
      addSimLog("Cannot run diagnostics: Simulated device is not paired.", "error");
      return;
    }
    setSimDevice((prev) => ({ ...prev, diagnosticState: "COLLECTING" }));
    addSimLog("[SIM] Initiating hardware sensor diagnostic sweep on virtual target...", "info");

    setTimeout(() => {
      setSimDevice((prev) => ({
        ...prev,
        diagnosticState: "COMPLETED",
        diagnosticReport: {
          checks: [
            { name: "Simulated Battery Level", status: "ok", value: "82% Capacity, Temp: 32°C, Optimized" },
            { name: "Simulated Storage Usage", status: "ok", value: "45% used (54GB / 128GB)" },
            { name: "Simulated Wi-Fi Radio", status: "ok", value: "Tech-Hotspot-5G, Signal: -55dBm, Channel: 11" },
            { name: "Simulated Network Validation", status: "ok", value: "Ping Gateway: 8.4ms, IP: 192.168.43.12" },
            { name: "Simulated System Information", status: "ok", value: "Samsung Galaxy Test, SDK: 35, Android: 15" }
          ]
        }
      }));
      addSimLog("[SIM] Simulated Telemetry data compiled successfully.", "success");
    }, 1500);
  };

  const runSimAiDiagnostics = () => {
    if (!simProblem.trim()) {
      addSimLog("Please write a symptom in the symptom form to analyze.", "warn");
      return;
    }
    setSimAiLoading(true);
    addSimLog(`[SIM] Dispatching problem query to local simulation AI module: "${simProblem}"`, "info");

    setTimeout(() => {
      setSimDevice((prev) => ({
        ...prev,
        aiAnalysis: {
          status: "success",
          message: `[SIMULATED AI ANALYSIS]
Primary Cause Identified: Fluctuation in carrier signal strength has caused the transceiver to default to active power-amplification loops.
Telemetry Correlation:
- Battery drain is elevated due to transmitter boost loops.
- CPU Thermals are optimized at ${simCpuTemp}°C, verifying that system drain is not a software thread freeze.
Recommended Remediation Sequences:
1. Dispatch WLAN settings intent (open_network_settings) to offload communications to the local technician hotspot.
2. Clear browser/application network caching bounds.`
        }
      }));
      addSimLog("[SIM] Simulated expert AI analysis compiled successfully.", "success");
      setSimAiLoading(false);
    }, 1200);
  };

  const runSimRepairSequence = () => {
    if (simDevice.pairingState !== "PAIRED") {
      addSimLog("Cannot dispatch repairs: Simulated device is not paired.", "error");
      return;
    }
    setSimRepairState("PENDING");
    addSimLog("[SIM] Preparing custom repair dispatch sequence...", "info");

    setTimeout(() => {
      setSimRepairState("APPROVED");
      addSimLog("[SIM] Technician repair action authorized.", "success");
    }, 800);

    setTimeout(() => {
      setSimRepairState("DISPATCHED");
      addSimLog("[SIM] Sending launch settings request packet to virtual device...", "info");
    }, 1600);

    setTimeout(() => {
      setSimRepairState("EXECUTING");
      addSimLog("[SIM] Executing simulated Settings launch on viewport bezel screen...", "warn");
    }, 2400);

    setTimeout(() => {
      setSimRepairState("COMPLETED");
      addSimLog("[SIM] Simulated action sequence executed perfectly on target frame!", "success");
    }, 3500);
  };

  // --- FAILURE SIMULATION HANDLERS ---
  const simulateDisconnect = () => {
    setSimDevice((prev) => ({
      ...prev,
      connectionState: "DISCONNECTED",
      pairingState: "REQUIRED",
      diagnosticState: "READY",
      screenSessionActive: false,
      repairState: "READY"
    }));
    setSimGeneratedPin(null);
    addSimLog("[SIM FAILURE INJECTION] Target device connection terminated forcefully.", "error");
  };

  const simulateReconnect = () => {
    setSimDevice((prev) => ({
      ...prev,
      connectionState: "RECONNECTING"
    }));
    addSimLog("[SIM] Attempting automatic network reconnection to virtual target...", "info");
    setTimeout(() => {
      setSimDevice((prev) => ({
        ...prev,
        connectionState: "CONNECTED",
        screenSessionActive: true
      }));
      addSimLog("[SIM] Connection restored successfully.", "success");
    }, 1200);
  };

  const simulatePairingFailure = () => {
    setSimDevice((prev) => ({ ...prev, connectionState: "AUTHENTICATING" }));
    addSimLog("[SIM FAILURE INJECTION] Simulating Authentication verification cycle...", "info");
    setTimeout(() => {
      setSimPairingError("Pairing handshake rejected: invalid signature block.");
      addSimLog("[SIM FAILURE INJECTION] Secure pairing match failed.", "error");
    }, 1000);
  };

  const simulateDiagnosticFailure = () => {
    setSimDevice((prev) => ({ ...prev, diagnosticState: "COLLECTING" }));
    addSimLog("[SIM FAILURE INJECTION] Pulling hardware sensors details...", "info");
    setTimeout(() => {
      setSimDevice((prev) => ({
        ...prev,
        diagnosticState: "READY",
        diagnosticReport: {
          checks: [
            { name: "Simulated Battery Level", status: "error", error: "Sensor offline / hardware driver timed out" },
            { name: "Simulated Storage Usage", status: "ok", value: "45% used (54GB / 128GB)" },
            { name: "Simulated Wi-Fi Radio", status: "error", error: "RF Modem rejected response envelope" }
          ]
        }
      }));
      addSimLog("[SIM FAILURE INJECTION] Telemetry scan completed with 2 fatal sensor warnings.", "error");
    }, 1200);
  };

  const simulateRepairFailure = () => {
    setSimRepairState("PENDING");
    addSimLog("[SIM FAILURE INJECTION] Dispatched repair request sequence...", "info");
    setTimeout(() => {
      setSimRepairState("FAILED");
      addSimLog("[SIM FAILURE INJECTION] Command timeout: Device failed to confirm Settings screen launch.", "error");
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] flex flex-col antialiased font-sans">
      
      {/* Header section */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40 px-6 py-4 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs flex items-center justify-center">
              <Cpu className="w-5.5 h-5.5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">AI Android Technician</h1>
              <p className="text-[10px] text-indigo-600 font-bold tracking-wider uppercase">Master Remote Diagnostic Console</p>
            </div>
          </div>

          {/* Mode Switcher panel (REAL vs SIMULATION) */}
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:justify-end">
            <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex items-center gap-1">
              <button
                onClick={() => setIsSimulationMode(false)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  !isSimulationMode 
                    ? "bg-white text-slate-900 shadow-xs" 
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-red-500" />
                <span>Real Device Mode</span>
              </button>
              <button
                onClick={() => setIsSimulationMode(true)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  isSimulationMode 
                    ? "bg-amber-500 text-white shadow-xs" 
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Preview Simulation Mode</span>
              </button>
            </div>

            {/* Network interface display (Only shown in Real mode) */}
            {!isSimulationMode && networkStatus && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 font-medium">
                <Wifi className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  Hotspot: <b>{networkStatus.interfaces.find((i: any) => !i.internal)?.ip || "192.168.43.1"}</b>
                </span>
                {networkStatus.hotspot_detected && (
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}
              </div>
            )}

            <button 
              onClick={() => { fetchDevices(); fetchNetworkStatus(); }}
              className="px-3 py-1.5 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 transition-all flex items-center gap-1.5 text-xs font-bold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Network</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Panel grid */}
      <main className="max-w-7xl w-full mx-auto px-4 md:px-6 py-6 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Hand: Workspace & Forms (8 cols) */}
        <div className="lg:col-span-8 space-y-6">

          {/* SIMULATION INDICATOR STICKY ROW */}
          {isSimulationMode && (
            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 animate-pulse" />
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-amber-800">Preview Simulation Mode Active</h3>
                  <p className="text-[11px] text-amber-700 font-medium">
                    SIMULATED DEVICE — NOT A REAL PHONE. Test the connection, pairing code verification, diagnostics, and settings actions below.
                  </p>
                </div>
              </div>
              <button
                onClick={runSimConnectionTest}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-wider rounded-lg transition-all"
              >
                Run Connection Test
              </button>
            </div>
          )}

          {/* Tab Selection */}
          <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-xs">
            <button
              onClick={() => setActiveTab("diagnostics")}
              className={`flex-1 py-3 px-4 text-xs font-black uppercase tracking-wider rounded-lg transition-all duration-200 ${
                activeTab === "diagnostics" 
                  ? "bg-indigo-600 text-white shadow-sm" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              AI Diagnostics Lab
            </button>
            <button
              onClick={() => setActiveTab("repairs")}
              className={`flex-1 py-3 px-4 text-xs font-black uppercase tracking-wider rounded-lg transition-all duration-200 ${
                activeTab === "repairs" 
                  ? "bg-indigo-600 text-white shadow-sm" 
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              Repair Dispatch Sequences
            </button>
          </div>

          {/* ACTIVE TAB CONTENT */}
          <AnimatePresence mode="wait">
            {activeTab === "diagnostics" ? (
              <motion.div
                key="diagnostics-panel"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="space-y-6"
              >
                {/* 1. DEVICE REGISTRY & AUTH CARDS */}
                {isSimulationMode ? (
                  /* SIMULATED DEVICE REGISTRY CARD */
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                      <div>
                        <h2 className="text-xs font-black uppercase text-slate-400 tracking-widest">Simulated Target Registry</h2>
                        <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5 mt-1">
                          <Smartphone className="w-4 h-4 text-indigo-600" />
                          {simDevice.manufacturer} {simDevice.model}
                        </h3>
                      </div>
                      <span className="text-[9px] font-black text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full uppercase">
                        VIRTUAL SIMULATOR
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 font-mono text-[11px]">
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-[9px] text-slate-400 block mb-0.5">Device ID</span>
                        <span className="font-bold text-slate-900 truncate block">{simDevice.device_id}</span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-[9px] text-slate-400 block mb-0.5">Android / SDK</span>
                        <span className="font-bold text-slate-900 block">v{simDevice.android_version} (API {simDevice.sdk})</span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-[9px] text-slate-400 block mb-0.5">Link State</span>
                        <span className="font-bold text-slate-900 flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            simDevice.connectionState === "CONNECTED" ? "bg-emerald-500" :
                            simDevice.connectionState === "DISCONNECTED" ? "bg-slate-400" : "bg-amber-500 animate-pulse"
                          }`} />
                          {simDevice.connectionState}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <span className="text-[9px] text-slate-400 block mb-0.5">Security Auth</span>
                        <span className={`font-bold uppercase ${simDevice.pairingState === 'PAIRED' ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {simDevice.pairingState}
                        </span>
                      </div>
                    </div>

                    {/* PIN Handshake Section */}
                    {simDevice.pairingState !== "PAIRED" ? (
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                          <div>
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Authorization Pin</span>
                            <p className="text-xs text-slate-500 mt-0.5">PIN is sent as a simulation Overlay. Input code to authorize.</p>
                          </div>
                          {simGeneratedPin ? (
                            <div className="bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg text-xs font-bold text-amber-800 font-mono">
                              Simulated Target PIN: <span className="text-sm font-black tracking-widest">{simGeneratedPin}</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                const pin = Math.floor(1000 + Math.random() * 9000).toString();
                                setSimGeneratedPin(pin);
                                addSimLog(`[SIM] Generated pairing PIN: ${pin}`, "info");
                              }}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-all"
                            >
                              Request Pairing Code
                            </button>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <input
                            type="text"
                            maxLength={4}
                            value={simVerificationPin}
                            onChange={(e) => setSimVerificationPin(e.target.value)}
                            placeholder="Enter PIN shown on Simulator Screen"
                            className="flex-1 bg-white border border-slate-300 rounded-lg px-4 py-2 text-xs text-center font-mono font-bold"
                          />
                          <button
                            onClick={verifySimPairingPin}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-all"
                          >
                            Verify PIN
                          </button>
                        </div>
                        {simPairingError && (
                          <p className="text-xs text-red-600 font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>{simPairingError}</span>
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4.5 h-4.5 text-emerald-600 shrink-0" />
                          <p className="text-xs font-bold">Simulated Security handshakes paired successfully.</p>
                        </div>
                        <button
                          onClick={() => {
                            setSimDevice(prev => ({ ...prev, pairingState: "REQUIRED", connectionState: "DISCONNECTED" }));
                            setSimGeneratedPin(null);
                            addSimLog("[SIM] Pairing revoked.", "info");
                          }}
                          className="px-2.5 py-1 text-[10px] border border-red-200 text-red-700 hover:bg-red-50 font-bold rounded-md uppercase"
                        >
                          Revoke Link
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* REAL DEVICE REGISTRY CARD */
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-indigo-600" />
                        Target Devices Registry
                      </h2>
                      <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-extrabold uppercase">
                        {devices.length} Devices Online/Historic
                      </span>
                    </div>

                    {devices.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                        <Activity className="w-8 h-8 text-slate-400 mx-auto animate-bounce mb-2" />
                        <p className="text-xs font-bold text-slate-600">No Target Devices Detected</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Connect the Target Phone to the Master Hotspot & launch the Companion app.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        {devices.map((dev) => {
                          const isSelected = dev.device_id === selectedDeviceId;
                          const isConnected = dev.connectionState === "CONNECTED";
                          const isPaired = dev.pairingState === "PAIRED";

                          return (
                            <div
                              key={dev.device_id}
                              onClick={() => setSelectedDeviceId(dev.device_id)}
                              className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer relative flex flex-col justify-between ${
                                isSelected 
                                  ? "border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-600/50 shadow-xs" 
                                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                  <div className={`p-2 rounded-lg ${isConnected ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                    <Smartphone className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <h3 className="text-xs font-black text-slate-900">{dev.manufacturer} {dev.model}</h3>
                                    <p className="text-[10px] text-slate-500 font-medium font-mono truncate max-w-[140px]">{dev.device_id}</p>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-1.5">
                                  {isPaired ? (
                                    <span className="text-[9px] font-black uppercase text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-sm border border-emerald-200">Paired</span>
                                  ) : (
                                    <span className="text-[9px] font-black uppercase text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-sm border border-amber-200">Unpaired</span>
                                  )}
                                  <button
                                    onClick={(e) => removeHistoricDevice(dev.device_id, e)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-slate-100 transition-colors"
                                    title="Remove profile"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              <div className="mt-3 border-t border-slate-100 pt-2 flex items-center justify-between text-[10px] font-mono text-slate-500">
                                <span className="font-semibold text-slate-700 uppercase">OS: Android {dev.android_version}</span>
                                <span className="flex items-center gap-1">
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    dev.connectionState === "CONNECTED" ? "bg-emerald-500" :
                                    dev.connectionState === "PAIRING_REQUIRED" ? "bg-amber-500" : "bg-slate-400"
                                  }`} />
                                  {dev.connectionState.replace("_", " ")}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Real secure auth */}
                    {realActiveDevice && (
                      <div className="border-t border-slate-100 pt-4 mt-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-xs font-bold text-slate-800">Secure Pin Handshake</h4>
                          <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md ${realActiveDevice.pairingState === 'PAIRED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                            {realActiveDevice.pairingState}
                          </span>
                        </div>

                        {realActiveDevice.pairingState !== "PAIRED" ? (
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            {!generatedPin ? (
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-700">Request secure pairing connection</span>
                                <button
                                  onClick={initiateSecurePairing}
                                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
                                >
                                  Generate Security PIN
                                </button>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 p-4 rounded-lg">
                                  <div>
                                    <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider block">Security Pin Generated</span>
                                    <span className="text-2xl font-black font-mono text-indigo-950 tracking-widest">{generatedPin}</span>
                                  </div>
                                  <p className="text-[11px] text-indigo-600 max-w-[280px] text-center sm:text-left leading-relaxed font-medium">
                                    This PIN is showing on the target device screen as a Toast. Type the PIN on the right to link securely.
                                  </p>
                                </div>

                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    maxLength={4}
                                    value={verificationPin}
                                    onChange={(e) => setVerificationPin(e.target.value)}
                                    placeholder="Enter 4-Digit PIN"
                                    className="flex-1 border border-slate-300 rounded-lg px-4 py-2 text-sm text-center font-mono font-bold uppercase"
                                  />
                                  <button
                                    onClick={verifyPairingPin}
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
                                  >
                                    Verify & Match
                                  </button>
                                </div>
                              </div>
                            )}

                            {pairingError && (
                              <p className="mt-2 text-xs font-bold text-rose-600 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>{pairingError}</span>
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50/40">
                            <div className="flex items-center gap-2.5 text-emerald-900">
                              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                              <div>
                                <p className="text-xs font-black">Authorized Remote Diagnostic Link Active</p>
                                <p className="text-[10px] text-emerald-700 font-medium">Pairing authenticated. Safe actions are fully authorized.</p>
                              </div>
                            </div>
                            <button
                              onClick={revokeDeviceTrust}
                              className="px-3.5 py-1.5 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-lg text-[10px] font-extrabold uppercase transition-all"
                            >
                              Revoke Authorization
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. SYMPTOM ANALYZER & AI SUMMARY CARDS */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-600" />
                    AI Causal Diagnostics
                  </h3>

                  <p className="text-xs text-slate-500 leading-relaxed">
                    Formulate the symptom or problem statement below to trigger a hardware sensor audit and generate an expert causal matrix.
                  </p>

                  <textarea
                    value={isSimulationMode ? simProblem : problem}
                    onChange={(e) => isSimulationMode ? setSimProblem(e.target.value) : setProblem(e.target.value)}
                    placeholder="Describe device symptom, e.g. Battery drains rapidly, or WiFi adapter drops carrier network connections..."
                    className="w-full min-h-[90px] border border-slate-300 rounded-xl p-3.5 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />

                  {isSimulationMode ? (
                    /* SIMULATION DISPATCH TRIGGERS */
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={runSimDiagnosticsTest}
                        disabled={simDevice.pairingState !== "PAIRED"}
                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50 transition-all font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 border border-slate-200"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Run Diagnostic Test (Simulated)</span>
                      </button>

                      <button
                        onClick={runSimAiDiagnostics}
                        disabled={simAiLoading || !simProblem.trim()}
                        className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-all font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        {simAiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        <span>Analyze with AI (Simulation)</span>
                      </button>
                    </div>
                  ) : (
                    /* REAL DISPATCH TRIGGERS */
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={requestOnDeviceDiagnostics}
                        disabled={aiLoading || realActiveDevice?.pairingState !== "PAIRED"}
                        className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50 transition-all font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 border border-slate-200"
                      >
                        {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5" />}
                        <span>Collect On-Device Telemetry</span>
                      </button>

                      <button
                        onClick={runAiDiagnostics}
                        disabled={aiLoading || !problem.trim()}
                        className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-all font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        <span>Execute Gemini Diagnostics Analysis</span>
                      </button>
                    </div>
                  )}

                  {/* AI Diagnosis Output */}
                  {isSimulationMode ? (
                    simDevice.aiAnalysis && (
                      <div className="mt-5 border-t border-slate-100 pt-5">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                            SIMULATED AI ANALYSIS
                          </h4>
                        </div>
                        <div className="p-4 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 font-mono text-[11px] leading-relaxed max-h-[350px] overflow-y-auto whitespace-pre-wrap shadow-inner">
                          {simDevice.aiAnalysis.message}
                        </div>
                      </div>
                    )
                  ) : (
                    realActiveDevice?.aiAnalysis && (
                      <div className="mt-5 border-t border-slate-100 pt-5">
                        <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-wider mb-2">Gemini Diagnostics Summary</h4>
                        <div className="p-4 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 font-mono text-[11px] leading-relaxed max-h-[350px] overflow-y-auto whitespace-pre-wrap shadow-inner">
                          {realActiveDevice.aiAnalysis.message}
                        </div>
                      </div>
                    )
                  )}
                </div>

                {/* 3. HARDWARE TELEMETRY CHECKLIST TABLE */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-indigo-600" />
                      Target Hardware Telemetry Metrics
                    </h3>
                    {isSimulationMode && (
                      <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                        SIMULATED DIAGNOSTIC DATA
                      </span>
                    )}
                  </div>

                  {isSimulationMode ? (
                    simDevice.diagnosticReport?.checks ? (
                      <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                        <div className="grid grid-cols-12 bg-slate-100 border-b border-slate-200 p-2.5 font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                          <div className="col-span-5">Sensor / Service Check</div>
                          <div className="col-span-3 text-center">Metric State</div>
                          <div className="col-span-4 text-right">Value Details</div>
                        </div>

                        <div className="divide-y divide-slate-100 font-mono text-[11px]">
                          {simDevice.diagnosticReport.checks.map((check, index) => (
                            <div key={index} className="grid grid-cols-12 p-3 items-center">
                              <div className="col-span-5 font-bold text-slate-900">{check.name}</div>
                              <div className="col-span-3 text-center">
                                {check.status === "ok" ? (
                                  <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full font-black text-[9px] uppercase border border-emerald-200">OK</span>
                                ) : (
                                  <span className="bg-rose-50 text-rose-800 px-2 py-0.5 rounded-full font-black text-[9px] uppercase border border-rose-200">ALERT</span>
                                )}
                              </div>
                              <div className="col-span-4 text-right text-slate-500 break-all">{check.value || check.error || "—"}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        <Info className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                        <p className="text-xs text-slate-500">No active telemetry metrics compiled yet.</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Click 'Run Diagnostic Test' above to compile hardware stats.</p>
                      </div>
                    )
                  ) : (
                    realActiveDevice?.diagnosticReport?.checks ? (
                      <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                        <div className="grid grid-cols-12 bg-slate-100 border-b border-slate-200 p-2.5 font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                          <div className="col-span-5">Sensor / Service Check</div>
                          <div className="col-span-3 text-center">Metric State</div>
                          <div className="col-span-4 text-right">Value Details</div>
                        </div>

                        <div className="divide-y divide-slate-100 font-mono text-[11px]">
                          {realActiveDevice.diagnosticReport.checks.map((check, index) => (
                            <div key={index} className="grid grid-cols-12 p-3 items-center">
                              <div className="col-span-5 font-bold text-slate-900">{check.name}</div>
                              <div className="col-span-3 text-center">
                                {check.status === "ok" ? (
                                  <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full font-black text-[9px] uppercase border border-emerald-200">OK</span>
                                ) : (
                                  <span className="bg-rose-50 text-rose-800 px-2 py-0.5 rounded-full font-black text-[9px] uppercase border border-rose-200">ALERT</span>
                                )}
                              </div>
                              <div className="col-span-4 text-right text-slate-500 break-all">{check.value || check.error || "—"}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        <Info className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                        <p className="text-xs text-slate-500">No active telemetry metrics compiled.</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Click 'Collect On-Device Telemetry' above to compile hardware stats.</p>
                      </div>
                    )
                  )}
                </div>

                {/* 4. PREVIEW SYSTEM FAULT TESTING BAY (Only in simulation mode) */}
                {isSimulationMode && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-500 animate-pulse" />
                      Simulation Fault Injection Center
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Inject simulated hardware malfunctions or carrier dropping events to test terminal resilience and watch state updates instantly.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <button
                        onClick={simulateDisconnect}
                        className="py-2 bg-red-50 text-red-700 hover:bg-red-100 text-[10px] font-black uppercase rounded-lg border border-red-200 transition-all"
                      >
                        Force Disconnect
                      </button>
                      <button
                        onClick={simulateReconnect}
                        className="py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[10px] font-black uppercase rounded-lg border border-emerald-200 transition-all"
                      >
                        Simulate Reconnect
                      </button>
                      <button
                        onClick={simulatePairingFailure}
                        className="py-2 bg-amber-50 text-amber-700 hover:bg-amber-100 text-[10px] font-black uppercase rounded-lg border border-amber-200 transition-all"
                      >
                        Pairing Failure
                      </button>
                      <button
                        onClick={simulateDiagnosticFailure}
                        className="py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 text-[10px] font-black uppercase rounded-lg border border-slate-300 transition-all"
                      >
                        Telemetry Warning
                      </button>
                      <button
                        onClick={simulateRepairFailure}
                        className="py-2 bg-red-50 text-red-700 hover:bg-red-100 text-[10px] font-black uppercase rounded-lg border border-red-200 transition-all col-span-2 sm:col-span-1"
                      >
                        Action Failure
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              /* REPAIRS PANEL TAB */
              <motion.div
                key="repairs-panel"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="space-y-6"
              >
                {isSimulationMode ? (
                  /* SIMULATED REPAIR SEQUENCER CARD */
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h2 className="text-xs font-black uppercase text-slate-400 tracking-widest">Simulated Sequencer</h2>
                        <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5 mt-1">
                          <ListOrdered className="w-4 h-4 text-indigo-600" />
                          Virtual Sequence Dispatcher
                        </h3>
                      </div>
                      <span className="text-[9px] font-black text-amber-700 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-full uppercase">
                        SIMULATED REPAIR ACTION
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed">
                      Select a remedial action settings intent below to dispatch to the virtual phone sandbox.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div 
                        onClick={() => {
                          setSimRepairPlan({
                            approval_id: "SIM-PLAN-01",
                            problem: "WLAN adapter signal offload",
                            summary: "Directing virtual device user to configure the technician access point SSID",
                            actions: [{ id: "open_network_settings", description: "Open wireless configs screen", risk: "low", reversible: true, requires_device_confirmation: false }],
                            risk: "low",
                            reversible: true,
                            confirmation_required: false,
                            status: "pending"
                          });
                          setSimRepairState("READY");
                          addSimLog("[SIM] Plan compiled: WLAN adapter signal offload.", "info");
                        }}
                        className="p-3.5 bg-slate-50 border border-slate-200 hover:border-indigo-500 rounded-xl cursor-pointer transition-all"
                      >
                        <h4 className="text-xs font-bold text-slate-900">1. WiFi Carrier Validation</h4>
                        <p className="text-[10px] text-slate-500 mt-0.5">Launches carrier settings menu intent.</p>
                      </div>

                      <div 
                        onClick={() => {
                          setSimRepairPlan({
                            approval_id: "SIM-PLAN-02",
                            problem: "Display power optimization",
                            summary: "Transition visual limits to dark-theme default and refresh battery sensors parameters",
                            actions: [{ id: "open_display_settings", description: "Launch color layout & brightness configurations", risk: "low", reversible: true, requires_device_confirmation: false }],
                            risk: "low",
                            reversible: true,
                            confirmation_required: false,
                            status: "pending"
                          });
                          setSimRepairState("READY");
                          addSimLog("[SIM] Plan compiled: Display power optimization.", "info");
                        }}
                        className="p-3.5 bg-slate-50 border border-slate-200 hover:border-indigo-500 rounded-xl cursor-pointer transition-all"
                      >
                        <h4 className="text-xs font-bold text-slate-900">2. Display Optimization</h4>
                        <p className="text-[10px] text-slate-500 mt-0.5">Launches brightness and UI theme controls.</p>
                      </div>

                      <div 
                        onClick={() => {
                          setSimRepairPlan({
                            approval_id: "SIM-PLAN-03",
                            problem: "Runaway package thermal reset",
                            summary: "Clean application telemetry partitions caching limits to reduce background polling",
                            actions: [{ id: "clear_app_cache_prompt", description: "Trigger system app package memory purge alert", risk: "medium", reversible: false, requires_device_confirmation: true }],
                            risk: "medium",
                            reversible: false,
                            confirmation_required: true,
                            status: "pending"
                          });
                          setSimRepairState("READY");
                          addSimLog("[SIM] Plan compiled: Runaway package thermal reset.", "info");
                        }}
                        className="p-3.5 bg-slate-50 border border-slate-200 hover:border-indigo-500 rounded-xl cursor-pointer transition-all"
                      >
                        <h4 className="text-xs font-bold text-slate-900">3. App Cache Purge</h4>
                        <p className="text-[10px] text-slate-500 mt-0.5">Triggers on-screen application cache clear alert.</p>
                      </div>
                    </div>

                    {/* Active Simulated Plan Tracker */}
                    {simRepairPlan && (
                      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <div>
                            <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded uppercase">
                              ID: {simRepairPlan.approval_id}
                            </span>
                            <h4 className="text-xs font-black text-slate-900 mt-1">{simRepairPlan.problem}</h4>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] text-slate-400 block font-bold uppercase">STATUS</span>
                            <span className="text-xs font-black text-indigo-600 uppercase tracking-wider">{simRepairState}</span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed font-medium">
                          <b>Sequence Abstract:</b> {simRepairPlan.summary}
                        </p>

                        <div className="space-y-2">
                          {simRepairPlan.actions.map((act, i) => (
                            <div key={i} className="bg-white border border-slate-200 p-2.5 rounded-lg flex items-center justify-between text-xs">
                              <div>
                                <span className="font-mono font-bold block">{act.id}</span>
                                <span className="text-slate-500 text-[11px] font-medium">{act.description}</span>
                              </div>
                              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 bg-slate-100 rounded text-slate-700">
                                {act.risk} risk
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Interactive Timeline simulation */}
                        <div className="pt-2 flex flex-col md:flex-row md:items-center justify-between gap-3 border-t border-slate-200">
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                            <span className={`px-2 py-0.5 rounded ${simRepairState === 'READY' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-200 text-slate-600'}`}>READY</span>
                            <span>→</span>
                            <span className={`px-2 py-0.5 rounded ${simRepairState === 'PENDING' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-200 text-slate-600'}`}>PENDING</span>
                            <span>→</span>
                            <span className={`px-2 py-0.5 rounded ${simRepairState === 'APPROVED' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-200 text-slate-600'}`}>APPROVED</span>
                            <span>→</span>
                            <span className={`px-2 py-0.5 rounded ${simRepairState === 'DISPATCHED' ? 'bg-indigo-600 text-white font-bold' : 'bg-slate-200 text-slate-600'}`}>DISPATCHED</span>
                            <span>→</span>
                            <span className={`px-2 py-0.5 rounded ${simRepairState === 'EXECUTING' ? 'bg-indigo-600 text-white font-bold animate-pulse' : 'bg-slate-200 text-slate-600'}`}>EXECUTING</span>
                            <span>→</span>
                            <span className={`px-2 py-0.5 rounded ${simRepairState === 'COMPLETED' ? 'bg-emerald-600 text-white font-bold' : 'bg-slate-200 text-slate-600'}`}>COMPLETED</span>
                          </div>

                          <button
                            onClick={runSimRepairSequence}
                            disabled={simDevice.pairingState !== "PAIRED" || simRepairState === "COMPLETED" || simRepairState === "FAILED"}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-black uppercase rounded-lg transition-all"
                          >
                            Approve & Run Sequence
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* REAL COMPANION REPAIR SEQUENCER */
                  <div className="space-y-6">
                    {/* Load Repair Sequences */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-3">
                        <ListOrdered className="w-4 h-4 text-indigo-600" />
                        Retrieve Active Repair Dispatch Plan
                      </h3>
                      <div className="flex gap-2.5">
                        <input
                          type="text"
                          value={approvalId}
                          onChange={(e) => setApprovalId(e.target.value)}
                          placeholder="Enter Approval ID (e.g. 5d8ca9f1)"
                          className="flex-1 border border-slate-300 rounded-lg px-3.5 py-2 text-xs font-mono focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                        />
                        <button
                          onClick={loadRepairPlan}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
                        >
                          Retrieve Sequence
                        </button>
                      </div>

                      {repairPlanError && (
                        <div className="mt-3 p-3 bg-rose-50 border border-rose-100 text-rose-800 text-[11px] rounded-xl flex items-center gap-2 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          <span>{repairPlanError}</span>
                        </div>
                      )}
                    </div>

                    {/* Plan Constructor Form */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        <Plus className="w-4 h-4 text-indigo-600" />
                        Compile New Dispatch Sequence
                      </h3>

                      <form onSubmit={createCustomRepairRequest} className="space-y-4 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Causal Problem</label>
                            <input
                              type="text"
                              value={customProblem}
                              onChange={(e) => setCustomProblem(e.target.value)}
                              placeholder="e.g., WLAN Interface Connection Failure"
                              className="w-full border border-slate-300 rounded-lg p-2.5 bg-slate-50 focus:ring-2 focus:ring-indigo-600"
                              required
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Executive Summary</label>
                            <input
                              type="text"
                              value={customSummary}
                              onChange={(e) => setCustomSummary(e.target.value)}
                              placeholder="e.g., Sequence reset network cache limits"
                              className="w-full border border-slate-300 rounded-lg p-2.5 bg-slate-50 focus:ring-2 focus:ring-indigo-600"
                              required
                            />
                          </div>
                        </div>

                        <div className="border-t border-slate-100 pt-4">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Action Queue Sequences</label>
                            <button
                              type="button"
                              onClick={addCustomActionItem}
                              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add Action Sequence</span>
                            </button>
                          </div>

                          <div className="space-y-3">
                            {customActions.map((action, index) => (
                              <div key={index} className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row gap-3 items-end sm:items-center">
                                <div className="w-full sm:w-1/4">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 block">Action ID</label>
                                  <select
                                    value={action.id || ""}
                                    onChange={(e) => handleActionChange(index, "id", e.target.value)}
                                    className="w-full border border-slate-300 rounded-md p-1.5 bg-white text-xs font-mono"
                                  >
                                    <option value="open_network_settings">open_network_settings</option>
                                    <option value="open_display_settings">open_display_settings</option>
                                    <option value="clear_app_cache_prompt">clear_app_cache_prompt</option>
                                    <option value="destructive_factory_reset_request">destructive_factory_reset_request</option>
                                  </select>
                                </div>

                                <div className="w-full sm:w-2/5">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 block">Description</label>
                                  <input
                                    type="text"
                                    value={action.description || ""}
                                    onChange={(e) => handleActionChange(index, "description", e.target.value)}
                                    placeholder="Describe physical verification steps for the device user..."
                                    className="w-full border border-slate-300 rounded-md p-1.5 bg-white text-xs"
                                    required
                                  />
                                </div>

                                <div className="w-full sm:w-1/5">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 block">Risk Level</label>
                                  <select
                                    value={action.risk || "low"}
                                    onChange={(e) => handleActionChange(index, "risk", e.target.value)}
                                    className="w-full border border-slate-300 rounded-md p-1.5 bg-white text-xs"
                                  >
                                    <option value="low">Low Risk</option>
                                    <option value="medium">Medium Risk</option>
                                    <option value="high">High Risk</option>
                                  </select>
                                </div>

                                <div className="flex items-center gap-2.5 self-center">
                                  <label className="flex items-center gap-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                                    <input
                                      type="checkbox"
                                      checked={!!action.reversible}
                                      onChange={(e) => handleActionChange(index, "reversible", e.target.checked)}
                                    />
                                    Reversible
                                  </label>

                                  {customActions.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => removeCustomActionItem(index)}
                                      className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isSubmittingPlan || realActiveDevice?.pairingState !== "PAIRED"}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-1"
                        >
                          {isSubmittingPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          <span>Compile Sequence & Register Approval Request</span>
                        </button>
                      </form>
                    </div>

                    {/* Active Sequencer Approval State Panel */}
                    {repairPlan && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                          <div>
                            <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                              Approval ID: {repairPlan.approval_id}
                            </span>
                            <h4 className="text-sm font-black text-slate-900 mt-2">{repairPlan.problem}</h4>
                          </div>

                          <div className="text-right">
                            <span className="text-[9px] text-slate-400 block uppercase tracking-wider font-bold">Sequence State</span>
                            <span className={`text-xs font-black uppercase tracking-wider ${
                              repairPlan.status === "approved" ? "text-emerald-600" :
                              repairPlan.status === "rejected" ? "text-rose-600" :
                              repairPlan.status === "pending" ? "text-amber-600" : "text-slate-600"
                            }`}>
                              {repairPlan.status}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 p-3 rounded-lg leading-relaxed font-medium">
                          <b>Sequence Abstract:</b> {repairPlan.summary}
                        </p>

                        <div className="space-y-2.5">
                          {repairPlan.actions?.map((act, idx) => (
                            <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                              <div>
                                <span className="font-mono font-bold text-slate-900 block">{act.id}</span>
                                <span className="text-slate-500 font-medium">{act.description}</span>
                              </div>
                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-sm border ${
                                act.risk === "high" ? "bg-rose-50 border-rose-200 text-rose-800" :
                                act.risk === "medium" ? "bg-amber-50 border-amber-200 text-amber-800" :
                                "bg-emerald-50 border-emerald-200 text-emerald-800"
                              }`}>
                                {act.risk} Risk
                              </span>
                            </div>
                          ))}
                        </div>

                        {repairPlan.status === "pending" && (
                          <div className="flex gap-3 pt-3 border-t border-slate-100">
                            <button
                              onClick={() => decideRepairPlan(false)}
                              className="flex-1 py-2.5 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-black uppercase transition-all"
                            >
                              Reject Sequence
                            </button>
                            <button
                              onClick={() => decideRepairPlan(true)}
                              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase transition-all shadow-sm"
                            >
                              Approve & Dispatch Settings Action
                            </button>
                          </div>
                        )}

                        {repairPlan.dispatch_status && (
                          <div className="p-3 border border-emerald-200 bg-emerald-50/40 text-emerald-800 text-[11px] font-medium rounded-xl flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Action successfully dispatched to companion!</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Hand: Bezel Viewport Phone & Log Monitors (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* SIMULATED PHYSICAL DEVICE VIEWPORT (AMOLED BEZELS) */}
          <div className="bg-slate-950 text-white rounded-[32px] p-5.5 border-4 border-slate-800 shadow-xl flex flex-col relative overflow-hidden ring-1 ring-slate-900">
            
            {/* Ambient Notch Bezel Sensor */}
            <div className="absolute top-2.5 left-1/2 transform -translate-x-1/2 w-28 h-5.5 bg-slate-800 rounded-full z-10 flex items-center justify-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-slate-900 border border-slate-800" />
              <div className="w-10 h-1 bg-slate-900 rounded-full" />
            </div>

            {/* Viewport header row */}
            <div className="flex items-center justify-between mb-4 mt-2.5 z-10">
              <div className="flex items-center gap-1.5">
                <span className="flex h-2 w-2 relative">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isSimulationMode 
                      ? (simDevice.connectionState === 'CONNECTED' ? 'bg-emerald-400' : 'bg-rose-400')
                      : (realActiveDevice?.screenSessionActive ? 'bg-emerald-400' : 'bg-rose-400')
                  }`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${
                    isSimulationMode 
                      ? (simDevice.connectionState === 'CONNECTED' ? 'bg-emerald-500' : 'bg-rose-500')
                      : (realActiveDevice?.screenSessionActive ? 'bg-emerald-500' : 'bg-rose-500')
                  }`} />
                </span>
                <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                  {isSimulationMode ? "SIMULATED VIEWPORT" : "LIVE TARGET VIEWPORT"}
                </span>
              </div>

              {/* Real Stream Freeze toggle */}
              {!isSimulationMode && (
                <button
                  onClick={() => setScreenStreamActive(!screenStreamActive)}
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-[9px] font-black uppercase tracking-wider border border-slate-800"
                >
                  {screenStreamActive ? (
                    <>
                      <Pause className="w-3 h-3 text-indigo-500" />
                      <span>Freeze</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 text-emerald-500" />
                      <span>Resume</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* PHYSICAL PHONE SCREEN MATRIX */}
            <div className="bg-[#0b0f19] rounded-[24px] overflow-hidden border border-slate-800 min-h-[460px] flex flex-col justify-between relative shadow-inner pt-3">
              
              {isSimulationMode ? (
                /* SIMULATED DEVICE GRAPHICS INTERACTIVE SCREEN */
                <div className="flex-1 flex flex-col justify-between p-4 text-xs font-sans">
                  
                  {/* Status Bar */}
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono border-b border-slate-900 pb-2 mb-2">
                    <span>12:00 PM</span>
                    <span className="text-amber-500 font-bold uppercase tracking-wider">Sim Mode</span>
                    <div className="flex items-center gap-1.5">
                      <Wifi className="w-3 h-3 text-emerald-500" />
                      <Battery className="w-3.5 h-3.5 text-emerald-500" />
                      <span>82%</span>
                    </div>
                  </div>

                  {/* Dynamic Render Sandbox Content based on linking state */}
                  {simDevice.connectionState === "DISCONNECTED" ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-4 space-y-3">
                      <Tv className="w-12 h-12 text-slate-700 mx-auto animate-pulse" />
                      <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Virtual Bezel Standby</h4>
                      <p className="text-[10px] text-slate-600 max-w-[170px] leading-relaxed">
                        Simulated screen remains offline. Click <b>"Run Connection Test"</b> above to power-on the handshake sequence.
                      </p>
                    </div>
                  ) : simDevice.connectionState !== "CONNECTED" ? (
                    /* SCANNING AND CONNECTING ANIMATION */
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-4 space-y-4">
                      <Loader2 className="w-10 h-10 text-amber-500 animate-spin" />
                      <div>
                        <h4 className="text-xs font-black uppercase text-amber-500 tracking-wider">{simDevice.connectionState}</h4>
                        <p className="text-[10px] text-slate-500 mt-1 font-mono">Negotiating secure websocket packet limits...</p>
                      </div>
                      
                      {/* Live PIN generation alert overlays */}
                      {simDevice.connectionState === "PAIRING_REQUIRED" && simGeneratedPin && (
                        <div className="bg-amber-900/40 border border-amber-500/50 p-3 rounded-lg text-amber-300 font-mono w-full text-[10px]">
                          <span className="font-black uppercase text-[8px] tracking-widest block mb-1 text-amber-400">On-Screen PIN Toast Alert:</span>
                          <span className="text-xl font-black tracking-widest block py-0.5">{simGeneratedPin}</span>
                          <span className="text-[9px]">Type this PIN into the Auth inputs on the left.</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* CONNECTED & STREAMING LIVE ANALYTICAL SVG FRAME GRAPHICS */
                    <div className="flex-1 flex flex-col justify-between space-y-3">
                      <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-slate-400 uppercase font-black">Wi-Fi Adapter:</span>
                          <span className="text-emerald-500 font-bold">Tech-Hotspot-5G</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-slate-400 uppercase font-black">Signal Strength:</span>
                          <span className="text-indigo-400 font-bold">{simCarrierSignal} dBm</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-slate-400 uppercase font-black">CPU Thermal Level:</span>
                          <span className="text-orange-400 font-bold">{simCpuTemp} °C</span>
                        </div>
                      </div>

                      {/* Moving SVG Live Waveform - strictly updates on simTick */}
                      <div className="bg-slate-950 rounded-xl p-2 border border-slate-900 flex-1 flex flex-col justify-between min-h-[140px]">
                        <span className="text-[8px] font-mono font-black text-slate-500 uppercase tracking-widest block mb-1">
                          Simulated Screen Stream Spectrum
                        </span>
                        
                        {/* Interactive Simulated settings app menu based on state */}
                        {simRepairState === "EXECUTING" ? (
                          <div className="flex-1 bg-indigo-950/60 border border-indigo-500/40 rounded-lg p-2.5 flex flex-col justify-between animate-pulse">
                            <div>
                              <span className="text-[9px] font-bold text-indigo-300 block">SYSTEM INTENT DISPATCHED</span>
                              <span className="text-xs font-black text-white block mt-0.5">Settings &gt; Wireless Configs</span>
                            </div>
                            <div className="flex items-center justify-between bg-indigo-900/60 p-1.5 rounded text-[9px] font-mono text-indigo-200">
                              <span>Reset WLAN Interface:</span>
                              <span className="font-bold text-white bg-indigo-700 px-1 rounded uppercase">PROMPTED</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 flex flex-col justify-center">
                            <svg className="w-full h-16 text-emerald-500" viewBox="0 0 100 30" preserveAspectRatio="none">
                              <path
                                d={`M 0 15 
                                    Q 15 ${15 + Math.sin(simTick) * 8}, 30 15 
                                    T 60 15 
                                    T 90 15 
                                    L 100 15`}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                className="transition-all duration-300"
                              />
                            </svg>
                            <span className="text-[9px] font-mono text-center text-slate-500 block">
                              Active Virtual Stream tick: <b>{simTick}</b>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Bottom diagnostics details info */}
                      <div className="p-2 bg-slate-900/60 border border-slate-850 rounded-lg flex items-center justify-between text-[9px] text-slate-400 font-mono">
                        <span className="flex items-center gap-1">
                          <Database className="w-3 h-3 text-indigo-400" />
                          Storage: <b>54GB Free</b>
                        </span>
                        <span className="flex items-center gap-1">
                          <Flame className="w-3 h-3 text-red-400" />
                          Thermals: <b>{simCpuTemp}°C</b>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Simulated Terminal logs overlay at bottom of screen */}
                  <div className="mt-3 p-2 bg-black border border-slate-900 rounded-lg h-24 overflow-y-auto text-[8px] font-mono text-indigo-300 flex flex-col gap-0.5 scrollbar-thin select-none">
                    <span className="text-[7px] text-indigo-500 font-black uppercase tracking-widest block mb-0.5">Simulated Event Logs</span>
                    {simLogs.slice(0, 8).map((log, idx) => (
                      <div key={idx} className="flex gap-1">
                        <span className="text-indigo-600">[{log.timestamp}]</span>
                        <span className={
                          log.type === "success" ? "text-emerald-400" :
                          log.type === "warn" ? "text-amber-400" :
                          log.type === "error" ? "text-rose-400" : "text-indigo-300"
                        }>{log.message}</span>
                      </div>
                    ))}
                  </div>

                </div>
              ) : (
                /* REAL COMPANION DEVICE SCREENS */
                <div className="flex-1 flex flex-col justify-between">
                  <div className="flex-1 flex items-center justify-center relative overflow-hidden min-h-[360px]">
                    {screenFrameUrl && screenStreamActive ? (
                      <img 
                        src={screenFrameUrl} 
                        referrerPolicy="no-referrer"
                        alt="Live Target Feed" 
                        className="max-h-[460px] w-auto object-contain mx-auto rounded-lg transition-all duration-200"
                      />
                    ) : (
                      <div className="text-center p-6 space-y-3">
                        <Tv className="w-10 h-10 text-slate-700 mx-auto animate-pulse" />
                        <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Feed Standby</p>
                        <p className="text-[10px] text-slate-600 max-w-[180px] mx-auto leading-relaxed">
                          Viewport stream will render instantly when screen sharing is active in the companion app.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="m-3 p-3 bg-slate-950 border border-slate-900 rounded-xl flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                    <Terminal className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="truncate">{screenEventMsg}</span>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ACTIVE DEVICE HARDWARE SPECS ACCENT CARD */}
          {isSimulationMode ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Simulated Hardware Specs</h3>
                <span className="text-[9px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                  SIM DEVICE
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">Manufacturer</span>
                  <span className="text-xs font-black text-slate-950">{simDevice.manufacturer}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">Model</span>
                  <span className="text-xs font-black text-slate-950">{simDevice.model}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">OS Release</span>
                  <span className="text-xs font-black text-slate-950">Android {simDevice.android_version}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase block mb-0.5">Battery Level</span>
                    <span className="text-xs font-black text-slate-950">{simDevice.batteryLevel}%</span>
                  </div>
                  <Battery className="w-5 h-5 text-emerald-500" />
                </div>
              </div>
            </div>
          ) : (
            realActiveDevice && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider">Target Hardware Specs</h3>
                
                <div className="grid grid-cols-2 gap-3 font-mono text-[11px]">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">Manufacturer</span>
                    <span className="text-xs font-black text-slate-900">{realActiveDevice.manufacturer}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">Model</span>
                    <span className="text-xs font-black text-slate-900">{realActiveDevice.model}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">OS Release</span>
                    <span className="text-xs font-black text-slate-900">Android {realActiveDevice.android_version}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-black text-slate-400 uppercase block mb-0.5">Battery Level</span>
                      <span className="text-xs font-black text-slate-900">
                        {realActiveDevice.batteryLevel !== undefined ? `${realActiveDevice.batteryLevel}%` : "—"}
                      </span>
                    </div>
                    {realActiveDevice.batteryLevel !== undefined && (
                      <Battery className={`w-5 h-5 ${realActiveDevice.batteryLevel > 20 ? 'text-emerald-500' : 'text-rose-500'}`} />
                    )}
                  </div>
                </div>
              </div>
            )
          )}

        </div>

      </main>

      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
        <div className="max-w-7xl mx-auto px-6">
          AI Android Technician Workspace • Secure Client Link 2.0
        </div>
      </footer>
    </div>
  );
}
