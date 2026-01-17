# RunPod Serverless Voice Pipeline

Real-time voice conversation pipeline using Pipecat on RunPod Serverless with GPU acceleration.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     RunPod Serverless GPU                       │
│  ┌───────────┐   ┌──────────┐   ┌───────┐   ┌──────────────┐   │
│  │ Daily.co  │──▶│ Faster-  │──▶│Claude │──▶│ Chatterbox   │   │
│  │ Transport │   │ Whisper  │   │  LLM  │   │   Turbo      │   │
│  └───────────┘   └──────────┘   └───────┘   └──────────────┘   │
│        ▲              Silero VAD                   │            │
│        └───────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

| Component | Model | Purpose |
|-----------|-------|---------|
| **STT** | Faster-Whisper distil-large-v3 | Speech-to-Text |
| **TTS** | Chatterbox Turbo | Text-to-Speech |
| **LLM** | Claude claude-sonnet-4-20250514 | Conversation |
| **VAD** | Silero VAD | Voice Activity Detection |
| **Transport** | Daily.co | WebRTC |

## Prerequisites

- [RunPod account](https://runpod.io)
- [Docker Hub account](https://hub.docker.com)
- [HuggingFace account](https://huggingface.co/settings/tokens) (for model downloads)
- [Daily.co account](https://daily.co)
- Anthropic API key

## Deployment

### 1. Build & Push Docker Image

```bash
cd runpod-serverless

docker login

# Build (15-30 min, downloads ~6GB models)
# HF_TOKEN required for Chatterbox Turbo model download
docker build --platform linux/amd64 \
  --build-arg HF_TOKEN=hf_your_token_here \
  -t andamanopal/project-me-voice:latest .

# Push (10-20 min, uploads ~15-20GB)
docker push andamanopal/project-me-voice:latest
```

Get your HuggingFace token from: https://huggingface.co/settings/tokens

### 2. Set Up Daily.co

```bash
# Create a room
curl -X POST "https://api.daily.co/v1/rooms" \
  -H "Authorization: Bearer YOUR_DAILY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "project-me-test", "privacy": "public"}'

# Create a meeting token
curl -X POST "https://api.daily.co/v1/meeting-tokens" \
  -H "Authorization: Bearer YOUR_DAILY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"properties": {"room_name": "project-me-test", "is_owner": true, "exp": 1800000000}}'
```

### 3. Create RunPod Endpoint

1. Go to [RunPod Serverless Console](https://console.runpod.io/serverless)
2. Click **New Endpoint** → **Import from Docker Registry**
3. Enter: `docker.io/andamanopal/project-me-voice:latest`

**Configuration:**

| Setting | Value |
|---------|-------|
| Name | `project-me-voice` |
| GPU | 48 GB (A6000/A40) |
| Min Workers | 0 |
| Max Workers | 3 |
| Idle Timeout | 30s |
| Execution Timeout | 600s |

**Environment Variable:**
- `ANTHROPIC_API_KEY`: Your Anthropic API key

### 4. Test

**Via RunPod Console:**

Go to endpoint → Requests tab → Run:

```json
{
  "input": {
    "room_url": "https://YOUR_DOMAIN.daily.co/project-me-test",
    "token": "YOUR_DAILY_TOKEN"
  }
}
```

Then open the room URL in browser and start talking.

**Via Python:**

```python
import runpod

runpod.api_key = "YOUR_RUNPOD_API_KEY"

job = runpod.run(
    endpoint_id="YOUR_ENDPOINT_ID",
    input={
        "room_url": "https://YOUR_DOMAIN.daily.co/project-me-test",
        "token": "YOUR_DAILY_TOKEN",
        "system_prompt": "You are a helpful personal assistant."
    }
)
print(f"Job: {job['id']} - Open room URL and start talking!")
```

## API Reference

### Input

| Field | Required | Description |
|-------|----------|-------------|
| `room_url` | Yes | Daily.co room URL |
| `token` | Yes | Daily.co meeting token |
| `system_prompt` | No | System prompt for Claude |
| `voice_reference_path` | No | Voice cloning reference audio |

### Output

| Field | Description |
|-------|-------------|
| `status` | "completed" or "failed" |
| `duration_seconds` | Session duration |
| `turns` | Conversation turns |

## Performance

| Metric | Value |
|--------|-------|
| STT Latency | ~100-200ms |
| LLM Latency | ~300-500ms |
| TTS Latency | ~200-400ms |
| **Total Round-Trip** | **~600-1100ms** |
| Cold Start (baked models) | 15-30s |
| Warm Worker | <1s |

## Costs

| Service | Cost |
|---------|------|
| RunPod A6000 | ~$1.22/hour |
| Daily.co | Free tier: 10K mins/month |
| Claude API | ~$0.003/1K tokens |

**~$0.15-0.20 per 5-minute call**

## Local Testing

Test the handler locally on your Mac (without GPU) before deploying:

```bash
cd runpod-serverless

# Create virtual environment with uv
uv venv
source .venv/bin/activate

# Install dependencies
uv pip install -r requirements.txt

# Set required env vars
export ANTHROPIC_API_KEY=your-anthropic-api-key

# Run handler (auto-detects CPU on Mac, CUDA on RunPod)
python handler.py
```

The handler auto-detects the device:
- **Mac/CPU**: Uses `device=cpu`, `compute_type=int8`
- **RunPod/GPU**: Uses `device=cuda`, `compute_type=float16`

**Quick validation** (without running full pipeline):
```bash
python -c "from handler import DEVICE, COMPUTE_TYPE; print(f'Device: {DEVICE}, Compute: {COMPUTE_TYPE}')"
```

**Test with input:**
```bash
echo '{"input": {"room_url": "https://your-domain.daily.co/test-room"}}' > test_input.json
python handler.py
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Slow cold start | Models are baked in; set Min Workers: 1 for always-warm |
| No audio | Check browser mic permissions, Daily.co room config |
| Job fails | Verify `ANTHROPIC_API_KEY` in RunPod, check token expiry |
| CUDA OOM | Use GPU with more VRAM, try `compute_type="int8"` |

View logs: RunPod endpoint → **Logs** tab
