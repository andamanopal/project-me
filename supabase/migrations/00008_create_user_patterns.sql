-- Migration: Create user_patterns table for Story 3.3
-- Stores detected patterns across user check-in history

-- Create user_patterns table
CREATE TABLE IF NOT EXISTS user_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('recurring_topic', 'unmet_goal', 'emotional_trend')),
  pattern_data JSONB NOT NULL,
  -- For recurring_topic: {topic: "...", count: N, first_seen: "...", last_seen: "..."}
  -- For unmet_goal: {goal: "...", mentions: N, first_mentioned: "...", last_mentioned: "..."}
  -- For emotional_trend: {trend: "...", direction: "improving|declining|stable", sentiment_scores: [...]}
  evidence_ids TEXT[] DEFAULT '{}',  -- ElasticSearch document IDs linked to this pattern
  is_actionable BOOLEAN DEFAULT false,  -- Flag for proactive nudge candidates
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,  -- Optional: patterns can expire (e.g., after 30 days)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: prevent duplicate patterns for same topic/goal per user
CREATE UNIQUE INDEX idx_user_patterns_unique_topic
ON user_patterns(user_id, pattern_type, (pattern_data->>'topic'))
WHERE pattern_type = 'recurring_topic';

CREATE UNIQUE INDEX idx_user_patterns_unique_goal
ON user_patterns(user_id, pattern_type, (pattern_data->>'goal'))
WHERE pattern_type = 'unmet_goal';

-- Index for efficient queries
CREATE INDEX idx_user_patterns_user_id ON user_patterns(user_id);
CREATE INDEX idx_user_patterns_actionable ON user_patterns(user_id, is_actionable) WHERE is_actionable = true;
CREATE INDEX idx_user_patterns_type ON user_patterns(user_id, pattern_type);

-- Enable Row Level Security
ALTER TABLE user_patterns ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own patterns
CREATE POLICY "Users can view own patterns"
ON user_patterns FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- RLS Policy: Service role can insert patterns (for background job)
CREATE POLICY "Service can insert patterns"
ON user_patterns FOR INSERT
TO service_role
WITH CHECK (true);

-- RLS Policy: Service role can update patterns
CREATE POLICY "Service can update patterns"
ON user_patterns FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- RLS Policy: Service role can delete patterns
CREATE POLICY "Service can delete patterns"
ON user_patterns FOR DELETE
TO service_role
USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_patterns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER trigger_user_patterns_updated_at
BEFORE UPDATE ON user_patterns
FOR EACH ROW
EXECUTE FUNCTION update_user_patterns_updated_at();

-- Comment for documentation
COMMENT ON TABLE user_patterns IS 'Stores detected patterns from user check-in history for proactive insights';
COMMENT ON COLUMN user_patterns.pattern_type IS 'Type: recurring_topic, unmet_goal, emotional_trend';
COMMENT ON COLUMN user_patterns.is_actionable IS 'True if pattern should trigger proactive nudge';
COMMENT ON COLUMN user_patterns.evidence_ids IS 'ElasticSearch document IDs that support this pattern';
