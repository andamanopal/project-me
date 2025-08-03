#!/usr/bin/env python3

import os
import sys
from datetime import datetime
from limitless_client import LimitlessClient
from task_parser import TaskParser

def fetch_tasks_for_date(date_str):
    """Fetch and display tasks for a specific date"""
    
    # Initialize client and parser
    client = LimitlessClient()
    parser = TaskParser()
    
    print(f"\nFetching tasks for {date_str}...\n")
    
    # Search for task-related lifelogs
    lifelogs = client.search_for_tasks(date=date_str)
    
    if not lifelogs:
        print("No lifelogs found for this date.")
        return
    
    print(f"Found {len(lifelogs)} lifelogs with potential tasks\n")
    
    # Extract tasks
    tasks = parser.extract_tasks_from_lifelogs(lifelogs)
    
    if not tasks:
        print("No tasks found in the lifelogs.")
        return
    
    # Display tasks
    print(f"Extracted {len(tasks)} tasks:\n")
    print("-" * 60)
    
    for i, task in enumerate(tasks, 1):
        print(f"{i}. {task.description}")
        if task.due_date:
            print(f"   Due: {task.due_date.strftime('%Y-%m-%d %H:%M')}")
        print(f"   Priority: {task.priority}")
        print()

if __name__ == "__main__":
    # Check API key
    if not os.getenv('LIMITLESS_API_KEY'):
        print("Error: Set LIMITLESS_API_KEY environment variable")
        sys.exit(1)
    
    # Get date from command line or use today
    if len(sys.argv) > 1:
        date = sys.argv[1]
    else:
        date = datetime.now().strftime("%Y-%m-%d")
    
    fetch_tasks_for_date('2025-07-31')