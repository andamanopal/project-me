"""Todo management tools for LangGraph agent."""

import os
import sys
import pandas as pd
from pathlib import Path
from typing import Dict, List, Optional, Literal
from datetime import datetime
from langchain_core.tools import tool
from src.services.line import send_line_update_sync
import logging

logger = logging.getLogger(__name__)

# Add the fastapi-server directory to the path to import database functions
FASTAPI_SERVER_PATH = Path(__file__).parent.parent.parent.parent.parent / "fastapi-server"
sys.path.insert(0, str(FASTAPI_SERVER_PATH))

# CSV file path - using the same file as FastAPI
TODOS_CSV_FILE = FASTAPI_SERVER_PATH / "todos.csv"


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


def get_todos_for_line() -> List[Dict]:
    """Get all todos formatted for LINE notification"""
    df = load_todos()
    todos = []
    if not df.empty:
        for _, row in df.iterrows():
            todos.append({
                "id": int(row["id"]),
                "title": row["title"],
                "status": row["status"]
            })
    return todos


@tool
def add_todo(title: str) -> Dict:
    """
    Add a new todo item to the list.

    Args:
        title: The description of the todo item to add

    Returns:
        Dict containing the created todo details with id, title, and status
    """
    try:
        df = load_todos()

        new_id = get_next_id()
        timestamp = datetime.now().isoformat()

        # Create new row
        new_row = pd.DataFrame([{
            "id": new_id,
            "timestamp": timestamp,
            "title": title,
            "status": "active"
        }])

        # Append to dataframe
        df = pd.concat([df, new_row], ignore_index=True)
        save_todos(df)

        # Send LINE notification with updated todo list
        try:
            todos = get_todos_for_line()
            line_success = send_line_update_sync(todos)
            if line_success:
                logger.info(f"LINE notification sent for new todo: {title}")
            else:
                logger.warning("Failed to send LINE notification for new todo")
        except Exception as e:
            logger.error(f"Error sending LINE notification: {str(e)}")

        return {
            "success": True,
            "message": f"Todo created successfully",
            "todo": {
                "id": new_id,
                "title": title,
                "status": "active",
                "timestamp": timestamp
            }
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to create todo: {str(e)}"
        }


@tool
def update_todo_status(todo_id: int, status: Literal["active", "done"]) -> Dict:
    """
    Update the status of an existing todo item by its ID.

    Args:
        todo_id: The ID of the todo item to update
        status: The new status - either "active" or "done"

    Returns:
        Dict containing success status and message
    """
    try:
        df = load_todos()

        # Find todo by ID
        todo_index = df[df["id"] == todo_id].index
        if todo_index.empty:
            return {
                "success": False,
                "message": f"Todo with ID {todo_id} not found"
            }

        idx = todo_index[0]
        old_status = df.at[idx, "status"]

        # Update status
        df.at[idx, "status"] = status
        save_todos(df)

        # Send LINE notification with updated todo list
        try:
            todos = get_todos_for_line()
            line_success = send_line_update_sync(todos)
            if line_success:
                logger.info(f"LINE notification sent for todo status update: {todo_id}")
            else:
                logger.warning("Failed to send LINE notification for status update")
        except Exception as e:
            logger.error(f"Error sending LINE notification: {str(e)}")

        return {
            "success": True,
            "message": f"Todo {todo_id} status updated from '{old_status}' to '{status}'",
            "todo": {
                "id": todo_id,
                "title": df.at[idx, "title"],
                "status": status
            }
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to update todo: {str(e)}"
        }


@tool
def get_all_todos() -> Dict:
    """
    Get all current todos with their status.

    Returns:
        Dict containing lists of active and done todos
    """
    try:
        df = load_todos()

        if df.empty:
            return {
                "success": True,
                "total_count": 0,
                "active_todos": [],
                "done_todos": [],
                "message": "No todos found"
            }

        # Separate active and done todos
        active_df = df[df["status"] == "active"]
        done_df = df[df["status"] == "done"]

        active_todos = []
        for _, row in active_df.iterrows():
            active_todos.append({
                "id": int(row["id"]),
                "title": row["title"],
                "status": row["status"]
            })

        done_todos = []
        for _, row in done_df.iterrows():
            done_todos.append({
                "id": int(row["id"]),
                "title": row["title"],
                "status": row["status"]
            })

        return {
            "success": True,
            "total_count": len(df),
            "active_count": len(active_todos),
            "done_count": len(done_todos),
            "active_todos": active_todos,
            "done_todos": done_todos,
            "message": f"Found {len(active_todos)} active and {len(done_todos)} completed todos"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to get todos: {str(e)}"
        }
