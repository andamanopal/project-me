"""Daily Summary service for Project-Me.

This module provides functions for:
- Gathering sources from multiple data stores (check-ins, lifelogs)
- Generating LLM-synthesized daily summaries
- Storing summaries in Supabase (source of truth)
- Indexing summaries to Elasticsearch (derived search cache)
- Hybrid search across daily summaries

The daily_summaries table in Supabase is the single source of truth.
Elasticsearch is a derived index that can be rebuilt from Supabase anytime.
"""

import logging
import os
from datetime import date, datetime, timezone
from typing import Any

import anthropic
import httpx
from dotenv import load_dotenv
from elasticsearch import Elasticsearch
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from llama_index.core import Document, Settings, StorageContext, VectorStoreIndex
from llama_index.embeddings.voyageai import VoyageEmbedding
from llama_index.vector_stores.elasticsearch import (
    AsyncDenseVectorStrategy,
    ElasticsearchStore,
)
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

load_dotenv()

logger = logging.getLogger(__name__)

# Configuration
ES_URL = os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")
DAILY_SUMMARIES_INDEX = os.getenv("DAILY_SUMMARIES_INDEX", "daily_summaries")
VOYAGE_EMBEDDING_MODEL = os.getenv("VOYAGE_EMBEDDING_MODEL", "voyage-3.5")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
LLM_TIMEOUT = 30.0  # 30 seconds for daily summary generation

# Token limit handling
HAIKU_MODEL = "claude-3-5-haiku-latest"
MAX_TOKENS_SINGLE_PASS = 180_000  # Haiku limit 200k, leave buffer
CHUNK_TARGET_TOKENS = 50_000  # Target tokens per chunk for refine chain

# Initialize embedding model
Settings.embed_model = VoyageEmbedding(model_name=VOYAGE_EMBEDDING_MODEL)
Settings.transformations = []
Settings.chunk_size = None

# Singleton Elasticsearch client
_es_client: Elasticsearch | None = None


def get_elasticsearch_client() -> Elasticsearch:
    """Get singleton Elasticsearch client with connection pooling."""
    global _es_client
    if _es_client is None:
        _es_client = Elasticsearch(
            [ES_URL],
            timeout=30,
            max_retries=3,
            retry_on_timeout=True,
        )
    return _es_client


# =============================================================================
# LLM Prompt for Daily Summary Generation
# =============================================================================

DAILY_SUMMARY_PROMPT = """You are synthesizing a user's day from multiple sources into a cohesive daily journal entry.

## Sources for {date}
{sources}

## Instructions
Create a daily summary that:
1. Synthesizes information chronologically when timestamps are available
2. Captures the emotional arc of the day
3. Highlights key events, accomplishments, and interactions
4. Notes any goals mentioned or progress made
5. Identifies concerns or stressors

## Output Format
Write a 2-3 paragraph narrative summary in first person, as if journaling.
Focus on what happened and how the user felt.
Be concise but capture nuance. Please also try to include all technical details, important numbers/figures, names if available.
Don't be TOO vague and general when doing summary. Remember, this is a memory.

If sources are sparse, create a brief summary acknowledging the available information.
Do NOT invent or assume content not present in the sources."""

REFINE_PROMPT = """You are refining a daily journal entry with additional sources.

## Current Summary
{current_summary}

## Additional Sources for {date}
{sources}

## Instructions
Integrate the new sources into the existing summary.
Keep the narrative cohesive and chronological.
Please also try to include all technical details, important numbers/figures, names if available.
Don't be TOO vague and general when doing summary. Remember, this is a memory.
Output the complete refined summary (2-3 paragraphs)."""


# =============================================================================
# Source Gathering
# =============================================================================


