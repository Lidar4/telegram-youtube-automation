import atexit
import json
import os
import socket
import threading
import time

from flask import Flask, jsonify, render_template_string, request
from flask_sock import Sock
from zeroconf import ServiceInfo, Zeroconf

from otg import OTGAIPhoneController

app = Flask(__name__)
sock = Sock(app)
controller = OTGAIPhoneController()
zeroconf = None
service_info = None
viewer_clients = set()
viewer_lock = threading.Lock()
companion_lock = threading.Lock()
active_companion = None
last_screen_frame = None
last_screen_event = {"type": "status", "message": "waiting_for_target"}
last_target_status = {"connected": False, "message": "waiting_for_target"}
last_diagnostic_report = None
last_ai_analysis = None

DASHBOARD = """
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Android Technician</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17181a;background:#f5f7fa}
body{max-width:1100px;margin:0 auto;padding:20px}.card{background:#fff;border:1px solid #e1e5ea;border-radius:16px;padding:18px;margin:14px 0;box-shadow:0 2px 10px #0000000a}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}.stat{padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#fafbfc}.stat strong{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#68707a;margin-bottom:5px}
textarea{width:100%;min-height:120px;box-sizing:border-box;padding:12px;border:1px solid #cfd5dc;border-radius:10px;resize:vertical}button{font:inherit;padding:10px 15px;border:0;border-radius:10px;cursor:pointer;background:#e9edf2}.primary{background:#17181a;color:#fff}pre{white-space:pre-wrap;overflow:auto;background:#f4f5f7;padding:12px;border-radius:10px;max-height:420px}.badge{display:inline-block;padding:5px 9px;border-radius:999px;background:#eef1f4;font-size:13px}.online{background:#e7f7ed;color:#176b38}.offline{background:#fff0f0;color:#8b1e1e}
.screen{display:flex;justify-content:center;background:#111;border-radius:12px;min-height:260px;overflow:hidden}.screen img{display:block;max-width:100%;max-height:620px;object-fit:contain}.event{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;background:#f4f5f7;border-radius:10px;padding:10px;margin-top:10px}
</style></head><body>
<header><div><h1>AI Android Technician</h1><small>Authorized device diagnostics + AI analysis</small></div><button onclick="refresh()">Refresh</button></header>
<div class="card"><span id="status" class="badge">Checking target…</span><div id="summary" class="grid" style="margin-top:14px"></div></div>
<div class="card"><h2>Target screen</h2><div class="screen"><img id="screen" alt="Target phone screen" hidden></div><div id="screenEvent" class="event">Waiting for target phone.</div></div>
<div class="card"><h2>Target status</h2><pre id="targetStatus">Waiting for target phone.</pre></div>
<div class="card"><h2>Diagnostic checks</h2><div id="checks">No report yet.</div></div>
<div class="card"><h2>Ask the AI</h2><p><small>Describe a phone problem. The AI analyzes available read-only evidence and does not execute arbitrary commands.</small></p><textarea id="problem" placeholder="Example: Mobile data is not working. Find the likely cause."></textarea><br><button class="primary" onclick="diagnose()">Diagnose</button><pre id="answer">Waiting for your problem.</pre></div>
<script>
function esc(v){return String(v??'—').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function render(r){const f=[['Model',r.device?.model],['Manufacturer',r.device?.manufacturer],['Android',r.device?.android_version],['SDK',r.device?.sdk],['Battery',r.battery?.level_percent===undefined?'—':r.battery.level_percent+'%'],['Network',r.network?.connected?'Connected':'Not connected'],['Wi-Fi',r.network?.transport_wifi?'Yes':'No'],['Cellular',r.network?.transport_cellular?'Yes':'No'],['Storage used',r.storage?.used_percent===undefined?'—':r.storage.used_percent+'%']];document.getElementById('summary').innerHTML=f.map(([k,v])=>`<div class="stat"><strong>${esc(k)}</strong>${esc(v)}</div>`).join('');document.getElementById('checks').innerHTML=`<pre>${esc(JSON.stringify(r,null,2))}</pre>`;}
async function refresh(){try{const d=await fetch('/api/target/status').then(r=>r.json());const s=document.getElementById('status');s.textContent=d.connected?'Target connected':'Target not connected';s.className='badge '+(d.connected?'online':'offline');document.getElementById('targetStatus').textContent=JSON.stringify(d,null,2);if(d.report)render(d.report);if(d.ai_analysis?.message)document.getElementById('answer').textContent=d.ai_analysis.message;}catch(e){document.getElementById('status').textContent='Dashboard error';document.getElementById('status').className='badge offline';}}
async function diagnose(){const problem=document.getElementById('problem').value.trim();if(!problem)return;document.getElementById('answer').textContent='Requesting target diagnostics…';try{const r=await fetch('/api/diagnostics/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({problem})}).then(x=>x.json());if(!r.ok){document.getElementById('answer').textContent=r.error||'Diagnostic request failed.';return;}document.getElementById('answer').textContent='Diagnostic request sent. Waiting for target report…';}catch(e){document.getElementById('answer').textContent='Request failed: '+e.message;}}
function connectScreen(){const proto=location.protocol==='https:'?'wss':'ws';const ws=new WebSocket(`${proto}://${location.host}/ws/viewer`);ws.binaryType='arraybuffer';ws.onopen=()=>document.getElementById('screenEvent').textContent='Viewer connected. Waiting for target screen…';ws.onmessage=e=>{if(typeof e.data==='string'){try{const msg=JSON.parse(e.data);document.getElementById('screenEvent').textContent=`${msg.type}: ${msg.message||''}`;document.getElementById('targetStatus').textContent=JSON.stringify(msg,null,2);if(msg.type==='diagnostic_report'){render(msg);document.getElementById('answer').textContent='Diagnostic report received. You can now ask the AI to analyze it.';}if(msg.type==='ai_analysis'){document.getElementById('answer').textContent=msg.message||'AI analysis received.';}}catch(_){}}else{const blob=new Blob([e.data],{type:'image/jpeg'});const url=URL.createObjectURL(blob);const img=document.getElementById('screen');img.onload=()=>URL.revokeObjectURL(url);img.src=url;img.hidden=false;document.getElementById('screenEvent').textContent='Live target screen';}};ws.onclose=()=>{document.getElementById('screenEvent').textContent='Viewer disconnected. Retrying…';setTimeout(connectScreen,1500);};ws.onerror=()=>ws.close();}
refresh();connectScreen();setInterval(refresh,3000);
</script></body></html>
"""


