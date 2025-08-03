"""LINE Messaging API client for sending todo updates."""

import os
import httpx
import logging
from typing import Dict, List, Optional
from datetime import datetime
import pendulum
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


class LINEClient:
    """Client for sending messages via LINE Messaging API"""
    
    def __init__(self):
        self.channel_access_token = os.getenv("LINE_CHANNEL_ACCESS_TOKEN")
        self.user_id = os.getenv("LINE_USER_ID")  # Your personal LINE user ID
        
        if not self.channel_access_token:
            logger.warning("LINE_CHANNEL_ACCESS_TOKEN not set in environment")
        if not self.user_id:
            logger.warning("LINE_USER_ID not set in environment")
            
        self.api_url = "https://api.line.me/v2/bot/message/push"
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.channel_access_token}"
        }
        
        logger.info(f"LINE client initialized for user: {self.user_id[:10]}..." if self.user_id else "LINE client initialized (no user ID)")
    
    async def send_message(self, text: str, to: Optional[str] = None) -> bool:
        """
        Send a text message via LINE.
        
        Args:
            text: The message text to send
            to: Recipient user/group/room ID (defaults to configured user_id)
            
        Returns:
            True if successful, False otherwise
        """
        if not self.channel_access_token:
            logger.error("Cannot send LINE message: No channel access token configured")
            return False
            
        recipient = to or self.user_id
        if not recipient:
            logger.error("Cannot send LINE message: No recipient specified")
            return False
        
        payload = {
            "to": recipient,
            "messages": [
                {
                    "type": "text",
                    "text": text
                }
            ]
        }
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.api_url,
                    headers=self.headers,
                    json=payload,
                    timeout=10.0
                )
                
                if response.status_code == 200:
                    logger.info(f"✅ LINE message sent successfully to {recipient[:10]}...")
                    return True
                else:
                    logger.error(f"❌ Failed to send LINE message: {response.status_code} - {response.text}")
                    return False
                    
        except httpx.TimeoutException:
            logger.error("Timeout sending LINE message")
            return False
        except Exception as e:
            logger.error(f"Error sending LINE message: {str(e)}")
            return False
    
    async def send_todo_update(self, todos: List[Dict]) -> bool:
        """
        Send a formatted todo list update via LINE.
        
        Args:
            todos: List of todo items with 'id', 'title', and 'status'
            
        Returns:
            True if successful, False otherwise
        """
        if not todos:
            message = "To-Do\n\nNo todos found. Your list is empty! 🎉"
        else:
            # Format the message with simple list
            message_parts = ["To-Do"]
            message_parts.append("")
            
            # Add all todos with appropriate emoji
            for todo in todos:
                if todo.get('status') == 'done':
                    message_parts.append(f"✅ {todo['title']}")
                else:
                    message_parts.append(f"❌ {todo['title']}")
            
            message = "\n".join(message_parts)
        
        # Ensure message doesn't exceed LINE's limit (5000 characters)
        if len(message) > 5000:
            message = message[:4997] + "..."
        
        return await self.send_message(message)
    
