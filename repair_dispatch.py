from __future__ import annotations

from typing import Callable, Optional

_dispatcher: Optional[Callable[[dict], bool]] = None


def set_dispatcher(dispatcher: Callable[[dict], bool]) -> None:
    global _dispatcher
    _dispatcher = dispatcher


def dispatch_repair(approval: dict) -> bool:
    if _dispatcher is None:
        return False
    payload = {
        "type": "repair_request",
        "approval_id": approval["approval_id"],
        "actions": approval.get("actions", []),
        "risk": approval.get("risk", "high"),
        "confirmation_required": True,
    }
    return bool(_dispatcher(payload))
