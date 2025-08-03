-- Migration: Drop unused memories table
-- Purpose: Replaced by daily_summaries table
-- Date: 2026-01-03

-- Drop the memories table (was never actually used - code indexed directly to ES)
DROP TABLE IF EXISTS memories;

-- Drop the memory_source_type enum
DROP TYPE IF EXISTS memory_source_type;
