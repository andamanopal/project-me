#!/usr/bin/env python3
"""Generate daily summaries from raw Limitless JSON using Claude Haiku.

This script reads raw JSON files from data/raw/limitless/,
generates daily summaries with Claude Haiku, and saves them to
data/processed/limitless/ for review before pushing to Supabase/ES.

Usage:
    # Process all JSON files in data/raw/limitless/
    python scripts/limitless/2_generate.py

    # Process specific date range
    python scripts/limitless/2_generate.py --start 2025-11-01 --end 2025-12-31

    # Skip dates that already have processed summaries
    python scripts/limitless/2_generate.py --skip-existing
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

from src.services.daily_summary import (
    CHUNK_TARGET_TOKENS,
    MAX_TOKENS_SINGLE_PASS,
    _count_tokens,
    _format_sources_for_prompt,
    generate_daily_summary,
)

RAW_DATA_DIR = Path(__file__).parent.parent.parent / "data" / "raw" / "limitless"
PROCESSED_DIR = Path(__file__).parent.parent.parent / "data" / "processed" / "limitless"


def ensure_dirs():
    """Create necessary directories."""
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


def get_available_dates() -> list[date]:
    """Get list of dates that have raw JSON files."""
    if not RAW_DATA_DIR.exists():
        return []

    dates = []
    for file_path in RAW_DATA_DIR.glob("*.json"):
        try:
            date_str = file_path.stem  # e.g., "2025-11-01"
            dates.append(date.fromisoformat(date_str))
        except ValueError:
            continue

    return sorted(dates)


def load_raw_json(target_date: date) -> list[dict] | None:
    """Load raw lifelog data from JSON file."""
    file_path = RAW_DATA_DIR / f"{target_date.isoformat()}.json"
    if not file_path.exists():
        return None

    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
        return data.get("lifelogs", [])


def processed_exists(target_date: date) -> bool:
    """Check if processed summary file exists."""
    file_path = PROCESSED_DIR / f"{target_date.isoformat()}.json"
    return file_path.exists()


def lifelogs_to_sources(lifelogs: list[dict]) -> list[dict]:
    """Convert Limitless lifelogs to source format for daily summary."""
    sources = []

    for ll in lifelogs:
        content_parts = []

        if ll.get("title"):
            content_parts.append(f"**{ll['title']}**")

        if ll.get("markdown"):
            content_parts.append(ll["markdown"])
        elif ll.get("contents"):
            for content in ll["contents"]:
                if content.get("type") == "heading1":
                    content_parts.append(f"# {content.get('content', '')}")
                elif content.get("type") == "heading2":
                    content_parts.append(f"## {content.get('content', '')}")
                elif content.get("type") == "blockquote":
                    content_parts.append(f"> {content.get('content', '')}")
                else:
                    content_parts.append(content.get("content", ""))

        if not content_parts:
            continue

        sources.append({
            "source_type": "lifelog",
            "source_id": ll.get("id", "unknown"),
            "content": "\n".join(content_parts),
            "timestamp": ll.get("startTime", ""),
        })

    sources.sort(key=lambda x: x.get("timestamp", ""))
    return sources


def save_processed_summary(
    target_date: date,
    summary_text: str,
    sources: list[dict],
) -> Path:
    """Save processed summary to JSON file."""
    file_path = PROCESSED_DIR / f"{target_date.isoformat()}.json"
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "date": target_date.isoformat(),
                "summary_text": summary_text,
                "summary_length": len(summary_text),
                "source_count": len(sources),
                "sources": sources,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )
    return file_path


async def generate_summary_for_date(
    target_date: date,
    lifelogs: list[dict],
) -> tuple[str | None, list[dict], dict]:
    """Generate summary using Claude Haiku.

    Returns:
        Tuple of (summary_text, sources, metadata) or (None, [], {}) on failure.
        metadata contains: token_count, method ("single_pass" or "refine_chain"), chunks
    """
    if not lifelogs:
        return None, [], {}

    sources = lifelogs_to_sources(lifelogs)
    if not sources:
        return None, [], {}

    # Count tokens to determine method
    formatted = _format_sources_for_prompt(sources)
    token_count = _count_tokens(formatted)

    if token_count > MAX_TOKENS_SINGLE_PASS:
        method = "refine_chain"
        chunks = (token_count // CHUNK_TARGET_TOKENS) + 1
    else:
        method = "single_pass"
        chunks = 1

    metadata = {
        "token_count": token_count,
        "method": method,
        "chunks": chunks,
    }

    try:
        summary_text = await generate_daily_summary(sources, target_date)
        return summary_text, sources, metadata
    except Exception as e:
        print(f"ERROR: {e}")
        return None, [], metadata


async def main():
    parser = argparse.ArgumentParser(
        description="Generate daily summaries from raw Limitless JSON"
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
        "--skip-existing",
        action="store_true",
        help="Skip dates that already have processed summaries",
    )

    args = parser.parse_args()

    ensure_dirs()

    # Get available dates from JSON files
    available_dates = get_available_dates()

    if not available_dates:
        print("No JSON files found in data/raw/limitless/")
        print("Run 1_fetch.py first to download data.")
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
    print("Generate Daily Summaries (Claude Haiku)")
    print("=" * 60)
    print(f"Input dir:     {RAW_DATA_DIR}")
    print(f"Output dir:    {PROCESSED_DIR}")
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
        if args.skip_existing and processed_exists(target_date):
            print("- skipped (processed file exists)")
            skip_count += 1
            continue

        # Load raw data
        lifelogs = load_raw_json(target_date)
        if lifelogs is None:
            print("- skipped (no raw file)")
            skip_count += 1
            continue

        if not lifelogs:
            print("- skipped (0 lifelogs)")
            skip_count += 1
            continue

        print(f"- {len(lifelogs)} lifelogs -> ", end="", flush=True)

        summary_text, sources, metadata = await generate_summary_for_date(target_date, lifelogs)

        if summary_text:
            save_processed_summary(target_date, summary_text, sources)
            token_info = f"{metadata.get('token_count', 0):,} tokens"
            method = metadata.get('method', 'unknown')
            if method == "refine_chain":
                method_info = f"refine({metadata.get('chunks', 0)} chunks)"
            else:
                method_info = "single_pass"
            print(f"{token_info} [{method_info}] -> {len(summary_text)} chars -> OK")
            success_count += 1
        else:
            print("FAILED")
            error_count += 1

    # Summary
    print()
    print("=" * 60)
    print("Generation Complete")
    print("=" * 60)
    print(f"Total dates:  {len(available_dates)}")
    print(f"Generated:    {success_count}")
    print(f"Skipped:      {skip_count}")
    print(f"Errors:       {error_count}")
    print(f"Output dir:   {PROCESSED_DIR}")
    print("=" * 60)
    print()
    print("Review the generated summaries, then run:")
    print("  python scripts/limitless/3_push.py <user_id>")


if __name__ == "__main__":
    asyncio.run(main())
