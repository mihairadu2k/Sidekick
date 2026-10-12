FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies:
# - ffmpeg: Required for yt-dlp audio extraction, 320kbps MP3 conversion, and chopper slicing
# - nodejs: Required by yt-dlp for YouTube JavaScript player deciphering (prevents HTTP 403 Forbidden)
# - curl: Useful for health checks and network diagnostics
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    nodejs \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first for caching layers
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Ensure the downloads directory exists
RUN mkdir -p downloads

# Render sets the PORT environment variable dynamically (defaults to 10000)
ENV PORT=10000
EXPOSE 10000

# Start FastAPI / Uvicorn server bound to 0.0.0.0 and $PORT
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
