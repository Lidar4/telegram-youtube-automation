import threading
import time

class RepairPlanState:
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    DISPATCHED = "dispatched"
    REQUIRES_USER_ACTION = "requires_user_action"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"

class RepairApprovalManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._plans = {}

    def create_plan(self, approval_id, problem, summary, actions, risk, reversible):
        with self._lock:
            plan = {
                "approval_id": approval_id,
                "problem": problem,
                "summary": summary,
                "actions": actions,
                "risk": risk,
                "reversible": reversible,
                "status": RepairPlanState.PENDING,
                "dispatch_status": "none",
                "timestamp": time.time(),
                "action_results": {}
            }
            self._plans[approval_id] = plan
            return plan

    def get_plan(self, approval_id):
        with self._lock:
            return self._plans.get(approval_id)

    def list_plans(self):
        with self._lock:
            return list(self._plans.values())

    def update_status(self, approval_id, new_status, dispatch_status=None):
        with self._lock:
            if approval_id not in self._plans:
                return None
            plan = self._plans[approval_id]
            
            # Simple state machine transitions verification
            allowed_transitions = {
                RepairPlanState.PENDING: [RepairPlanState.APPROVED, RepairPlanState.REJECTED],
                RepairPlanState.APPROVED: [RepairPlanState.DISPATCHED, RepairPlanState.FAILED],
                RepairPlanState.REJECTED: [],
                RepairPlanState.DISPATCHED: [RepairPlanState.REQUIRES_USER_ACTION, RepairPlanState.EXECUTING, RepairPlanState.COMPLETED, RepairPlanState.FAILED],
                RepairPlanState.REQUIRES_USER_ACTION: [RepairPlanState.EXECUTING, RepairPlanState.COMPLETED, RepairPlanState.FAILED],
                RepairPlanState.EXECUTING: [RepairPlanState.REQUIRES_USER_ACTION, RepairPlanState.COMPLETED, RepairPlanState.FAILED],
                RepairPlanState.COMPLETED: [],
                RepairPlanState.FAILED: []
            }
            
            current_status = plan["status"]
            # Enforce transition rules
            if new_status in allowed_transitions.get(current_status, []) or new_status == current_status:
                plan["status"] = new_status
                if dispatch_status:
                    plan["dispatch_status"] = dispatch_status
            return plan

    def update_action_result(self, approval_id, action_id, status, message):
        with self._lock:
            if approval_id not in self._plans:
                return None
            plan = self._plans[approval_id]
            plan["action_results"][action_id] = {
                "status": status,
                "message": message,
                "timestamp": time.time()
            }
            return plan
