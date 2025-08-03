import pandas as pd
import os
from typing import Optional

# CSV file path
TODOS_CSV_FILE = "todos.csv"


def load_todos() -> pd.DataFrame:
    """Load todos from CSV file"""
    if not os.path.exists(TODOS_CSV_FILE):
        # Create empty CSV with headers
        df = pd.DataFrame(columns=["id", "timestamp", "title", "status"])
        df.to_csv(TODOS_CSV_FILE, index=False)
        return df
    return pd.read_csv(TODOS_CSV_FILE)


def save_todos(df: pd.DataFrame) -> None:
    """Save todos to CSV file"""
    df.to_csv(TODOS_CSV_FILE, index=False)


def get_next_id() -> int:
    """Get next available ID"""
    df = load_todos()
    if df.empty:
        return 1
    return int(df["id"].max()) + 1


def filter_todos_by_date(df: pd.DataFrame, from_date: str) -> pd.DataFrame:
    """Filter todos by date"""
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    from_datetime = pd.to_datetime(from_date)
    return df[df["timestamp"] >= from_datetime]