import uuid
from dataclasses import asdict, dataclass
from threading import Lock
from typing import Any, Dict, List, Optional


BLOCKED_ACTIONS = {
    "arbitrary_shell",
    "security_bypass",
    "credential_access",
    "lockscreen_bypass",
    "silent_factory_reset",
}


@dataclass
class RepairAction:
    id: str
    description: str
    risk: str
    reversible: bool
    requires_device_confirmation: bool = False


@dataclass
class RepairPlan:
    approval_id: str
    problem: str
    summary: str
    actions: List[RepairAction]
    risk: str
    reversible: bool
    confirmation_required: bool
    status: str = "pending"

    def to_dict(self) -> dict:
        data = asdict(self)
        data["actions"] = [asdict(action) for action in self.actions]
        return data


class RepairApprovalManager:
    """Confirmation-first repair-plan store; never executes device commands."""

    ALLOWED_STATUSES = {
        "pending", "approved", "rejected", "executing", "completed", "failed"
    }

    def __init__(self):
        self._store: Dict[str, RepairPlan] = {}
        self._lock = Lock()

    def create_plan_from_ai(self, diagnosis_data: Dict[str, Any]) -> RepairPlan:
        approval_id = uuid.uuid4().hex[:8]
        raw_actions = diagnosis_data.get("actions", [])
        actions: List[RepairAction] = []

        for i, raw in enumerate(raw_actions if isinstance(raw_actions, list) else []):
            if not isinstance(raw, dict):
                continue
            action_id = str(raw.get("id", f"act_{i}")).strip()
            description = str(raw.get("description", "Standard diagnostic adjustment")).strip()
            if not action_id or not description:
                continue

            lowered = f"{action_id} {description}".lower()
            if action_id in BLOCKED_ACTIONS or any(
                term in lowered
                for term in (
                    "security bypass",
                    "credential access",
                    "lockscreen bypass",
                    "silent factory reset",
                )
            ):
                continue

            risk = str(raw.get("risk", "high")).lower()
            if risk not in {"low", "medium", "high"}:
                risk = "high"
            reversible = bool(raw.get("reversible", False))
            requires_device_confirmation = bool(raw.get("requires_device_confirmation", False))
            if risk == "high" or not reversible:
                requires_device_confirmation = True

            actions.append(
                RepairAction(
                    id=action_id,
                    description=description,
                    risk=risk,
                    reversible=reversible,
                    requires_device_confirmation=requires_device_confirmation,
                )
            )

        overall_risk = str(diagnosis_data.get("overall_risk", "high")).lower()
        if overall_risk not in {"low", "medium", "high"}:
            overall_risk = "high"

        plan = RepairPlan(
            approval_id=approval_id,
            problem=str(diagnosis_data.get("problem", "Unknown diagnostic issue")),
            summary=str(diagnosis_data.get("summary", "Automated AI repair evaluation.")),
            actions=actions,
            risk=overall_risk,
            reversible=bool(diagnosis_data.get("reversible", False)),
            confirmation_required=True,
            status="pending",
        )
        with self._lock:
            self._store[approval_id] = plan
        return plan

    def get_plan(self, approval_id: str) -> Optional[RepairPlan]:
        with self._lock:
            return self._store.get(approval_id)

    def update_status(self, approval_id: str, status: str) -> bool:
        if status not in self.ALLOWED_STATUSES:
            return False
        with self._lock:
            plan = self._store.get(approval_id)
            if plan is None:
                return False
            plan.status = status
            return True


class RepairApprovalStore:
    """Compatibility facade for the existing repair API/routes."""

    def __init__(self, manager: Optional[RepairApprovalManager] = None):
        self.manager = manager or RepairApprovalManager()

    def create(self, problem: str, summary: str, actions: list) -> RepairPlan:
        return self.manager.create_plan_from_ai({
            "problem": problem,
            "summary": summary,
            "actions": actions,
            "confirmation_required": True,
        })

    def get(self, approval_id: str) -> Optional[RepairPlan]:
        return self.manager.get_plan(approval_id)

    def decide(self, approval_id: str, approved: bool) -> Optional[RepairPlan]:
        plan = self.manager.get_plan(approval_id)
        if plan is None or plan.status != "pending":
            return None
        self.manager.update_status(approval_id, "approved" if approved else "rejected")
        return self.manager.get_plan(approval_id)


approval_store = RepairApprovalStore()
approval_manager = approval_store.manager
