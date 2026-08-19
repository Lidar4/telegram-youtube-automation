from flask import Flask, jsonify, request

from otg import OTGAIPhoneController

app = Flask(__name__)
controller = OTGAIPhoneController()


@app.get("/")
def index():
    return jsonify({
        "name": "AI Android Technician",
        "status": "ready",
        "endpoints": ["/api/devices", "/api/diagnostics", "/api/diagnose"],
    })


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
    app.run(host="127.0.0.1", port=5000, debug=False)
