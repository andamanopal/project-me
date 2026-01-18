"""
Faster-Whisper STT Service for Pipecat.

Based on the official Pipecat WhisperSTTService implementation.
Uses SegmentedSTTService for proper VAD integration.
"""

import asyncio
import io
import wave
import numpy as np
from typing import AsyncGenerator, Optional
from functools import lru_cache

from loguru import logger

from pipecat.frames.frames import Frame, TranscriptionFrame, ErrorFrame
from pipecat.services.stt_service import SegmentedSTTService
from pipecat.transcriptions.language import Language
from pipecat.utils.time import time_now_iso8601


@lru_cache(maxsize=1)
def get_whisper_model(
    model_name: str = "distil-large-v3",
    device: str = "cuda",
    compute_type: str = "float16",
):
    """Load and cache the Faster-Whisper model."""
    from faster_whisper import WhisperModel

    logger.info(f"Loading Faster-Whisper model: {model_name}")
    model = WhisperModel(
        model_name,
        device=device,
        compute_type=compute_type,
    )
    logger.info("Faster-Whisper model loaded successfully")
    return model


class FasterWhisperSTTService(SegmentedSTTService):
    """
    Speech-to-Text service using Faster-Whisper.
    
    Extends SegmentedSTTService for proper VAD integration:
    - Audio is buffered while user is speaking
    - Transcription runs only when user stops speaking
    - Uses no_speech_prob to filter hallucinations
    """

    def __init__(
        self,
        *,
        model_name: str = "distil-large-v3",
        device: str = "cuda",
        compute_type: str = "float16",
        language: str = "en",
        beam_size: int = 5,
        no_speech_prob: float = 0.4,
        sample_rate: int = 16000,
        **kwargs
    ):
        super().__init__(sample_rate=sample_rate, **kwargs)

        self._model_name = model_name
        self._device = device
        self._compute_type = compute_type
        self._language = language
        self._beam_size = beam_size
        self._no_speech_prob = no_speech_prob
        self._model = None

        # Load model immediately
        self._load()

    def _load(self):
        """Load the Whisper model."""
        try:
            self._model = get_whisper_model(
                self._model_name,
                self._device,
                self._compute_type,
            )
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            self._model = None

    async def run_stt(self, audio: bytes) -> AsyncGenerator[Frame, None]:
        """
        Transcribe audio using Faster-Whisper.
        
        SegmentedSTTService sends WAV-formatted bytes. We parse the WAV
        to extract raw PCM, then convert to float32 for Whisper.
        """
        if not self._model:
            yield ErrorFrame("Whisper model not available")
            return

        try:
            # Parse WAV bytes to extract raw PCM audio
            wav_io = io.BytesIO(audio)
            with wave.open(wav_io, 'rb') as wav_file:
                n_frames = wav_file.getnframes()
                if n_frames < self._sample_rate * 0.3:
                    logger.debug(f"[STT] Audio too short ({n_frames} frames), skipping")
                    return
                pcm_bytes = wav_file.readframes(n_frames)

            # Convert 16-bit PCM to float32 normalized to [-1, 1]
            audio_float = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            segments, info = await asyncio.to_thread(
                self._model.transcribe,
                audio_float,
                language=self._language,
                beam_size=self._beam_size,
            )

            text = ""
            for segment in segments:
                # Filter out segments with high no_speech probability (hallucinations)
                if segment.no_speech_prob < self._no_speech_prob:
                    text += f"{segment.text} "

            text = text.strip()

            if text:
                logger.info(f"[STT] Transcribed: {text}")
                # Debug log
                with open("/tmp/voice_debug.txt", "a") as f:
                    import time
                    f.write(f"[{time.strftime('%H:%M:%S')}] USER: {text}\n")

                yield TranscriptionFrame(
                    text=text,
                    user_id=self._user_id,
                    timestamp=time_now_iso8601(),
                    language=Language(self._language) if self._language else None,
                )

        except Exception as e:
            logger.error(f"Transcription error: {e}")
            yield ErrorFrame(error=f"Transcription failed: {str(e)}")
