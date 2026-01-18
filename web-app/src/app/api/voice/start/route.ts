import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID

/**
 * Get authenticated user from request cookies.
 */
async function getAuthUser(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {
          // Not needed for read-only operations
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

interface StartVoiceRequest {
  room_url: string
  token?: string
}

interface RunPodResponse {
  id: string
  status: string
}

/**
 * POST /api/voice/start
 * Triggers RunPod voice pipeline to join a Daily.co room.
 */
export async function POST(request: NextRequest) {
  if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
    return NextResponse.json(
      { error: 'Voice service not configured' },
      { status: 503 }
    )
  }

  let body: StartVoiceRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const { room_url, token } = body

  if (!room_url) {
    return NextResponse.json(
      { error: 'room_url is required' },
      { status: 400 }
    )
  }

  // Get authenticated user for tool access control
  const user = await getAuthUser(request)
  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const response = await fetch(
      `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/run`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RUNPOD_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: {
            room_url,
            token: token || '',
            user_id: user.id,
          },
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('[Voice API] RunPod error:', error)
      return NextResponse.json(
        { error: 'Failed to start voice pipeline' },
        { status: 502 }
      )
    }

    const data: RunPodResponse = await response.json()

    return NextResponse.json({
      job_id: data.id,
      status: data.status,
    })
  } catch (error) {
    console.error('[Voice API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
