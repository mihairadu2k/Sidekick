# 🗺️ YT2MP3 Product & Engineering Roadmap

This roadmap outlines upcoming modules, capabilities, and technical enhancements planned for **YT2MP3 Pro**.

---

## 🚀 Active Feature Roadmap: CrateEngine (Sample & Break Isolation Module)

### Overview
**CrateEngine** transforms YT2MP3 from a capture utility into an end-to-end crate-digging and beatmaking workstation. It ingests long-form YouTube audio, vinyl rips, and direct uploads, automatically isolating drum breaks, vocal chops, and melodic phrases, segmenting them into quantized 1-, 2-, 4-, and 8-bar loops snapped to zero-crossing downbeats, with 4-stem separation (Drums, Bass, Other, Vocals).

---

### Phase 1: Core Analysis & DSP Engine (`backend/crate_engine.py`)
- [ ] **Media Ingestion & Audio Normalization**
  - Stream/URL acquisition via `yt-dlp` / FFmpeg.
  - Direct file upload handler (`.wav`, `.mp3`, `.flac`, `.aiff`) up to 120 minutes.
  - EBU R128 loudness normalization target (-14 LUFS) and sub-30Hz high-pass infrasonic filtering.
- [ ] **Tempo, Beat & Key Extraction**
  - Dynamic BPM tracking and downbeat timestamp grid extraction ($[t_0, t_1, \dots, t_n]$).
  - Harmonic root key & mode estimation (Major/Minor) with confidence scoring using HPCP / chromagram tonal profiles.
- [ ] **Automated Drum Break Detection Heuristics**
  - Energy ratio scoring across sliding bar windows:
    $$\text{Break Confidence} = \frac{E_{\text{drums}}}{E_{\text{total}} + \epsilon} \cdot (1 - \text{Vocal Masking Index})$$
  - Solo percussion identification ($\text{Drums RMS} > 75\%$ for $\ge 2$ bars).
- [ ] **Zero-Crossing Loop Slicing Engine**
  - Snap loop boundary points ($t_{\text{start}}, t_{\text{end}}$) to exact zero-crossing samples ($x[i] \approx 0, \frac{dx}{dt} > 0$).
  - Apply 2–5 ms cosine anti-click ramps at loop boundaries for seamless looping.
  - Multi-bar loop segmentation (1, 2, 4, and 8 bars).

---

### Phase 2: Source Separation & Background Job Queue
- [ ] **Dual-Tier AI Source Separation**
  - **Tier 1 (High-Fidelity):** PyTorch Demucs v4 (`htdemucs`) 4-stem model execution (GPU/CPU) when dependencies are available.
  - **Tier 2 (Built-in Fast Fallback):** High-performance DSP stem separation (Harmonic-Percussive Source Separation + band-split filtering) requiring zero external GPU model downloads.
- [ ] **Asynchronous Processing Pipeline & API**
  - Non-blocking job runner with background worker tasks.
  - `POST /api/v1/sample-extractor/jobs`: Submit URL or file upload with options (`extract_stems`, `bar_lengths`).
  - `GET /api/v1/sample-extractor/jobs/{job_id}/stream`: Real-time Server-Sent Events (SSE) or WebSocket progress updates (`Queued` $\rightarrow$ `Analyzing` $\rightarrow$ `Separating` $\rightarrow$ `Slicing` $\rightarrow$ `Ready`).
  - `GET /api/v1/sample-extractor/jobs/{job_id}`: Job metadata, downbeat arrays, stem URLs, and detected break candidates.
  - Direct export routes: 24-bit 44.1 kHz WAV loops and packaged 4-stem ZIP bundles.

---

### Phase 3: Interactive Web Audio Workbench UI
- [ ] **Header & Navigation Integration**
  - New dedicated top-level tab: **"CrateEngine" / "Break Extractor"**.
  - Dropzone for local audio files and YouTube / media stream URL input.
- [ ] **Multi-Step Processing Indicator**
  - Animated step tracker with percentage and live status messages.
- [ ] **Interactive Waveform Overview**
  - Web Audio / Canvas timeline rendering.
  - Downbeat grid lines overlay.
  - Highlighted "Break Candidate" heat-map regions.
- [ ] **In-Browser 4-Stem Mixer Deck**
  - Individual channels: **Drums**, **Bass**, **Melodic (Other)**, **Vocals**.
  - Real-time `Solo`, `Mute`, and volume sliders powered by Web Audio `GainNode`s.
- [ ] **Loop Audition & Slicing Controls**
  - Bar selector buttons (1, 2, 4, 8 bars) with zero-latency boundary repeats.
  - Break candidate card list with one-click preview audition.
- [ ] **Export Toolbar**
  - One-click "Download Sliced WAV" (24-bit uncompressed).
  - "Download 4-Stem Pack (ZIP)" for instant drag-and-drop into DAWs.
  - Save directly to local `downloads/crate_engine/` directory with Finder integration.

---

### Phase 4: DAW Plugin & Ecosystem Enhancements
- [ ] **DAW Drag-and-Drop Extension (VST3 / AU)**
  - Support dragging isolated drum break slices and stem packs directly into Ableton Live, FL Studio, Logic Pro, and Reaper arrangement timelines.
- [ ] **Preset & Sample Tagging**
  - Embed musical metadata (BPM, Key, Bar Count, Stem Type) directly into audio file tags and RIFF metadata chunks.
- [ ] **External GPU Cloud Inference (Optional Remote Worker)**
  - Optional connector for offloading Demucs inference to remote serverless GPU instances (RunPod, Modal, or self-hosted worker) for ultra-fast processing on low-spec client machines.
