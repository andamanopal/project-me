"""
LangGraph LLM Service for Pipecat.

Provides LLM inference by calling a remote LangGraph server
via OpenAI-compatible API endpoint.

This follows the same pattern as Pipecat's TogetherLLMService and GroqLLMService,
extending OpenAILLMService and using base_url to point to our custom endpoint.
"""

from loguru import logger

from pipecat.services.openai.llm import OpenAILLMService


class LangGraphLLMService(OpenAILLMService):
    """
    LLM service that calls a remote LangGraph server.
    
    Extends OpenAILLMService to connect to a LangGraph server's
    OpenAI-compatible API endpoint. This is the same pattern used
    by TogetherLLMService and GroqLLMService in Pipecat.
    """

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str = "not-needed",
        model: str = "langgraph-agent",
        **kwargs
    ):
        """
        Initialize LangGraph LLM service.

        Args:
            base_url: Base URL of the LangGraph server (e.g., https://xxx.ngrok.io/v1)
            api_key: API key for authentication (default: "not-needed" for local dev)
            model: Model name to send (default: langgraph-agent)
            **kwargs: Additional keyword arguments passed to OpenAILLMService
        """
        # Ensure base_url ends with /v1 for OpenAI compatibility
        if not base_url.rstrip("/").endswith("/v1"):
            base_url = base_url.rstrip("/") + "/v1"
        
        super().__init__(
            api_key=api_key,
            base_url=base_url,
            model=model,
            **kwargs
        )
        
        logger.info(f"LangGraphLLMService initialized with base_url: {base_url}")

    def create_client(self, api_key=None, base_url=None, **kwargs):
        """Create OpenAI-compatible client for LangGraph API endpoint.

        Args:
            api_key: API key for authentication. If None, uses instance api_key.
            base_url: Base URL for the API. If None, uses instance base_url.
            **kwargs: Additional arguments passed to the client constructor.

        Returns:
            An OpenAI-compatible client configured for LangGraph's API.
        """
        logger.debug(f"Creating LangGraph client with base_url: {base_url}")
        return super().create_client(api_key, base_url, **kwargs)
