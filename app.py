import os
import socket
import threading

from flask import Flask, jsonify, render_template_string, request
from zeroconf import ServiceInfo, Zeroconf

from otg import OTGAIPhoneController

app = Flask(__name__)
controller = OTGAIPhoneController()

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
</style></head><body>
<header><div><h1>AI Android Technician</h1><small>Authorized device diagnostics + AI analysis</small></div><button onclick="refresh()">Refresh</button></header>
<div class="card"><span id="status" class="badge">Checking device…</span><div id="summary" class="grid" style="margin-top:14px"></div></div>
<div class="card"><h2>Diagnostic checks</h2><div id="checks">No report yet.</div></div>
<div class="card"><h2>Ask the AI</h2><p><small>Describe any phone problem. The AI analyzes available read-only evidence and does not execute arbitrary commands.</small></p><textarea id="problem" placeholder="Example: Mobile data is not working. Find the likely cause."></textarea><br><button class="primary" onclick="diagnose()">Diagnose</button><pre id="answer">Waiting for your problem.</pre></div>
<script>
function esc(v){return String(v??'—').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function render(r){const f=[['Model',r.model],['Manufacturer',r.manufacturer],['Android',r.android_version],['SDK',r.sdk],['Serial',r.serial]];document.getElementById('summary').innerHTML=f.map(([k,v])=>`<div class="stat"><strong>${esc(k)}</strong>${esc(v)}</div>`).join('');document.getElementById('checks').innerHTML=(r.checks||[]).map(c=>`<div class="check"><span>${esc(c.name)}</span><span class="${c.status==='ok'?'ok':'error'}">${esc(c.status)}</span></div>`).join('')||'No checks.';}
async function refresh(){const s=document.getElementById('status');s.textContent='Checking…';try{const d=await fetch('/api/devices').then(r=>r.json());if(!d.devices?.length){s.textContent='No authorized ADB device detected';s.className='badge offline';document.getElementById('summary').innerHTML='';document.getElementById('checks').textContent='Connect an authorized device to begin diagnostics.';return;}const r=await fetch('/api/diagnostics?serial='+encodeURIComponent(d.devices[0])).then(x=>x.json());s.textContent='Connected: '+d.devices[0];s.className='badge online';render(r);}catch(e){s.textContent='Dashboard error';s.className='badge offline';}}
async function diagnose(){const problem=document.getElementById('problem').value.trim();if(!problem)return;document.getElementById('answer').textContent='Analyzing…';try{const r=await fetch('/api/diagnose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({problem})}).then(x=>x.json());if(r.report)render(r.report);document.getElementById('answer').textContent=r.diagnosis?.message||r.error||'No diagnosis returned.';}catch(e){document.getElementById('answer').textContent='Request failed: '+e.message;}}
refresh();
</script></body></html>
"""

SERVICE_TYPE = "_otgtech._tcp.local."
SERVICE_NAME = "AI-Android-Technician._otgtech._tcp.local."
zeroconf_instance = None
service_info = None


def _local_ip():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("192.0.2.1", 9))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


def start_service_discovery(port: int):
    global zeroconf_instance, service_info
    address = _local_ip()
    if address == "127.0.0.1":
        return
    try:
        zeroconf_instance = Zeroconf()
        service_info = ServiceInfo(
            SERVICE_TYPE,
            SERVICE_NAME,
            addresses=[socket.inet_aton(address)],
            port=port,
            properties={b"version": b"0.1", b"capability": b"diagnostics"},
        )
        zeroconf_instance.register_service(service_info)
    except Exception:
        if zeroconf_instance:
            zeroconf_instance.close()
        zeroconf_instance = None
        service_info = None


def stop_service_discovery():
    global zeroconf_instance, service_info
    if zeroconf_instance:
        try:
            if service_info:
                zeroconf_instance.unregister_service(service_info)
            zeroconf_instance.close()
        except Exception:
            pass
    zeroconf_instance = None
    service_info = None


@app.get("/")
def index():
    return render_template_string(DASHBOARD)


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "ai-android-technician", "version": "0.1"})


@app.get("/api/devices")
def devices():
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


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    host = os.environ.get("OTG_HOST", "0.0.0.0")
    start_service_discovery(port)
    try:
        app.run(host=host, port=port, debug=False)
    finally:
        stop_service_discovery()
