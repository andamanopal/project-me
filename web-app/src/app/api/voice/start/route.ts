import { NextRequest, NextResponse } from 'next/server'

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID

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
