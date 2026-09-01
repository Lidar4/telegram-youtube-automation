import sys
import time
from repair_api import RepairApiClient

def main():
    client = RepairApiClient()
    print("=============================================")
    print(" AI Android Remote Technician Console Monitor ")
    print("=============================================")
    
    status = client.get_status()
    if "error" in status:
        print(f"[-] Status check failed: {status['error']}")
        sys.exit(1)

    connected = status.get("connected", False)
    message = status.get("message", "unknown")
    print(f"[*] Target Connected: {connected}")
    print(f"[*] Latest Event: {message}")

    if "report" in status:
        report = status["report"]
        dev = report.get("device", {})
        print(f"[*] Device Details: {dev.get('manufacturer', 'N/A')} {dev.get('model', 'N/A')} (Android {dev.get('android_version', 'N/A')})")
        battery = report.get("battery", {})
        print(f"[*] Battery Capacity: {battery.get('level_percent', 'N/A')}%")
        network = report.get("network", {})
        print(f"[*] Connectivity: Wifi={network.get('transport_wifi', False)} Cellular={network.get('transport_cellular', False)}")
        
    print("=============================================")

if __name__ == "__main__":
    main()
