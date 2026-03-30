import io
import zipfile
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter()

EXTENSION_DIR = Path(__file__).parent.parent / "extension"

_EXCLUDED = {"node_modules", "__pycache__", ".git"}
_EXCLUDED_FILES = {"package-lock.json"}


def _build_extension_zip() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(EXTENSION_DIR.rglob("*")):
            if path.is_dir():
                continue
            parts = path.relative_to(EXTENSION_DIR).parts
            if any(part in _EXCLUDED for part in parts):
                continue
            if path.name in _EXCLUDED_FILES:
                continue
            zf.write(path, path.relative_to(EXTENSION_DIR))
    return buffer.getvalue()


@router.get("/extension/download")
def download_extension() -> StreamingResponse:
    zip_bytes = _build_extension_zip()
    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="extension.zip"'},
    )
