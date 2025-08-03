"""LangGraph client for sending lifelogs to the agent for processing."""

import os
import httpx
import logging
from typing import Dict, Optional
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class LangGraphClient:
    """Client for interacting with LangGraph server"""
    
    def __init__(self):
        self.api_url = os.getenv("LANGGRAPH_URL", "http://localhost:2024")
        self.assistant_id = os.getenv("LANGGRAPH_ASSISTANT_ID", "agent")
        logger.info(f"LangGraph client initialized - URL: {self.api_url}, Assistant: {self.assistant_id}")
    
    async def process_lifelog(self, lifelog: Dict) -> Optional[Dict]:
        """
        Send a lifelog to LangGraph for processing.
        
        Args:
            lifelog: The lifelog dictionary containing id, markdown content, etc.
            
        Returns:
            Response from LangGraph or None if error
        """
        lifelog_id = lifelog.get('id')
        lifelog_content = lifelog.get('markdown', '')
        
        if not lifelog_content:
            logger.warning(f"No content in lifelog {lifelog_id}")
            return None
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                # Step 1: Create a new thread for this lifelog
                logger.info(f"Creating thread for lifelog {lifelog_id}")
                thread_response = await client.post(
                    f"{self.api_url}/threads",
                    headers={'Content-Type': 'application/json'},
                    json={}
                )
                thread_response.raise_for_status()
                thread_data = thread_response.json()
                thread_id = thread_data.get("thread_id")
                logger.info(f"Thread created: {thread_id}")
                
                # Step 2: Send the lifelog content with instructions
                prompt = f"""Analyze this lifelog and determine if it contains any tasks or completed items.
                
                    If it contains a new task/reminder:
                    - Use the add_todo tool to create it
                    - Extract the core task from the text

                    If it mentions completing/finishing a task:
                    - First use get_all_todos to see current tasks
                    - Try to match it with an existing todo
                    - Use update_todo_status to mark it as done

                    Please also check the existing todos first to avoid creating duplicates.

                    Lifelog content:
                    {lifelog_content}

                    Only create or update todos if you're confident this is task-related. Respond with what action you took.
                """
                
                logger.info(f"Sending lifelog {lifelog_id} to LangGraph for analysis")
                run_response = await client.post(
                    f"{self.api_url}/threads/{thread_id}/runs/wait",
                    headers={'Content-Type': 'application/json'},
                    json={
                        "assistant_id": self.assistant_id,
                        "input": {
                            "messages": [{
                                "type": "human",
                                "content": prompt
                            }]
                        }
                    }
                )
                run_response.raise_for_status()
                
                result = run_response.json()
                
                # Extract the assistant's response
                messages = result.get('messages', [])
                if messages:
                    # Get the last assistant message
                    assistant_response = messages[-1].get('content', 'No response')
                    logger.info(f"✅ LangGraph processed lifelog {lifelog_id}: {assistant_response[:100]}...")
                    return True
                else:
                    logger.error(f"🚨 LangGraph processing failed for lifelog {lifelog_id}: {result.get('error')}")
                    return False
                
            except httpx.TimeoutException:
                logger.error(f"Timeout processing lifelog {lifelog_id}")
                return None
            except httpx.HTTPStatusError as e:
                logger.error(f"HTTP error processing lifelog {lifelog_id}: {e.response.status_code} - {e.response.text}")
                return None
            except Exception as e:
                logger.error(f"Unexpected error processing lifelog {lifelog_id}: {str(e)}")
                return None