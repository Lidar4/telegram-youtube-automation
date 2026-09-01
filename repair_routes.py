from flask import Blueprint, jsonify, request
from repair_approval import RepairApprovalManager, RepairPlanState
from repair_dispatch import RepairDispatcher

repair_bp = Blueprint("repair_bp", __name__)
repair_manager = RepairApprovalManager()

@repair_bp.route("/api/v1/repairs", methods=["POST"])
def create_repair():
    body = request.json or {}
    problem = body.get("problem", "").strip()
    summary = body.get("summary", "").strip()
    actions = body.get("actions", [])

    if not problem or not summary:
        return jsonify({"error": "problem and summary are required"}), 400

    import uuid
    approval_id = uuid.uuid4().hex[:8]
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

@repair_bp.route("/api/v1/repairs/<approval_id>", methods=["GET"])
def get_repair(approval_id):
    plan = repair_manager.get_plan(approval_id)
    if not plan:
        return jsonify({"error": "Plan not found"}), 404
    return jsonify(plan)
