from repair_policy import RepairPolicy

class RepairDispatcher:
    @staticmethod
    def prepare_dispatch(plan_dict):
        """
        Validates every action in the plan against the RepairPolicy.
        Filters out forbidden actions and flags high-risk ones.
        """
        actions = plan_dict.get("actions", [])
        verified_actions = []
        is_blocked_entirely = False
        block_reason = ""

        for action in actions:
            action_id = action.get("id", "unknown")
            description = action.get("description", "")

            # Run safety validation
            is_allowed, is_high_risk, reason = RepairPolicy.validate_action(action_id, description)
            if not is_allowed:
                is_blocked_entirely = True
                block_reason = reason
                break

            verified_actions.append({
                "id": action_id,
                "description": description,
                "risk": "high" if is_high_risk or action.get("risk") == "high" else action.get("risk", "low"),
                "reversible": action.get("reversible", True),
                "requires_device_confirmation": is_high_risk or action.get("requires_device_confirmation", False)
            })

        if is_blocked_entirely:
            return {
                "ok": False,
                "reason": block_reason
            }

        return {
            "ok": True,
            "payload": {
                "type": "repair_request",
                "approval_id": plan_dict["approval_id"],
                "actions": verified_actions,
                "risk": plan_dict.get("risk", "low"),
                "confirmation_required": True
            }
        }
