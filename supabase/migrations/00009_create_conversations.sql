-- Migration: Create conversations and messages tables
-- Story: 4.1 Start New Conversation
-- Date: 2026-01-01

-- Create conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,  -- Optional: auto-generated from first message
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies with performance optimization (using select auth.uid())
CREATE POLICY "Users can view own conversations"
ON conversations FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own conversations"
ON conversations FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own conversations"
ON conversations FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own conversations"
ON conversations FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

-- Index for RLS performance (critical)
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);

-- Apply updated_at trigger (function already exists from 00001)
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE conversations IS 'Chat conversations for Project-Me AI assistant';

-- Create messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS via conversation ownership (subquery approach for security)
CREATE POLICY "Users can view messages in own conversations"
ON messages FOR SELECT
TO authenticated
USING (
  conversation_id IN (
    SELECT id FROM conversations WHERE user_id = (select auth.uid())
  )
);

CREATE POLICY "Users can insert messages in own conversations"
ON messages FOR INSERT
TO authenticated
WITH CHECK (
  conversation_id IN (
    SELECT id FROM conversations WHERE user_id = (select auth.uid())
  )
);

CREATE POLICY "Users can update messages in own conversations"
ON messages FOR UPDATE
TO authenticated
USING (
  conversation_id IN (
    SELECT id FROM conversations WHERE user_id = (select auth.uid())
  )
);

CREATE POLICY "Users can delete messages in own conversations"
ON messages FOR DELETE
TO authenticated
USING (
  conversation_id IN (
    SELECT id FROM conversations WHERE user_id = (select auth.uid())
  )
);

-- Indexes for performance
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at ASC);

-- Add comment for documentation
COMMENT ON TABLE messages IS 'Individual messages within conversations';
