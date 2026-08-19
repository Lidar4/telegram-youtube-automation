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
body{font-family:system-ui,sans-serif;max-width:900px;margin:0 auto;padding:24px;background:#f6f7f9;color:#17181a}
.card{background:white;border:1px solid #ddd;border-radius:16px;padding:18px;margin:14px 0;box-shadow:0 2px 8px #00000008}
textarea,input,button{font:inherit}textarea{width:100%;min-height:110px;box-sizing:border-box;padding:12px;border:1px solid #ccc;border-radius:10px}
button{margin-top:10px;padding:10px 16px;border:0;border-radius:10px;cursor:pointer}.primary{background:#17181a;color:white}
pre{white-space:pre-wrap;overflow:auto;background:#f1f2f4;padding:12px;border-radius:10px}.ok{color:#147a3d}.bad{color:#a12a2a}
</style></head>
<body>
<h1>AI Android Technician</h1>
<div class="card"><strong id="status">Checking device…</strong><button onclick="refresh()">Refresh device</button></div>
<div class="card"><h2>Diagnostics</h2><pre id="report">No report yet.</pre></div>
<div class="card"><h2>Ask the AI</h2><textarea id="problem" placeholder="Describe any problem in your own words…"></textarea><button class="primary" onclick="diagnose()">Diagnose</button><pre id="answer">Waiting for your problem.</pre></div>
<script>
async function refresh(){
  const d=await fetch('/api/devices').then(r=>r.json());
  document.getElementById('status').textContent=d.devices?.length?`Connected: ${d.devices.join(', ')}`:'No authorized ADB device detected';
  if(d.devices?.length){const r=await fetch('/api/diagnostics').then(x=>x.json());document.getElementById('report').textContent=JSON.stringify(r,null,2)}
}
async function diagnose(){
 const problem=document.getElementById('problem').value.trim(); if(!problem)return;
 document.getElementById('answer').textContent='Analyzing…';
 const r=await fetch('/api/diagnose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({problem})}).then(x=>x.json());
 document.getElementById('report').textContent=JSON.stringify(r.report||{},null,2);
 document.getElementById('answer').textContent=typeof r.diagnosis==='string'?r.diagnosis:JSON.stringify(r.diagnosis||r.error,null,2);
}
refresh();
</script></body></html>
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
    result = controller.diagnose(problem, report.to_dict())
    return jsonify({"report": report.to_dict(), "diagnosis": result})


if __name__ == "__main__":
    host = os.environ.get("OTG_HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5000"))
    app.run(host=host, port=port, debug=False)
