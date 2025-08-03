# Project-Me LangGraph Server

Digital clone backend powered by LangGraph. Aggregates memories from multiple data sources (check-ins, lifelogs, conversations) into daily summaries, enabling you to chat with a digital version of yourself through context-engineered memory retrieval.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FastAPI Server                            │
│  /chat/stream  │  /api/daily-summaries  │  /api/check-ins  ...  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     LangGraph Agent                              │
│  Tools: search_daily_summaries, (extensible)                     │
│  Checkpointer: PostgresSaver (persistent conversations)          │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────────┐   ┌─────────┐
        │ Supabase │   │Elasticsearch │   │ Claude  │
        │ (data)   │   │  (search)    │   │ (LLM)   │
        └──────────┘   └──────────────┘   └─────────┘
```

## Quick Start

```bash
# Install dependencies
cd langgraph-server
uv sync

# Copy environment template
cp .env.example .env
# Edit .env with your API keys

# Run the server
uv run python -m uvicorn src.api.main:app --reload --port 8000
```

Server runs at `http://localhost:8000`. API docs at `/docs`.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (for conversation persistence) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `ELASTICSEARCH_URL` | Elasticsearch URL (default: `http://localhost:9200`) |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `VOYAGE_API_KEY` | VoyageAI API key for embeddings |
| `ELEVENLABS_API_KEY` | ElevenLabs API key (for voice features) |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE messaging integration |
| `LINE_CHANNEL_SECRET` | LINE webhook verification |

## API Endpoints

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/chat/stream` | SSE streaming chat with LangGraph agent |

### Daily Summaries

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/daily-summaries/search` | Hybrid search (BM25 + vector) |
| GET | `/api/daily-summaries/calendar` | Calendar data for a month |
| GET | `/api/daily-summaries/{date}` | Get summary for specific date |
| PATCH | `/api/daily-summaries/{date}` | Update summary (auto-syncs to ES) |

### Check-ins

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/check-ins` | List user's check-ins |
| POST | `/api/check-ins` | Create new check-in |
| GET | `/api/check-ins/{id}` | Get specific check-in |

### Voice

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/voice/transcribe/{check_in_id}` | Transcribe audio for check-in |
| GET | `/voice/status/{check_in_id}` | Get transcription status |

### Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conversations` | List conversations |
| GET | `/api/conversations/{id}` | Get conversation with messages |
| DELETE | `/api/conversations/{id}` | Delete conversation |

### Connectors (LINE)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/connectors/line/authorize` | Start LINE OAuth flow |
| GET | `/connectors/line/callback` | OAuth callback |
| GET | `/connectors/line/status` | Check connection status |
| DELETE | `/connectors/line` | Disconnect LINE |

### Patterns

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/patterns` | Get detected behavioral patterns |
| POST | `/api/patterns/refresh` | Refresh pattern analysis |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/line/webhook` | LINE message webhook |

### Imports

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/imports/line-chat` | Import LINE chat history |

## Project Structure

```
src/
├── agent/
│   ├── graph.py              # LangGraph agent definition
│   └── tools/
│       └── daily_summary.py  # Search tool for agent
├── api/
│   ├── main.py               # FastAPI app entry point
│   ├── deps.py               # Shared dependencies (auth)
│   ├── routers/              # API route handlers
│   │   ├── chat.py
│   │   ├── checkins.py
│   │   ├── connectors.py
│   │   ├── conversations.py
│   │   ├── daily_summaries.py
│   │   ├── imports.py
│   │   ├── patterns.py
│   │   ├── voice.py
│   │   └── webhooks.py
│   └── schemas/              # Pydantic models
├── services/
│   ├── daily_summary.py      # Summary generation & search
│   ├── elasticsearch.py      # ES client & queries
│   ├── elevenlabs.py         # Voice synthesis
│   ├── line.py               # LINE messaging
│   ├── pattern_detector.py   # Behavioral pattern analysis
│   ├── scheduler.py          # Background jobs
│   ├── summarizer.py         # LLM summarization
│   └── supabase.py           # Supabase client
└── core/
    ├── config.py             # Settings & env vars
    └── exceptions.py         # Custom exceptions
```

## Data Flow

### Daily Summaries

```
Supabase (source of truth)     Elasticsearch (search cache)
┌─────────────────────────┐    ┌──────────────────────────┐
│ daily_summaries table   │───▶│ daily_summaries index    │
│ - user_id               │    │ - content (text+vector)  │
│ - summary_date          │    │ - metadata               │
│ - summary_text          │    └──────────────────────────┘
│ - source_entries        │              │
└─────────────────────────┘              │
         │                               │
         │ Calendar/Date views           │ Semantic search
         ▼                               ▼
    GET /calendar              GET /search?query=...
    GET /{date}
```

### Chat Streaming

```
Frontend                    Server                      LangGraph
   │                           │                            │
   │ POST /chat/stream         │                            │
   │ {message, conversation_id}│                            │
   │──────────────────────────▶│                            │
   │                           │ astream_events()           │
   │                           │───────────────────────────▶│
   │                           │                            │
   │◀─ SSE: tool_call ─────────│◀─ on_chat_model_stream ───│
   │◀─ SSE: token ─────────────│◀─ on_chat_model_stream ───│
   │◀─ SSE: tool_result ───────│◀─ on_tool_end ────────────│
   │◀─ SSE: done ──────────────│                            │
```

## Development

### Running with LangGraph Studio

```bash
langgraph dev
```

### Running Tests

```bash
pytest tests/
```

### Import Scripts

```bash
# Import Limitless lifelogs
python scripts/limitless/1_fetch.py
python scripts/limitless/2_generate.py
python scripts/limitless/3_push.py <user_id>
```
