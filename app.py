import os

from flask import Flask, jsonify, render_template_string, request

from otg import OTGAIPhoneController

app = Flask(__name__)
controller = OTGAIPhoneController()

DASHBOARD = """
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Android Technician</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17181a;background:#f5f7fa}
body{max-width:1000px;margin:0 auto;padding:20px}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.card{background:#fff;border:1px solid #e1e5ea;border-radius:16px;padding:18px;margin:14px 0;box-shadow:0 2px 10px #0000000a}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.stat{padding:14px;border:1px solid #e5e7eb;border-radius:12px;background:#fafbfc}
.stat strong{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#68707a;margin-bottom:5px}
textarea{width:100%;min-height:120px;box-sizing:border-box;padding:12px;border:1px solid #cfd5dc;border-radius:10px;resize:vertical}
button{font:inherit;padding:10px 15px;border:0;border-radius:10px;cursor:pointer;background:#e9edf2}
.primary{background:#17181a;color:#fff}.danger{background:#fff0f0;color:#8b1e1e}
pre{white-space:pre-wrap;overflow:auto;background:#f4f5f7;padding:12px;border-radius:10px;max-height:420px}
.badge{display:inline-block;padding:5px 9px;border-radius:999px;background:#eef1f4;font-size:13px}.online{background:#e7f7ed;color:#176b38}.offline{background:#fff0f0;color:#8b1e1e}
small{color:#69717b}
</style>
</head>
<body>
<header><div><h1>AI Android Technician</h1><small>Read-only diagnostics + AI analysis</small></div><button onclick="refresh()">Refresh device</button></header>

<div class="card">
  <span id="status" class="badge">Checking device…</span>
  <div id="summary" class="grid" style="margin-top:14px"></div>
</div>

<div class="card">
  <h2>Device diagnostics</h2>
  <pre id="report">No report yet.</pre>
</div>

<div class="card">
  <h2>Ask the AI</h2>
  <p><small>Describe the problem naturally. The current version only analyzes authorized, read-only diagnostic evidence.</small></p>
  <textarea id="problem" placeholder="Example: Mobile data is not working. Tell me what is wrong."></textarea>
  <button class="primary" onclick="diagnose()">Diagnose</button>
  <pre id="answer">Waiting for your problem.</pre>
</div>

<script>
function esc(value){return String(value ?? '—').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function renderSummary(r){
 const fields=[['Model',r.model],['Manufacturer',r.manufacturer],['Android',r.android_version],['SDK',r.sdk],['Serial',r.serial]];
 document.getElementById('summary').innerHTML=fields.map(([k,v])=>`<div class="stat"><strong>${esc(k)}</strong>${esc(v)}</div>`).join('');
}
async function refresh(){
 document.getElementById('status').textContent='Checking…';
 document.getElementById('status').className='badge';
 try{
   const d=await fetch('/api/devices').then(r=>r.json());
   if(!d.devices?.length){document.getElementById('status').textContent='No authorized ADB device detected';document.getElementById('status').className='badge offline';document.getElementById('summary').innerHTML='';return;}
   const r=await fetch('/api/diagnostics?serial='+encodeURIComponent(d.devices[0])).then(x=>x.json());
   document.getElementById('status').textContent='Connected: '+d.devices[0];
   document.getElementById('status').className='badge online';
   renderSummary(r); document.getElementById('report').textContent=JSON.stringify(r,null,2);
 }catch(e){document.getElementById('status').textContent='Dashboard error';document.getElementById('status').className='badge offline';}
}
async function diagnose(){
 const problem=document.getElementById('problem').value.trim();
 if(!problem)return;
 document.getElementById('answer').textContent='Analyzing…';
 try{
   const r=await fetch('/api/diagnose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({problem})}).then(x=>x.json());
   if(r.report){renderSummary(r.report);document.getElementById('report').textContent=JSON.stringify(r.report,null,2);}
   document.getElementById('answer').textContent=typeof r.diagnosis?.message==='string'?r.diagnosis.message:JSON.stringify(r.diagnosis||r.error,null,2);
 }catch(e){document.getElementById('answer').textContent='Request failed: '+e.message;}
}
refresh();
</script>
</body></html>
"""


@app.get("/")
def index():
    return render_template_string(DASHBOARD)


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
    result = controller.diagnose(problem, report.to_dict())
    return jsonify({"report": report.to_dict(), "diagnosis": result})


if __name__ == "__main__":
    host = os.environ.get("OTG_HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5000"))
    app.run(host=host, port=port, debug=False)
