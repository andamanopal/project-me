"""
Simple RAG service for lifelog indexing and search using Elasticsearch.

SEARCH APPROACHES: HYBRID SEARCH
- Uses AsyncDenseVectorStrategy(hybrid=True) from LlamaIndex
- Combines BM25 keyword search + vector similarity using RRF (Reciprocal Rank Fusion)
- Pros: Best of both worlds - catches exact matches AND semantic similarity
- Cons: Requires Elasticsearch 8.9+

For even more control, see alto-langgraph/core/retrieval/hybrid_retriever.py which
uses direct Elasticsearch queries with configurable alpha weighting.
"""

import re
import os
from datetime import datetime, timezone
from dotenv import load_dotenv
from elasticsearch import Elasticsearch
import logging
from llama_index.core import Document, Settings, VectorStoreIndex, StorageContext
from llama_index.core.node_parser import SentenceSplitter
from llama_index.embeddings.voyageai import VoyageEmbedding
from llama_index.vector_stores.elasticsearch import ElasticsearchStore, AsyncDenseVectorStrategy

load_dotenv()

logger = logging.getLogger(__name__)

# Config
ES_URL = os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")
ES_INDEX = os.getenv("ELASTICSEARCH_INDEX", "lifelogs")
VOYAGE_EMBEDDING_MODEL = os.getenv("VOYAGE_EMBEDDING_MODEL", "voyage-3.5")
USE_CHUNKING = os.getenv("USE_CHUNKING", "false").lower() == "true"

Settings.embed_model = VoyageEmbedding(model_name=VOYAGE_EMBEDDING_MODEL)
Settings.transformations = []
Settings.chunk_size = None

# Singleton Elasticsearch client
_es_client = None


def _calculate_recency_score(start_time: str | None) -> float:
    """Calculate recency score (0-1) based on document age.

    Uses exponential decay: 1.0 for today, ~0.5 for 30 days ago, ~0.25 for 90 days.

    Args:
        start_time: ISO format timestamp string.

    Returns:
        Recency score between 0.1 and 1.0.
    """
    if not start_time:
        return 0.0
    try:
        # Handle various ISO formats
        dt_str = start_time.replace("Z", "+00:00")
        doc_time = datetime.fromisoformat(dt_str)
        now = datetime.now(timezone.utc)
        age_days = (now - doc_time).days
        # Decay: 1.0 for today, ~0.5 for 30 days ago, ~0.25 for 90 days
        return max(0.1, 1.0 / (1 + age_days / 30))
    except (ValueError, TypeError):
        return 0.0


def get_elasticsearch_client() -> Elasticsearch:
    """Get singleton Elasticsearch client with connection pooling.

    Returns:
        Configured Elasticsearch client instance.
    """
    global _es_client
    if _es_client is None:
        _es_client = Elasticsearch(
            [ES_URL],
            timeout=30,
            max_retries=3,
            retry_on_timeout=True,
        )
    return _es_client


def clean_lifelog_markdown(text: str) -> str:
    # Remove speaker labels
    pattern = r"^- Unknown \(\d{1,2}/\d{1,2}/\d{2,4} \d{1,2}:\d{2} [AP]M\): "
    text = re.sub(pattern, "", text, flags=re.MULTILINE)

    # Collapse multiple newlines into one
    text = re.sub(r"\n{2,}", "\n", text)

    return text.strip()

def _delete_existing_documents(doc_ids: list[str]) -> int:
    """
    Delete existing documents by their lifelog_id.

    Args:
        doc_ids: List of lifelog IDs to delete.

    Returns:
        Number of documents deleted.
    """
    if not doc_ids:
        return 0

    es = get_elasticsearch_client()

    # Check if index exists
    if not es.indices.exists(index=ES_INDEX):
        return 0

    # Delete documents matching the lifelog_ids
    # We need to delete by metadata.lifelog_id since LlamaIndex stores it there
    deleted_count = 0
    for doc_id in doc_ids:
        try:
            # Delete by query - find all chunks with this lifelog_id
            response = es.delete_by_query(
                index=ES_INDEX,
                body={
                    "query": {
                        "term": {
                            "metadata.lifelog_id": doc_id
                        }
                    }
                },
                refresh=True
            )
            deleted_count += response.get("deleted", 0)
        except Exception as e:
            print(f"Warning: Could not delete doc {doc_id}: {e}")

    return deleted_count


