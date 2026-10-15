import subprocess
import time
import os
import shutil

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
browser_exe = chrome_path if os.path.exists(chrome_path) else edge_path

temp_dir = os.path.join(os.environ["TEMP"], "browser_capture_profile")
os.makedirs(temp_dir, exist_ok=True)

target_dir = r"C:\Users\manik\.gemini\antigravity-ide\brain\34984a52-5003-47b2-aff6-b3ef9d9bd3b0"
os.makedirs(target_dir, exist_ok=True)

# 1. Capture Module 2: Smart Traffic Signal Preemption
out_mod2_temp = os.path.join(os.environ["TEMP"], "module2_traffic_dashboard.png")
if os.path.exists(out_mod2_temp):
    os.remove(out_mod2_temp)

cmd_mod2 = [
    browser_exe,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    f"--user-data-dir={temp_dir}",
    "--window-size=1440,960",
    f"--screenshot={out_mod2_temp}",
    "http://localhost:5173/?section=traffic-preemption"
]
print("Running capture for Module 2...")
subprocess.run(cmd_mod2, check=False)
time.sleep(2)

if os.path.exists(out_mod2_temp):
    dest_mod2 = os.path.join(target_dir, "module2_traffic_dashboard.png")
    shutil.copy2(out_mod2_temp, dest_mod2)
    print("SUCCESS: Module 2 screenshot saved to", dest_mod2, "Size:", os.path.getsize(dest_mod2))
else:
    print("FAILED: Module 2 screenshot not generated")

# 2. Capture Module 1: Emergency Command Center
out_mod1_temp = os.path.join(os.environ["TEMP"], "module1_command_center.png")
if os.path.exists(out_mod1_temp):
    os.remove(out_mod1_temp)

cmd_mod1 = [
    browser_exe,
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    f"--user-data-dir={temp_dir}",
    "--window-size=1440,960",
    f"--screenshot={out_mod1_temp}",
    "http://localhost:5173/?section=command-center"
]
print("Running capture for Module 1...")
subprocess.run(cmd_mod1, check=False)
time.sleep(2)

if os.path.exists(out_mod1_temp):
    dest_mod1 = os.path.join(target_dir, "module1_command_center.png")
    shutil.copy2(out_mod1_temp, dest_mod1)
    print("SUCCESS: Module 1 screenshot saved to", dest_mod1, "Size:", os.path.getsize(dest_mod1))
else:
    print("FAILED: Module 1 screenshot not generated")
