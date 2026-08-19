from repair_approval import RepairApprovalStore

store = RepairApprovalStore()


def create_repair_request(problem: str, summary: str, actions: list, device_id: str = "") -> dict:
    approval = store.create(problem=problem, summary=summary, actions=actions)
    data = approval.to_dict()
    data["device_id"] = device_id
    return data


def approve_repair(approval_id: str) -> dict | None:
    approval = store.decide(approval_id, True)
    return approval.to_dict() if approval else None


def reject_repair(approval_id: str) -> dict | None:
    approval = store.decide(approval_id, False)
    return approval.to_dict() if approval else None


def get_repair(approval_id: str) -> dict | None:
    approval = store.get(approval_id)
    return approval.to_dict() if approval else None
