"""
Local testing script for Pipecat pipeline components.

Test each component individually without needing Daily.co or RunPod.

Usage:
    # Test all components
    python test_pipeline.py

    # Test specific component
    python test_pipeline.py --component stt
    python test_pipeline.py --component tts
    python test_pipeline.py --component llm
    python test_pipeline.py --component full
"""

import asyncio
import argparse
import logging
import numpy as np
import os
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Add services to path
sys.path.insert(0, str(Path(__file__).parent))


async def test_stt():
    """Test Faster-Whisper STT service."""
    logger.info("=" * 50)
    logger.info("Testing STT (Faster-Whisper)")
    logger.info("=" * 50)

    from services.faster_whisper_stt import FasterWhisperSTTService, get_whisper_model
    from pipecat.frames.frames import AudioRawFrame, StartFrame

    # Pre-load model
    logger.info("Loading Whisper model...")
    model = get_whisper_model("distil-large-v3", "cuda", "float16")
    logger.info("Model loaded!")

    # Create STT service
    stt = FasterWhisperSTTService(
        model_name="distil-large-v3",
        device="cuda",
        compute_type="float16",
        language="en",
        sample_rate=16000,
    )

    # Start the service
    await stt.start(StartFrame())

    # Option 1: Test with audio file
    test_audio_path = Path(__file__).parent / "test_audio.wav"
    if test_audio_path.exists():
        import soundfile as sf
        audio_data, sample_rate = sf.read(str(test_audio_path))
        if sample_rate != 16000:
            import scipy.signal
            audio_data = scipy.signal.resample(
                audio_data, int(len(audio_data) * 16000 / sample_rate)
            )
        audio_int16 = (audio_data * 32767).astype(np.int16)
        audio_bytes = audio_int16.tobytes()
        logger.info(f"Testing with audio file: {test_audio_path}")
    else:
        # Option 2: Generate test audio (sine wave saying nothing)
        logger.info("No test audio file found. Using synthesized test audio.")
        logger.info("To test with real audio, place a 'test_audio.wav' file in this directory.")

        # Create 2 seconds of silence + noise (simulates speech-like audio)
        duration = 2.0
        sample_rate = 16000
        t = np.linspace(0, duration, int(sample_rate * duration))
        # Add some noise to trigger VAD
        audio_data = np.random.randn(len(t)) * 0.01
        audio_int16 = (audio_data * 32767).astype(np.int16)
        audio_bytes = audio_int16.tobytes()

    # Test transcription directly
    logger.info("Running transcription...")
    audio_array = audio_int16.astype(np.float32) / 32768.0

    segments, info = model.transcribe(
        audio_array,
        language="en",
        beam_size=5,
        vad_filter=True,
    )
    text = "".join(segment.text for segment in segments).strip()

    if text:
        logger.info(f"Transcription result: '{text}'")
    else:
        logger.info("No speech detected (expected for noise/silence)")

    await stt.stop(StartFrame())
    logger.info("STT test complete!")
    return True


async def test_tts():
    """Test Chatterbox TTS service."""
    logger.info("=" * 50)
    logger.info("Testing TTS (Chatterbox Turbo)")
    logger.info("=" * 50)

    from services.chatterbox_tts import ChatterboxTTSService, get_chatterbox_model
    from pipecat.frames.frames import StartFrame, TextFrame

    # Pre-load model
    logger.info("Loading Chatterbox model...")
    model = get_chatterbox_model("cuda")
    logger.info("Model loaded!")

    # Create TTS service
    tts = ChatterboxTTSService(
        device="cuda",
        sample_rate=24000,
        exaggeration=0.5,
        cfg_weight=0.5,
    )

    # Start the service
    await tts.start(StartFrame())

    # Test synthesis
    test_text = "Hello! I am your personal AI assistant. How can I help you today?"
    logger.info(f"Synthesizing: '{test_text}'")

    audio_bytes = await tts._synthesize(test_text)
    logger.info(f"Generated {len(audio_bytes)} bytes of audio")

    # Save to file for manual verification
    output_path = Path(__file__).parent / "test_output.wav"
    import soundfile as sf
    audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
    audio_float = audio_int16.astype(np.float32) / 32767.0
    sf.write(str(output_path), audio_float, 24000)
    logger.info(f"Saved audio to: {output_path}")

    await tts.stop(StartFrame())
    logger.info("TTS test complete!")
    return True


async def test_llm():
    """Test Anthropic LLM service."""
    logger.info("=" * 50)
    logger.info("Testing LLM (Claude)")
    logger.info("=" * 50)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY not set. Skipping LLM test.")
        return False

    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)

    test_message = "Hello, what's 2 + 2?"
    logger.info(f"Sending to Claude: '{test_message}'")

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=100,
        system="You are a helpful AI assistant. Keep responses brief.",
        messages=[{"role": "user", "content": test_message}]
    )

    result = response.content[0].text
    logger.info(f"Claude response: '{result}'")
    logger.info("LLM test complete!")
    return True


