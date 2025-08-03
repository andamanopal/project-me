from fastapi import FastAPI
from contextlib import asynccontextmanager
import logging

from app.routers import todos, health, line
from app.scheduler import start_scheduler, stop_scheduler

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    start_scheduler()
    
    yield
    
    # Shutdown
    stop_scheduler()


# Initialize FastAPI app
app = FastAPI(
    title="Simple FastAPI Server",
    description="FastAPI server with 15-minute cron job and TODO management",
    version="1.0.0",
    lifespan=lifespan
)

# Include routers
app.include_router(health.router)
app.include_router(todos.router)
app.include_router(line.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)