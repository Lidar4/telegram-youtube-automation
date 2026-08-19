from repair_approval import RepairApprovalStore

store = RepairApprovalStore()


def create_repair_request(plan: dict, device_id: str = "") -> dict:
    return store.create(plan=plan, device_id=device_id)


def approve_repair(approval_id: str) -> dict:
    return store.approve(approval_id)


def reject_repair(approval_id: str) -> dict:
    return store.reject(approval_id)


def get_repair(approval_id: str) -> dict | None:
    return store.get(approval_id)