async def test_full_pipeline():
    """Test the full pipeline with mock transport."""
    logger.info("=" * 50)
    logger.info("Testing Full Pipeline (Mock Transport)")
    logger.info("=" * 50)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY not set. Skipping full pipeline test.")
        return False

    from services.faster_whisper_stt import FasterWhisperSTTService
    from services.chatterbox_tts import ChatterboxTTSService
    from pipecat.frames.frames import StartFrame, TextFrame, TranscriptionFrame

    # Initialize services
    logger.info("Initializing services...")

    stt = FasterWhisperSTTService(
        model_name="distil-large-v3",
        device="cuda",
        compute_type="float16",
        language="en",
        sample_rate=16000,
    )

    tts = ChatterboxTTSService(
        device="cuda",
        sample_rate=24000,
        exaggeration=0.5,
        cfg_weight=0.5,
    )

    await stt.start(StartFrame())
    await tts.start(StartFrame())

    # Simulate user input (skip STT, use text directly)
    user_text = "What is the capital of France?"
    logger.info(f"\nSimulated user input: '{user_text}'")

    # LLM processing
    from anthropic import Anthropic
    client = Anthropic(api_key=api_key)

    logger.info("Sending to Claude...")
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=200,
        system="You are a helpful AI assistant. Keep responses brief and conversational.",
        messages=[{"role": "user", "content": user_text}]
    )
    llm_response = response.content[0].text
    logger.info(f"Claude response: '{llm_response}'")

    # TTS processing
    logger.info("\nSynthesizing response...")
    audio_bytes = await tts._synthesize(llm_response)
    logger.info(f"Generated {len(audio_bytes)} bytes of audio")

    # Save output
    output_path = Path(__file__).parent / "test_full_pipeline_output.wav"
    import soundfile as sf
    audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
    audio_float = audio_int16.astype(np.float32) / 32767.0
    sf.write(str(output_path), audio_float, 24000)
    logger.info(f"Saved audio to: {output_path}")

    await stt.stop(StartFrame())
    await tts.stop(StartFrame())

    logger.info("\nFull pipeline test complete!")
    return True


async def test_with_microphone():
    """Test with live microphone input (requires pyaudio)."""
    logger.info("=" * 50)
    logger.info("Testing with Live Microphone")
    logger.info("=" * 50)

    try:
        import pyaudio
    except ImportError:
        logger.error("pyaudio not installed. Run: pip install pyaudio")
        return False

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.error("ANTHROPIC_API_KEY not set.")
        return False

    from services.faster_whisper_stt import get_whisper_model
    from services.chatterbox_tts import get_chatterbox_model
    from anthropic import Anthropic
    import soundfile as sf

    # Load models
    logger.info("Loading models...")
    whisper = get_whisper_model("distil-large-v3", "cuda", "float16")
    chatterbox = get_chatterbox_model("cuda")
    claude = Anthropic(api_key=api_key)

    # Audio settings
    CHUNK = 1024
    FORMAT = pyaudio.paInt16
    CHANNELS = 1
    RATE = 16000
    RECORD_SECONDS = 5

    p = pyaudio.PyAudio()

    logger.info(f"\nRecording for {RECORD_SECONDS} seconds... Speak now!")

    stream = p.open(
        format=FORMAT,
        channels=CHANNELS,
        rate=RATE,
        input=True,
        frames_per_buffer=CHUNK
    )

    frames = []
    for i in range(0, int(RATE / CHUNK * RECORD_SECONDS)):
        data = stream.read(CHUNK)
        frames.append(data)

    stream.stop_stream()
    stream.close()
    p.terminate()

    logger.info("Recording complete!")

    # Convert to numpy
    audio_bytes = b''.join(frames)
    audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
    audio_float = audio_int16.astype(np.float32) / 32768.0

    # STT
    logger.info("Transcribing...")
    segments, _ = whisper.transcribe(audio_float, language="en", beam_size=5)
    user_text = "".join(segment.text for segment in segments).strip()

    if not user_text:
        logger.info("No speech detected. Try again.")
        return False

    logger.info(f"You said: '{user_text}'")

    # LLM
    logger.info("Getting Claude's response...")
    response = claude.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=200,
        system="You are a helpful AI assistant. Keep responses brief.",
        messages=[{"role": "user", "content": user_text}]
    )
    llm_response = response.content[0].text
    logger.info(f"Claude: '{llm_response}'")

    # TTS
    logger.info("Synthesizing response...")
    audio_output = chatterbox.generate(llm_response, exaggeration=0.5, cfg_weight=0.5)
    audio_np = audio_output.detach().cpu().numpy()
    if len(audio_np.shape) > 1:
        audio_np = audio_np.squeeze(0)

    # Save and play
    output_path = Path(__file__).parent / "test_mic_response.wav"
    sf.write(str(output_path), audio_np, 24000)
    logger.info(f"Saved response to: {output_path}")

    # Try to play (macOS)
    logger.info("Playing response...")
    os.system(f"afplay {output_path}")

    return True


def main():
    parser = argparse.ArgumentParser(description="Test Pipecat pipeline components")
    parser.add_argument(
        "--component",
        choices=["stt", "tts", "llm", "full", "mic", "all"],
        default="all",
        help="Which component to test"
    )
    args = parser.parse_args()

    async def run_tests():
        if args.component in ["stt", "all"]:
            await test_stt()
            print()

        if args.component in ["tts", "all"]:
            await test_tts()
            print()

        if args.component in ["llm", "all"]:
            await test_llm()
            print()

        if args.component in ["full", "all"]:
            await test_full_pipeline()
            print()

        if args.component == "mic":
            await test_with_microphone()

    asyncio.run(run_tests())


if __name__ == "__main__":
    main()
