import pendulum
import requests
from typing import Optional, Dict, List
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()


class LimitlessClient:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv('LIMITLESS_API_KEY')
        print(f"✅ Limitless API key: {self.api_key}")
        if not self.api_key:
            raise ValueError("API key is required. Set LIMITLESS_API_KEY environment variable or pass it to constructor.")
        
        self.base_url = "https://api.limitless.ai/v1"
        self.headers = {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json"
        }
    
    def search_lifelogs(
        self, 
        search: Optional[str] = None,
        start: Optional[str] = None,
        end: Optional[str] = None,
        timezone: Optional[str] = 'Asia/Bangkok',
        is_starred: Optional[bool] = None,
        limit: Optional[int] = 20,
        offset: Optional[int] = 0
    ) -> Dict:
        """
        Search lifelogs with various filters
        
        Args:
            search: Semantic search query
            start_time: ISO 8601 timestamp for start range
            end_time: ISO 8601 timestamp for end range
            timezone: Timezone for date filter
            is_starred: Filter by starred status
            limit: Number of results to return (max 100)
            offset: Pagination offset
        
        Returns:
            Dict containing lifelog entries
        """
        endpoint = f"{self.base_url}/lifelogs"
        params = {}
        
        if search:
            params['search'] = search
        if start:
            params['start'] = pendulum.parse(start, tz=timezone).format("YYYY-MM-DD[T]HH:mm:ss")
        if end:
            params['end'] = pendulum.parse(end, tz=timezone).format("YYYY-MM-DD[T]HH:mm:ss")
        if timezone:
            params['timezone'] = timezone
        if is_starred is not None:
            params['isStarred'] = str(is_starred).lower()
        if limit:
            params['limit'] = min(limit, 100)
        if offset:
            params['offset'] = offset
        
        try:
            print(f"💬 Searching for lifelogs with params: {params}")
            response = requests.get(endpoint, headers=self.headers, params=params)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error fetching lifelogs: {e}")
            if hasattr(e, 'response') and e.response:
                print(f"Response content: {e.response.text}")
            raise
    
    def get_lifelog(self, lifelog_id: str) -> Dict:
        """
        Get a specific lifelog entry by ID
        
        Args:
            lifelog_id: The ID of the lifelog entry
        
        Returns:
            Dict containing the lifelog entry
        """
        endpoint = f"{self.base_url}/lifelogs/{lifelog_id}"
        
        try:
            response = requests.get(endpoint, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error fetching lifelog {lifelog_id}: {e}")
            raise
    
    def search_for_reminders_and_completions(self, start: Optional[str] = None, end: Optional[str] = None) -> List[Dict]:
        """
        Search lifelogs for reminder and completion content
        
        Args:
            start: Optional start date filter in ISO 8601 format
            end: Optional end date filter in ISO 8601 format
        
        Returns:
            List of lifelog entries that contain reminders or completions
        """
        keywords = [
            "remind me to",
            "I've already finish",
            "I already finish",
            "I finished",
            "completed",
            "done with"
        ]

        keyworks_search = " OR ".join(keywords)
        
        try:
            results = self.search_lifelogs(search=keyworks_search, start=start, end=end, limit=50)
            if results.get('data', {}).get('lifelogs'):
                lifelogs = results['data']['lifelogs']
        except Exception as e:
            print(f"Error searching for '{keyworks_search}': {e}")
        
        # Remove duplicates based on ID
        seen_ids = set()
        unique_results = []
        for result in lifelogs:
            if result.get('id') not in seen_ids:
                seen_ids.add(result.get('id'))
                unique_results.append(result)

        print(f"💬 Found {len(unique_results)} unique reminder/completion results")
        
        return unique_results