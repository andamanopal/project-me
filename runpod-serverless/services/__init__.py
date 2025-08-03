"""
Custom Pipecat services for RunPod Serverless Voice Pipeline.

Services:
- FasterWhisperSTTService: Speech-to-Text using Faster-Whisper with distil-large-v3
- ChatterboxTTSService: Text-to-Speech using Chatterbox Turbo
"""

from .faster_whisper_stt import FasterWhisperSTTService
from .chatterbox_tts import ChatterboxTTSService

__all__ = ["FasterWhisperSTTService", "ChatterboxTTSService"]
