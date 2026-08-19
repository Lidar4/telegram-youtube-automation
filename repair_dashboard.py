from repair_api import approve_repair, create_repair_request, get_repair, reject_repair


def repair_status(approval_id: str):
    return get_repair(approval_id)


def repair_approve(approval_id: str):
    return approve_repair(approval_id)


def repair_reject(approval_id: str):
    return reject_repair(approval_id)
