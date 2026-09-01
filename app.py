import os
import json
import uuid
import time
import socket
import threading
from flask import Flask, request, jsonify, send_from_directory
from flask_sock import Sock
from zeroconf import IPVersion, Info, Zeroconf
from repair_approval import RepairApprovalManager, RepairPlanState
from repair_dispatch import RepairDispatcher
from otg import OTGDiagnosticHelper

app = Flask(__name__)
sock = Sock(app)

# Thread-safe in-memory state
active_companion_ws = None
last_screen_frame = None
last_screen_event = {"type": "status", "message": "waiting_for_target"}
last_target_status = {"connected": False, "message": "waiting_for_target"}
last_diagnostic_report = None
last_ai_analysis = None

viewer_clients = set()
state_lock = threading.Lock()

# Instantiate repair manager
repair_manager = RepairApprovalManager()

# Zeroconf instance
zeroconf_instance = None

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Does not have to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

def start_zeroconf_advertising(port=3000):
    global zeroconf_instance
    try:
        zeroconf_instance = Zeroconf()
        ip_addr = get_local_ip()
        info = Info(
            "_otgtech._tcp.local.",
            "AI Android Technician Service._otgtech._tcp.local.",
            addresses=[socket.inet_aton(ip_addr)],
            port=port,
            properties={},
            server="otgtech.local."
        )
        zeroconf_instance.register_service(info)
        print(f"[Zeroconf] Service registered successfully on {ip_addr}:{port}")
    except Exception as e:
        print(f"[Zeroconf] Service advertisement registration failed: {str(e)}")

def stop_zeroconf_advertising():
    global zeroconf_instance
    if zeroconf_instance:
        try:
            zeroconf_instance.unregister_all_services()
            zeroconf_instance.close()
            print("[Zeroconf] Services unregistered and shut down.")
        except Exception as e:
            print(f"[Zeroconf] Shutdown error: {str(e)}")

# Broadcaster helper
def broadcast_to_viewers(data, is_binary=False):
    with state_lock:
        closed_viewers = set()
        for client in list(viewer_clients):
            try:
                client.send(data)
            except Exception:
                closed_viewers.add(client)
        for closed in closed_viewers:
            viewer_clients.discard(closed)

# --- FLASK API ROUTES ---

@app.route("/api/health", methods=["GET"])
def api_health():
    return jsonify({"ok": True, "service": "python-flask-android-technician", "version": "1.0"})

@app.route("/api/devices", methods=["GET"])
def api_devices():
    return jsonify({"devices": []})

@app.route("/api/target/status", methods=["GET"])
def api_target_status():
    with state_lock:
        payload = dict(last_target_status)
        if last_diagnostic_report:
            payload["report"] = last_diagnostic_report
        if last_ai_analysis:
            payload["ai_analysis"] = last_ai_analysis
        return jsonify(payload)

@app.route("/api/diagnostics", methods=["GET"])
def api_diagnostics():
    with state_lock:
        if last_diagnostic_report:
            return jsonify(last_diagnostic_report)
        return jsonify({"error": "No diagnostics report collected yet."}), 404

@app.route("/api/diagnostics/request", methods=["POST"])
def api_diagnostics_request():
    global active_companion_ws
    body = request.json or {}
    problem = body.get("problem", "").strip()
    if not problem:
        return jsonify({"error": "problem is required"}), 400

    request_id = uuid.uuid4().hex[:16]
    payload = {
        "type": "diagnostic_request",
        "request_id": request_id,
        "problem": problem,
        "timestamp": int(time.time() * 1000)
    }

    with state_lock:
        if not active_companion_ws:
            return jsonify({"error": "No connected companion is available"}), 503
        try:
            active_companion_ws.send(json.dumps(payload))
            broadcast_to_viewers(json.dumps({
                "type": "status",
                "message": f"diagnostic_requested",
                "request_id": request_id
            }))
            return jsonify({"ok": True, "request_id": request_id})
        except Exception as e:
            return jsonify({"error": f"Failed to transmit request: {str(e)}"}), 500

@app.route("/api/diagnostics/analyze", methods=["POST"])
def api_diagnostics_analyze():
    global last_ai_analysis
    body = request.json or {}
    problem = body.get("problem", "").strip()
    report = body.get("report") or last_diagnostic_report

    if not problem:
        return jsonify({"error": "problem is required"}), 400
    if not report:
        return jsonify({"error": "No diagnostic report is available yet"}), 409

    # Trigger expert Gemini analysis
    analysis_res = OTGDiagnosticHelper.run_ai_analysis(problem, report)
    with state_lock:
        last_ai_analysis = analysis_res

    broadcast_to_viewers(json.dumps({
        "type": "ai_analysis",
        "message": analysis_res.get("message", ""),
        "status": analysis_res.get("status", "failed")
    }))

    return jsonify(analysis_res)

@app.route("/api/repair/requests", methods=["POST"])
def api_create_repair_request():
    body = request.json or {}
    problem = body.get("problem", "").strip()
    summary = body.get("summary", "").strip()
    actions = body.get("actions", [])

    if not problem or not summary:
        return jsonify({"error": "problem and summary are required"}), 400

    approval_id = uuid.uuid4().hex[:8]
    
    # Analyze risk and reversibility
    has_high_risk = any(act.get("risk") == "high" for act in actions)
    reversible = all(act.get("reversible", True) for act in actions)
    risk_level = "high" if has_high_risk else "medium"

    plan = repair_manager.create_plan(
        approval_id=approval_id,
        problem=problem,
        summary=summary,
        actions=actions,
        risk=risk_level,
        reversible=reversible
    )
    return jsonify(plan), 201

