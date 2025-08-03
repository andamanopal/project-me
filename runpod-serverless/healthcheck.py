"""
Health check script for RunPod Serverless Voice Pipeline.

Verifies that all components are properly loaded and functional.
"""

import sys
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def check_gpu():
    """Check GPU availability."""
    try:
        import torch

        if not torch.cuda.is_available():
            logger.error("GPU not available")
            return False

        device_name = torch.cuda.get_device_name(0)
        memory_total = torch.cuda.get_device_properties(0).total_memory / 1e9
        logger.info(f"GPU: {device_name} ({memory_total:.1f} GB)")
        return True

    except Exception as e:
        logger.error(f"GPU check failed: {e}")
        return False


def check_faster_whisper():
    """Check Faster-Whisper model."""
    try:
        from faster_whisper import WhisperModel

        logger.info("Loading Faster-Whisper model...")
        model = WhisperModel("distil-large-v3", device="cuda", compute_type="float16")

        # Quick inference test
        import numpy as np
        dummy_audio = np.zeros(16000, dtype=np.float32)  # 1 second of silence
        segments, _ = model.transcribe(dummy_audio, language="en")
        list(segments)  # Consume generator

        logger.info("Faster-Whisper: OK")
        return True

    except Exception as e:
        logger.error(f"Faster-Whisper check failed: {e}")
        return False


def check_chatterbox():
    """Check Chatterbox TTS model."""
    try:
        from chatterbox.tts_turbo import ChatterboxTurboTTS

        logger.info("Loading Chatterbox Turbo model...")
        model = ChatterboxTurboTTS.from_pretrained(device="cuda")

        # Quick synthesis test
        audio = model.generate("Hello, this is a test.", exaggeration=0.5)

        if audio is None or len(audio) == 0:
            logger.error("Chatterbox generated empty audio")
            return False

        logger.info("Chatterbox Turbo: OK")
        return True

    except Exception as e:
        logger.error(f"Chatterbox check failed: {e}")
        return False


def check_pipecat():
    """Check Pipecat framework."""
    try:
        from pipecat.pipeline.pipeline import Pipeline
        from pipecat.transports.services.daily import DailyTransport
        from pipecat.audio.vad.silero import SileroVADAnalyzer

        logger.info("Pipecat framework: OK")
        return True

    except Exception as e:
        logger.error(f"Pipecat check failed: {e}")
        return False


def check_anthropic():
    """Check Anthropic API connectivity."""
    try:
        import os
        from anthropic import Anthropic

        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            logger.warning("ANTHROPIC_API_KEY not set (will be required at runtime)")
            return True  # Not a fatal error at build time

        client = Anthropic(api_key=api_key)
        # Don't actually make a request during health check
        logger.info("Anthropic client: OK")
        return True

    except Exception as e:
        logger.error(f"Anthropic check failed: {e}")
        return False


def main():
    """Run all health checks."""
    logger.info("=" * 50)
    logger.info("Running health checks...")
    logger.info("=" * 50)

    checks = [
        ("GPU", check_gpu),
        ("Faster-Whisper", check_faster_whisper),
        ("Chatterbox Turbo", check_chatterbox),
        ("Pipecat", check_pipecat),
        ("Anthropic", check_anthropic),
    ]

    results = {}
    for name, check_fn in checks:
        logger.info(f"\nChecking {name}...")
        results[name] = check_fn()

    logger.info("\n" + "=" * 50)
    logger.info("Health Check Results:")
    logger.info("=" * 50)

    all_passed = True
    for name, passed in results.items():
        status = "PASS" if passed else "FAIL"
        logger.info(f"  {name}: {status}")
        if not passed:
            all_passed = False

    if all_passed:
        logger.info("\nAll checks passed!")
        sys.exit(0)
    else:
        logger.error("\nSome checks failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
