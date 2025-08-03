-- Migration: Create connectors table
-- Story: 6.1 Connect LINE Account
-- Date: 2025-12-31

-- Create connectors table for external service integrations (LINE, etc.)
CREATE TABLE connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  external_user_id TEXT,
  config JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  UNIQUE(user_id, type)
);

-- Enable Row Level Security
ALTER TABLE connectors ENABLE ROW LEVEL SECURITY;

-- RLS Policies with performance optimization (using select auth.uid())
-- Note: Wrapping auth.uid() in SELECT provides 100x performance improvement

CREATE POLICY "Users can view own connectors"
ON connectors FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own connectors"
ON connectors FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own connectors"
ON connectors FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own connectors"
ON connectors FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

-- Create index for webhook lookups (type + external_user_id)
-- Critical for LINE webhook processing to find user by LINE ID
CREATE INDEX idx_connectors_lookup ON connectors(type, external_user_id);

-- Create index on user_id for RLS performance
CREATE INDEX idx_connectors_user_id ON connectors(user_id);

-- Add comment for documentation
COMMENT ON TABLE connectors IS 'External service integrations (LINE, etc.) for Project-Me users';
COMMENT ON COLUMN connectors.type IS 'Connector type: line, slack, etc.';
COMMENT ON COLUMN connectors.external_user_id IS 'Platform user ID for webhook lookups';
COMMENT ON COLUMN connectors.config IS 'Platform-specific data: display_name, is_friend, picture_url, etc.';
