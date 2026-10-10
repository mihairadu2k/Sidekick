# 🎛️ The Producer Sidekick — Every music hero needs a Sidekick

A lightweight local studio companion built for music producers. Features high-fidelity audio downloading up to 320 kbps CBR and lossless FLAC/WAV with clean tags, **Crate Digging** (vintage vinyl and obscure sample discovery on YouTube), and an onboard **Sample Slicer**.

---

## 🚀 Features

- **Studio-Grade MP3 (320 kbps CBR)**: Converts YouTube audio streams using `yt-dlp` and `ffmpeg` to 320 kbps MP3, 256 kbps, 192 kbps, or lossless FLAC/WAV.
- **Full HD & 4K Video Downloads (MP4 / MKV)**: Download complete YouTube videos up to 4K / 1080p / 720p with synchronized audio streams muxed via FFmpeg.
- **Embedded Metadata & Cover Art**: Automatically embeds Title, Artist, Album, Year, and high-resolution thumbnail directly into audio and video tags.
- **Built-in In-Browser Video Player**: Watch downloaded MP4 videos directly within the web app with a responsive modal player.
- **Real-Time Progress**: Live download percentage, speed, and conversion state over WebSockets.
- **Smart Title & Artist Parsing**: Cleans up YouTube titles (e.g. removes "(Official Video)", "[Audio]", "4K") and separates Artist and Track names.
- **Playlist & Album Support**: Batch convert entire playlists or cherry-pick specific tracks.
- **Built-in Web Audio Player**: Instant preview and playback of downloaded tracks directly inside the web browser.
- **Finder Integration**: One-click button to open your local downloads folder in macOS Finder.

---

## 🛠️ Quick Start

### 1. Prerequisites
- **macOS / Linux / Windows**
- **Python 3.10+**
- **FFmpeg** (Recommended for audio encoding: `brew install ffmpeg` on macOS)

### 2. Launch the Application
Simply run the startup script:

```bash
./run.sh
```

This will automatically:
1. Create a Python virtual environment (`.venv`)
2. Install all dependencies from `requirements.txt`
3. Launch the FastAPI server at `http://127.0.0.1:8000`
4. Open the web UI in your default browser

---

## 📁 Directory Structure

```
YT2MP3/
├── backend/
│   ├── main.py         # FastAPI routes, WebSocket handler, static files
│   ├── downloader.py   # yt-dlp wrapper, mutagen ID3 tagging, progress hooks
│   └── models.py       # Pydantic schemas
├── frontend/
│   ├── index.html      # Responsive web UI layout
│   ├── styles.css      # Dark glassmorphic design & animations
│   └── app.js          # WebSocket client, player controls, API calls
├── downloads/          # Converted MP3 / audio files saved here
├── requirements.txt    # Python dependencies
├── run.sh              # One-click startup script
└── README.md           # Documentation
```

---

## 🔌 API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | `GET` | Health check and FFmpeg availability |
| `/api/info` | `POST` | Inspect video/playlist metadata & thumbnails |
| `/api/download` | `POST` | Start downloading a single track |
| `/api/download-playlist` | `POST` | Batch download tracks from a playlist |
| `/api/tasks` | `GET` | Get active and recent task statuses |
| `/api/files` | `GET` | List all downloaded audio files |
| `/api/files/{filename}` | `GET` | Download raw audio file |
| `/api/stream/{filename}` | `GET` | Stream audio file for playback |
| `/api/files/{filename}` | `DELETE` | Delete a downloaded file |
| `/api/open-folder` | `POST` | Open `downloads/` directory in Finder |
| `/ws/progress` | `WebSocket` | Real-time progress updates |

---

## 🎛️ DAW Plugin (VST3 / AU) for Ableton Live & FL Studio

YT2MP3 includes a universal **VST3 & AU** audio plugin built with JUCE for **Ableton Live**, **FL Studio**, **Logic Pro**, and **Reaper**.

### Key Plugin Features:
- **Instant Paste & Convert**: Paste YouTube links directly inside your DAW plugin window.
- **Drag-to-Timeline Integration**: Drag the rendered waveform tile directly onto your arrangement timeline or playlist to create a new audio lane/clip instantly.
- **Audition / Preview Player**: Click play in the plugin to hear the track through your DAW's master or insert channel.
- **Library Access**: Re-drag any previous downloads from the current session directly from the plugin.

### Building & Installing the Plugin:
```bash
./build_vst.sh
```
This builds and installs the plugins to:
- **VST3**: `~/Library/Audio/Plug-Ins/VST3/YT2MP3.vst3`
- **AU**: `~/Library/Audio/Plug-Ins/Components/YT2MP3.component`

### Using in Ableton Live & FL Studio:
1. Ensure the local backend is running (`./run.sh`).
2. In **Ableton Live**: Go to *Preferences -> Plug-Ins -> Rescan*. Insert `YT2MP3` onto any MIDI/Audio track.
3. In **FL Studio**: Go to *Manage Plugins -> Find installed plugins*. Add `YT2MP3` to the Channel Rack or Mixer.
4. Paste any YouTube link, click **DOWNLOAD**, then grab the waveform tile and **drag it directly onto the timeline / playlist**!

---

## 📜 License
MIT

