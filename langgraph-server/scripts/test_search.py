#!/usr/bin/env python3
"""Test search_daily_summaries function.

Usage:
    uv run python scripts/test_search.py <user_id> --query "dentist"
    uv run python scripts/test_search.py <user_id> --start 2025-12-01 --end 2025-12-05
    uv run python scripts/test_search.py <user_id> --query "meeting" --start 2025-12-01
"""

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))
load_dotenv()

from src.services.daily_summary import search_daily_summaries

parser = argparse.ArgumentParser(description="Test search_daily_summaries")
parser.add_argument("user_id", help="User ID")
parser.add_argument("--query", "-q", help="Search query")
parser.add_argument("--start", help="Start date (YYYY-MM-DD)")
parser.add_argument("--end", help="End date (YYYY-MM-DD)")
parser.add_argument("--top-k", "-k", type=int, default=5, help="Number of results")

args = parser.parse_args()

print(f"Searching: query={args.query}, start={args.start}, end={args.end}, top_k={args.top_k}")
print("-" * 60)

results = search_daily_summaries(
    query=args.query,
    user_id=args.user_id,
    top_k=args.top_k,
    start_date=args.start,
    end_date=args.end,
)

print(f"Found {len(results)} results:\n")
for i, r in enumerate(results, 1):
    date = r.get("metadata", {}).get("summary_date", "?")
    content = r.get("content", "")[:200]
    print(f"[{i}] {date}")
    print(f"    {content}...")
    print()
