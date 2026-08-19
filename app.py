import atexit
import json
import os
import socket
import threading

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
last_screen_frame = None
last_screen_event = {"type": "status", "message": "waiting_for_target"}

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
textarea{width:100%;min-height:120px;box-sizing:border-box;padding:12px;border:1px solid #cfd5dc;border-radius:10px;resize:vertical}button{font:inherit;padding:10px 15px;border:0;border-radius:10px;cursor:pointer;background:#e9edf2}.primary{background:#17181a;color:#fff}pre{white-space:pre-wrap;overflow:auto;background:#f4f5f7;padding:12px;border-radius:10px;max-height:420px}.badge{display:inline-block;padding:5px 9px;border-radius:999px;background:#eef1f4;font-size:13px}.online{background:#e7f7ed;color:#176b38}.offline{background:#fff0f0;color:#8b1e1e}small{color:#69717b}
.check{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #eee}.ok{color:#176b38}.error{color:#8b1e1e}
.screen{display:flex;justify-content:center;background:#111;border-radius:12px;min-height:260px;overflow:hidden}.screen img{display:block;max-width:100%;max-height:620px;object-fit:contain}.event{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;background:#f4f5f7;border-radius:10px;padding:10px;margin-top:10px}
</style></head><body>
<header><div><h1>AI Android Technician</h1><small>Authorized device diagnostics + AI analysis</small></div><button onclick="refresh()">Refresh</button></header>
<div class="card"><span id="status" class="badge">Checking device…</span><div id="summary" class="grid" style="margin-top:14px"></div></div>
<div class="card"><h2>Target screen</h2><div class="screen"><img id="screen" alt="Target phone screen" hidden></div><div id="screenEvent" class="event">Waiting for target phone.</div></div>
<div class="card"><h2>Diagnostic checks</h2><div id="checks">No report yet.</div></div>
<div class="card"><h2>Ask the AI</h2><p><small>Describe a phone problem. The AI analyzes available read-only evidence and does not execute arbitrary commands.</small></p><textarea id="problem" placeholder="Example: Mobile data is not working. Find the likely cause."></textarea><br><button class="primary" onclick="diagnose()">Diagnose</button><pre id="answer">Waiting for your problem.</pre></div>
<script>
function esc(v){return String(v??'—').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function render(r){const f=[['Model',r.model],['Manufacturer',r.manufacturer],['Android',r.android_version],['SDK',r.sdk],['Serial',r.serial]];document.getElementById('summary').innerHTML=f.map(([k,v])=>`<div class="stat"><strong>${esc(k)}</strong>${esc(v)}</div>`).join('');document.getElementById('checks').innerHTML=(r.checks||[]).map(c=>`<div class="check"><span>${esc(c.name)}</span><span class="${c.status==='ok'?'ok':'error'}">${esc(c.status)}</span></div>`).join('')||'No checks.';}
async function refresh(){const s=document.getElementById('status');s.textContent='Checking…';try{const d=await fetch('/api/devices').then(r=>r.json());if(!d.devices?.length){s.textContent='No authorized ADB device detected';s.className='badge offline';document.getElementById('summary').innerHTML='';document.getElementById('checks').textContent='Connect an authorized device to begin diagnostics.';return;}const r=await fetch('/api/diagnostics?serial='+encodeURIComponent(d.devices[0])).then(x=>x.json());s.textContent='Connected: '+d.devices[0];s.className='badge online';render(r);}catch(e){s.textContent='Dashboard error';s.className='badge offline';}}
async function diagnose(){const problem=document.getElementById('problem').value.trim();if(!problem)return;document.getElementById('answer').textContent='Analyzing…';try{const r=await fetch('/api/diagnose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({problem})}).then(x=>x.json());if(r.report)render(r.report);document.getElementById('answer').textContent=r.diagnosis?.message||r.error||'No diagnosis returned.';}catch(e){document.getElementById('answer').textContent='Request failed: '+e.message;}}
function connectScreen(){const proto=location.protocol==='https:'?'wss':'ws';const ws=new WebSocket(`${proto}://${location.host}/ws/viewer`);ws.binaryType='arraybuffer';ws.onopen=()=>document.getElementById('screenEvent').textContent='Viewer connected. Waiting for target screen…';ws.onmessage=e=>{if(typeof e.data==='string'){try{const msg=JSON.parse(e.data);document.getElementById('screenEvent').textContent=`${msg.type}: ${msg.message}`;}catch(_){}}else{const blob=new Blob([e.data],{type:'image/jpeg'});const url=URL.createObjectURL(blob);const img=document.getElementById('screen');img.onload=()=>URL.revokeObjectURL(url);img.src=url;img.hidden=false;document.getElementById('screenEvent').textContent='Live target screen';}};ws.onclose=()=>{document.getElementById('screenEvent').textContent='Viewer disconnected. Retrying…';setTimeout(connectScreen,1500);};ws.onerror=()=>ws.close();}
refresh();connectScreen();
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


@app.get("/")
def index():
    return render_template_string(DASHBOARD)


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "ai-android-technician", "version": "2"})


@app.get("/api/devices")
def devices():
    # Return actual authorized ADB serials for the dashboard.
    return jsonify({"devices": controller.check_adb_connection()})


@app.get("/api/diagnostics")
def diagnostics():
    serial = request.args.get("serial")
    return jsonify(controller.collect_report(serial).to_dict())


@app.post("/api/diagnose")
def diagnose():
    body = request.get_json(silent=True) or {}
    problem = str(body.get("problem", "")).strip()
    serial = body.get("serial")
    if not problem:
        return jsonify({"error": "problem is required"}), 400
    report = controller.collect_report(serial)
    if not report.connected:
        return jsonify({"error": "No authorized ADB device detected", "report": report.to_dict()}), 503
    return jsonify({"report": report.to_dict(), "diagnosis": controller.diagnose(problem, report.to_dict())})


@sock.route("/ws/companion")
def companion_socket(ws):
    global last_screen_frame, last_screen_event
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
            _broadcast(json.dumps(event))


@sock.route("/ws/viewer")
def viewer_socket(ws):
    with viewer_lock:
        viewer_clients.add(ws)
    try:
        if last_screen_event:
            ws.send(json.dumps(last_screen_event))
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
