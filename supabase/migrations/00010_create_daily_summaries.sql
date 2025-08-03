-- Migration: Create daily_summaries table
-- Purpose: Single source of truth for aggregated user memories
-- Date: 2026-01-03

-- Create daily_summaries table
CREATE TABLE daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_date DATE NOT NULL,

  -- LLM-generated narrative (main content)
  summary_text TEXT,

  -- Source tracking for drill-down
  -- Format: [{"source_type": "check_in", "source_id": "uuid", "timestamp": "ISO"}]
  source_entries JSONB DEFAULT '[]'::jsonb,

  -- Generation metadata
  generated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One summary per user per day
  CONSTRAINT unique_user_date UNIQUE (user_id, summary_date)
);

-- Enable Row Level Security
ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own summaries"
ON daily_summaries FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "Service can manage summaries"
ON daily_summaries FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_daily_summaries_user_date ON daily_summaries(user_id, summary_date DESC);
CREATE INDEX idx_daily_summaries_date ON daily_summaries(summary_date DESC);

-- Apply updated_at trigger (function already exists from 00001)
CREATE TRIGGER update_daily_summaries_updated_at
    BEFORE UPDATE ON daily_summaries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE daily_summaries IS 'Aggregated daily memory summaries - single source of truth for user memories';
COMMENT ON COLUMN daily_summaries.summary_text IS 'LLM-generated narrative summary of the day';
COMMENT ON COLUMN daily_summaries.source_entries IS 'JSON array tracking which raw entries contributed to this summary';
COMMENT ON COLUMN daily_summaries.generated_at IS 'When the summary was last generated/regenerated';