def ingest_lifelogs(lifelogs: list[dict], user_id: str) -> int:
    """
    Ingest lifelogs into Elasticsearch.

    If documents with the same IDs already exist, they will be replaced.

    Args:
        lifelogs: List of lifelog dicts with 'id', 'title', 'contents', 'startTime', etc.
        user_id: User ID for multi-tenant isolation (required).

    Returns:
        Number of documents indexed.

    Raises:
        ValueError: If user_id is not provided.
    """
    if not user_id or not user_id.strip():
        raise ValueError("user_id is required for multi-tenant isolation")
    if not lifelogs:
        return 0

    # Delete existing documents with the same IDs (to avoid duplicates)
    doc_ids = [log.get("id") for log in lifelogs if log.get("id")]
    deleted = _delete_existing_documents(doc_ids)
    if deleted > 0:
        print(f"Deleted {deleted} existing document chunks for replacement.")

    es = get_elasticsearch_client()
    if es.indices.exists(index=ES_INDEX):
        count = es.count(index=ES_INDEX)
        print(f"Total documents in index before ingestion: {count}")
    else:
        print(f"Index '{ES_INDEX}' does not exist yet. No documents in index before ingestion.")

    # Convert lifelogs to Documents
    documents = []
    for log in lifelogs:
        # Extract text content from contents array
        text_parts = []
        if log.get("title"):
            text_parts.append(f"Title: {log['title']}")

        full_markdown = log.get("markdown")
        full_markdown = clean_lifelog_markdown(full_markdown)
        if not full_markdown:
            continue
        else:
            text_parts.append(full_markdown)

        full_text = "\n".join(text_parts)

        doc = Document(
            text=full_text,
            metadata={
                "lifelog_id": log.get("id", ""),
                "title": log.get("title", ""),
                "start_time": log.get("startTime", ""),
                "end_time": log.get("endTime", ""),
                "user_id": user_id,
            },
            doc_id=log.get("id", ""),
        )
        documents.append(doc)

    if not documents:
        return 0

    # Create vector store and index
    # Using hybrid=True combines BM25 keyword search + vector similarity
    vector_store = ElasticsearchStore(
        es_url=ES_URL,
        index_name=ES_INDEX,
        retrieval_strategy=AsyncDenseVectorStrategy(hybrid=True),
    )
    storage_context = StorageContext.from_defaults(vector_store=vector_store)

    # Create index (this will embed and store documents)
    if USE_CHUNKING:
        print(f"Creating index with chunking SentenceSplitter with chunk_size=1024 and chunk_overlap=100")
        splitter = SentenceSplitter(chunk_size=1024, chunk_overlap=100)
        VectorStoreIndex.from_documents(
            documents,
            storage_context=storage_context,
            transformations=[splitter],
        )
    else:
        print(f"Creating index without chunking")
        # Index whole documents without chunking
        VectorStoreIndex.from_documents(
            documents,
            storage_context=storage_context,
            transformations=[],
        )

    count = es.count(index=ES_INDEX)
    print(f"Total documents in index after ingestion: {count}")

    return len(documents)


def search_lifelogs(
    query: str | None = None,
    user_id: str | None = None,
    top_k: int = 5,
    start_time: str | None = None,
    end_time: str | None = None,
) -> list[dict]:
    """Search indexed lifelogs using hybrid search and/or time filtering.

    Supports three modes:
    1. Semantic search only: provide query
    2. Time-based search only: provide start_time and/or end_time
    3. Combined: provide query + time filters

    All modes support user_id filtering for multi-user isolation.

    Args:
        query: Optional search query string for semantic/keyword search.
        user_id: Optional user ID for filtering results (required for multi-user isolation).
        top_k: Number of results to return.
        start_time: Optional start time filter (ISO format, e.g., "2024-01-15T09:00:00").
        end_time: Optional end time filter (ISO format, e.g., "2024-01-15T18:00:00").

    Returns:
        List of matching results with text and metadata.
    """
    es = get_elasticsearch_client()

    # Check if index exists
    if not es.indices.exists(index=ES_INDEX):
        logger.warning(f"Index '{ES_INDEX}' does not exist")
        return []

    # Time-only search: use direct Elasticsearch query
    if not query and (start_time or end_time):
        return _search_by_time_range(es, start_time, end_time, top_k, user_id=user_id)

    # Semantic search (with optional time filtering)
    if query:
        results = _search_hybrid(
            query,
            top_k * 2 if (start_time or end_time) else top_k,
            user_id=user_id,
        )

        # Apply time filtering if specified
        if start_time or end_time:
            results = _filter_results_by_time(results, start_time, end_time)
            results = results[:top_k]

        return results

    # No search criteria provided
    return []


