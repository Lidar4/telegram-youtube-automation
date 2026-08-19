from flask import Blueprint, jsonify, request

from repair_approval import approval_store

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
    approval = approval_store.decide(approval_id, approved)
    if approval is None:
        return jsonify({"error": "approval request not found"}), 404
    return jsonify(approval.to_dict())
