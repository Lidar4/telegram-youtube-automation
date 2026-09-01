import re

class RepairPolicy:
    # Forbidden terms that will immediately block an action from being created or dispatched
    FORBIDDEN_PATTERNS = [
        r"security[-_]?bypass",
        r"credential[-_]?extraction",
        r"lock[-_]?screen[-_]?bypass",
        r"arbitrary[-_]?shell",
        r"silent[-_]?factory[-_]?reset",
        r"authentication[-_]?bypass",
        r"root[-_]?device",
        r"dump[-_]?passwords",
        r"extract[-_]?keys",
        r"bypass[-_]?auth"
    ]

    # High-risk actions that require explicit manual user confirmation
    HIGH_RISK_PATTERNS = [
        r"factory[-_]?reset",
        r"delete[-_]?user",
        r"clear[-_]?all[-_]?data",
        r"format",
        r"uninstall[-_]?system",
        r"modify[-_]?secure[-_]?settings"
    ]

    @classmethod
    def validate_action(cls, action_id, description):
        """
        Validates an action.
        Returns:
            (is_allowed, is_high_risk, reason)
        """
        combined = f"{action_id} {description}".lower()

        # 1. Check for strictly forbidden patterns
        for pattern in cls.FORBIDDEN_PATTERNS:
            if re.search(pattern, combined):
                return False, True, f"Blocked: Action violates safety boundaries (matched forbidden policy pattern '{pattern}')."

        # 2. Check for high-risk patterns requiring confirmation
        is_high_risk = False
        for pattern in cls.HIGH_RISK_PATTERNS:
            if re.search(pattern, combined):
                is_high_risk = True
                break

        return True, is_high_risk, "Allowed"