def _search_hybrid(
    query: str,
    top_k: int,
    rrf_k: int = 60,
    user_id: str | None = None,
) -> list[dict]:
    """Perform hybrid search combining BM25 text search and vector similarity.

    Uses manual RRF (Reciprocal Rank Fusion) to combine results from both
    search methods. Compatible with any Elasticsearch version that supports kNN.

    Args:
        query: Search query string.
        top_k: Number of results to return.
        rrf_k: RRF constant (default 60). Higher values give more weight to lower-ranked results.
        user_id: Optional user ID for filtering results (multi-user isolation).

    Returns:
        List of results with content and metadata.
    """
    es = get_elasticsearch_client()

    # Get query embedding from VoyageAI
    embed_model = Settings.embed_model
    query_embedding = embed_model.get_query_embedding(query)

    # Build user_id filter if provided
    user_filter = {"term": {"metadata.user_id": user_id}} if user_id else None

    # 1. BM25 text search with optional user_id filter
    bm25_results = {}
    try:
        bm25_query = {
            "bool": {
                "must": {
                    "match": {
                        "content": {
                            "query": query,
                            "fuzziness": "AUTO"
                        }
                    }
                }
            }
        }
        # Add user_id filter if provided
        if user_filter:
            bm25_query["bool"]["filter"] = user_filter

        bm25_response = es.search(
            index=ES_INDEX,
            body={
                "query": bm25_query,
                "size": top_k * 2,
                "_source": ["content", "metadata"]
            }
        )
        for rank, hit in enumerate(bm25_response["hits"]["hits"]):
            doc_id = hit["_id"]
            bm25_results[doc_id] = {
                "rank": rank + 1,
                "source": hit["_source"]
            }
    except Exception as e:
        logger.warning(f"BM25 search failed: {e}")

    # 2. Vector (kNN) search with optional user_id filter
    vector_results = {}
    try:
        knn_query = {
            "field": "embedding",
            "query_vector": query_embedding,
            "k": top_k * 2,
            "num_candidates": top_k * 10
        }
        # Add user_id filter to kNN if provided
        if user_filter:
            knn_query["filter"] = user_filter

        knn_response = es.search(
            index=ES_INDEX,
            body={
                "knn": knn_query,
                "_source": ["content", "metadata"]
            }
        )
        for rank, hit in enumerate(knn_response["hits"]["hits"]):
            doc_id = hit["_id"]
            vector_results[doc_id] = {
                "rank": rank + 1,
                "source": hit["_source"]
            }
    except Exception as e:
        logger.warning(f"Vector search failed: {e}")

    # 3. Combine using RRF (Reciprocal Rank Fusion) with recency boost
    # RRF score = sum(1 / (k + rank)) for each method
    # Final score = 80% relevance + 20% recency
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

        # Calculate recency score based on document timestamp
        start_time = source.get("metadata", {}).get("start_time") if source else None
        recency_score = _calculate_recency_score(start_time)

        # Combine: 80% relevance + 20% recency (scaled to RRF range)
        # Normalize recency contribution to be proportional to RRF scores
        final_score = relevance_score * 0.8 + recency_score * 0.2 * (1.0 / rrf_k)

        rrf_scores.append({
            "doc_id": doc_id,
            "score": final_score,
            "source": source
        })

    # Sort by combined score (descending) and take top_k
    rrf_scores.sort(key=lambda x: x["score"], reverse=True)
    top_results = rrf_scores[:top_k]

    # Format results
    results = []
    for item in top_results:
        source = item["source"]
        results.append({
            "content": source.get("content", ""),
            "metadata": source.get("metadata", {}),
        })

    logger.info(f"Hybrid search: {len(bm25_results)} BM25 + {len(vector_results)} vector -> {len(results)} combined")
    return results


def _search_by_time_range(
    es: Elasticsearch,
    start_time: str | None,
    end_time: str | None,
    top_k: int,
    user_id: str | None = None,
) -> list[dict]:
    """Search lifelogs by time range using direct Elasticsearch query.

    Args:
        es: Elasticsearch client instance.
        start_time: Optional start time filter (ISO format).
        end_time: Optional end time filter (ISO format).
        top_k: Number of results to return.
        user_id: Optional user ID for filtering results (multi-user isolation).

    Returns:
        List of results with content and metadata.
    """
    # Build filters list
    filters = []

    # Add time range filter
    range_filter = {"range": {"metadata.start_time": {}}}
    if start_time:
        range_filter["range"]["metadata.start_time"]["gte"] = start_time
    if end_time:
        range_filter["range"]["metadata.start_time"]["lte"] = end_time
    filters.append(range_filter)

    # Add user_id filter if provided
    if user_id:
        filters.append({"term": {"metadata.user_id": user_id}})

    try:
        response = es.search(
            index=ES_INDEX,
            body={
                "query": {"bool": {"filter": filters}},
                "size": top_k,
                "sort": [{"metadata.start_time": {"order": "desc"}}]
            }
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
        logger.error(f"Error in time range search: {e}")
        return []


def _filter_results_by_time(
    results: list[dict],
    start_time: str | None,
    end_time: str | None
) -> list[dict]:
    """Filter search results by time range."""
    from datetime import datetime

    def parse_dt(dt_str: str) -> datetime | None:
        if not dt_str:
            return None
        for fmt in ["%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"]:
            try:
                return datetime.strptime(dt_str, fmt)
            except ValueError:
                continue
        return None

    start_dt = parse_dt(start_time) if start_time else None
    end_dt = parse_dt(end_time) if end_time else None

    filtered = []
    for result in results:
        result_time = result.get("metadata", {}).get("start_time", "")
        result_dt = parse_dt(result_time)

        if not result_dt:
            continue
        if start_dt and result_dt < start_dt:
            continue
        if end_dt and result_dt > end_dt:
            continue

        filtered.append(result)

    return filtered