async def gather_sources_for_date(
    user_id: str,
    target_date: date,
) -> list[dict[str, Any]]:
    """Gather all sources for a specific date.

    Collects data from:
    - check_ins table (Supabase)
    - lifelogs index (Elasticsearch - temporary until migrated)

    Args:
        user_id: User ID for filtering.
        target_date: Date to gather sources for.

    Returns:
        List of source dicts with source_type, source_id, content, timestamp.
    """
    from src.services.supabase import get_supabase_client

    sources: list[dict[str, Any]] = []
    date_str = target_date.isoformat()

    # 1. Get check-ins from Supabase
    client = get_supabase_client()
    if client:
        try:
            response = (
                client.table("check_ins")
                .select("id, transcript, summary, created_at")
                .eq("user_id", user_id)
                .eq("status", "completed")
                .gte("created_at", f"{date_str}T00:00:00")
                .lt("created_at", f"{date_str}T23:59:59.999999")
                .order("created_at", desc=False)
                .execute()
            )

            for check_in in response.data or []:
                content_parts = []
                if check_in.get("transcript"):
                    content_parts.append(check_in["transcript"])

                summary = check_in.get("summary", {})
                if summary and not summary.get("error"):
                    if summary.get("events"):
                        content_parts.append(f"Events: {', '.join(summary['events'])}")
                    if summary.get("goals"):
                        content_parts.append(f"Goals: {', '.join(summary['goals'])}")

                if content_parts:
                    sources.append({
                        "source_type": "check_in",
                        "source_id": check_in["id"],
                        "content": "\n".join(content_parts),
                        "timestamp": check_in["created_at"],
                    })

            logger.info(f"Found {len(response.data or [])} check-ins for {date_str}")

        except Exception as e:
            logger.error(f"Error fetching check-ins for {date_str}: {e}")

    # 2. Get lifelogs from Elasticsearch (temporary - will be migrated)
    try:
        from src.services.elasticsearch import search_lifelogs

        # Search lifelogs for the target date
        lifelogs = search_lifelogs(
            query=None,
            user_id=user_id,
            top_k=50,
            start_time=f"{date_str}T00:00:00",
            end_time=f"{date_str}T23:59:59",
        )

        for ll in lifelogs:
            metadata = ll.get("metadata", {})
            sources.append({
                "source_type": "lifelog",
                "source_id": metadata.get("lifelog_id", "unknown"),
                "content": ll.get("content", ""),
                "timestamp": metadata.get("start_time", ""),
            })

        logger.info(f"Found {len(lifelogs)} lifelogs for {date_str}")

    except Exception as e:
        logger.warning(f"Error fetching lifelogs for {date_str}: {e}")

    # Sort by timestamp
    sources.sort(key=lambda x: x.get("timestamp", ""))

    return sources


# =============================================================================
# Summary Generation
# =============================================================================


def _format_sources_for_prompt(sources: list[dict[str, Any]]) -> str:
    """Format sources for LLM prompt."""
    if not sources:
        return "No sources available for this date."

    parts = []
    for i, source in enumerate(sources, 1):
        source_type = source.get("source_type", "unknown")
        timestamp = source.get("timestamp", "")
        content = source.get("content", "")

        # Parse timestamp for display
        time_str = ""
        if timestamp:
            try:
                dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                time_str = dt.strftime("%H:%M")
            except (ValueError, TypeError):
                pass

        header = f"[{source_type.upper()}"
        if time_str:
            header += f" at {time_str}"
        header += "]"

        parts.append(f"{header}\n{content}")

    return "\n\n---\n\n".join(parts)


def _count_tokens(text: str) -> int:
    """Count tokens using Anthropic's token counting API (free).

    Args:
        text: Text to count tokens for.

    Returns:
        Number of tokens.
    """
    if not text:
        return 0

    try:
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        result = client.messages.count_tokens(
            model=HAIKU_MODEL,
            messages=[{"role": "user", "content": text}],
        )
        return result.input_tokens
    except Exception as e:
        logger.warning(f"Token counting failed, using estimate: {e}")
        # Fallback: rough estimate ~4 chars per token
        return len(text) // 4


def _chunk_sources_by_tokens(
    sources: list[dict[str, Any]],
    target_tokens: int = CHUNK_TARGET_TOKENS,
) -> list[list[dict[str, Any]]]:
    """Split sources into chunks that fit within token limits.

    Args:
        sources: List of source dicts.
        target_tokens: Target tokens per chunk.

    Returns:
        List of source chunks.
    """
    if not sources:
        return []

    chunks: list[list[dict[str, Any]]] = []
    current_chunk: list[dict[str, Any]] = []
    current_tokens = 0

    for source in sources:
        source_text = _format_sources_for_prompt([source])
        source_tokens = _count_tokens(source_text)

        if current_tokens + source_tokens > target_tokens and current_chunk:
            # Start new chunk
            chunks.append(current_chunk)
            current_chunk = [source]
            current_tokens = source_tokens
        else:
            current_chunk.append(source)
            current_tokens += source_tokens

    if current_chunk:
        chunks.append(current_chunk)

    return chunks


