# LangGraph Server Dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and pyproject.toml first for better caching
COPY requirements.txt pyproject.toml ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install the package in development mode
COPY . .
RUN pip install -e .

# Create data directory for shared CSV files
RUN mkdir -p /app/data

# Set environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Expose the port (LangGraph default)
EXPOSE 2024

# Health check - LangGraph doesn't have a built-in health endpoint, so we check the port
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:2024/ || exit 1

# Run LangGraph server
CMD ["langgraph", "dev", "--host", "0.0.0.0", "--port", "2024"]