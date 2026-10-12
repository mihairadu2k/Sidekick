# 🎛️ Sidekick — The Producer's Audio Companion

A lightweight, high-fidelity studio workstation and sample curation engine built for beatmakers and music producers. Features studio-grade audio ingest up to 320 kbps CBR and lossless FLAC/WAV, intelligent **Crate Digging** for vintage vinyl and holy grail library records, an authentic **MPC Sampler & Slicer** with vintage textures, and seamless cloud or local deployment.

---

## 🚀 Features

### 🎧 High-Fidelity Audio Ingest
- **Studio-Grade MP3 (320 kbps CBR)**: Converts YouTube audio streams using `yt-dlp` and `ffmpeg` to 320 kbps MP3, 256 kbps, 192 kbps, or lossless FLAC, WAV, AAC/M4A, and OPUS.
- **Embedded Metadata & Cover Art**: Automatically embeds Title, Artist, Album, Year, and high-resolution cover art directly into audio tags via Mutagen.
- **Full HD & 4K Video Downloads (MP4 / MKV)**: Download complete YouTube videos up to 4K / 1080p / 720p with synchronized audio streams muxed via FFmpeg.
- **In-Browser Players**: Built-in Web Audio player with real-time waveform visualization, plus an in-browser video player modal.
- **Real-Time Progress**: Live download percentage, speed, and conversion state delivered via WebSockets.
- **Smart Title & Artist Parsing**: Cleans up YouTube clutter (e.g. removes "(Official Music Video)", "[HD]", "4K") and intelligently isolates Artist and Track names.
- **Playlist & Album Support**: Batch download entire playlists or cherry-pick specific tracks.

### 📻 Crate Digger (Vintage Vinyl & Rare Sample Discovery)
- **Harmonic & BPM Alignment**: Filter and match vinyl finds to your project's tempo & Camelot key (1A–12A minor, 1B–12B major). Allows 1-click discovery of harmonic cousins directly from any library track.
- **Curated Archival Channels & Label Matrices**: Whitelist verified vintage vinyl archivists (*Terminal Passage, My Analogue Journal, Rare Groove Archive*) and holy grail library music matrices (*KPM, Bruton, De Wolfe, Three Blind Mice, Melodiya*).
- **Algorithmic Rabbit Hole Crawler**: Taps YouTube's radio mix graph (`list=RD{id}`) to crawl obscure related tracks and rare sample companion records.
- **Digger Feedback & Personal Crate**: Like, save, or dismiss tracks with continuous preference tracking.

### 🥁 MPC Sampler & Slicer (Sidekick Chopper)
- **Authentic 4×4 MPC Layout**: 16 pads in the classic bottom-to-top arrangement (Pads 1–16) with responsive QWERTY keyboard finger-drumming (`1-4`, `Q-R`, `A-F`, `Z-V`).
- **Waveform Transient Slicing**: Auto-chop transients, split into equal divisions, or drag and nudge chop markers manually.
- **Smart Sample Scout**: AI recommender that analyzes waveform energy and transients to automatically isolate musical 2-bar, 4-bar, or 8-bar loops.
- **Poly / Mono Choke Groups**: Classic MPC choke behavior (striking a new pad cuts off the previous pad) with a toggle for polyphonic layering.
- **16 Levels (Tuned Pitch) & Scale Quantize**: Spread any sliced chop across all 16 pads chromatically or quantized to musical scales (*Natural Minor, Major, Dorian, Minor Pentatonic, Blues*).
- **MPC Note Repeat / Pad Roll**: Roll chops in `1/8`, `1/16`, `1/32`, or `1/16T` divisions. Hold `Shift` for instant roll, with live recording support.
- **Step Sequencer with Live Overdub**: Pattern sequencer expandable up to 64 beats, with live overdub recording (`● REC`) directly from pads or your keyboard.
- **Vintage Texture / Color Engine**:
  - **SP-1200**: Gritty 12-bit, 26.04 kHz ring with gentle drive.
  - **SP-404 Vinyl Sim**: Authentic vinyl crackle, pitch wow & flutter, and low-end warmth.
  - **Tape Warmth**: Saturated head bump and high-frequency tape roll-off.
  - **Clean**: Pristine 24-bit transparent pass-through.