def _local_ip():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("192.0.2.1", 9))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return "127.0.0.1"


def _advertise_service():
    global zeroconf, service_info
    if zeroconf is not None:
        return
    port = int(os.environ.get("PORT", "5000"))
    ip = _local_ip()
    service_info = ServiceInfo(
        "_otgtech._tcp.local.",
        "AI Android Technician._otgtech._tcp.local.",
        addresses=[socket.inet_aton(ip)],
        port=port,
        properties={"api": "/api/health", "version": "2", "ws": "/ws/companion"},
    )
    zeroconf = Zeroconf()
    zeroconf.register_service(service_info)


def _stop_service():
    global zeroconf, service_info
    if zeroconf is not None:
        try:
            if service_info is not None:
                zeroconf.unregister_service(service_info)
            zeroconf.close()
        finally:
            zeroconf = None
            service_info = None


def _broadcast(payload):
    dead = []
    with viewer_lock:
        clients = list(viewer_clients)
    for client in clients:
        try:
            client.send(payload)
        except Exception:
            dead.append(client)
    if dead:
        with viewer_lock:
            for client in dead:
                viewer_clients.discard(client)


def _send_to_companion(payload):
    with companion_lock:
        companion = active_companion
    if companion is None:
        return False
    try:
        return bool(companion.send(json.dumps(payload)))
    except Exception:
        return False


