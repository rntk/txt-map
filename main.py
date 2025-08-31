from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from handlers import themed_post_handler

app = FastAPI(title="My FastAPI App", description="A simple FastAPI application with separate handlers")

app.mount("/static", StaticFiles(directory="frontend/build/static"), name="static")

app.include_router(themed_post_handler.router, prefix="/api")

@app.get("/page/themed-post")
def serve_themed_post_page():
    return FileResponse("frontend/build/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
