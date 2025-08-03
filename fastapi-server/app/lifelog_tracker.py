import pandas as pd
import os
from typing import List, Set

import pendulum

# CSV file for tracking processed lifelogs
PROCESSED_LIFELOGS_FILE = "processed_lifelogs.csv"


def load_processed_lifelogs() -> pd.DataFrame:
    """Load processed lifelogs from CSV file"""
    if not os.path.exists(PROCESSED_LIFELOGS_FILE):
        # Create empty CSV with headers
        df = pd.DataFrame(columns=["lifelog_id", "processed_at"])
        df.to_csv(PROCESSED_LIFELOGS_FILE, index=False)
        return df
    return pd.read_csv(PROCESSED_LIFELOGS_FILE)


def save_processed_lifelogs(df: pd.DataFrame) -> None:
    """Save processed lifelogs to CSV file"""
    df.to_csv(PROCESSED_LIFELOGS_FILE, index=False)


def get_processed_lifelog_ids() -> Set[str]:
    """Get set of all processed lifelog IDs"""
    df = load_processed_lifelogs()
    if df.empty:
        return set()
    return set(df["lifelog_id"].astype(str))


def is_lifelog_processed(lifelog_id: str) -> bool:
    """Check if a lifelog has already been processed"""
    processed_ids = get_processed_lifelog_ids()
    return str(lifelog_id) in processed_ids


def mark_lifelog_as_processed(lifelog_id: str) -> None:
    """Mark a lifelog as processed"""
    df = load_processed_lifelogs()
    
    # Check if already exists
    if not is_lifelog_processed(lifelog_id):
        new_row = pd.DataFrame([{
            "lifelog_id": str(lifelog_id),
            "processed_at": pendulum.now().to_atom_string()
        }])
        
        df = pd.concat([df, new_row], ignore_index=True)
        save_processed_lifelogs(df)


def mark_multiple_lifelogs_as_processed(lifelog_ids: List[str]) -> None:
    """Mark multiple lifelogs as processed in batch"""
    df = load_processed_lifelogs()
    processed_ids = get_processed_lifelog_ids()
    
    new_rows = []
    for lifelog_id in lifelog_ids:
        if str(lifelog_id) not in processed_ids:
            new_rows.append({
                "lifelog_id": str(lifelog_id),
                "processed_at": pendulum.now().to_atom_string()
            })
    
    if new_rows:
        new_df = pd.DataFrame(new_rows)
        df = pd.concat([df, new_df], ignore_index=True)
        save_processed_lifelogs(df)


def filter_new_lifelogs(lifelogs: List[dict]) -> List[dict]:
    """Filter out already processed lifelogs from a list"""
    processed_ids = get_processed_lifelog_ids()
    new_lifelogs = []
    
    for lifelog in lifelogs:
        lifelog_id = str(lifelog.get('id', ''))
        if lifelog_id and lifelog_id not in processed_ids:
            new_lifelogs.append(lifelog)
    
    return new_lifelogs