async def _generate_with_refine(
    sources: list[dict[str, Any]],
    target_date: date,
) -> str:
    """Generate summary using refine chain for large inputs.

    Processes sources in chunks, iteratively refining the summary.

    Args:
        sources: List of source dicts.
        target_date: Date being summarized.

    Returns:
        Generated summary text.
    """
    chunks = _chunk_sources_by_tokens(sources)
    logger.info(f"Using refine chain with {len(chunks)} chunks for {target_date}")

    date_str = target_date.strftime("%B %d, %Y")
    llm = ChatAnthropic(
        model=HAIKU_MODEL,
        api_key=ANTHROPIC_API_KEY,
        max_tokens=2048,
        temperature=0.7,
        timeout=LLM_TIMEOUT,
    )

    current_summary = ""

    for i, chunk in enumerate(chunks):
        formatted_chunk = _format_sources_for_prompt(chunk)

        if i == 0:
            # First chunk: use standard prompt
            prompt = ChatPromptTemplate.from_template(DAILY_SUMMARY_PROMPT)
            messages = await prompt.ainvoke({
                "date": date_str,
                "sources": formatted_chunk,
            })
        else:
            # Subsequent chunks: refine existing summary
            prompt = ChatPromptTemplate.from_template(REFINE_PROMPT)
            messages = await prompt.ainvoke({
                "current_summary": current_summary,
                "date": date_str,
                "sources": formatted_chunk,
            })

        response = await llm.ainvoke(messages)
        current_summary = response.content.strip()
        logger.debug(f"Refine chunk {i + 1}/{len(chunks)}: {len(current_summary)} chars")

    return current_summary


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=4),
    retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TimeoutException)),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
async def generate_daily_summary(
    sources: list[dict[str, Any]],
    target_date: date,
) -> str:
    """Generate LLM-synthesized daily summary from sources.

    Uses single-pass for small inputs, refine chain for large inputs.

    Args:
        sources: List of source dicts with content.
        target_date: Date being summarized.

    Returns:
        Generated summary text.
    """
    if not ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY environment variable not set")

    if not sources:
        return f"No activities recorded for {target_date.isoformat()}."

    formatted_sources = _format_sources_for_prompt(sources)
    token_count = _count_tokens(formatted_sources)

    # Use refine chain for large inputs
    if token_count > MAX_TOKENS_SINGLE_PASS:
        logger.info(
            f"Large input ({token_count} tokens > {MAX_TOKENS_SINGLE_PASS}), "
            f"using refine chain for {target_date}"
        )
        return await _generate_with_refine(sources, target_date)

    # Single pass for normal inputs
    date_str = target_date.strftime("%B %d, %Y")

    try:
        llm = ChatAnthropic(
            model=HAIKU_MODEL,
            api_key=ANTHROPIC_API_KEY,
            max_tokens=2048,
            temperature=0.7,
            timeout=LLM_TIMEOUT,
        )

        prompt = ChatPromptTemplate.from_template(DAILY_SUMMARY_PROMPT)
        messages = await prompt.ainvoke({
            "date": date_str,
            "sources": formatted_sources,
        })
        response = await llm.ainvoke(messages)

        summary_text = response.content.strip()
        logger.info(f"Generated summary for {target_date}: {len(summary_text)} chars")

        return summary_text

    except Exception as e:
        logger.error(f"Daily summary generation failed for {target_date}: {e}")
        raise


# =============================================================================
# Storage and Indexing
# =============================================================================


