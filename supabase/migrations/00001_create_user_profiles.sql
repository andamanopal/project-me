-- Migration: Create user_profiles table
-- Story: 1.1 User Registration
-- Date: 2025-12-31

-- Create user_profiles table
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  preferred_check_in_time TIME DEFAULT '19:00',
  proactive_enabled BOOLEAN DEFAULT true,
  proactive_frequency TEXT DEFAULT 'daily',
  timezone TEXT DEFAULT 'Asia/Bangkok',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies with performance optimization (using select auth.uid())
-- Note: Wrapping auth.uid() in SELECT provides 100x performance improvement

CREATE POLICY "Users can view own profile"
ON user_profiles FOR SELECT
TO authenticated
USING ((select auth.uid()) = id);

CREATE POLICY "Users can update own profile"
ON user_profiles FOR UPDATE
TO authenticated
USING ((select auth.uid()) = id);

CREATE POLICY "Users can insert own profile"
ON user_profiles FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users can delete own profile"
ON user_profiles FOR DELETE
TO authenticated
USING ((select auth.uid()) = id);

-- Create index on id for RLS performance
CREATE INDEX idx_user_profiles_id ON user_profiles(id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to user_profiles
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE user_profiles IS 'User profile settings and preferences for Project-Me';