- **Dual Resonant Filters**: High-pass and Low-pass frequency shaping sliders.
- **Sample Export Packager**: Export individually sliced WAVs + standard MIDI sequence files packaged into a single downloadable `.zip` archive ready to drop into Ableton Live, FL Studio, Logic Pro, or hardware samplers.

---

## 🛠️ Quick Start (Local)

### 1. Prerequisites
- **macOS / Linux / Windows**
- **Python 3.10+**
- **FFmpeg** (`brew install ffmpeg` on macOS, `sudo apt install ffmpeg` on Ubuntu/Debian)

### 2. Launch the Application
Run the startup script:

```bash
./run.sh
```

This will automatically:
1. Create a Python virtual environment (`.venv`)
2. Install all dependencies from `requirements.txt`
3. Launch the FastAPI server at `http://127.0.0.1:8000`
4. Open the web UI in your default browser

---

## ☁️ Cloud Deployment (Render.com)

Sidekick is fully configured for deployment on [render.com](https://render.com) using Docker:

1. Push this repository to your GitHub account (`git push origin main`).
2. In the [Render Dashboard](https://dashboard.render.com), click **New +** -> **Blueprint**.
3. Select your repository. Render will automatically read `render.yaml` and configure the **Docker runtime**, **Free tier**, and European/US region.
4. Click **Apply** to deploy.

The production `Dockerfile` automatically installs **FFmpeg** and **Node.js** alongside Python, ensuring seamless YouTube cipher solving and audio transcoding in the cloud.

---

## 📁 Directory Structure

```
Sidekick/
├── backend/
│   ├── main.py            # FastAPI endpoints, WebSockets, static file mount
│   ├── downloader.py      # yt-dlp ingest engine, mutagen tagging, progress hooks
│   ├── crate_digger.py    # Archival channel & label matrices, rabbit hole crawler
│   ├── chopper.py         # Audio slicing, transient DSP, WAV & MIDI ZIP packager
│   ├── audio_analyzer.py  # SciPy/NumPy BPM and Camelot musical key detection
│   └── models.py          # Pydantic data schemas
├── frontend/
│   ├── index.html         # Responsive studio layout
│   ├── styles.css         # Dark glassmorphic theme & MPC pad styling
│   ├── app.js             # Main controller, library management, Crate Digger UI
│   └── chopper.js         # MPC sampler engine, Web Audio FX, sequencer, 16 levels
├── Dockerfile             # Production container (Python 3.11 + FFmpeg + Node.js)
├── render.yaml            # Render.com Blueprint configuration
├── requirements.txt       # Python dependencies
├── run.sh                 # Local startup script
└── README.md              # Project documentation
```

---

## 🔌 API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | `GET` | Health check, FFmpeg availability, and system status |
| `/api/info` | `POST` | Inspect video/playlist metadata, formats, and thumbnails |
| `/api/download` | `POST` | Start downloading a single track with audio/video options |
| `/api/download-playlist` | `POST` | Batch download tracks from a playlist |
| `/api/tasks` | `GET` | Get active and recent download task statuses |
| `/api/files` | `GET` | List all downloaded library audio and video files |
| `/api/files/{filename}` | `GET` | Download raw audio/video file |
| `/api/stream/{filename}` | `GET` | Stream audio file for playback |
| `/api/files/{filename}` | `DELETE` | Delete a downloaded file |
| `/api/files/{filename}/analyze` | `GET` | DSP analysis (BPM, Camelot Key, energy) |
| `/api/crate-dig` | `POST` | Crate Digger discovery (by genre, era, surprise, or rabbit hole) |
| `/api/crate-feedback` | `POST` | Submit crate feedback (like/dismiss) for preference weighting |
| `/api/chopper/export` | `POST` | Export chopped WAV slices and MIDI file in a `.zip` archive |
| `/api/open-folder` | `POST` | Open local `downloads/` directory in macOS Finder |
| `/ws/progress` | `WebSocket` | Real-time download progress updates |

---

## 📜 License
MIT