async def save_and_index_summary(
    user_id: str,
    summary_date: date,
    summary_text: str,
    sources: list[dict[str, Any]],
) -> str | None:
    """Save summary to Supabase (source of truth) and index to ES.

    Args:
        user_id: User ID.
        summary_date: Date of the summary.
        summary_text: LLM-generated summary text.
        sources: List of sources that contributed.

    Returns:
        Summary ID if successful, None otherwise.
    """
    from src.services.supabase import get_supabase_client

    # Prepare source_entries for storage
    source_entries = [
        {
            "source_type": s.get("source_type"),
            "source_id": s.get("source_id"),
            "timestamp": s.get("timestamp"),
        }
        for s in sources
    ]

    # 1. Save to Supabase (source of truth)
    client = get_supabase_client()
    if not client:
        logger.error("Supabase client not available")
        return None

    try:
        data = {
            "user_id": user_id,
            "summary_date": summary_date.isoformat(),
            "summary_text": summary_text,
            "source_entries": source_entries,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

        # Upsert (update if exists, insert if not)
        response = (
            client.table("daily_summaries")
            .upsert(data, on_conflict="user_id,summary_date")
            .execute()
        )

        if not response.data:
            logger.error("Failed to save daily summary to Supabase")
            return None

        summary_id = response.data[0]["id"]
        logger.info(f"Saved daily summary {summary_id[:8]}... for {summary_date}")

    except Exception as e:
        logger.error(f"Error saving daily summary: {e}")
        return None

    # 2. Index to Elasticsearch (derived search cache)
    try:
        await _index_summary_to_es(
            user_id=user_id,
            summary_date=summary_date,
            summary_text=summary_text,
        )
    except Exception as e:
        # Non-fatal - ES can be rebuilt from Supabase
        logger.warning(f"Failed to index summary to ES (non-fatal): {e}")

    return summary_id


async def _index_summary_to_es(
    user_id: str,
    summary_date: date,
    summary_text: str,
) -> None:
    """Index summary to Elasticsearch.

    Args:
        user_id: User ID.
        summary_date: Date of the summary.
        summary_text: Summary text to index.
    """
    if not summary_text:
        return

    doc_id = f"{user_id}_{summary_date.isoformat()}"

    # Delete existing document if re-indexing
    es = get_elasticsearch_client()
    if es.indices.exists(index=DAILY_SUMMARIES_INDEX):
        try:
            es.delete_by_query(
                index=DAILY_SUMMARIES_INDEX,
                body={"query": {"term": {"metadata.doc_id": doc_id}}},
                refresh=True,
            )
        except Exception:
            pass  # Ignore if not found

    # Create document
    doc = Document(
        text=summary_text,
        metadata={
            "user_id": user_id,
            "summary_date": summary_date.isoformat(),
            "doc_id": doc_id,
        },
        doc_id=doc_id,
    )

    # Index with vector embeddings
    vector_store = ElasticsearchStore(
        es_url=ES_URL,
        index_name=DAILY_SUMMARIES_INDEX,
        retrieval_strategy=AsyncDenseVectorStrategy(hybrid=True),
    )
    storage_context = StorageContext.from_defaults(vector_store=vector_store)

    VectorStoreIndex.from_documents(
        [doc],
        storage_context=storage_context,
        transformations=[],  # No chunking for daily summaries
    )

    logger.info(f"Indexed summary to ES: {doc_id}")


# =============================================================================
# Search
# =============================================================================


def _calculate_recency_score(summary_date: str | None) -> float:
    """Calculate recency score (0-1) based on date age."""
    if not summary_date:
        return 0.0
    try:
        doc_date = date.fromisoformat(summary_date)
        today = date.today()
        age_days = (today - doc_date).days
        return max(0.1, 1.0 / (1 + age_days / 30))
    except (ValueError, TypeError):
        return 0.0


def search_daily_summaries(
    query: str | None = None,
    user_id: str | None = None,
    top_k: int = 5,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict]:
    """Search daily summaries using hybrid search.

    Args:
        query: Search query string for semantic/keyword search.
        user_id: User ID for filtering (required for multi-user).
        top_k: Number of results to return.
        start_date: Optional start date filter (YYYY-MM-DD).
        end_date: Optional end date filter (YYYY-MM-DD).

    Returns:
        List of matching results with content and metadata.
    """
    es = get_elasticsearch_client()

    if not es.indices.exists(index=DAILY_SUMMARIES_INDEX):
        logger.warning(f"Index '{DAILY_SUMMARIES_INDEX}' does not exist")
        return []

    # Time-only search
    if not query and (start_date or end_date):
        return _search_by_date_range(es, start_date, end_date, top_k, user_id)

    # Semantic search (with optional date filtering)
    if query:
        results = _search_hybrid(query, top_k * 2, user_id)

        # Apply date filtering if specified
        if start_date or end_date:
            results = _filter_by_date(results, start_date, end_date)
            results = results[:top_k]

        return results

    return []


def _search_hybrid(
    query: str,
    top_k: int,
    user_id: str | None = None,
    rrf_k: int = 60,
) -> list[dict]:
    """Perform hybrid search combining BM25 + vector similarity."""
    es = get_elasticsearch_client()

    # Get query embedding
    embed_model = Settings.embed_model
    query_embedding = embed_model.get_query_embedding(query)

    # Build user filter (.keyword for exact match)
    user_filter = {"term": {"metadata.user_id.keyword": user_id}} if user_id else None

    # BM25 search
    bm25_results = {}
    try:
        bm25_query: dict[str, Any] = {
            "bool": {
                "must": {"match": {"content": {"query": query, "fuzziness": "AUTO"}}}
            }
        }
        if user_filter:
            bm25_query["bool"]["filter"] = user_filter

        bm25_response = es.search(
            index=DAILY_SUMMARIES_INDEX,
            body={
                "query": bm25_query,
                "size": top_k * 2,
                "_source": ["content", "metadata"],
            },
        )
        for rank, hit in enumerate(bm25_response["hits"]["hits"]):
            bm25_results[hit["_id"]] = {
                "rank": rank + 1,
                "source": hit["_source"],
            }
    except Exception as e:
        logger.warning(f"BM25 search failed: {e}")

    # Vector (kNN) search
    vector_results = {}
    try:
        knn_query: dict[str, Any] = {
            "field": "embedding",
            "query_vector": query_embedding,
            "k": top_k * 2,
            "num_candidates": top_k * 10,
        }
        if user_filter:
            knn_query["filter"] = user_filter

        knn_response = es.search(
            index=DAILY_SUMMARIES_INDEX,
            body={"knn": knn_query, "_source": ["content", "metadata"]},
        )
        for rank, hit in enumerate(knn_response["hits"]["hits"]):
            vector_results[hit["_id"]] = {
                "rank": rank + 1,
                "source": hit["_source"],
            }
    except Exception as e:
        logger.warning(f"Vector search failed: {e}")

    # Combine with RRF + recency boost
    all_doc_ids = set(bm25_results.keys()) | set(vector_results.keys())
    rrf_scores = []

    for doc_id in all_doc_ids:
        relevance_score = 0.0
        source = None

        if doc_id in bm25_results:
            relevance_score += 1.0 / (rrf_k + bm25_results[doc_id]["rank"])
            source = bm25_results[doc_id]["source"]

        if doc_id in vector_results:
            relevance_score += 1.0 / (rrf_k + vector_results[doc_id]["rank"])
            if source is None:
                source = vector_results[doc_id]["source"]

        summary_date = source.get("metadata", {}).get("summary_date") if source else None
        recency_score = _calculate_recency_score(summary_date)
        final_score = relevance_score * 0.8 + recency_score * 0.2 * (1.0 / rrf_k)

        rrf_scores.append({"doc_id": doc_id, "score": final_score, "source": source})

    rrf_scores.sort(key=lambda x: x["score"], reverse=True)
    top_results = rrf_scores[:top_k]

    results = []
    for item in top_results:
        source = item["source"]
        results.append({
            "content": source.get("content", ""),
            "metadata": source.get("metadata", {}),
        })

    logger.info(
        f"Hybrid search: {len(bm25_results)} BM25 + {len(vector_results)} vector "
        f"-> {len(results)} combined"
    )
    return results


def _search_by_date_range(
    es: Elasticsearch,
    start_date: str | None,
    end_date: str | None,
    top_k: int,
    user_id: str | None = None,
) -> list[dict]:
    """Search summaries by date range."""
    filters = []

    # Date range filter
    range_filter: dict[str, Any] = {"range": {"metadata.summary_date": {}}}
    if start_date:
        range_filter["range"]["metadata.summary_date"]["gte"] = start_date
    if end_date:
        range_filter["range"]["metadata.summary_date"]["lte"] = end_date
    filters.append(range_filter)

    # User filter (.keyword for exact match)
    if user_id:
        filters.append({"term": {"metadata.user_id.keyword": user_id}})

    try:
        response = es.search(
            index=DAILY_SUMMARIES_INDEX,
            body={
                "query": {"bool": {"filter": filters}},
                "size": top_k,
                "sort": [{"metadata.summary_date": {"order": "desc"}}],
            },
        )

        results = []
        for hit in response["hits"]["hits"]:
            source = hit["_source"]
            results.append({
                "content": source.get("content", ""),
                "metadata": source.get("metadata", {}),
            })
        return results

    except Exception as e:
        logger.error(f"Date range search failed: {e}")
        return []


def _filter_by_date(
    results: list[dict],
    start_date: str | None,
    end_date: str | None,
) -> list[dict]:
    """Filter results by date range."""
    if not start_date and not end_date:
        return results

    filtered = []
    for result in results:
        summary_date = result.get("metadata", {}).get("summary_date", "")
        if not summary_date:
            continue

        if start_date and summary_date < start_date:
            continue
        if end_date and summary_date > end_date:
            continue

        filtered.append(result)

    return filtered


# =============================================================================
# Utilities
# =============================================================================


async def get_daily_summary(
    user_id: str,
    summary_date: date,
) -> dict[str, Any] | None:
    """Get daily summary from Supabase (source of truth).

    Args:
        user_id: User ID.
        summary_date: Date to fetch.

    Returns:
        Summary record or None if not found.
    """
    from src.services.supabase import get_supabase_client

    client = get_supabase_client()
    if not client:
        return None

    try:
        response = (
            client.table("daily_summaries")
            .select("*")
            .eq("user_id", user_id)
            .eq("summary_date", summary_date.isoformat())
            .single()
            .execute()
        )
        return response.data
    except Exception as e:
        if "No rows" in str(e) or "PGRST116" in str(e):
            return None
        logger.error(f"Error fetching daily summary: {e}")
        return None


async def get_users_with_activity_today() -> list[str]:
    """Get user IDs that have activity today (need summary generation).

    Checks for:
    - Completed check-ins today
    - Lifelogs synced today

    Returns:
        List of unique user IDs.
    """
    from src.services.supabase import get_supabase_client

    today = date.today().isoformat()
    user_ids: set[str] = set()

    client = get_supabase_client()
    if client:
        try:
            # Get users with check-ins today
            response = (
                client.table("check_ins")
                .select("user_id")
                .eq("status", "completed")
                .gte("created_at", f"{today}T00:00:00")
                .execute()
            )
            for row in response.data or []:
                user_ids.add(row["user_id"])
        except Exception as e:
            logger.error(f"Error fetching users with check-ins: {e}")

    logger.info(f"Found {len(user_ids)} users with activity today")
    return list(user_ids)


async def reindex_all_summaries(user_id: str | None = None) -> int:
    """Rebuild ES index from Supabase (source of truth).

    Use this for recovery or migration.

    Args:
        user_id: Optional user ID to limit reindexing.

    Returns:
        Number of summaries reindexed.
    """
    from src.services.supabase import get_supabase_client

    client = get_supabase_client()
    if not client:
        return 0

    try:
        query = client.table("daily_summaries").select("*")
        if user_id:
            query = query.eq("user_id", user_id)

        response = query.execute()
        summaries = response.data or []

        count = 0
        for summary in summaries:
            try:
                await _index_summary_to_es(
                    user_id=summary["user_id"],
                    summary_date=date.fromisoformat(summary["summary_date"]),
                    summary_text=summary.get("summary_text", ""),
                )
                count += 1
            except Exception as e:
                logger.error(f"Failed to reindex summary {summary['id']}: {e}")

        logger.info(f"Reindexed {count}/{len(summaries)} summaries")
        return count

    except Exception as e:
        logger.error(f"Reindex failed: {e}")
        return 0


def is_daily_summary_service_configured() -> bool:
    """Check if service is properly configured."""
    try:
        es = get_elasticsearch_client()
        return es.ping() and bool(ANTHROPIC_API_KEY)
    except Exception:
        return False