@app.route("/api/repair/<approval_id>", methods=["GET"])
def api_get_repair_plan(approval_id):
    plan = repair_manager.get_plan(approval_id)
    if not plan:
        return jsonify({"error": "approval request not found"}), 404
    return jsonify(plan)

@app.route("/api/repair/<approval_id>/decision", methods=["POST"])
def api_repair_decision(approval_id):
    global active_companion_ws
    body = request.json or {}
    approved = body.get("approved")

    if not isinstance(approved, bool):
        return jsonify({"error": "approved must be a boolean"}), 400

    plan = repair_manager.get_plan(approval_id)
    if not plan:
        return jsonify({"error": "approval request not found"}), 404

    if plan["status"] != RepairPlanState.PENDING:
        return jsonify({"error": f"approval is already {plan['status']}"}), 409

    if not approved:
        updated = repair_manager.update_status(approval_id, RepairPlanState.REJECTED)
        return jsonify(updated)

    # Prepare dispatch
    dispatch_payload = RepairDispatcher.prepare_dispatch(plan)
    if not dispatch_payload["ok"]:
        repair_manager.update_status(approval_id, RepairPlanState.FAILED)
        return jsonify({"error": dispatch_payload["reason"]}), 422

    with state_lock:
        if not active_companion_ws:
            repair_manager.update_status(approval_id, RepairPlanState.FAILED)
            return jsonify({"error": "No connected companion is available"}), 503

        try:
            active_companion_ws.send(json.dumps(dispatch_payload["payload"]))
            updated = repair_manager.update_status(
                approval_id,
                RepairPlanState.DISPATCHED,
                dispatch_status="sent_to_companion"
            )
            return jsonify(updated)
        except Exception as e:
            repair_manager.update_status(approval_id, RepairPlanState.FAILED)
            return jsonify({"error": f"Failed to dispatch repair action: {str(e)}"}), 500

# --- WEBSOCKET SOCKET.IO ROUTES ---

@sock.route("/ws/companion")
def companion_ws_handler(ws):
    global active_companion_ws, last_target_status, last_diagnostic_report
    print("[WS] Companion socket connected")
    with state_lock:
        active_companion_ws = ws
        last_target_status = {"connected": True, "message": "target_connected"}
    
    broadcast_to_viewers(json.dumps({"type": "status", "message": "target_connected"}))

    while True:
        try:
            data = ws.receive()
            if not data:
                break

            # Check if binary (frame screenshots)
            if isinstance(data, (bytes, bytearray)):
                # Store and forward binary frame
                with state_lock:
                    global last_screen_frame
                    last_screen_frame = data
                broadcast_to_viewers(data, is_binary=True)
            else:
                # Text Frame
                try:
                    event = json.loads(data)
                except Exception:
                    event = {"type": "event", "message": data}

                with state_lock:
                    global last_screen_event
                    last_screen_event = event
                    if event.get("type") == "diagnostic_report":
                        last_diagnostic_report = event
                    
                    # Update status
                    last_target_status = dict(event)
                    last_target_status["connected"] = True

                    # Check for individual action results
                    if event.get("type") == "repair_result":
                        app_id = event.get("approval_id")
                        act_id = event.get("action_id")
                        status = event.get("status")
                        msg = event.get("message")
                        if app_id and act_id:
                            repair_manager.update_action_result(app_id, act_id, status, msg)
                        
                        # Lifecycle transition: requires_user_action / executing / completed / failed
                        if status == "requires_user_action":
                            repair_manager.update_status(app_id, RepairPlanState.REQUIRES_USER_ACTION)
                        elif status == "failed":
                            repair_manager.update_status(app_id, RepairPlanState.FAILED)
                        elif event.get("completed") is True:
                            repair_manager.update_status(app_id, RepairPlanState.COMPLETED)

                broadcast_to_viewers(data, is_binary=False)
        except Exception as e:
            print(f"[WS] Companion socket exception: {str(e)}")
            break

    print("[WS] Companion socket disconnected")
    with state_lock:
        if active_companion_ws == ws:
            active_companion_ws = None
        last_target_status = {"connected": False, "message": "target_disconnected"}
    broadcast_to_viewers(json.dumps({"type": "status", "message": "target_disconnected"}))

@sock.route("/ws/viewer")
def viewer_ws_handler(ws):
    print("[WS] Viewer socket connected")
    with state_lock:
        viewer_clients.add(ws)
        # Bootstrap new viewer client with latest known frames and states
        current_frame = last_screen_frame
        current_event = last_screen_event
        current_status = last_target_status

    if current_frame:
        try:
            ws.send(current_frame)
        except Exception:
            pass
    if current_event:
        try:
            ws.send(json.dumps(current_event))
        except Exception:
            pass
    try:
        ws.send(json.dumps({"type": "status", **current_status}))
    except Exception:
        pass

    while True:
        try:
            # Viewers are read-only from companion perspective; keep link alive
            data = ws.receive()
            if not data:
                break
        except Exception:
            break

    with state_lock:
        viewer_clients.discard(ws)
    print("[WS] Viewer socket disconnected")

# Serve the compiled React static SPA in production
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_spa(path):
    dist_dir = os.path.join(os.getcwd(), "dist")
    if not path or not os.path.exists(os.path.join(dist_dir, path)):
        return send_from_directory(dist_dir, "index.html")
    return send_from_directory(dist_dir, path)

if __name__ == "__main__":
    start_zeroconf_advertising(port=3000)
    app.run(host="0.0.0.0", port=3000, threaded=True)
    stop_zeroconf_advertising()
