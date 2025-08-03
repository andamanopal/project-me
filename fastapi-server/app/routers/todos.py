from fastapi import APIRouter, HTTPException
from typing import List, Optional
from datetime import datetime
import pandas as pd

from ..models import TodoItem, TodoCreate, TodoUpdate
from ..database import load_todos, save_todos, get_next_id, filter_todos_by_date

router = APIRouter(prefix="/todos", tags=["todos"])


@router.get("/", response_model=List[TodoItem])
async def get_todos(from_date: Optional[str] = None):
    """Get all todos, optionally filtered by from date (YYYY-MM-DD)"""
    try:
        df = load_todos()
        
        if df.empty:
            return []
        
        # Filter by date if provided
        if from_date:
            try:
                df = filter_todos_by_date(df, from_date)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid date format: {str(e)}")
        
        # Convert to list of TodoItem
        todos = []
        for _, row in df.iterrows():
            todos.append(TodoItem(
                id=int(row["id"]),
                timestamp=pd.to_datetime(row["timestamp"]),
                title=row["title"],
                status=row["status"]
            ))
        
        return todos
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading todos: {str(e)}")


@router.post("/", response_model=TodoItem)
async def create_todo(todo: TodoCreate):
    """Create a new todo item"""
    try:
        df = load_todos()
        
        new_id = get_next_id()
        timestamp = datetime.now()
        
        # Create new row
        new_row = pd.DataFrame([{
            "id": new_id,
            "timestamp": timestamp.isoformat(),
            "title": todo.title,
            "status": "active"
        }])
        
        # Append to dataframe
        df = pd.concat([df, new_row], ignore_index=True)
        save_todos(df)
        
        return TodoItem(
            id=new_id,
            timestamp=timestamp,
            title=todo.title,
            status="active"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating todo: {str(e)}")


@router.put("/{todo_id}", response_model=TodoItem)
async def update_todo(todo_id: int, todo_update: TodoUpdate):
    """Update a todo item by ID"""
    try:
        df = load_todos()
        
        # Find todo by ID
        todo_index = df[df["id"] == todo_id].index
        if todo_index.empty:
            raise HTTPException(status_code=404, detail="Todo not found")
        
        idx = todo_index[0]
        
        # Update fields if provided
        if todo_update.title is not None:
            df.at[idx, "title"] = todo_update.title
        if todo_update.status is not None:
            df.at[idx, "status"] = todo_update.status
        
        save_todos(df)
        
        # Return updated todo
        row = df.iloc[idx]
        return TodoItem(
            id=int(row["id"]),
            timestamp=pd.to_datetime(row["timestamp"]),
            title=row["title"],
            status=row["status"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating todo: {str(e)}")


@router.delete("/{todo_id}")
async def delete_todo(todo_id: int):
    """Delete a todo item by ID"""
    try:
        df = load_todos()
        
        # Find todo by ID
        todo_exists = df[df["id"] == todo_id]
        if todo_exists.empty:
            raise HTTPException(status_code=404, detail="Todo not found")
        
        # Remove the todo
        df = df[df["id"] != todo_id]
        save_todos(df)
        
        return {"message": f"Todo {todo_id} deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting todo: {str(e)}")