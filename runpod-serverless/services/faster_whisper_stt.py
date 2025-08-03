"""
Faster-Whisper STT Service for Pipecat.

Provides Speech-to-Text using the Faster-Whisper library with
distil-large-v3 model for low-latency transcription.
"""

import asyncio
import logging
import numpy as np
from typing import Optional, AsyncGenerator
from functools import lru_cache

from pipecat.frames.frames import (
    Frame,
    AudioRawFrame,
    TranscriptionFrame,
    InterimTranscriptionFrame,
    ErrorFrame,
)
from pipecat.services.ai_services import STTService
from pipecat.processors.frame_processor import FrameDirection

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_whisper_model(
    model_name: str = "distil-large-v3",
    device: str = "cuda",
    compute_type: str = "float16",
):
    """
    Load and cache the Faster-Whisper model.

    This is cached at module level to avoid reloading on each request.
    """
    from faster_whisper import WhisperModel

    logger.info(f"Loading Faster-Whisper model: {model_name}")
    model = WhisperModel(
        model_name,
        device=device,
        compute_type=compute_type,
    )
    logger.info("Faster-Whisper model loaded successfully")
    return model


class FasterWhisperSTTService(STTService):
    """
    Speech-to-Text service using Faster-Whisper.

    Processes audio frames and yields transcription results.
    Optimized for low-latency with distil-large-v3 model.
    """

    def __init__(
        self,
        *,
        model_name: str = "distil-large-v3",
        device: str = "cuda",
        compute_type: str = "float16",
        language: str = "en",
        beam_size: int = 5,
        vad_filter: bool = True,
        vad_parameters: Optional[dict] = None,
        sample_rate: int = 16000,
        min_audio_length: float = 0.5,  # Minimum audio duration in seconds
        **kwargs
    ):
        """
        Initialize Faster-Whisper STT service.

        Args:
            model_name: Whisper model name (e.g., 'distil-large-v3')
            device: Device to run on ('cuda' or 'cpu')
            compute_type: Compute precision ('float16', 'int8', etc.)
            language: Language code for transcription
            beam_size: Beam size for decoding
            vad_filter: Whether to use VAD filtering
            vad_parameters: Custom VAD parameters
            sample_rate: Expected audio sample rate
            min_audio_length: Minimum audio length to process (seconds)
        """
        super().__init__(**kwargs)

        self._model_name = model_name
        self._device = device
        self._compute_type = compute_type
        self._language = language
        self._beam_size = beam_size
        self._vad_filter = vad_filter
        self._vad_parameters = vad_parameters or {
            "threshold": 0.5,
            "min_speech_duration_ms": 250,
            "min_silence_duration_ms": 500,  # Increased for natural speech pauses
            "speech_pad_ms": 200,
        }
        self._sample_rate = sample_rate
        self._min_audio_length = min_audio_length

        # Audio buffer for accumulating frames
        self._audio_buffer = bytearray()
        self._min_buffer_size = int(sample_rate * min_audio_length * 2)  # 16-bit audio

        # Model reference (lazy loaded)
        self._model = None

    async def start(self, frame: Frame):
        """Initialize the STT service."""
        await super().start(frame)

        # Load model in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        self._model = await loop.run_in_executor(
            None,
            get_whisper_model,
            self._model_name,
            self._device,
            self._compute_type,
        )
        logger.info("FasterWhisperSTTService started")

    async def stop(self, frame: Frame):
        """Cleanup resources."""
        await super().stop(frame)
        self._audio_buffer.clear()
        logger.info("FasterWhisperSTTService stopped")

    def _audio_bytes_to_array(self, audio_bytes: bytes) -> np.ndarray:
        """Convert raw audio bytes to numpy array."""
        # Assuming 16-bit PCM audio
        audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
        # Normalize to float32 [-1, 1]
        audio_array = audio_array.astype(np.float32) / 32768.0
        return audio_array

    async def _transcribe(self, audio: np.ndarray) -> AsyncGenerator[Frame, None]:
        """
        Transcribe audio using Faster-Whisper.

        Yields TranscriptionFrame with the transcription result.
        """
        if self._model is None:
            yield ErrorFrame(error="Faster-Whisper model not loaded")
            return

        try:
            # Define transcription function that consumes generator in thread
            def do_transcription():
                segments, info = self._model.transcribe(
                    audio,
                    language=self._language,
                    beam_size=self._beam_size,
                    vad_filter=self._vad_filter,
                    vad_parameters=self._vad_parameters,
                    word_timestamps=False,
                )
                # Consume generator inside thread for thread-safety
                text = "".join(segment.text for segment in segments)
                return text.strip(), info

            # Run transcription in thread pool
            loop = asyncio.get_event_loop()
            transcription_text, info = await loop.run_in_executor(
                None, do_transcription
            )

            if transcription_text:
                logger.debug(f"Transcription: {transcription_text}")
                yield TranscriptionFrame(
                    text=transcription_text,
                    user_id="",
                    timestamp="",
                    language=self._language,
                )

        except Exception as e:
            logger.error(f"Transcription error: {e}")
            yield ErrorFrame(error=f"Transcription failed: {str(e)}")

    async def run_stt(self, audio: bytes) -> AsyncGenerator[Frame, None]:
        """
        Process audio bytes and yield transcription frames.

        This method is called by Pipecat when audio data is ready.
        """
        # Add audio to buffer
        self._audio_buffer.extend(audio)

        # Check if we have enough audio
        if len(self._audio_buffer) < self._min_buffer_size:
            return

        # Convert buffer to numpy array
        audio_array = self._audio_bytes_to_array(bytes(self._audio_buffer))

        # Clear buffer
        self._audio_buffer.clear()

        # Transcribe
        async for frame in self._transcribe(audio_array):
            yield frame

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        """Process incoming audio frames."""
        await super().process_frame(frame, direction)

        if isinstance(frame, AudioRawFrame):
            # Process audio through STT
            async for result_frame in self.run_stt(frame.audio):
                await self.push_frame(result_frame, direction)
        else:
            # Pass through other frames
            await self.push_frame(frame, direction)

    async def process_audio_buffer(self) -> AsyncGenerator[Frame, None]:
        """
        Force process any remaining audio in the buffer.

        Call this when the user stops speaking to ensure all audio is processed.
        """
        if len(self._audio_buffer) > 0:
            audio_array = self._audio_bytes_to_array(bytes(self._audio_buffer))
            self._audio_buffer.clear()

            async for frame in self._transcribe(audio_array):
                yield frame
