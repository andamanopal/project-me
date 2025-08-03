#!/usr/bin/env python3
"""Push processed summaries to Supabase and Elasticsearch.

This script reads processed summary files from data/processed/limitless/
and pushes them to Supabase (source of truth) and ES (search index).

Usage:
    # Push all processed summaries
    python scripts/limitless/3_push.py <user_id>

    # Push specific date range
    python scripts/limitless/3_push.py <user_id> --start 2025-11-01 --end 2025-12-31

    # Skip dates that already exist in Supabase
    python scripts/limitless/3_push.py <user_id> --skip-existing
"""

import os
import warnings

# Suppress tokenizers fork warning
os.environ["TOKENIZERS_PARALLELISM"] = "false"

# Suppress aiohttp unclosed session warnings (harmless at script exit)
warnings.filterwarnings("ignore", message="Unclosed client session")
warnings.filterwarnings("ignore", message="Unclosed connector")

import argparse
import asyncio
import json
import sys
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

# Add langgraph-server to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

load_dotenv()

from src.services.daily_summary import get_daily_summary, save_and_index_summary

PROCESSED_DIR = Path(__file__).parent.parent.parent / "data" / "processed" / "limitless"


def get_available_dates() -> list[date]:
    """Get list of dates that have processed summary files."""
    if not PROCESSED_DIR.exists():
        return []

    dates = []
    for file_path in PROCESSED_DIR.glob("*.json"):
        try:
            date_str = file_path.stem  # e.g., "2025-11-01"
            dates.append(date.fromisoformat(date_str))
        except ValueError:
            continue

    return sorted(dates)


def load_processed_summary(target_date: date) -> dict | None:
    """Load processed summary from JSON file."""
    file_path = PROCESSED_DIR / f"{target_date.isoformat()}.json"
    if not file_path.exists():
        return None

    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


async def check_summary_exists(user_id: str, target_date: date) -> bool:
    """Check if a daily summary already exists in Supabase."""
    summary = await get_daily_summary(user_id, target_date)
    return summary is not None


async def push_summary(
    user_id: str,
    target_date: date,
    summary_text: str,
    sources: list[dict],
) -> str | None:
    """Push summary to Supabase and ES.

    Returns:
        Summary ID if successful, None otherwise.
    """
    try:
        summary_id = await save_and_index_summary(
            user_id=user_id,
            summary_date=target_date,
            summary_text=summary_text,
            sources=sources,
        )
        return summary_id
    except Exception as e:
        print(f"ERROR: {e}")
        return None


async def main():
    parser = argparse.ArgumentParser(
        description="Push processed summaries to Supabase and ES"
    )
    parser.add_argument("user_id", help="Supabase user ID")
    parser.add_argument(
        "--start",
        type=lambda s: date.fromisoformat(s),
        help="Start date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--end",
        type=lambda s: date.fromisoformat(s),
        help="End date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip dates that already exist in Supabase",
    )

    args = parser.parse_args()

    # Get available dates from processed files
    available_dates = get_available_dates()

    if not available_dates:
        print("No processed files found in data/processed/limitless/")
        print("Run 2_generate.py first to generate summaries.")
        sys.exit(1)

    # Filter by date range if specified
    if args.start:
        available_dates = [d for d in available_dates if d >= args.start]
    if args.end:
        available_dates = [d for d in available_dates if d <= args.end]

    if not available_dates:
        print("No dates match the specified range.")
        sys.exit(1)

    print("=" * 60)
    print("Push Summaries to Supabase/ES")
    print("=" * 60)
    print(f"User ID:       {args.user_id[:8]}...")
    print(f"Input dir:     {PROCESSED_DIR}")
    print(f"Date range:    {available_dates[0]} to {available_dates[-1]}")
    print(f"Total dates:   {len(available_dates)}")
    print(f"Skip existing: {args.skip_existing}")
    print("=" * 60)
    print()

    success_count = 0
    skip_count = 0
    error_count = 0

    for i, target_date in enumerate(available_dates, 1):
        print(f"[{i}/{len(available_dates)}] {target_date}", end=" ")

        # Check if should skip
        if args.skip_existing:
            exists = await check_summary_exists(args.user_id, target_date)
            if exists:
                print("- skipped (exists in Supabase)")
                skip_count += 1
                continue

        # Load processed summary
        data = load_processed_summary(target_date)
        if data is None:
            print("- skipped (no processed file)")
            skip_count += 1
            continue

        summary_text = data.get("summary_text")
        sources = data.get("sources", [])

        if not summary_text:
            print("- skipped (empty summary)")
            skip_count += 1
            continue

        print(f"- pushing {len(summary_text)} chars...", end=" ")

        summary_id = await push_summary(
            args.user_id, target_date, summary_text, sources
        )

        if summary_id:
            print(f"OK ({summary_id[:8]}...)")
            success_count += 1
        else:
            print("FAILED")
            error_count += 1

    # Summary
    print()
    print("=" * 60)
    print("Push Complete")
    print("=" * 60)
    print(f"Total dates:  {len(available_dates)}")
    print(f"Pushed:       {success_count}")
    print(f"Skipped:      {skip_count}")
    print(f"Errors:       {error_count}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
