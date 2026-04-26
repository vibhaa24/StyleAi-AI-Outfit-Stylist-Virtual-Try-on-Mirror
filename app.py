"""Top-level launcher for the outfit stylist app."""

from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parent
CANDIDATES = [
	ROOT / "ai_outfit_stylist" / "ai_outfit_stylist" / "backend_server.py",
	ROOT / "ai_outfit_stylist" / "ai_outfit_stylist" / "app.py",
	ROOT / "ai_outfit_stylist" / "app.py",
	ROOT / "ai_outfit_stylist" / "app_test.py",
	ROOT / "ai_outfit_stylist" / "ai_outfit_stylist" / "app_test.py",
]

TARGET = next((path for path in CANDIDATES if path.exists()), None)

if TARGET is None:
	searched = "\n".join(str(path) for path in CANDIDATES)
	raise FileNotFoundError(f"Could not find app launcher. Searched:\n{searched}")

runpy.run_path(str(TARGET), run_name="__main__")
