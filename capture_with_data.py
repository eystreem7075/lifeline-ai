import os
import subprocess
import time
import shutil

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
temp_dir = os.path.join(os.environ["TEMP"], "browser_capture_profile_2")
os.makedirs(temp_dir, exist_ok=True)

target_dir = r"C:\Users\manik\.gemini\antigravity-ide\brain\34984a52-5003-47b2-aff6-b3ef9d9bd3b0"
out_temp = os.path.join(os.environ["TEMP"], "module2_loaded.png")

if os.path.exists(out_temp):
    os.remove(out_temp)

# In headless Chrome, we can tell it to run with virtual time budget so fetches complete
cmd = [
    chrome_path,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    f"--user-data-dir={temp_dir}",
    "--window-size=1440,1050",
    "--virtual-time-budget=5000",
    f"--screenshot={out_temp}",
    "http://localhost:5173/?section=traffic-preemption"
]

subprocess.run(cmd, check=False)
time.sleep(2)

if os.path.exists(out_temp):
    dest = os.path.join(target_dir, "module2_loaded.png")
    shutil.copy2(out_temp, dest)
    print("SUCCESS: module2_loaded.png saved! Size:", os.path.getsize(dest))
else:
    print("FAILED to create screenshot")
