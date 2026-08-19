from flask import Blueprint, jsonify, request

from repair_approval import approval_store
from repair_dispatch import dispatch_repair

repair_bp = Blueprint("repair", __name__, url_prefix="/api/repair")


@repair_bp.post("/requests")
def create_request():
    body = request.get_json(silent=True) or {}
    problem = str(body.get("problem", "")).strip()
    summary = str(body.get("summary", "")).strip()
    actions = body.get("actions") or []
    if not problem or not summary:
        return jsonify({"error": "problem and summary are required"}), 400
    approval = approval_store.create(problem, summary, actions)
    return jsonify(approval.to_dict()), 201


@repair_bp.get("/<approval_id>")
def get_request(approval_id):
    approval = approval_store.get(approval_id)
    if approval is None:
        return jsonify({"error": "approval request not found"}), 404
    return jsonify(approval.to_dict())


@repair_bp.post("/<approval_id>/decision")
def decide_request(approval_id):
    body = request.get_json(silent=True) or {}
    approved = body.get("approved")
    if not isinstance(approved, bool):
        return jsonify({"error": "approved must be a boolean"}), 400

    approval = approval_store.get(approval_id)
    if approval is None:
        return jsonify({"error": "approval request not found"}), 404
    if approval.status != "pending":
        return jsonify({"error": f"approval is already {approval.status}"}), 409

    if not approved:
        approval = approval_store.decide(approval_id, False)
        return jsonify(approval.to_dict()), 200

    approved_plan = approval_store.decide(approval_id, True)
    if approved_plan is None:
        return jsonify({"error": "could not approve repair plan"}), 409

    if not dispatch_repair(approved_plan.to_dict()):
        # Do not claim execution was dispatched if no companion is connected.
        approval_store.manager.update_status(approval_id, "failed")
        return jsonify({
            "error": "No connected companion is available",
            "approval_id": approval_id,
            "status": "failed",
        }), 503

    return jsonify({
        **approved_plan.to_dict(),
        "dispatch_status": "sent_to_companion",
    }), 200
