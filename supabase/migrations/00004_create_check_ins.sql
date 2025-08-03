-- Migration: Create check_ins table
-- Story: 2.2 Submit Voice Recording
-- Date: 2025-12-31

-- Create check_in_status enum for tracking processing state
CREATE TYPE check_in_status AS ENUM (
  'processing',    -- upload received, waiting for transcription
  'transcribing',  -- ElevenLabs/Whisper processing audio
  'summarizing',   -- LLM generating structured summary
  'completed',     -- fully processed, ready to view
  'failed'         -- error occurred during processing
);

-- Create check_ins table
CREATE TABLE check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audio_path TEXT NOT NULL,  -- Supabase Storage path: {user_id}/{uuid}.{ext}
  audio_duration_seconds INTEGER,  -- Duration in seconds
  status check_in_status DEFAULT 'processing',
  transcript TEXT,  -- Raw transcription text
  summary JSONB,  -- Structured summary from LLM
  error_message TEXT,  -- Error details if status = 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;

-- RLS Policies with performance optimization (using select auth.uid())
CREATE POLICY "Users can view own check-ins"
ON check_ins FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own check-ins"
ON check_ins FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own check-ins"
ON check_ins FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own check-ins"
ON check_ins FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

-- Indexes for performance
CREATE INDEX idx_check_ins_user_id ON check_ins(user_id);
CREATE INDEX idx_check_ins_created_at ON check_ins(created_at DESC);
CREATE INDEX idx_check_ins_status ON check_ins(status);

-- Apply updated_at trigger (function already exists from 00001)
CREATE TRIGGER update_check_ins_updated_at
    BEFORE UPDATE ON check_ins
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE check_ins IS 'Voice check-in records with processing status and transcription/summary data';
