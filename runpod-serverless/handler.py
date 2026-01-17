"""
RunPod Serverless Handler for Voice Pipeline.

This handler runs a Pipecat voice pipeline with:
- Daily.co WebRTC transport
- Faster-Whisper STT (distil-large-v3)
- Claude LLM (claude-sonnet-4-20250514)
- Chatterbox TTS

Usage:
    Job input:
    {
        "room_url": "https://your-domain.daily.co/room-name",
        "token": "eyJ...",
        "system_prompt": "You are a helpful assistant...",
        "voice_reference_path": "/app/voices/reference.wav"  # optional
    }

    Job output:
    {
        "status": "completed",
        "duration_seconds": 125.4,
        "turns": 15
    }
"""

import os
import asyncio
import logging
import time
from typing import Optional
from functools import lru_cache

import runpod

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Environment variables
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
DEFAULT_SYSTEM_PROMPT = """You are a helpful personal AI assistant.
You are having a real-time voice conversation. Keep your responses concise
and natural - aim for 1-3 sentences unless more detail is needed.
Be warm, friendly, and helpful."""


@lru_cache(maxsize=1)
def preload_models():
    """
    Pre-load all ML models at startup for faster inference.

    This is called once when the container starts to warm up models.
    """
    logger.info("Pre-loading models...")
    start = time.time()

    # Pre-load Faster-Whisper
    from services.faster_whisper_stt import get_whisper_model
    get_whisper_model("distil-large-v3", "cuda", "float16")

    # Pre-load Chatterbox
    from services.chatterbox_tts import get_chatterbox_model
    get_chatterbox_model("cuda")

    elapsed = time.time() - start
    logger.info(f"All models pre-loaded in {elapsed:.2f}s")


async def run_voice_pipeline(
    room_url: str,
    token: str,
    system_prompt: str = DEFAULT_SYSTEM_PROMPT,
    voice_reference_path: Optional[str] = None,
) -> dict:
    """
    Run the voice pipeline in the Daily.co room.

    Args:
        room_url: Daily.co room URL
        token: Daily.co meeting token
        system_prompt: System prompt for Claude
        voice_reference_path: Optional path to voice reference for Chatterbox

    Returns:
        Dictionary with status, duration, and conversation metrics
    """
    from pipecat.pipeline.pipeline import Pipeline
    from pipecat.pipeline.task import PipelineTask
    from pipecat.pipeline.runner import PipelineRunner
    from pipecat.transports.services.daily import DailyTransport, DailyParams
    from pipecat.audio.vad.silero import SileroVADAnalyzer
    from pipecat.services.anthropic import AnthropicLLMService
    from pipecat.processors.aggregators.user_response import UserResponseAggregator
    from pipecat.frames.frames import TextFrame, EndFrame

    from services.faster_whisper_stt import FasterWhisperSTTService
    from services.chatterbox_tts import ChatterboxTTSService

    start_time = time.time()
    turn_count = 0

    # Initialize VAD
    vad = SileroVADAnalyzer(
        sample_rate=16000,
        min_volume=0.6,
        start_secs=0.2,      # Quick response to speech start
        stop_secs=0.8,       # Wait for natural pauses
        min_speech_secs=0.5, # Filter out short sounds
    )

    # Initialize Daily transport
    transport = DailyTransport(
        room_url=room_url,
        token=token,
        bot_name="Assistant",
        params=DailyParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            audio_in_sample_rate=16000,
            audio_out_sample_rate=24000,
            vad_enabled=True,
            vad_analyzer=vad,
            transcription_enabled=False,  # We use our own STT
        )
    )

    # Initialize STT (Faster-Whisper)
    stt = FasterWhisperSTTService(
        model_name="distil-large-v3",
        device="cuda",
        compute_type="float16",
        language="en",
        beam_size=5,
        vad_filter=True,
        sample_rate=16000,
    )

    # Initialize LLM (Claude) with system prompt
    llm = AnthropicLLMService(
        api_key=ANTHROPIC_API_KEY,
        model="claude-sonnet-4-20250514",
        system_prompt=system_prompt,
    )

    # Initialize TTS (Chatterbox)
    tts = ChatterboxTTSService(
        device="cuda",
        sample_rate=24000,
        exaggeration=0.5,
        cfg_weight=0.5,
        reference_audio_path=voice_reference_path,
    )

    # Aggregator for proper conversation handling
    user_aggregator = UserResponseAggregator()

    # Build pipeline
    pipeline = Pipeline([
        transport.input(),        # Audio from Daily.co
        stt,                      # Speech-to-Text
        user_aggregator,          # Aggregate user speech
        llm,                      # Claude LLM
        tts,                      # Text-to-Speech
        transport.output(),       # Audio back to Daily.co
    ])

    # Create runner and task
    runner = PipelineRunner()
    task = PipelineTask(pipeline)

    # Track conversation metrics
    pipeline_done = asyncio.Event()

    @transport.event_handler("on_participant_joined")
    async def on_participant_joined(participant):
        nonlocal turn_count
        logger.info(f"Participant joined: {participant.get('id', 'unknown')}")

        # Greet the user
        greeting = "Hello! I'm your personal AI assistant. How can I help you today?"
        await task.queue_frames([TextFrame(text=greeting)])
        turn_count += 1

    @transport.event_handler("on_participant_left")
    async def on_participant_left(participant, reason=None):
        logger.info(f"Participant left: {participant.get('id', 'unknown')}")
        await task.queue_frame(EndFrame())
        pipeline_done.set()

    @transport.event_handler("on_call_state_updated")
    async def on_call_state_updated(state):
        if state == "left":
            logger.info("Call ended")
            pipeline_done.set()

    # Track turns on transcription
    original_process = stt.process_frame
    async def counting_process(frame, direction):
        nonlocal turn_count
        from pipecat.frames.frames import TranscriptionFrame
        if isinstance(frame, TranscriptionFrame):
            turn_count += 1
        await original_process(frame, direction)
    stt.process_frame = counting_process

    try:
        # Run the pipeline
        logger.info("Starting voice pipeline...")

        # Run with timeout (max 10 minutes per session)
        await asyncio.wait_for(
            runner.run(task),
            timeout=600
        )

    except asyncio.TimeoutError:
        logger.warning("Pipeline timed out after 10 minutes")
    except Exception as e:
        logger.error(f"Pipeline error: {e}")
        raise
    finally:
        # Cleanup
        await transport.leave()
        logger.info("Pipeline stopped, transport cleaned up")

    duration = time.time() - start_time

    return {
        "status": "completed",
        "duration_seconds": round(duration, 2),
        "turns": turn_count,
    }


