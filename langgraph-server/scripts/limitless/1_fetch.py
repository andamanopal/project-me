#!/usr/bin/env python3
"""Fetch Limitless lifelogs and save to JSON files.

This script fetches data from Limitless API day by day and saves
raw JSON to data/raw/limitless/{YYYY-MM-DD}.json

Usage:
    # Fetch last 7 days (default)
    python scripts/limitless/1_fetch.py

    # Fetch specific date range
    python scripts/limitless/1_fetch.py --start 2025-11-01 --end 2025-12-31

    # Fetch last 30 days
    python scripts/limitless/1_fetch.py --days 30

    # Skip dates that already have JSON files
    python scripts/limitless/1_fetch.py --skip-existing
"""

import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

# Configuration
LIMITLESS_API_KEY = os.getenv("LIMITLESS_API_KEY")
LIMITLESS_BASE_URL = "https://api.limitless.ai/v1"
RAW_DATA_DIR = Path(__file__).parent.parent.parent / "data" / "raw" / "limitless"
TIMEZONE = "Asia/Bangkok"


def ensure_dirs():
    """Create necessary directories."""
    RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)


def fetch_lifelogs_for_date(target_date: date) -> list[dict]:
    """Fetch lifelogs from Limitless API for a specific date.

    Args:
        target_date: Date to fetch lifelogs for.

    Returns:
        List of lifelog entries.
    """
    if not LIMITLESS_API_KEY:
        print("Error: LIMITLESS_API_KEY not set in environment")
        sys.exit(1)

    headers = {
        "X-API-Key": LIMITLESS_API_KEY,
        "Content-Type": "application/json",
    }

    date_str = target_date.isoformat()
    params = {
        "start": f"{date_str}T00:00:00",
        "end": f"{date_str}T23:59:59",
        "timezone": TIMEZONE,
        "limit": 100,
    }

    all_lifelogs = []
    cursor = None

    while True:
        if cursor:
            params["cursor"] = cursor

        try:
            response = requests.get(
                f"{LIMITLESS_BASE_URL}/lifelogs",
                headers=headers,
                params=params,
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()

            lifelogs = data.get("data", {}).get("lifelogs", [])
            all_lifelogs.extend(lifelogs)

            # Check for pagination
            cursor = data.get("meta", {}).get("lifelogs", {}).get("nextCursor")
            if not cursor:
                break

        except requests.RequestException as e:
            print(f"  Error fetching: {e}")
            break

    return all_lifelogs


def save_raw_json(target_date: date, lifelogs: list[dict]) -> Path:
    """Save raw lifelog data to JSON file.

    Args:
        target_date: Date of the lifelogs.
        lifelogs: List of lifelog entries.

    Returns:
        Path to saved file.
    """
    file_path = RAW_DATA_DIR / f"{target_date.isoformat()}.json"
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "date": target_date.isoformat(),
                "fetched_at": datetime.now().isoformat(),
                "count": len(lifelogs),
                "lifelogs": lifelogs,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )
    return file_path


def file_exists(target_date: date) -> bool:
    """Check if raw JSON file exists for date."""
    file_path = RAW_DATA_DIR / f"{target_date.isoformat()}.json"
    return file_path.exists()


def main():
    parser = argparse.ArgumentParser(
        description="Fetch Limitless lifelogs and save to JSON"
    )
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
        "--days",
        type=int,
        default=7,
        help="Number of days to fetch (default: 7)",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip dates that already have JSON files",
    )

    args = parser.parse_args()

    ensure_dirs()

    # Determine date range
    if args.start and args.end:
        start_date = args.start
        end_date = args.end
    elif args.start:
        start_date = args.start
        end_date = date.today()
    else:
        end_date = date.today()
        start_date = end_date - timedelta(days=args.days - 1)

    print("=" * 60)
    print("Limitless Data Fetch")
    print("=" * 60)
    print(f"Date range:    {start_date} to {end_date}")
    print(f"Output dir:    {RAW_DATA_DIR}")
    print(f"Skip existing: {args.skip_existing}")
    print("=" * 60)
    print()

    # Fetch each date
    current_date = start_date
    total_days = (end_date - start_date).days + 1
    fetch_count = 0
    skip_count = 0
    total_lifelogs = 0

    while current_date <= end_date:
        day_num = (current_date - start_date).days + 1

        # Check if should skip
        if args.skip_existing and file_exists(current_date):
            print(f"[{day_num}/{total_days}] {current_date} - skipped (exists)")
            skip_count += 1
            current_date += timedelta(days=1)
            continue

        print(f"[{day_num}/{total_days}] {current_date} - fetching...", end=" ")

        lifelogs = fetch_lifelogs_for_date(current_date)

        if not lifelogs:
            print("0 lifelogs, skipped")
            skip_count += 1
            current_date += timedelta(days=1)
            continue

        file_path = save_raw_json(current_date, lifelogs)
        print(f"{len(lifelogs)} lifelogs -> {file_path.name}")

        fetch_count += 1
        total_lifelogs += len(lifelogs)
        current_date += timedelta(days=1)

    # Summary
    print()
    print("=" * 60)
    print("Fetch Complete")
    print("=" * 60)
    print(f"Total days:    {total_days}")
    print(f"Fetched:       {fetch_count}")
    print(f"Skipped:       {skip_count}")
    print(f"Total lifelogs: {total_lifelogs}")
    print(f"Output dir:    {RAW_DATA_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
