from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from handlers import submission_handler, task_queue_handler, diff_handler, llm_cache_handler, settings_handler, extension_handler, llm_queue_handler
from lifespan import lifespan

app = FastAPI(
    title="My FastAPI App",
    description="A simple FastAPI application with separate handlers",
    lifespan=lifespan,
)

# Allow extension/background fetches (OPTIONS preflight for JSON POST).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

frontend_build_dir = Path("frontend/build")
legacy_static_dir = frontend_build_dir / "static"
vite_assets_dir = frontend_build_dir / "assets"

# Support both legacy CRA output (`build/static`) and Vite output (`build/assets`).
if legacy_static_dir.is_dir():
    app.mount("/static", StaticFiles(directory=str(legacy_static_dir)), name="static")
if vite_assets_dir.is_dir():
    app.mount("/assets", StaticFiles(directory=str(vite_assets_dir)), name="assets")

app.include_router(submission_handler.router, prefix="/api")
app.include_router(task_queue_handler.router, prefix="/api")
app.include_router(llm_queue_handler.router, prefix="/api")
app.include_router(diff_handler.router, prefix="/api")
app.include_router(llm_cache_handler.router, prefix="/api")
app.include_router(settings_handler.router, prefix="/api")
app.include_router(extension_handler.router, prefix="/api")


FRONTEND_INDEX = "frontend/build/index.html"


@app.get("/")
@app.get("/page/menu")
@app.get("/page/text/{submission_id}")
@app.get("/page/word/{submission_id}/{word}")
@app.get("/page/tasks")
@app.get("/page/llm-tasks")
@app.get("/page/texts")
@app.get("/page/diff")
@app.get("/page/cache")
@app.get("/page/topics")
@app.get("/page/topic-analysis/{submission_id}")
def serve_frontend_page():
    return FileResponse(FRONTEND_INDEX)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
