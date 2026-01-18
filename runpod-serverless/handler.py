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
import warnings
from typing import Optional
from functools import lru_cache

# Suppress noisy warnings from faster-whisper
warnings.filterwarnings("ignore", message=".*matmul.*")
warnings.filterwarnings("ignore", category=RuntimeWarning)

import torch
import runpod

# Auto-detect device: use CUDA if available, otherwise CPU (for local testing)
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "int8"

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
    logger.info(f"Pre-loading models on device: {DEVICE}...")
    start = time.time()

    # Pre-load Faster-Whisper
    from services.faster_whisper_stt import get_whisper_model
    get_whisper_model("distil-large-v3", DEVICE, COMPUTE_TYPE)

    # Pre-load Chatterbox
    from services.chatterbox_tts import get_chatterbox_model
    get_chatterbox_model(DEVICE)

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
    from pipecat.pipeline.task import PipelineTask, PipelineParams
    from pipecat.pipeline.runner import PipelineRunner
    from pipecat.transports.daily.transport import DailyTransport, DailyParams
    from pipecat.audio.vad.silero import SileroVADAnalyzer
    from pipecat.audio.vad.vad_analyzer import VADParams
    from pipecat.services.anthropic.llm import AnthropicLLMService
    from pipecat.frames.frames import EndFrame, LLMMessagesFrame
    from pipecat.processors.aggregators.llm_context import LLMContext
    from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair

    from services.faster_whisper_stt import FasterWhisperSTTService
    from services.chatterbox_tts import ChatterboxTTSService

    start_time = time.time()
    turn_count = 0

    # Initialize VAD
    vad = SileroVADAnalyzer(
        params=VADParams(
            stop_secs=0.5,
        )
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
            vad_analyzer=vad,
            transcription_enabled=False,
        )
    )

    # Initialize STT (Faster-Whisper with SegmentedSTTService)
    stt = FasterWhisperSTTService(
        model_name="distil-large-v3",
        device=DEVICE,
        compute_type=COMPUTE_TYPE,
        language="en",
        beam_size=5,
        no_speech_prob=0.4,  # Filter segments with high no_speech probability
        sample_rate=16000,
    )

    # Initialize LLM (Claude)
    llm = AnthropicLLMService(
        api_key=ANTHROPIC_API_KEY,
        model="claude-sonnet-4-20250514",
    )

    # Initialize TTS (Chatterbox)
    tts = ChatterboxTTSService(
        device=DEVICE,
        sample_rate=24000,
        exaggeration=0.5,
        cfg_weight=0.5,
        reference_audio_path=voice_reference_path,
    )

    # Conversation context with system prompt
    messages = [
        {"role": "system", "content": system_prompt},
    ]
    context = LLMContext(messages)

    # Context aggregators for proper conversation flow
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(context)

    # Build pipeline with proper aggregators
    pipeline = Pipeline([
        transport.input(),
        stt,
        user_aggregator,
        llm,
        tts,
        transport.output(),
        assistant_aggregator,
    ])

    # Create runner and task
    runner = PipelineRunner()
    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
        ),
    )

    # Track conversation metrics
    pipeline_done = asyncio.Event()
    greeted = False

    @transport.event_handler("on_participant_joined")
    async def on_participant_joined(transport, participant):
        nonlocal greeted
        participant_id = participant.get('id', 'unknown')
        is_local = participant.get('local', False)
        participant_info = participant.get('info', {})
        is_owner = participant_info.get('isOwner', False)
        user_name = participant_info.get('userName', '')
        
        logger.info(f"Participant joined: {participant_id} (local={is_local}, owner={is_owner}, name={user_name})")

        # Only greet real human users (not local bot, not other bots)
        # Check: not local AND (is owner OR has a real user name that's not a bot)
        is_human = not is_local and (is_owner or (user_name and 'bot' not in user_name.lower() and 'assistant' not in user_name.lower()))
        
        if is_human and not greeted:
            greeted = True
            logger.info("Sending greeting to human user")
            messages.append({"role": "user", "content": "Please introduce yourself briefly."})
            await task.queue_frame(LLMMessagesFrame(messages))

    @transport.event_handler("on_participant_left")
    async def on_participant_left(transport, participant, reason=None):
        logger.info(f"Participant left: {participant.get('id', 'unknown')}")
        await task.queue_frame(EndFrame())
        pipeline_done.set()

    @transport.event_handler("on_call_state_updated")
    async def on_call_state_updated(transport, state):
        if state == "left":
            logger.info("Call ended")
            pipeline_done.set()

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
        # Cleanup - transport is cleaned up automatically by the pipeline
        logger.info("Pipeline stopped")

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

    # token is optional for public rooms

    if not ANTHROPIC_API_KEY:
        return False, "ANTHROPIC_API_KEY environment variable not set"

    return True, ""


async def async_handler(job):
    """
    Async RunPod serverless handler.

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
    token = job_input.get("token") or None
    system_prompt = job_input.get("system_prompt", DEFAULT_SYSTEM_PROMPT)
    voice_reference_path = job_input.get("voice_reference_path")

    try:
        # Run the async pipeline directly (we're already in async context)
        result = await run_voice_pipeline(
            room_url=room_url,
            token=token,
            system_prompt=system_prompt,
            voice_reference_path=voice_reference_path,
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
logger.info(f"Container starting on device: {DEVICE}")
preload_models()
logger.info("Container ready to accept jobs!")

# Start RunPod serverless worker with async handler
runpod.serverless.start({"handler": async_handler})
