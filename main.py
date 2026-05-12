from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from handlers import (
    auth_handler,
    canvas_handler,
    diff_handler,
    extension_handler,
    llm_cache_handler,
    llm_providers_handler,
    llm_queue_handler,
    llm_worker_handler,
    settings_handler,
    submission_handler,
    task_queue_handler,
    tokens_handler,
)
from handlers.auth_handler import require_auth
from lifespan import lifespan

frontend_build_dir: Path = Path("frontend/build")
legacy_static_dir: Path = frontend_build_dir / "static"
vite_assets_dir: Path = frontend_build_dir / "assets"
FRONTEND_INDEX: str = "frontend/build/index.html"


@dataclass(frozen=True)
class RouterRegistration:
    router: APIRouter
    requires_auth: bool = True


ROUTERS: tuple[RouterRegistration, ...] = (
    RouterRegistration(auth_handler.router, requires_auth=False),
    RouterRegistration(tokens_handler.router),
    RouterRegistration(llm_providers_handler.router),
    RouterRegistration(submission_handler.router),
    RouterRegistration(task_queue_handler.router),
    RouterRegistration(llm_queue_handler.router),
    RouterRegistration(llm_worker_handler.router),
    RouterRegistration(diff_handler.router),
    RouterRegistration(llm_cache_handler.router),
    RouterRegistration(settings_handler.router),
    RouterRegistration(extension_handler.router),
    RouterRegistration(canvas_handler.router),
)

FRONTEND_ROUTES: tuple[str, ...] = (
    "/",
    "/page/menu",
    "/page/text/{submission_id}",
    "/page/word/{submission_id}/{word}",
    "/page/tasks",
    "/page/llm-tasks",
    "/page/texts",
    "/page/diff",
    "/page/cache",
    "/page/topics",
    "/page/topic-analysis/{submission_id}",
    "/page/topic-hierarchy/{submission_id}",
    "/page/canvas/{submission_id}",
    "/page/login",
    "/page/tokens",
    "/page/llm-providers",
)


def configure_cors(fastapi_app: FastAPI) -> None:
    # Allow extension/background fetches (OPTIONS preflight for JSON POST).
    # allow_credentials=False because the frontend is same-origin.
    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )


def mount_frontend_assets(fastapi_app: FastAPI) -> None:
    # Support both legacy CRA output (`build/static`) and Vite output (`build/assets`).
    if legacy_static_dir.is_dir():
        fastapi_app.mount(
            "/static",
            StaticFiles(directory=str(legacy_static_dir)),
            name="static",
        )
    if vite_assets_dir.is_dir():
        fastapi_app.mount(
            "/assets",
            StaticFiles(directory=str(vite_assets_dir)),
            name="assets",
        )


def include_api_routers(fastapi_app: FastAPI) -> None:
    for registration in ROUTERS:
        dependencies = [Depends(require_auth)] if registration.requires_auth else []
        fastapi_app.include_router(
            registration.router,
            prefix="/api",
            dependencies=dependencies,
        )


def _frontend_route_name(route: str) -> str:
    if route == "/":
        return "frontend_root"
    slug = route.strip("/").replace("/", "_").replace("{", "").replace("}", "")
    return f"frontend_{slug}"


def register_frontend_routes(fastapi_app: FastAPI, routes: Sequence[str]) -> None:
    for route in routes:
        fastapi_app.add_api_route(
            route,
            serve_frontend_page,
            methods=["GET"],
            response_class=FileResponse,
            name=_frontend_route_name(route),
        )


def get_frontend_index_response() -> FileResponse:
    if not Path(FRONTEND_INDEX).is_file():
        raise HTTPException(status_code=404, detail="Frontend build not found")
    return FileResponse(FRONTEND_INDEX)


def serve_frontend_page() -> FileResponse:
    return get_frontend_index_response()


def create_app() -> FastAPI:
    fastapi_app: FastAPI = FastAPI(
        title="My FastAPI App",
        description="A simple FastAPI application with separate handlers",
        lifespan=lifespan,
    )
    configure_cors(fastapi_app)
    mount_frontend_assets(fastapi_app)
    include_api_routers(fastapi_app)
    register_frontend_routes(fastapi_app, FRONTEND_ROUTES)
    return fastapi_app


app: FastAPI = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
