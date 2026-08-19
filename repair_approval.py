"""Confirmation-first repair approval state for the technician dashboard.

This module only creates and validates approval records. It never executes a
repair command and never bypasses Android/user authorization.
"""

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from threading import Lock
from typing import Dict, List
from uuid import uuid4


BLOCKED_ACTIONS = {
    "arbitrary_shell",
    "security_bypass",
    "credential_access",
    "lockscreen_bypass",
    "carrier_restriction_bypass",
    "silent_factory_reset",
}


@dataclass
class RepairAction:
    id: str
    description: str
    risk: str
    reversible: bool
    confirmation_required: bool = True


@dataclass
class Approval:
    approval_id: str
    problem: str
    summary: str
    actions: List[RepairAction]
    status: str
    created_at: str

    def to_dict(self):
        data = asdict(self)
        data["actions"] = [asdict(action) for action in self.actions]
        return data


class RepairApprovalStore:
    """Small in-memory approval store for the first implementation stage."""

    def __init__(self):
        self._items: Dict[str, Approval] = {}
        self._lock = Lock()

    def create(self, problem: str, summary: str, actions: list) -> Approval:
        safe_actions = []
        for raw in actions or []:
            action_id = str(raw.get("id", "")).strip()
            description = str(raw.get("description", "")).strip()
            risk = str(raw.get("risk", "high")).lower()
            reversible = str(raw.get("reversible", "no")).lower() == "yes"
            if not action_id or not description:
                continue
            if action_id in BLOCKED_ACTIONS or any(
                blocked in description.lower()
                for blocked in ("security bypass", "credential", "lockscreen bypass")
            ):
                continue
            if risk not in {"low", "medium", "high"}:
                risk = "high"
            # High-risk/irreversible actions are approval-gated and never
            # silently converted into executable actions by this module.
            safe_actions.append(
                RepairAction(
                    id=action_id,
                    description=description,
                    risk=risk,
                    reversible=reversible,
                    confirmation_required=True,
                )
            )

        approval = Approval(
            approval_id=uuid4().hex,
            problem=problem,
            summary=summary,
            actions=safe_actions,
            status="pending_confirmation",
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        with self._lock:
            self._items[approval.approval_id] = approval
        return approval

    def get(self, approval_id: str):
        with self._lock:
            return self._items.get(approval_id)

    def decide(self, approval_id: str, approved: bool):
        with self._lock:
            approval = self._items.get(approval_id)
            if approval is None:
                return None
            approval.status = "approved" if approved else "rejected"
            return approval


approval_store = RepairApprovalStore()
