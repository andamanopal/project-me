-- Migration: Create memories table
-- Story: 2.7 Store Content in Unified Memory
-- Date: 2025-12-31

-- Create source_type enum for memory sources
CREATE TYPE memory_source_type AS ENUM (
  'check_in',     -- Voice check-in content
  'chat',         -- Conversation content
  'line_import',  -- Imported LINE chat history
  'line_message'  -- LINE webhook messages
);

-- Create memories table (PostgreSQL side for relational tracking)
-- Actual content is indexed in ElasticSearch for vector search
CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type memory_source_type NOT NULL,
  source_id UUID NOT NULL,  -- References check_ins.id, conversations.id, etc.
  elasticsearch_id TEXT,    -- Document ID in ElasticSearch index
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- RLS Policies with performance optimization (using select auth.uid())
CREATE POLICY "Users can view own memories"
ON memories FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own memories"
ON memories FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own memories"
ON memories FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

-- Indexes for performance
CREATE INDEX idx_memories_user_id ON memories(user_id);
CREATE INDEX idx_memories_source ON memories(source_type, source_id);
CREATE INDEX idx_memories_elasticsearch_id ON memories(elasticsearch_id);
CREATE INDEX idx_memories_created_at ON memories(created_at DESC);

-- Apply updated_at trigger (function already exists from 00001)
CREATE TRIGGER update_memories_updated_at
    BEFORE UPDATE ON memories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE memories IS 'Tracks memory entries indexed in ElasticSearch for vector search';
COMMENT ON COLUMN memories.elasticsearch_id IS 'Document ID in ElasticSearch memories index for deletion/updates';
