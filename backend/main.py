import os
import sys
from pathlib import Path


def _ensure_venv() -> None:
    here = Path(__file__).resolve().parent
    venv_python = here / ".venv" / "bin" / "python3"
    if not venv_python.exists():
        sys.stderr.write(
            f"venv not found at {venv_python}\n"
            "Set it up first:\n"
            "  python3.12 -m venv .venv\n"
            "  .venv/bin/pip install -r requirements.txt\n"
        )
        sys.exit(1)
    if Path(sys.executable).resolve() != venv_python.resolve():
        os.execv(str(venv_python), [str(venv_python), __file__, *sys.argv[1:]])


_ensure_venv()

import uvicorn


if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8099")),
        reload=os.getenv("RELOAD", "false").lower() == "true",
    )
