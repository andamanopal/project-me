from apscheduler.schedulers.asyncio import AsyncIOScheduler
import logging
from typing import Dict
import pendulum

from .limitless_client import LimitlessClient
from .lifelog_tracker import filter_new_lifelogs, mark_multiple_lifelogs_as_processed
from .langgraph_client import LangGraphClient
from .line_client import LINEClient
from .database import load_todos

logger = logging.getLogger(__name__)

# Initialize scheduler
scheduler = AsyncIOScheduler()


async def process_lifelog_with_llm(lifelog: Dict) -> None:
    """
    Process lifelog with hybrid keyword detection and LLM analysis.
    Uses broad keyword matching first, then sends to LLM for deeper analysis.
    
    Args:
        lifelog: The lifelog entry to process
    """
    # Broad keywords to catch potential task-related content
    broad_keywords = [
        "remind me", "remind", "already finish", "finish"
    ]
    
    logger.info(f"Processing lifelog {lifelog.get('id')} with hybrid approach")

    lifelog_whole_markdown = lifelog.get('markdown')

    if not lifelog_whole_markdown:
        logger.info(f"🚨 No markdown found for lifelog {lifelog.get('id')}")
        return
    
    # Convert to lowercase for case-insensitive matching
    text_lower = lifelog_whole_markdown.lower()
    
    # Check if ANY broad keyword exists (more flexible than exact matching)
    found_keywords = []
    for keyword in broad_keywords:
        if keyword in text_lower:
            found_keywords.append(keyword)
    
    if found_keywords:
        logger.info(f"✅ Found potential task keywords: {', '.join(found_keywords)} in lifelog {lifelog.get('id')}")
        logger.info(f"✅ MARKDOWN: {lifelog_whole_markdown}")
        logger.info(f"📤 Sending to LangGraph for deeper analysis...")
        
        # Send to LangGraph server for intelligent processing
        langgraph_client = LangGraphClient()
        is_success = await langgraph_client.process_lifelog(lifelog)

        if is_success:
            logger.info(f"✅ Successfully processed lifelog {lifelog.get('id')} with LangGraph")
        else:
            logger.warning(f"⚠️ LangGraph processing did not complete successfully for lifelog {lifelog.get('id')}")
        
    else:
        logger.info(f"⏭️ Skipping lifelog {lifelog.get('id')} - no task-related keywords found")


async def search_and_process_last_1_hour_lifelogs():
    """
    Search for reminder and completion lifelogs and process new ones
    """
    try:
        logger.info("Starting lifelog search and processing...")
        
        # Initialize Limitless client
        client = LimitlessClient()
        
        # Search for reminder and completion lifelogs
        now = pendulum.now(tz="Asia/Bangkok")
        start_datetime = now.subtract(hours=1).to_iso8601_string()
        end_datetime = now.to_iso8601_string()
        all_lifelogs = client.search_for_reminders_and_completions(start=start_datetime, end=end_datetime)
        
        if not all_lifelogs:
            logger.info("No lifelogs found matching keywords")
            return
        
        # Filter out already processed lifelogs
        new_lifelogs = filter_new_lifelogs(all_lifelogs)
        
        if not new_lifelogs:
            logger.info(f"😪 Found {len(all_lifelogs)} lifelogs, but all have been processed already")
            return
        
        logger.info(f"🔔 Found {len(new_lifelogs)} new lifelogs to process")
        
        # Process each new lifelog with LLM
        processed_ids = []
        for lifelog in new_lifelogs:
            try:
                await process_lifelog_with_llm(lifelog)
                processed_ids.append(lifelog.get('id'))
                logger.info(f"Successfully processed lifelog {lifelog.get('id')}")
            except Exception as e:
                logger.error(f"Error processing lifelog {lifelog.get('id')}: {e}")
        
        # Mark successfully processed lifelogs
        if processed_ids:
            mark_multiple_lifelogs_as_processed(processed_ids)
            logger.info(f"Marked {len(processed_ids)} lifelogs as processed")
        
    except Exception as e:
        logger.error(f"Error in lifelog search and processing: {e}")


async def send_todo_update_to_line():
    """
    Send current todo list to LINE.
    Can be called on-demand or scheduled.
    """
    try:
        logger.info("📱 Sending todo update to LINE...")
        
        # Load current todos
        df = load_todos()
        todos = []
        
        if not df.empty:
            for _, row in df.iterrows():
                todos.append({
                    "id": int(row["id"]),
                    "title": row["title"],
                    "status": row["status"]
                })
        
        # Send via LINE
        line_client = LINEClient()
        success = await line_client.send_todo_update(todos)
        
        if success:
            logger.info("✅ Todo update sent to LINE successfully")
        else:
            logger.error("❌ Failed to send todo update to LINE")
            
        return success
        
    except Exception as e:
        logger.error(f"Error sending LINE update: {str(e)}")
        return False


def start_scheduler():
    """Start the scheduler with cron jobs"""
    
    # 1. Lifelog processing - every 15 seconds (change to minutes=15 for production)
    scheduler.add_job(
        search_and_process_last_1_hour_lifelogs,
        "interval",
        seconds=15,  # Change to minutes=15 for production
        id="lifelog_processing"
    )
    
    # 2. LINE todo updates - cron job
    scheduler.add_job(
        send_todo_update_to_line,
        "cron",
        hour="9,18",  # 9 AM and 6 PM
        timezone="Asia/Bangkok",
        id="line_scheduled_update"
    )
    
    scheduler.start()
    logger.info("Scheduler started:")
    logger.info("  - Lifelog processing: every 15 seconds")


def stop_scheduler():
    """Stop the scheduler"""
    scheduler.shutdown()
    logger.info("Scheduler shutdown")