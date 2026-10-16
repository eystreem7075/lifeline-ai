"""
Root entrypoint for Render and other cloud platforms.
Allows running 'uvicorn main:app' whether the Root Directory is set to 'backend' or repository root.
"""
import sys
from pathlib import Path

backend_path = Path(__file__).resolve().parent / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from backend.main import app  # noqa: F401
