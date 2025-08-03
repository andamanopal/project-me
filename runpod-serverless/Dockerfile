# RunPod Serverless Voice Pipeline
# Includes pre-baked STT (Faster-Whisper) and TTS (Chatterbox Turbo) models

FROM runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04

# HuggingFace token for downloading gated models
ARG HF_TOKEN

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV HF_HOME=/models/huggingface
ENV TRANSFORMERS_CACHE=/models/huggingface
ENV TORCH_HOME=/models/torch
ENV PYTHONUNBUFFERED=1
ENV HF_TOKEN=${HF_TOKEN}

# Create directories
RUN mkdir -p /models/huggingface /app/services /app/voices

WORKDIR /app

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    libportaudio2 \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install UV for fast dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy requirements first for better caching
COPY requirements.txt /app/requirements.txt

# Install Python dependencies using UV (much faster than pip)
RUN uv pip install --system -r requirements.txt

# Pin numpy<2 (base image PyTorch was compiled with numpy 1.x)
RUN uv pip install --system "numpy>=1.26.4,<2"

# Install Chatterbox TTS dependencies first (since we'll use --no-deps)
# Based on chatterbox-tts==0.1.6 pyproject.toml
RUN uv pip install --system \
    librosa==0.11.0 \
    torchaudio \
    transformers==4.46.3 \
    diffusers==0.29.0 \
    resemble-perth==1.0.1 \
    conformer==0.3.2 \
    safetensors==0.5.3 \
    s3tokenizer \
    spacy-pkuseg \
    pykakasi==2.3.0 \
    pyloudnorm \
    omegaconf

# Install Chatterbox TTS with --no-deps to avoid numpy version conflict
RUN uv pip install --system --no-deps chatterbox-tts==0.1.6

# Pre-download Chatterbox Turbo model (~4GB)
RUN python -c "\
import os; \
from huggingface_hub import login; \
token = os.environ.get('HF_TOKEN'); \
token and login(token=token); \
from chatterbox.tts_turbo import ChatterboxTurboTTS; \
print('Downloading Chatterbox Turbo...'); \
model = ChatterboxTurboTTS.from_pretrained(device='cpu'); \
print('Chatterbox Turbo model downloaded successfully'); \
del model"

# Pre-download Faster-Whisper distil-large-v3 model (~1.5GB)
# This bakes the model into the image for faster cold starts
RUN python -c "\
from faster_whisper import WhisperModel; \
print('Downloading Faster-Whisper distil-large-v3...'); \
model = WhisperModel('distil-large-v3', device='cpu', compute_type='int8'); \
print('Faster-Whisper model downloaded successfully'); \
del model"

# Pre-download Silero VAD model
RUN python -c "\
import torch; \
torch.hub.load(repo_or_dir='snakers4/silero-vad', model='silero_vad', force_reload=False); \
print('Silero VAD model downloaded successfully')"

# Copy application code
COPY services/ /app/services/
COPY handler.py /app/handler.py

# Optional: Copy default voice reference for Chatterbox
# COPY voices/ /app/voices/

# Health check script
COPY healthcheck.py /app/healthcheck.py

# RunPod serverless entrypoint
CMD ["python", "-u", "/app/handler.py"]
