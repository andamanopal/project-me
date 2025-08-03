import requests
from typing import Optional, Dict, List
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()


class LimitlessClient:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv('LIMITLESS_API_KEY')
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
        date: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        timezone: Optional[str] = 'Asia/Bangkok',
        is_starred: Optional[bool] = None,
        limit: Optional[int] = 20,
        offset: Optional[int] = 0
    ) -> Dict:
        """
        Search lifelogs with various filters
        
        Args:
            search: Semantic search query
            date: Date in YYYY-MM-DD format
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
        if date:
            params['date'] = date
        if start_time:
            params['start_time'] = start_time
        if end_time:
            params['end_time'] = end_time
        if timezone:
            params['timezone'] = timezone
        if is_starred is not None:
            params['is_starred'] = str(is_starred).lower()
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
    
    def delete_lifelog(self, lifelog_id: str) -> bool:
        """
        Delete a specific lifelog entry
        
        Args:
            lifelog_id: The ID of the lifelog entry to delete
        
        Returns:
            True if successful
        """
        endpoint = f"{self.base_url}/lifelogs/{lifelog_id}"
        
        try:
            response = requests.delete(endpoint, headers=self.headers)
            response.raise_for_status()
            return True
        except requests.exceptions.RequestException as e:
            print(f"Error deleting lifelog {lifelog_id}: {e}")
            raise
    
    def search_for_tasks(self, date: Optional[str] = None) -> List[Dict]:
        """
        Search lifelogs for task-related content
        
        Args:
            date: Optional date filter in YYYY-MM-DD format
        
        Returns:
            List of lifelog entries that may contain tasks
        """
        task_keywords = [
            "remind me", "remember to", "don't forget", "reminder",
        ]
        
        all_results = []
        
        for keyword in task_keywords:
            try:
                results = self.search_lifelogs(search=keyword, date=date, limit=50)
                if results.get('data', {}).get('lifelogs'):
                    all_results.extend(results['data']['lifelogs'])
            except Exception as e:
                print(f"Error searching for '{keyword}': {e}")
        
        # Remove duplicates based on ID
        seen_ids = set()
        unique_results = []
        for result in all_results:
            if result.get('id') not in seen_ids:
                seen_ids.add(result.get('id'))
                unique_results.append(result)

        print(f"💬 Found {len(unique_results)} unique results")
        
        return unique_results