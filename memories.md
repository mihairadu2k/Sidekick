# Project Memory: YT2MP3

## Overview & Objectives
- Local server web application that takes music from YouTube and converts it to high-quality audio (MP3 320 kbps, FLAC, WAV, M4A) with embedded ID3 metadata tags and album art.

## Architecture & Tech Stack
- Primary Language & Framework: Python 3 (FastAPI, Uvicorn), HTML5, CSS3, Modern JavaScript (Vanilla ES6).
- Key Libraries & Dependencies: `yt-dlp`, `mutagen`, `pydantic`, `numpy`, `scipy`, `ffmpeg` (system tool).
- Frontend: Single-page application with tabbed interface for YouTube Conversion and Synth Timbre Deconstructor (Audio-to-Serum), WebSocket real-time progress streaming, dark glassmorphic UI, and built-in HTML5 audio player.
- Storage: Local `downloads/` directory.

## Conventions & Rules
- Keep server lightweight with FastAPI and WebSocket broadcasts.
- Use `mutagen` for clean ID3v2.3 tag injection (APIC album art, TIT2 title, TPE1 artist).
- Use `numpy` + `scipy.signal` for fast, zero-delay DSP timbre reverse-engineering (pitch tracking, 2048-point wavetable extraction, circular shape correlation, ADSR tracking, spectral filter estimation, and FX detection).
- Single startup script: `./run.sh`.

## Memory Log & Key Decisions
- [2026-09-19]: Project initialized in DeepChat workspace.
- [2026-09-19]: Built complete FastAPI backend + WebSocket progress system + Modern Glassmorphic Web UI with Audio Player.
- [2026-09-19]: Built Audio Synth DSP Deconstructor engine (`backend/synth_dsp.py`) with pitch detection, 2048-sample single-cycle wavetable extraction, harmonic shape classification, stereo unison detune detection, ADSR amp & filter tracking, FX detection, Serum patch recipe generation, and interactive frontend visualizers.
- [2026-10-10]: Rebranded application to **Sidekick Studio** ("Bedroom Producer Companion • Sample Ingest & Crate Digger"). Refactored UI/UX design system to **Analog Amber** theme (warm vacuum tube amber `#f59e0b`, sunset tangerine `#f97316`, soft studio cream white `#f4f4f6`, and charcoal chassis `#0d0e12`). Updated navigation and workflow terminology: "Sample Ingest" (formerly YouTube to MP3), "Crate Digger" (Rare vinyl & sample discovery vault), and "Sample Stash (DAW Ready)" (formerly Downloaded Library).
- [2026-10-10]: Fixed Crate sampling metadata and ID3 tagging: when clicking "Sample This Track" in Crate Digger, `sampleCrateTrack` now pre-fills `custom_title` and `custom_artist`, displays the preview card immediately, and starts the ingest with exact metadata. Upgraded `parse_artist_title` to clean vinyl rip noise and genre prefixes (e.g. `SOUL-JAZZ Cavril` -> `Cavril`), dynamically extract the release year from video titles (e.g. `(1971)` -> `year=1971`), and preserve title/artist across all WebSocket progress updates without falling back to placeholder strings.
- [2026-10-10]: Added favorites toggle on Preview card and Similar tracks cards with real-time sync across Crate favorites vault. Made Alternatives & Similar Songs drawer open and discover recommendations automatically upon sampling any crate disk. Fixed blank thumbnail glitch when loading alternative tracks into preview.
- [2026-10-10]: Public Release Planning: User intends to release as a Web App first. Key architectural requirements noted for future implementation:
  1. YouTube Bot/Datacenter IP ban avoidance (rotating residential proxy support or cookies injection in yt-dlp).
  2. Server disk TTL janitor cleanup task for `downloads/` directory (e.g. auto-delete files older than 1 hour).
  3. Production Dockerfile with pre-installed ffmpeg, python dependencies, and gunicorn/uvicorn workers.
  4. Platform options evaluated: Hetzner VPS (high CPU/bandwidth for FFmpeg), Railway/Render (easy auto-deploy), Fly.io. Alternative desktop route: PyInstaller / Tauri / Electron desktop app.



