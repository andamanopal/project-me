"""
Chatterbox TTS Service for Pipecat.

Provides Text-to-Speech using Chatterbox Turbo model
for high-quality, low-latency voice synthesis.
"""

import asyncio
import logging
import numpy as np
import io
from typing import Optional, AsyncGenerator
from functools import lru_cache

from pipecat.frames.frames import (
    Frame,
    TextFrame,
    TTSAudioRawFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
    ErrorFrame,
)
from pipecat.services.ai_services import TTSService
from pipecat.processors.frame_processor import FrameDirection

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_chatterbox_model(device: str = "cuda"):
    """
    Load and cache the Chatterbox Turbo TTS model.

    This is cached at module level to avoid reloading on each request.
    """
    from chatterbox.tts_turbo import ChatterboxTurboTTS

    logger.info("Loading Chatterbox Turbo model...")
    model = ChatterboxTurboTTS.from_pretrained(device=device)
    logger.info("Chatterbox Turbo model loaded successfully")
    return model


class ChatterboxTTSService(TTSService):
    """
    Text-to-Speech service using Chatterbox Turbo.

    Processes text frames and yields audio output.
    Supports voice cloning via reference audio.
    """

    def __init__(
        self,
        *,
        device: str = "cuda",
        sample_rate: int = 24000,
        exaggeration: float = 0.5,
        cfg_weight: float = 0.5,
        reference_audio_path: Optional[str] = None,
        chunk_size: int = 4096,
        **kwargs
    ):
        """
        Initialize Chatterbox TTS service.

        Args:
            device: Device to run on ('cuda' or 'cpu')
            sample_rate: Output audio sample rate (Chatterbox outputs 24kHz)
            exaggeration: Emotion exaggeration factor (0.0-1.0)
            cfg_weight: Classifier-free guidance weight (0.0-1.0)
            reference_audio_path: Path to reference audio for voice cloning
            chunk_size: Size of audio chunks to yield
        """
        super().__init__(sample_rate=sample_rate, **kwargs)

        self._device = device
        self._exaggeration = exaggeration
        self._cfg_weight = cfg_weight
        self._reference_audio_path = reference_audio_path
        self._chunk_size = chunk_size

        # Model reference (lazy loaded)
        self._model = None

    async def start(self, frame: Frame):
        """Initialize the TTS service."""
        await super().start(frame)

        # Load model in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        self._model = await loop.run_in_executor(
            None,
            get_chatterbox_model,
            self._device,
        )

        logger.info("ChatterboxTTSService started")

    async def stop(self, frame: Frame):
        """Cleanup resources."""
        await super().stop(frame)
        logger.info("ChatterboxTTSService stopped")

    def set_reference_audio(self, audio_path: str):
        """Set reference audio path for voice cloning."""
        self._reference_audio_path = audio_path

    async def _synthesize(self, text: str) -> bytes:
        """
        Synthesize speech from text using Chatterbox.

        Returns raw audio bytes.
        """
        if self._model is None:
            raise RuntimeError("Chatterbox model not loaded")

        loop = asyncio.get_event_loop()

        # Prepare generation kwargs
        generate_kwargs = {
            "text": text,
            "exaggeration": self._exaggeration,
            "cfg_weight": self._cfg_weight,
        }

        # Add voice cloning reference if provided (use path directly)
        if self._reference_audio_path:
            generate_kwargs["audio_prompt_path"] = self._reference_audio_path

        # Run synthesis in thread pool
        audio_tensor = await loop.run_in_executor(
            None,
            lambda: self._model.generate(**generate_kwargs)
        )

        # Convert to numpy and then to bytes
        audio_numpy = audio_tensor.detach().cpu().numpy()

        # Ensure audio is in the right shape (1D or 2D with channels)
        if len(audio_numpy.shape) > 1:
            audio_numpy = audio_numpy.squeeze(0)

        # Convert to 16-bit PCM
        audio_int16 = (audio_numpy * 32767).astype(np.int16)
        audio_bytes = audio_int16.tobytes()

        return audio_bytes

    async def run_tts(self, text: str) -> AsyncGenerator[Frame, None]:
        """
        Convert text to speech and yield audio frames.

        Yields TTSAudioRawFrame chunks for streaming playback.
        """
        if not text or not text.strip():
            return

        logger.debug(f"Synthesizing: {text[:50]}...")

        try:
            # Signal TTS started
            yield TTSStartedFrame()

            # Synthesize audio
            audio_bytes = await self._synthesize(text)

            # Stream audio in chunks
            for i in range(0, len(audio_bytes), self._chunk_size):
                chunk = audio_bytes[i:i + self._chunk_size]
                yield TTSAudioRawFrame(
                    audio=chunk,
                    sample_rate=self._sample_rate,
                    num_channels=1,
                )

            # Signal TTS stopped
            yield TTSStoppedFrame()

            logger.debug("TTS synthesis complete")

        except Exception as e:
            logger.error(f"TTS synthesis error: {e}")
            yield ErrorFrame(error=f"TTS synthesis failed: {str(e)}")
            yield TTSStoppedFrame()

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        """Process incoming text frames."""
        await super().process_frame(frame, direction)

        if isinstance(frame, TextFrame):
            # Process text through TTS
            async for audio_frame in self.run_tts(frame.text):
                await self.push_frame(audio_frame, direction)
        else:
            # Pass through other frames
            await self.push_frame(frame, direction)


class ChatterboxTTSServiceWithResampling(ChatterboxTTSService):
    """
    Chatterbox TTS with automatic resampling support.

    Resamples Chatterbox's 24kHz output to the target sample rate
    if needed (e.g., for 16kHz transport requirements).
    """

    def __init__(
        self,
        *,
        output_sample_rate: int = 24000,
        **kwargs
    ):
        """
        Initialize with resampling support.

        Args:
            output_sample_rate: Target output sample rate
        """
        super().__init__(sample_rate=24000, **kwargs)  # Chatterbox native rate
        self._output_sample_rate = output_sample_rate
        self._needs_resampling = output_sample_rate != 24000

    async def _resample(self, audio_bytes: bytes, from_rate: int, to_rate: int) -> bytes:
        """Resample audio to target rate."""
        import scipy.signal

        # Convert to numpy
        audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
        audio_float = audio_int16.astype(np.float32) / 32767.0

        # Calculate resampling ratio
        num_samples = int(len(audio_float) * to_rate / from_rate)

        # Resample
        loop = asyncio.get_event_loop()
        resampled = await loop.run_in_executor(
            None,
            lambda: scipy.signal.resample(audio_float, num_samples)
        )

        # Convert back to int16 bytes
        resampled_int16 = (resampled * 32767).astype(np.int16)
        return resampled_int16.tobytes()

    async def run_tts(self, text: str) -> AsyncGenerator[Frame, None]:
        """
        Convert text to speech with optional resampling.
        """
        async for frame in super().run_tts(text):
            if isinstance(frame, TTSAudioRawFrame) and self._needs_resampling:
                # Resample the audio
                resampled_audio = await self._resample(
                    frame.audio,
                    24000,
                    self._output_sample_rate
                )
                yield TTSAudioRawFrame(
                    audio=resampled_audio,
                    sample_rate=self._output_sample_rate,
                    num_channels=frame.num_channels,
                )
            else:
                yield frame
