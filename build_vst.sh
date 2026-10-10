#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================================="
echo "       Building YT2MP3 VST3 / AU Plugin (JUCE)        "
echo "======================================================="

# Set Developer Dir to CommandLineTools to avoid Xcode license prompts if needed
if [ -d "/Library/Developer/CommandLineTools" ]; then
    export DEVELOPER_DIR="/Library/Developer/CommandLineTools"
fi

# Locate cmake
CMAKE_BIN="cmake"
if [ -f "$SCRIPT_DIR/.venv/bin/cmake" ]; then
    CMAKE_BIN="$SCRIPT_DIR/.venv/bin/cmake"
elif ! command -v cmake &> /dev/null; then
    echo "❌ CMake not found. Please install cmake or activate .venv"
    exit 1
fi

echo "🔹 Using CMake: $CMAKE_BIN"
echo "🔹 Configuring CMake project..."
"$CMAKE_BIN" -B build -S vst -DCMAKE_BUILD_TYPE=Release

echo "🔹 Compiling VST3 & AU plugins..."
CPU_CORES=$(sysctl -n hw.ncpu 2>/dev/null || echo 4)
"$CMAKE_BIN" --build build --config Release -j "$CPU_CORES"

echo "🔹 Ensuring target plugin directories exist on macOS..."
mkdir -p "$HOME/Library/Audio/Plug-Ins/VST3"
mkdir -p "$HOME/Library/Audio/Plug-Ins/Components"

# Copy VST3
VST3_SRC=$(find build -name "YT2MP3.vst3" -type d 2>/dev/null | head -n 1)
if [ -n "$VST3_SRC" ]; then
    echo "📦 Installing VST3 -> $HOME/Library/Audio/Plug-Ins/VST3/YT2MP3.vst3"
    cp -R "$VST3_SRC" "$HOME/Library/Audio/Plug-Ins/VST3/"
fi

# Copy AU / Component
AU_SRC=$(find build -name "YT2MP3.component" -type d 2>/dev/null | head -n 1)
if [ -n "$AU_SRC" ]; then
    echo "📦 Installing AU -> $HOME/Library/Audio/Plug-Ins/Components/YT2MP3.component"
    cp -R "$AU_SRC" "$HOME/Library/Audio/Plug-Ins/Components/"
fi

# Copy Standalone app if built
APP_SRC=$(find build -name "YT2MP3.app" -type d 2>/dev/null | head -n 1)
if [ -n "$APP_SRC" ]; then
    echo "📦 Standalone App built: $APP_SRC"
fi

echo "======================================================="
echo "✅ YT2MP3 Plugin build & installation complete!"
echo "   - VST3: $HOME/Library/Audio/Plug-Ins/VST3/YT2MP3.vst3"
echo "   - AU:   $HOME/Library/Audio/Plug-Ins/Components/YT2MP3.component"
echo "======================================================="