@app.get("/")
def index():
    return render_template_string(DASHBOARD)


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "ai-android-technician", "version": "5"})


@app.get("/api/devices")
def devices():
    return jsonify({"devices": controller.check_adb_connection()})


@app.get("/api/target/status")
def target_status():
    payload = dict(last_target_status)
    if last_diagnostic_report is not None:
        payload["report"] = last_diagnostic_report
    if last_ai_analysis is not None:
        payload["ai_analysis"] = last_ai_analysis
    return jsonify(payload)


@app.get("/api/diagnostics")
def diagnostics():
    serial = request.args.get("serial")
    return jsonify(controller.collect_report(serial).to_dict())


@app.post("/api/diagnostics/request")
def request_diagnostics():
    body = request.get_json(silent=True) or {}
    problem = str(body.get("problem", "")).strip()
    if not problem:
        return jsonify({"error": "problem is required"}), 400
    payload = {
        "type": "diagnostic_request",
        "request_id": os.urandom(8).hex(),
        "problem": problem,
        "timestamp": int(time.time() * 1000),
    }
    if not _send_to_companion(payload):
        return jsonify({"error": "No connected companion is available"}), 503
    _broadcast(json.dumps({"type": "status", "message": "diagnostic_requested", "request_id": payload["request_id"]}))
    return jsonify({"ok": True, "request_id": payload["request_id"]})


@app.post("/api/diagnostics/analyze")
def analyze_diagnostics():
    global last_ai_analysis
    body = request.get_json(silent=True) or {}
    problem = str(body.get("problem", "")).strip()
    report = body.get("report") or last_diagnostic_report
    if not problem:
        return jsonify({"error": "problem is required"}), 400
    if not isinstance(report, dict):
        return jsonify({"error": "No diagnostic report is available yet"}), 409

    last_ai_analysis = controller.diagnose(problem, report)
    event = {"type": "ai_analysis", "message": last_ai_analysis.get("message", ""), "status": last_ai_analysis.get("status", "unknown")}
    _broadcast(json.dumps(event))
    return jsonify(last_ai_analysis)


@sock.route("/ws/companion")
def companion_socket(ws):
    global active_companion, last_screen_frame, last_screen_event, last_target_status, last_diagnostic_report
    with companion_lock:
        active_companion = ws
    last_target_status = {"connected": True, "message": "target_connected"}
    _broadcast(json.dumps({"type": "status", "message": "target_connected"}))
    try:
        while True:
            message = ws.receive()
            if message is None:
                break
            if isinstance(message, bytes):
                last_screen_frame = message
                _broadcast(message)
            else:
                try:
                    event = json.loads(message)
                except json.JSONDecodeError:
                    event = {"type": "event", "message": str(message)}
                last_screen_event = event
                if event.get("type") == "diagnostic_report":
                    last_diagnostic_report = event
                last_target_status = {"connected": True, **event}
                _broadcast(json.dumps(event))
    finally:
        with companion_lock:
            if active_companion is ws:
                active_companion = None
        last_target_status = {"connected": False, "message": "target_disconnected"}
        _broadcast(json.dumps(last_target_status))


@sock.route("/ws/viewer")
def viewer_socket(ws):
    with viewer_lock:
        viewer_clients.add(ws)
    try:
        ws.send(json.dumps(last_target_status))
        if last_screen_event:
            ws.send(json.dumps(last_screen_event))
        if last_diagnostic_report:
            ws.send(json.dumps(last_diagnostic_report))
        if last_ai_analysis:
            ws.send(json.dumps({"type": "ai_analysis", **last_ai_analysis}))
        if last_screen_frame:
            ws.send(last_screen_frame)
        while True:
            if ws.receive() is None:
                break
    finally:
        with viewer_lock:
            viewer_clients.discard(ws)


if __name__ == "__main__":
    _advertise_service()
    atexit.register(_stop_service)
    app.run(host=os.environ.get("OTG_HOST", "0.0.0.0"), port=int(os.environ.get("PORT", "5000")), debug=False)
