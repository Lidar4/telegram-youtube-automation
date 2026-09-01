import urllib.request
import json

class RepairApiClient:
    def __init__(self, base_url="http://localhost:3000"):
        self.base_url = base_url

    def get_status(self):
        try:
            req = urllib.request.Request(f"{self.base_url}/api/target/status")
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            return {"error": str(e)}

    def submit_repair_request(self, problem, summary, actions):
        try:
            data = json.dumps({
                "problem": problem,
                "summary": summary,
                "actions": actions
            }).encode('utf-8')
            
            req = urllib.request.Request(
                f"{self.base_url}/api/repair/requests",
                data=data,
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            return {"error": str(e)}

    def send_decision(self, approval_id, approved: bool):
        try:
            data = json.dumps({"approved": approved}).encode('utf-8')
            req = urllib.request.Request(
                f"{self.base_url}/api/repair/{approval_id}/decision",
                data=data,
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            return {"error": str(e)}
