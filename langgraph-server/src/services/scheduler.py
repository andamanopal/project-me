"""Background job scheduler for periodic tasks.

Uses APScheduler for cron-based job scheduling:
- Daily summary generation runs nightly at 11:59 PM
- Pattern detection runs nightly at 2 AM
- Other periodic tasks can be added here

Usage:
    from src.services.scheduler import scheduler, start_scheduler

    # Start scheduler on app startup
    start_scheduler()
"""

import asyncio
import logging
from datetime import date, datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler = AsyncIOScheduler()


async def nightly_summary_generation():
    """Generate daily summaries for users with activity today.

    Runs nightly at 11:59 PM to synthesize all sources (check-ins, lifelogs)
    into LLM-generated daily summaries.
    """
    from src.services.daily_summary import (
        gather_sources_for_date,
        generate_daily_summary,
        get_users_with_activity_today,
        save_and_index_summary,
    )

    logger.info("Starting nightly summary generation job")

    try:
        today = date.today()
        users = await get_users_with_activity_today()
        logger.info(f"Found {len(users)} users with activity today")

        success_count = 0
        error_count = 0

        for user_id in users:
            try:
                # Gather sources for today
                sources = await gather_sources_for_date(user_id, today)

                if not sources:
                    logger.debug(f"No sources for user {user_id[:8]}... on {today}")
                    continue

                # Generate LLM summary
                summary_text = await generate_daily_summary(sources, today)

                # Save to Supabase and index to ES
                summary_id = await save_and_index_summary(
                    user_id=user_id,
                    summary_date=today,
                    summary_text=summary_text,
                    sources=sources,
                )

                if summary_id:
                    logger.info(
                        f"Generated summary for user {user_id[:8]}... "
                        f"date={today} sources={len(sources)}"
                    )
                    success_count += 1
                else:
                    error_count += 1

            except Exception as e:
                logger.error(f"Summary generation failed for {user_id[:8]}...: {e}")
                error_count += 1

        logger.info(
            f"Nightly summary generation complete: "
            f"{success_count} success, {error_count} errors"
        )

    except Exception as e:
        logger.error(f"Nightly summary generation job failed: {e}")


async def nightly_pattern_detection():
    """Run pattern detection for users with new check-ins.

    Runs nightly at 2 AM to detect patterns in user memory history.
    Only processes users who have new check-ins since last run.
    """
    from src.services.pattern_detector import (
        detect_patterns,
        get_users_needing_pattern_update,
    )

    logger.info("Starting nightly pattern detection job")

    try:
        users = await get_users_needing_pattern_update()
        logger.info(f"Found {len(users)} users needing pattern update")

        success_count = 0
        error_count = 0

        for user_id in users:
            try:
                patterns = await detect_patterns(user_id)
                logger.info(
                    f"Detected {len(patterns)} patterns for user {user_id[:8]}..."
                )
                success_count += 1
            except Exception as e:
                logger.error(f"Pattern detection failed for {user_id[:8]}...: {e}")
                error_count += 1

        logger.info(
            f"Nightly pattern detection complete: "
            f"{success_count} success, {error_count} errors"
        )

    except Exception as e:
        logger.error(f"Nightly pattern detection job failed: {e}")


def start_scheduler():
    """Start the background job scheduler.

    Registers all scheduled jobs and starts the scheduler.
    Should be called once during application startup.
    """
    if scheduler.running:
        logger.warning("Scheduler already running")
        return

    # Daily summary generation: 11:59 PM daily
    # Runs before midnight to summarize the current day
    scheduler.add_job(
        nightly_summary_generation,
        trigger=CronTrigger(hour=23, minute=59),
        id="nightly_summary_generation",
        name="Nightly Summary Generation",
        replace_existing=True,
    )

    # Pattern detection: 2 AM daily
    scheduler.add_job(
        nightly_pattern_detection,
        trigger=CronTrigger(hour=2, minute=0),
        id="nightly_pattern_detection",
        name="Nightly Pattern Detection",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Background scheduler started with jobs:")
    for job in scheduler.get_jobs():
        logger.info(f"  - {job.name}: {job.trigger}")


def stop_scheduler():
    """Stop the background job scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=True)
        logger.info("Background scheduler stopped")


async def trigger_pattern_detection(user_id: str) -> list[dict]:
    """Manually trigger pattern detection for a specific user.

    Useful for on-demand pattern refresh from API.

    Args:
        user_id: User ID to analyze.

    Returns:
        List of detected patterns.
    """
    from src.services.pattern_detector import detect_patterns

    logger.info(f"Manual pattern detection triggered for user {user_id[:8]}...")
    return await detect_patterns(user_id)
