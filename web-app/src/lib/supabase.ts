import { createBrowserClient } from '@supabase/ssr'

/**
 * Singleton browser client instance for client-side operations.
 * Memoized to avoid creating multiple clients per request.
 */
let browserClient: ReturnType<typeof createBrowserClient> | null = null

/**
 * Creates or returns the memoized Supabase client for browser-side operations.
 * Uses environment variables for URL and anon key.
 *
 * Note: For server-side operations, use createServerSupabaseClient from './supabase-server'.
 */
export const createClient = () => {
  if (browserClient) return browserClient

  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  return browserClient
}
