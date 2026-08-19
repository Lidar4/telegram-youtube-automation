"""Safety-first repair planning helpers.

This module deliberately creates plans only. It never executes device commands.
The host UI/backend can use the returned plan to require explicit user approval
before any future, narrowly-scoped repair action is attempted.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any


BLOCKED_CATEGORIES = {
    "security_bypass",
    "credential_access",
    "surveillance",
    "data_destruction",
    "factory_reset",
    "arbitrary_shell",
}


@dataclass(frozen=True)
class RepairPlan:
    action_id: str
    title: str
    reason: str
    risk: str
    reversible: bool
    requires_confirmation: bool = True

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def build_repair_plan(action_id: str, title: str, reason: str, *, risk: str = "low", reversible: bool = True) -> dict[str, Any]:
    """Return a confirmation-first plan; never execute an action."""
    if action_id in BLOCKED_CATEGORIES:
        return {
            "status": "blocked",
            "reason": "This action is outside the safe repair policy.",
            "requires_confirmation": False,
        }

    normalized_risk = risk.lower().strip()
    if normalized_risk not in {"low", "medium", "high"}:
        normalized_risk = "high"

    plan = RepairPlan(
        action_id=action_id,
        title=title,
        reason=reason,
        risk=normalized_risk,
        reversible=bool(reversible),
        requires_confirmation=True,
    )
    return {"status": "pending_approval", "plan": plan.to_dict()}
