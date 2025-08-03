# Limitless Import Pipeline

```bash
cd langgraph-server

# 1. Fetch raw data from Limitless API
uv run python scripts/limitless/1_fetch.py --days 30

# 2. Generate summaries with Claude Haiku
uv run python scripts/limitless/2_generate.py

# 3. Review output, then push to Supabase/ES
uv run python scripts/limitless/3_push.py <user_id>
```

## Example: Import Dec 1-5

```bash
# 1. Fetch
uv run python scripts/limitless/1_fetch.py --start 2025-12-01 --end 2025-12-05

# 2. Generate
uv run python scripts/limitless/2_generate.py --start 2025-12-01 --end 2025-12-05

# 3. Push
uv run python scripts/limitless/3_push.py <user_id> --start 2025-12-01 --end 2025-12-05
```

**Options:** `--start YYYY-MM-DD --end YYYY-MM-DD --skip-existing`
