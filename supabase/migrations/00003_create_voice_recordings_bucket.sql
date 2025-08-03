-- Migration: Create voice-recordings storage bucket
-- Story: 2.2 Submit Voice Recording
-- Date: 2025-12-31

-- Create the voice-recordings bucket
-- Note: This may need to be run via Supabase dashboard or API if storage schema is not accessible
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-recordings',
  'voice-recordings',
  false,  -- private bucket (requires auth)
  52428800,  -- 50MB limit (5min audio @ ~160kbps = ~6MB, with margin)
  ARRAY['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg']
)
ON CONFLICT (id) DO NOTHING;

-- RLS policy: Users can only upload to their own folder
-- File path format: {user_id}/{uuid}.{ext}
CREATE POLICY "Users can upload own recordings"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'voice-recordings' AND
  (storage.foldername(name))[1] = (select auth.uid())::text
);

-- RLS policy: Users can only read their own recordings
CREATE POLICY "Users can read own recordings"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'voice-recordings' AND
  (storage.foldername(name))[1] = (select auth.uid())::text
);

-- RLS policy: Users can delete their own recordings
CREATE POLICY "Users can delete own recordings"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'voice-recordings' AND
  (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Note: Cannot add COMMENT on storage.buckets as it's owned by Supabase
-- Documentation: voice-recordings bucket stores private user voice check-in audio files