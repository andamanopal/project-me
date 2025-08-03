-- Migration: Create chat-imports storage bucket
-- Story: 6.4 Import LINE Chat History
-- Date: 2026-01-01

-- Create storage bucket for chat import files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-imports',
  'chat-imports',
  false,
  52428800,  -- 50MB limit
  ARRAY['application/zip', 'application/x-zip-compressed', 'text/plain']
);

-- RLS Policies for storage bucket
-- Users can only access files in their own folder (user_id as folder name)

CREATE POLICY "Users can upload own imports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-imports'
  AND (select auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can read own imports"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-imports'
  AND (select auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own imports"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-imports'
  AND (select auth.uid())::text = (storage.foldername(name))[1]
);
