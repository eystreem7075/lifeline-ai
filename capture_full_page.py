import os
import subprocess
import time
import shutil

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
temp_dir = os.path.join(os.environ["TEMP"], "browser_capture_profile_3")
os.makedirs(temp_dir, exist_ok=True)

target_dir = r"C:\Users\manik\.gemini\antigravity-ide\brain\34984a52-5003-47b2-aff6-b3ef9d9bd3b0"

# Capture taller window size (1440 x 2200) to see all cards, tables, and audit logs!
out_temp = os.path.join(os.environ["TEMP"], "module2_full_page.png")
if os.path.exists(out_temp):
    os.remove(out_temp)

cmd = [
    chrome_path,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    f"--user-data-dir={temp_dir}",
    "--window-size=1440,2200",
    "--virtual-time-budget=5000",
    f"--screenshot={out_temp}",
    "http://localhost:5173/?section=traffic-preemption"
]

subprocess.run(cmd, check=False)
time.sleep(2)

if os.path.exists(out_temp):
    dest = os.path.join(target_dir, "module2_full_page.png")
    shutil.copy2(out_temp, dest)
    print("SUCCESS: module2_full_page.png saved! Size:", os.path.getsize(dest))
else:
    print("FAILED")

# Also capture Module 1 (1440 x 1400)
out_mod1 = os.path.join(os.environ["TEMP"], "module1_full_page.png")
if os.path.exists(out_mod1):
    os.remove(out_mod1)

cmd_mod1 = [
    chrome_path,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    f"--user-data-dir={temp_dir}",
    "--window-size=1440,1400",
    "--virtual-time-budget=5000",
    f"--screenshot={out_mod1}",
    "http://localhost:5173/?section=command-center"
]
subprocess.run(cmd_mod1, check=False)
time.sleep(2)

if os.path.exists(out_mod1):
    dest1 = os.path.join(target_dir, "module1_full_page.png")
    shutil.copy2(out_mod1, dest1)
    print("SUCCESS: module1_full_page.png saved! Size:", os.path.getsize(dest1))
