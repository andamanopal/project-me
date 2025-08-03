"""LINE integration router for manual todo updates."""

from fastapi import APIRouter, HTTPException
import logging

from ..scheduler import send_todo_update_to_line

router = APIRouter(prefix="/line", tags=["line"])
logger = logging.getLogger(__name__)


@router.post("/send-todo-update")
async def send_todo_update():
    """
    Manually trigger sending todo update to LINE.
    
    Returns:
        Dict with success status and message
    """
    try:
        logger.info("Manual LINE todo update requested")
        success = await send_todo_update_to_line()
        
        if success:
            return {
                "status": "success",
                "message": "Todo update sent to LINE successfully"
            }
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to send todo update to LINE. Check logs for details."
            )
            
    except Exception as e:
        logger.error(f"Error in manual LINE update: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error sending LINE update: {str(e)}"
        )