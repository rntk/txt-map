from fastapi import FastAPI
from handlers import themed_post_handler

app = FastAPI(title="My FastAPI App", description="A simple FastAPI application with separate handlers")

app.include_router(themed_post_handler.router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