def validate_input(job_input: dict) -> tuple[bool, str]:
    """Validate job input parameters."""
    if not isinstance(job_input, dict):
        return False, "Input must be a dictionary"

    if "room_url" not in job_input:
        return False, "Missing required field: room_url"

    if "token" not in job_input:
        return False, "Missing required field: token"

    if not ANTHROPIC_API_KEY:
        return False, "ANTHROPIC_API_KEY environment variable not set"

    return True, ""


def handler(job):
    """
    RunPod serverless handler.

    Processes voice pipeline jobs for real-time conversation.
    """
    job_id = job["id"]
    job_input = job.get("input", {})

    logger.info(f"Processing job {job_id}")

    # Validate input
    is_valid, error_msg = validate_input(job_input)
    if not is_valid:
        logger.error(f"Validation error: {error_msg}")
        return {"error": error_msg, "status": "failed"}

    # Extract parameters
    room_url = job_input["room_url"]
    # Convert empty token to None for DailyTransport compatibility
    token = job_input["token"] or None
    system_prompt = job_input.get("system_prompt", DEFAULT_SYSTEM_PROMPT)
    voice_reference_path = job_input.get("voice_reference_path")

    try:
        # Run the async pipeline
        result = asyncio.run(
            run_voice_pipeline(
                room_url=room_url,
                token=token,
                system_prompt=system_prompt,
                voice_reference_path=voice_reference_path,
            )
        )

        logger.info(f"Job {job_id} completed: {result}")
        return result

    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}")
        return {
            "error": str(e),
            "status": "failed"
        }


# Pre-warm models on container startup
logger.info("Container starting, pre-warming models...")
preload_models()
logger.info("Container ready to accept jobs!")

# Start RunPod serverless worker
runpod.serverless.start({"handler": handler})
