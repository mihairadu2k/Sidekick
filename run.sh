#!/usr/bin/env bash

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=================================================="
echo "    🎵 Starting YT2MP3 Pro Local Web Server       "
echo "=================================================="

# 1. Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: Python 3 is not installed. Please install Python 3."
    exit 1
fi

# Prepend local bin directory to PATH if present
if [ -d "$DIR/bin" ]; then
    export PATH="$DIR/bin:$PATH"
fi

# Ensure Node.js is in PATH for YouTube JS challenge solving (prevents HTTP 403 Forbidden)
if ! command -v node &> /dev/null; then
    if [ -d "$HOME/.nvm/versions/node" ]; then
        LATEST_NVM_NODE=$(find "$HOME/.nvm/versions/node" -maxdepth 2 -name "node" -type f 2>/dev/null | head -n 1)
        if [ -n "$LATEST_NVM_NODE" ]; then
            export PATH="$(dirname "$LATEST_NVM_NODE"):$PATH"
        fi
    fi
fi

# 2. Check FFmpeg (essential for 320kbps MP3 conversion)
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  FFmpeg was not found in your PATH."

    if command -v brew &> /dev/null; then
        echo "💡 Homebrew detected. Attempting to install FFmpeg via 'brew install ffmpeg'..."
        brew install ffmpeg || {
            echo "❌ Failed to auto-install FFmpeg. Please run 'brew install ffmpeg' manually."
        }
    else
        echo "⚠️ Please install FFmpeg (e.g. 'brew install ffmpeg') for high-quality MP3 conversion."
    fi
fi

# 3. Create virtualenv if not present
if [ ! -d ".venv" ]; then
    echo "📦 Creating Python virtual environment in .venv..."
    python3 -m venv .venv
fi

# 4. Activate virtualenv
source .venv/bin/activate

# 5. Install dependencies
echo "⚡ Checking and installing Python dependencies..."
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

# 6. Ensure downloads directory exists
mkdir -p downloads

# 7. Open browser automatically after server boots
(sleep 1.5 && open "http://127.0.0.1:8000" 2>/dev/null || xdg-open "http://127.0.0.1:8000" 2>/dev/null || true) &

echo "🚀 Launching YT2MP3 Pro at http://127.0.0.1:8000"
echo "📂 Converted MP3s are saved in: $DIR/downloads"
echo "Press Ctrl+C to stop the server."
echo "--------------------------------------------------"

uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
