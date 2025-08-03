from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "FastAPI server is running"}


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    from ..scheduler import scheduler
    return {"status": "healthy", "scheduler_running": scheduler.running}