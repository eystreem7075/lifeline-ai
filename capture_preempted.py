import urllib.request
import json
import time
import subprocess
import os
import shutil

# 1. Reset simulation to svims_critical
body = json.dumps({"scenario_id": "svims_critical"}).encode()
req = urllib.request.Request("http://127.0.0.1:8000/api/traffic/simulation/reset", data=body, headers={"Content-Type": "application/json"})
urllib.request.urlopen(req)

# 2. Trigger preemption on INT-102 for AMB-101
body_p = json.dumps({"intersection_id": "INT-102", "ambulance_code": "AMB-101", "direction": "EW"}).encode()
req_p = urllib.request.Request("http://127.0.0.1:8000/api/traffic/preemption/request", data=body_p, headers={"Content-Type": "application/json"})
urllib.request.urlopen(req_p)

# 3. Step forward 5 seconds to pass Yellow Clearance (3s) and All-Red Hold (2s) into PREEMPTION_GREEN
req_tick = urllib.request.Request("http://127.0.0.1:8000/api/traffic/simulation/tick?dt=5", data=b"", method="POST")
urllib.request.urlopen(req_tick)

time.sleep(1)

# 4. Capture screenshot of Active Preemption Green State
chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
temp_dir = os.path.join(os.environ["TEMP"], "browser_capture_profile")
out_active_temp = os.path.join(os.environ["TEMP"], "module2_active_preemption.png")

cmd = [
    chrome_path,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    f"--user-data-dir={temp_dir}",
    "--window-size=1440,960",
    f"--screenshot={out_active_temp}",
    "http://localhost:5173/?section=traffic-preemption"
]
subprocess.run(cmd, check=False)
time.sleep(1)

target_dir = r"C:\Users\manik\.gemini\antigravity-ide\brain\34984a52-5003-47b2-aff6-b3ef9d9bd3b0"
if os.path.exists(out_active_temp):
    dest = os.path.join(target_dir, "module2_active_preemption.png")
    shutil.copy2(out_active_temp, dest)
    print("SUCCESS: Active preemption screenshot saved to", dest, "Size:", os.path.getsize(dest))
