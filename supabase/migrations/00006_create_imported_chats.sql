-- Migration: Create imported_chats table
-- Story: 6.4 Import LINE Chat History
-- Date: 2026-01-01

-- Create imported_chats table for storing imported chat messages
CREATE TABLE imported_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,  -- 'line', future: 'whatsapp', 'telegram', etc.
  content TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE imported_chats ENABLE ROW LEVEL SECURITY;

-- RLS Policies with performance optimization (using select auth.uid())
CREATE POLICY "Users can view own imports"
ON imported_chats FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own imports"
ON imported_chats FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own imports"
ON imported_chats FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

-- Indexes for performance
CREATE INDEX idx_imported_chats_user_id ON imported_chats(user_id);
CREATE INDEX idx_imported_chats_source ON imported_chats(user_id, source);
CREATE INDEX idx_imported_chats_sent_at ON imported_chats(user_id, sent_at DESC);

-- Add comments for documentation
COMMENT ON TABLE imported_chats IS 'Imported chat messages from external platforms for personality extraction';
COMMENT ON COLUMN imported_chats.source IS 'Source platform: line, whatsapp, telegram, etc.';
COMMENT ON COLUMN imported_chats.content IS 'Message content text';
COMMENT ON COLUMN imported_chats.sent_at IS 'Original timestamp when message was sent';
COMMENT ON COLUMN imported_chats.metadata IS 'Additional metadata: sender_name, is_outgoing, etc.';
