import io
import zipfile
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

router = APIRouter()

EXTENSION_DIR = Path(__file__).parent.parent / "extension"

_EXCLUDED = {"node_modules", "__pycache__", ".git"}
_EXCLUDED_FILES = {"package-lock.json"}
# Files where __API_URL__ placeholder should be replaced at download time
_URL_INJECT_FILES = {"config.js", "manifest.json"}


def _build_extension_zip(api_url: str) -> bytes:
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

            arcname = str(path.relative_to(EXTENSION_DIR))

            if path.name in _URL_INJECT_FILES:
                content = path.read_text().replace("__API_URL__", api_url).encode()
                zf.writestr(arcname, content)
            else:
                zf.write(path, arcname)

    return buffer.getvalue()


@router.get("/extension/download")
def download_extension(request: Request) -> StreamingResponse:
    api_url = str(request.base_url).rstrip("/")
    zip_bytes = _build_extension_zip(api_url)
    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="extension.zip"'},
    )
