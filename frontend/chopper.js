// Sidekick Studio — Chopper, Sequencer & Drum Sketchpad Engine

(function() {
  // Web Audio Context (lazy initialized on user interaction)
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // --- Drum Synthesizer (909 & 808 with Zero Latency) ---
  function playSynthKick(ctx, time, kit, vol = 1.0) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (kit === '808') {
      // 808 Kick: deep booming sine drop
      osc.frequency.setValueAtTime(140, time);
      osc.frequency.exponentialRampToValueAtTime(45, time + 0.08);
      osc.frequency.exponentialRampToValueAtTime(25, time + 0.45);
      gain.gain.setValueAtTime(0.9 * vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.48);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.5);
    } else {
      // 909 Kick: punchy club click + tight punchy body
      osc.frequency.setValueAtTime(180, time);
      osc.frequency.exponentialRampToValueAtTime(75, time + 0.04);
      osc.frequency.exponentialRampToValueAtTime(48, time + 0.22);
      gain.gain.setValueAtTime(0.95 * vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.26);

      // 909 transient pitch pop
      const clickOsc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      clickOsc.frequency.setValueAtTime(320, time);
      clickOsc.frequency.exponentialRampToValueAtTime(40, time + 0.015);
      clickGain.gain.setValueAtTime(0.4 * vol, time);
      clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.02);
      clickOsc.connect(clickGain);
      clickGain.connect(ctx.destination);
      clickOsc.start(time);
      clickOsc.stop(time + 0.025);
    }
  }

  function playSynthSnare(ctx, time, kit, vol = 1.0) {
    // Tonal body
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    const baseFreq = kit === '808' ? 190 : 210;
    osc.frequency.setValueAtTime(baseFreq, time);
    osc.frequency.exponentialRampToValueAtTime(90, time + 0.07);
    oscGain.gain.setValueAtTime(0.45 * vol, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.13);

    // Snare white noise wire
    const bufferSize = ctx.sampleRate * 0.22;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = kit === '808' ? 'bandpass' : 'highpass';
    filter.frequency.setValueAtTime(kit === '808' ? 1200 : 1500, time);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6 * vol, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(time);
    noise.stop(time + 0.21);
  }

  function playSynthHiHat(ctx, time, kit, open = false, vol = 1.0) {
    const decay = open ? 0.35 : 0.05;
    const bufferSize = Math.floor(ctx.sampleRate * (decay + 0.05));
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(kit === '808' ? 6800 : 8000, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime((open ? 0.45 : 0.35) * vol, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + decay);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(time);
    noise.stop(time + decay + 0.01);
  }

  // --- Genre Presets: 16-step patterns [K=kick, S=snare, H=closed hat, O=open hat] ---
  const GENRE_PATTERNS = {
    house: {
      defaultBpm: 125,
      // 4-on-the-floor, clap/snare on 4/12 (0-indexed: 4, 12), open hat on offbeats (2, 6, 10, 14)
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      openHat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]
    },
    tech_house: {
      defaultBpm: 127,
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0],
      hat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      openHat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]
    },
    techno: {
      defaultBpm: 132,
      kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      openHat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]
    },
    uk_garage: {
      defaultBpm: 134,
      // 2-step syncopated kick
      kick: [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      hat: [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0],
      openHat: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0]
    },
    dubstep: {
      defaultBpm: 140,
      // Half-time kick on 0, snare on 8
      kick: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
      snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      openHat: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]
    }
  };

  // --- State ---
  const state = {
    currentFilename: null,
    currentTitle: null,
    audioBuffer: null,
    sourceDuration: 0,
    bpm: 126.0,
    kit: '909',
    genre: 'house',
    drumMute: false,
    drumVolume: 0.8,
    sliceVolume: 0.9,
    
    // Waveform Selection Range (seconds)
    rangeStart: 0,
    rangeEnd: 4.0,

    // Zoom & Scroll viewport
    zoom: 1.0, // 1.0 = entire track visible, >1.0 = zoomed in
    scrollOffset: 0.0, // viewport start time in seconds

    // Slices: [ { start, end, note, index, slot, locked, attackMs, decayMs, tuning, isReversed, playMode } ]
    slices: [],
    selectedSliceIndex: 0,

    // MPC Performance & Program State
    is16Levels: false,
    isFullLevel: false,
    isMonoChoke: true, // mono choke by default (classic MPC hip-hop/house style)
    padBank: 'A',      // 'A' (pads 1-16) or 'B' (pads 17-32)
    scoutBarLength: 4, // 2, 4, or 8 bars loop target

    // Phase 1: Live Overdub Recording
    isRecording: false,
    playbackStartTime: 0,

    // Phase 2: Vintage Texture Color Engine
    vintageColor: 'clean', // 'clean', 'sp1200', 'sp404', 'tape'

    // Phase 3: Scale Quantize for 16 Levels
    scale16Levels: 'chromatic', // 'chromatic', 'minor', 'major', 'dorian', 'pentatonic', 'blues'

    // Phase 4: MPC Note Repeat / Pad Roll
    isNoteRepeat: false,
    noteRepeatRate: '16', // '8', '16', '32', '16t'

    // Gate length factor (0.1 to 1.0)
    gate: 1.0,

    // De-click Attack fade-in in milliseconds (default 8ms)
    attackMs: 8,

    // Filter EQ (High-Pass and Low-Pass)
    hpCutoff: 20,    // 20 Hz (effectively bypassed)
    lpCutoff: 20000, // 20 kHz (effectively bypassed)

    // Step Sequencer: 16 to 64 steps (1 to 4 bars/cycles)
    patternBars: 1, // 1 to 4 bars
    patternSteps: 16, // patternBars * 16 (16, 32, 48, 64)
    sequence: [0, null, 1, null, 2, null, 3, null, 0, null, 1, null, 2, null, 3, null],
    
    // Playback engine
    isPlaying: false,
    currentStep: 0,
    timerId: null,
    nextStepTime: 0,
    currentActiveVoice: null,
    previewVoice: null,
    previewAnimId: null,
    
    // Waveform interaction
    draggingHandle: null, // 'start', 'end', or slice marker index
  };

  const NOTE_LABELS = [
    'C1', 'C#1', 'D1', 'D#1', 'E1', 'F1', 'F#1', 'G1',
    'G#1', 'A1', 'A#1', 'B1', 'C2', 'C#2', 'D2', 'D#2',
    'E2', 'F2', 'F#2', 'G2', 'G#2', 'A2', 'A#2', 'B2',
    'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3'
  ];

  // Authentic MPC Bottom-to-Top Visual Layout:
  // Row 1 (top):    Pads 13, 14, 15, 16 -> Keys: 1, 2, 3, 4
  // Row 2:         Pads 9,  10, 11, 12 -> Keys: Q, W, E, R
  // Row 3:         Pads 5,  6,  7,  8  -> Keys: A, S, D, F
  // Row 4 (bottom): Pads 1,  2,  3,  4  -> Keys: Z, X, C, V
  const MPC_VISUAL_MAP = [
    { row: 0, col: 0, padNum: 13, slot: 12, key: '1' },
    { row: 0, col: 1, padNum: 14, slot: 13, key: '2' },
    { row: 0, col: 2, padNum: 15, slot: 14, key: '3' },
    { row: 0, col: 3, padNum: 16, slot: 15, key: '4' },

    { row: 1, col: 0, padNum: 9,  slot: 8,  key: 'Q' },
    { row: 1, col: 1, padNum: 10, slot: 9,  key: 'W' },
    { row: 1, col: 2, padNum: 11, slot: 10, key: 'E' },
    { row: 1, col: 3, padNum: 12, slot: 11, key: 'R' },

    { row: 2, col: 0, padNum: 5,  slot: 4,  key: 'A' },
    { row: 2, col: 1, padNum: 6,  slot: 5,  key: 'S' },
    { row: 2, col: 2, padNum: 7,  slot: 6,  key: 'D' },
    { row: 2, col: 3, padNum: 8,  slot: 7,  key: 'F' },

    { row: 3, col: 0, padNum: 1,  slot: 0,  key: 'Z' },
    { row: 3, col: 1, padNum: 2,  slot: 1,  key: 'X' },
    { row: 3, col: 2, padNum: 3,  slot: 2,  key: 'C' },
    { row: 3, col: 3, padNum: 4,  slot: 3,  key: 'V' }
  ];

  // Musical Scales for 16 Levels Quantize (Phase 3)
  const SCALES = {
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    minor: [0, 2, 3, 5, 7, 8, 10], // Natural Minor
    major: [0, 2, 4, 5, 7, 9, 11], // Major
    dorian: [0, 2, 3, 5, 7, 9, 10], // Dorian (House / Funk)
    pentatonic: [0, 3, 5, 7, 10], // Minor Pentatonic
    blues: [0, 3, 5, 6, 7, 10] // Blues
  };

  function get16LevelsPitchOffset(slot, scaleName = 'chromatic') {
    if (!scaleName || scaleName === 'chromatic') return slot - 7;
    const scale = SCALES[scaleName] || SCALES.minor;
    const rootSlot = 7; // Pad 8 is Root (0 st)
    const diff = slot - rootSlot;
    if (diff === 0) return 0;
    if (diff > 0) {
      const octave = Math.floor(diff / scale.length);
      const idx = diff % scale.length;
      return (octave * 12) + scale[idx];
    } else {
      const absDiff = -diff;
      const scaleRev = scale.slice(1).reverse();
      const revOctave = Math.floor((absDiff - 1) / scaleRev.length);
      const revIdx = (absDiff - 1) % scaleRev.length;
      return -((revOctave * 12) + (12 - scaleRev[revIdx]));
    }
  }

  // Vintage Character DSP Curves: SP-1200, SP-404, Tape (Phase 2)
  let vintageCurves = null;

  function initVintageCurves() {
    if (vintageCurves) return vintageCurves;
    const n = 65536;
    const sp1200 = new Float32Array(n);
    const tape = new Float32Array(n);
    const sp404 = new Float32Array(n);

    // 1. SP-1200: 12-bit quantization staircase + mid punch
    const levels = 4096;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      const quantized = Math.round(x * levels) / levels;
      sp1200[i] = Math.tanh(quantized * 1.25) / Math.tanh(1.25);
    }

    // 2. Tape Warmth: Smooth hyperbolic tangent saturation
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      tape[i] = Math.tanh(x * 1.55) / Math.tanh(1.55);
    }

    // 3. SP-404 Vinyl Sim: Asymmetric warm tube/vinyl saturation with soft clip
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      if (x < -1) sp404[i] = -1;
      else if (x > 1) sp404[i] = 1;
      else {
        sp404[i] = (x + 0.15 * x * x) / (1 + 0.15);
      }
    }

    vintageCurves = { sp1200, tape, sp404 };
    return vintageCurves;
  }

  // --- Coordinate conversions for Zoom & Viewport ---
  function getVisibleDuration() {
    if (!state.audioBuffer) return 1.0;
    return state.audioBuffer.duration / Math.max(1.0, state.zoom);
  }

  function timeToCanvasX(time, width) {
    const visibleDur = getVisibleDuration();
    const relTime = time - state.scrollOffset;
    return (relTime / visibleDur) * width;
  }

  function canvasXToTime(x, width) {
    const visibleDur = getVisibleDuration();
    return state.scrollOffset + (x / width) * visibleDur;
  }

  function clampScrollOffset() {
    if (!state.audioBuffer) return;
    const visibleDur = getVisibleDuration();
    const maxOffset = Math.max(0, state.audioBuffer.duration - visibleDur);
    state.scrollOffset = Math.max(0, Math.min(state.scrollOffset, maxOffset));
  }

  // --- Waveform Drawing (Zoom-Aware) ---
  function renderWaveformCanvas() {
    const canvas = document.getElementById('chopperWaveformCanvas');
    if (!canvas || !state.audioBuffer) return;

    clampScrollOffset();

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const channelData = state.audioBuffer.getChannelData(0);
    const totalDuration = state.audioBuffer.duration;
    const visibleDuration = getVisibleDuration();
    const amp = height / 2;

    // Draw background grid lines (horizontal center line & subtle vertical beat grid)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, amp);
    ctx.lineTo(width, amp);
    ctx.stroke();

    // Time markings on canvas
    const sampleRate = state.audioBuffer.sampleRate;
    const startSample = Math.floor(state.scrollOffset * sampleRate);
    const endSample = Math.min(channelData.length, Math.floor((state.scrollOffset + visibleDuration) * sampleRate));
    const totalVisibleSamples = Math.max(1, endSample - startSample);
    const step = Math.max(1, Math.floor(totalVisibleSamples / width));

    // Draw background waveform data in visible range
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    for (let x = 0; x < width; x++) {
      const sampleOffset = startSample + Math.floor((x / width) * totalVisibleSamples);
      if (sampleOffset >= channelData.length) break;

      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step && (sampleOffset + j) < channelData.length; j++) {
        const datum = channelData[sampleOffset + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.fillRect(x, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
    }

    // Active Selection Highlight (rangeStart to rangeEnd)
    const selStartX = timeToCanvasX(state.rangeStart, width);
    const selEndX = timeToCanvasX(state.rangeEnd, width);

    // Dim regions outside active selection
    ctx.fillStyle = 'rgba(10, 11, 14, 0.65)';
    if (selStartX > 0) {
      ctx.fillRect(0, 0, Math.min(width, selStartX), height);
    }
    if (selEndX < width) {
      ctx.fillRect(Math.max(0, selEndX), 0, width - Math.max(0, selEndX), height);
    }

    // Bright colored waveform inside active loop selection
    const drawSelLeft = Math.max(0, Math.floor(selStartX));
    const drawSelRight = Math.min(width, Math.ceil(selEndX));
    if (drawSelRight > drawSelLeft) {
      ctx.fillStyle = 'rgba(129, 140, 248, 0.9)'; // Indigo highlight
      for (let x = drawSelLeft; x < drawSelRight; x++) {
        const sampleOffset = startSample + Math.floor((x / width) * totalVisibleSamples);
        if (sampleOffset >= channelData.length) break;

        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step && (sampleOffset + j) < channelData.length; j++) {
          const datum = channelData[sampleOffset + j];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
        ctx.fillRect(x, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
      }
    }

    // Selection border flags
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    if (selStartX >= 0 && selStartX <= width) {
      ctx.beginPath();
      ctx.moveTo(selStartX, 0); ctx.lineTo(selStartX, height);
      ctx.stroke();
    }
    if (selEndX >= 0 && selEndX <= width) {
      ctx.beginPath();
      ctx.moveTo(selEndX, 0); ctx.lineTo(selEndX, height);
      ctx.stroke();
    }

    // Highlight and draw locked slices across waveform (even outside current selection range)
    state.slices.forEach((s) => {
      if (!s.locked) return;
      const lockStartX = timeToCanvasX(s.start, width);
      const lockEndX = timeToCanvasX(s.end, width);
      if (lockEndX > 0 && lockStartX < width) {
        // Gold glowing highlight band for locked slice
        ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
        ctx.fillRect(Math.max(0, lockStartX), 0, Math.min(width, lockEndX) - Math.max(0, lockStartX), height);
        
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(Math.max(0, lockStartX), 0, Math.min(width, lockEndX) - Math.max(0, lockStartX), height);
      }
    });

    // Draw slice markers within range
    state.slices.forEach((s, idx) => {
      const sliceX = timeToCanvasX(s.start, width);
      if (sliceX >= 0 && sliceX <= width) {
        if (s.locked) {
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([]);
        } else {
          ctx.strokeStyle = idx === state.selectedSliceIndex ? '#38bdf8' : 'rgba(56, 189, 248, 0.65)';
          ctx.lineWidth = idx === state.selectedSliceIndex ? 2.5 : 1.5;
          ctx.setLineDash([4, 2]);
        }
        ctx.beginPath();
        ctx.moveTo(sliceX, 0);
        ctx.lineTo(sliceX, height);
        ctx.stroke();
        ctx.setLineDash([]);

        // Slice badge on top with lock symbol if locked
        const noteName = NOTE_LABELS[idx] || `${idx + 1}`;
        const labelText = s.locked ? `🔒 ${noteName}` : noteName;
        const badgeWidth = s.locked ? 36 : 24;

        ctx.fillStyle = s.locked ? '#d97706' : (idx === state.selectedSliceIndex ? '#0284c7' : 'rgba(15, 23, 42, 0.88)');
        ctx.fillRect(sliceX - (badgeWidth / 2), 4, badgeWidth, 16);
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(labelText, sliceX, 16);
      }
    });

    // Zoom indicator badge in corner
    if (state.zoom > 1.05) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(width - 70, height - 20, 66, 16);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${state.zoom.toFixed(1)}x Zoom`, width - 8, height - 8);
    }
  }

  // --- Slicing Engine (Ableton Simpler Style) ---
  function computeSlices(mode = 'grid_8') {
    if (!state.audioBuffer) return;

    const start = Math.max(0, state.rangeStart);
    const end = Math.min(state.audioBuffer.duration, state.rangeEnd);
    const totalSpan = Math.max(0.1, end - start);

    // Keep all currently locked slices
    const lockedSlices = (state.slices || []).filter(s => s.locked);
    const lockedSlots = new Set(lockedSlices.map(s => s.slot !== undefined ? s.slot : (s.index - 1)));

    const freshSlices = [];

    if (mode.startsWith('grid')) {
      const parts = mode === 'grid_4' ? 4 : (mode === 'grid_8' ? 8 : 16);
      const sliceLen = totalSpan / parts;
      for (let i = 0; i < parts; i++) {
        freshSlices.push({
          start: start + (i * sliceLen),
          end: start + ((i + 1) * sliceLen),
          attackMs: state.attackMs,
          decayMs: 2500,
          tuning: 0,
          isReversed: false,
          playMode: 'oneshot',
          locked: false
        });
      }
    } else if (mode === 'transient') {
      // Audio buffer transient detection inside range
      const channelData = state.audioBuffer.getChannelData(0);
      const sr = state.audioBuffer.sampleRate;
      const startSamp = Math.floor(start * sr);
      const endSamp = Math.floor(end * sr);

      const blockSize = 512;
      const energies = [];
      for (let i = startSamp; i < endSamp; i += blockSize) {
        let sum = 0;
        for (let j = 0; j < blockSize && i + j < endSamp; j++) {
          const val = channelData[i + j];
          sum += val * val;
        }
        energies.push(Math.sqrt(sum / blockSize));
      }

      // Derivative peak threshold
      const peaks = [0]; // always start at 0
      const threshold = 0.08;
      for (let i = 1; i < energies.length - 1; i++) {
        const diff = energies[i] - energies[i - 1];
        if (diff > threshold && energies[i] > energies[i + 1]) {
          const timeSec = (i * blockSize) / sr;
          // min spacing 0.15s between chops
          if (timeSec - peaks[peaks.length - 1] > 0.15) {
            peaks.push(timeSec);
          }
        }
        if (peaks.length >= 16) break;
      }

      if (peaks.length < 4) {
        // Fallback to 8 grid if audio has few sharp transients
        return computeSlices('grid_8');
      }

      for (let i = 0; i < peaks.length; i++) {
        const sTime = start + peaks[i];
        const eTime = (i < peaks.length - 1) ? (start + peaks[i + 1]) : end;
        freshSlices.push({
          start: sTime,
          end: Math.min(eTime, end),
          attackMs: state.attackMs,
          decayMs: 2500,
          tuning: 0,
          isReversed: false,
          playMode: 'oneshot',
          locked: false
        });
      }
    }

    // Merge: preserve locked slices in their specific slots; fill unlocked slots from freshSlices
    const finalSlices = [];
    const maxSlots = Math.max(freshSlices.length, Math.max(0, ...Array.from(lockedSlots).map(x => x + 1)));
    let freshIdx = 0;

    for (let slot = 0; slot < maxSlots && slot < 16; slot++) {
      const existingLocked = lockedSlices.find(s => (s.slot !== undefined ? s.slot : (s.index - 1)) === slot);
      if (existingLocked) {
        finalSlices.push({
          ...existingLocked,
          index: slot + 1,
          slot: slot,
          note: 36 + slot,
          locked: true
        });
      } else if (freshIdx < freshSlices.length) {
        const fresh = freshSlices[freshIdx++];
        finalSlices.push({
          decayMs: 2500,
          tuning: 0,
          isReversed: false,
          playMode: 'oneshot',
          ...fresh,
          index: slot + 1,
          slot: slot,
          note: 36 + slot,
          locked: false
        });
      }
    }

    state.slices = finalSlices;
    renderPadsUI();
    renderWaveformCanvas();
  }

  // --- Reversed Audio Sub-Buffer Generation ---
  function getSliceBuffer(slice) {
    if (!state.audioBuffer) return null;
    if (!slice.isReversed) return state.audioBuffer;

    if (slice._reversedBuffer && slice._reversedStart === slice.start && slice._reversedEnd === slice.end) {
      return slice._reversedBuffer;
    }

    const ctx = getAudioContext();
    const sr = state.audioBuffer.sampleRate;
    const startSamp = Math.max(0, Math.floor(slice.start * sr));
    const endSamp = Math.min(state.audioBuffer.length, Math.floor(slice.end * sr));
    const length = Math.max(1, endSamp - startSamp);
    const channels = state.audioBuffer.numberOfChannels;

    const revBuf = ctx.createBuffer(channels, length, sr);
    for (let c = 0; c < channels; c++) {
      const srcData = state.audioBuffer.getChannelData(c);
      const dstData = revBuf.getChannelData(c);
      for (let i = 0; i < length; i++) {
        dstData[i] = srcData[endSamp - 1 - i];
      }
    }

    slice._reversedBuffer = revBuf;
    slice._reversedStart = slice.start;
    slice._reversedEnd = slice.end;
    return revBuf;
  }

  // --- Voice Playback (Choke group / Monophonic Sampler) ---
  function playSlice(sliceIndex, when = 0, durationOverride = null, chromaticOffset = 0) {
    if (!state.audioBuffer || sliceIndex < 0 || sliceIndex >= state.slices.length) return;
    const ctx = getAudioContext();
    const slice = state.slices[sliceIndex];

    // Mono Choke: If isMonoChoke is true, cancel previous voice immediately with 5ms de-click fade-out
    if (state.isMonoChoke && state.currentActiveVoice) {
      try {
        const curTime = ctx.currentTime;
        state.currentActiveVoice.gain.gain.cancelScheduledValues(curTime);
        state.currentActiveVoice.gain.gain.setValueAtTime(state.currentActiveVoice.gain.gain.value, curTime);
        state.currentActiveVoice.gain.gain.exponentialRampToValueAtTime(0.0001, curTime + 0.005);
        state.currentActiveVoice.source.stop(curTime + 0.006);
      } catch (e) {}
      state.currentActiveVoice = null;
    }

    const source = ctx.createBufferSource();
    const playBuffer = getSliceBuffer(slice);
    source.buffer = playBuffer;

    // Pitch / Tuning:
    // Semitones = (slice.tuning || 0) + chromaticOffset
    const totalSemitones = (slice.tuning || 0) + chromaticOffset;
    const playbackRate = Math.pow(2, totalSemitones / 12.0);
    const startTime = when > 0 ? when : ctx.currentTime;
    source.playbackRate.setValueAtTime(playbackRate, startTime);

    // Filters: High-pass and Low-pass
    const hpFilter = ctx.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.setValueAtTime(Math.max(20, state.hpCutoff), startTime);

    const lpFilter = ctx.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.setValueAtTime(Math.min(20000, state.lpCutoff), startTime);

    const gainNode = ctx.createGain();
    const targetGain = state.isFullLevel ? 1.0 : state.sliceVolume;

    // Calculate natural slice duration (scaled by playback rate)
    const rawSpan = Math.max(0.05, slice.end - slice.start);
    const naturalDuration = rawSpan / playbackRate;

    // Decay setting (per-pad decay: 50ms - 2500ms; 2500ms = full)
    const decayMs = (slice.decayMs !== undefined) ? slice.decayMs : 2500;
    const decaySec = (decayMs < 2500) ? Math.max(0.04, decayMs / 1000.0) : naturalDuration;

    let playbackDuration;
    if (durationOverride !== null) {
      playbackDuration = Math.max(0.04, durationOverride * Math.min(1.0, Math.max(0.1, state.gate)));
    } else if (when > 0) {
      playbackDuration = Math.max(0.04, Math.min(naturalDuration, decaySec) * Math.min(1.0, Math.max(0.1, state.gate)));
    } else {
      // Direct pad audition
      playbackDuration = Math.min(naturalDuration, decaySec);
    }

    // Determine attack fade-in time (per-slice override or global attack)
    const sliceAttackMs = (slice.attackMs !== undefined && slice.attackMs !== null) ? slice.attackMs : state.attackMs;
    const attackSec = Math.max(0.002, Math.min(0.2, (sliceAttackMs || 8) / 1000.0));

    // Release micro-fade to avoid end-of-slice clicks (10ms)
    const releaseSec = Math.min(0.015, Math.max(0.003, playbackDuration * 0.1));

    // Apply de-clicking envelope: soft attack curve up from zero
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(targetGain, startTime + attackSec);

    // Fade-out at end of playback duration
    const fadeOutStart = Math.max(startTime + attackSec + 0.001, startTime + playbackDuration - releaseSec);
    gainNode.gain.setValueAtTime(targetGain, fadeOutStart);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + playbackDuration);

    // Audio node chain: source -> hpFilter -> lpFilter -> (Vintage Processing) -> gainNode -> destination
    source.connect(hpFilter);
    hpFilter.connect(lpFilter);

    let lastFilterNode = lpFilter;

    if (state.vintageColor && state.vintageColor !== 'clean') {
      const curves = initVintageCurves();
      const shaper = ctx.createWaveShaper();
      shaper.oversample = '2x';

      if (state.vintageColor === 'sp1200') {
        shaper.curve = curves.sp1200;
        // SP-1200 steep reconstruction filter
        const spFilter = ctx.createBiquadFilter();
        spFilter.type = 'lowpass';
        spFilter.frequency.setValueAtTime(9800, startTime);
        spFilter.Q.setValueAtTime(1.15, startTime);

        lastFilterNode.connect(shaper);
        shaper.connect(spFilter);
        lastFilterNode = spFilter;
      } else if (state.vintageColor === 'tape') {
        shaper.curve = curves.tape;
        // Tape head high-shelf dip
        const tapeShelf = ctx.createBiquadFilter();
        tapeShelf.type = 'highshelf';
        tapeShelf.frequency.setValueAtTime(11000, startTime);
        tapeShelf.gain.setValueAtTime(-2.2, startTime);

        lastFilterNode.connect(shaper);
        shaper.connect(tapeShelf);
        lastFilterNode = tapeShelf;
      } else if (state.vintageColor === 'sp404') {
        shaper.curve = curves.sp404;
        // SP-404 Low-end vinyl bump
        const vinylLow = ctx.createBiquadFilter();
        vinylLow.type = 'peaking';
        vinylLow.frequency.setValueAtTime(90, startTime);
        vinylLow.gain.setValueAtTime(2.8, startTime);

        lastFilterNode.connect(shaper);
        shaper.connect(vinylLow);
        lastFilterNode = vinylLow;

        // Subtle analog pitch flutter on vinyl drift
        const flutterCents = (Math.random() - 0.5) * 5.0; // +/- 2.5 cents
        const flutterRate = playbackRate * Math.pow(2, flutterCents / 1200.0);
        source.playbackRate.setValueAtTime(flutterRate, startTime);
      }
    }

    lastFilterNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    // If buffer is reversed, play from 0; else play from slice.start
    const bufferOffset = slice.isReversed ? 0 : slice.start;
    const bufferSecondsToRead = playbackDuration * playbackRate;
    source.start(startTime, bufferOffset, bufferSecondsToRead);

    state.currentActiveVoice = { source, gain: gainNode, sliceIndex, startTime };
    highlightPad(sliceIndex);
  }

  function highlightPad(idx) {
    const pad = document.querySelector(`.chopper-pad[data-slice-index="${idx}"]`);
    if (pad) {
      pad.classList.add('active-trigger');
      setTimeout(() => pad.classList.remove('active-trigger'), 120);
    }
  }

  function highlightPadSlot(slot) {
    const pad = document.querySelector(`.chopper-pad[data-slot="${slot}"]`);
    if (pad) {
      pad.classList.add('active-trigger');
      setTimeout(() => pad.classList.remove('active-trigger'), 120);
    }
  }

  // --- Click-to-Preview Audio from any waveform point ---
  function stopPreviewVoice() {
    if (state.previewVoice) {
      try {
        state.previewVoice.gain.gain.exponentialRampToValueAtTime(0.001, state.previewVoice.ctx.currentTime + 0.01);
        state.previewVoice.source.stop(state.previewVoice.ctx.currentTime + 0.015);
      } catch (e) {}
      state.previewVoice = null;
    }
    if (state.previewAnimId) {
      cancelAnimationFrame(state.previewAnimId);
      state.previewAnimId = null;
    }
    const playhead = document.getElementById('waveformPlayheadLine');
    if (playhead) playhead.classList.add('hidden');
  }

  function previewAudioFromTime(startTime, duration = null) {
    if (!state.audioBuffer) return;
    const ctx = getAudioContext();
    stopPreviewVoice();

    const maxDur = duration !== null ? duration : (state.audioBuffer.duration - startTime);
    if (maxDur <= 0.02) return;

    const source = ctx.createBufferSource();
    source.buffer = state.audioBuffer;

    // Route through HP/LP filters
    const hpFilter = ctx.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.setValueAtTime(Math.max(20, state.hpCutoff), ctx.currentTime);

    const lpFilter = ctx.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.setValueAtTime(Math.min(20000, state.lpCutoff), ctx.currentTime);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(state.sliceVolume, ctx.currentTime);
    gainNode.gain.setValueAtTime(state.sliceVolume, ctx.currentTime + Math.max(0.01, maxDur - 0.02));
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + maxDur);

    source.connect(hpFilter);
    hpFilter.connect(lpFilter);
    lpFilter.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start(ctx.currentTime, startTime, maxDur);
    state.previewVoice = { source, gain: gainNode, ctx, startTime, startCtxTime: ctx.currentTime, duration: maxDur };

    // Animate visual playhead cursor line
    const playhead = document.getElementById('waveformPlayheadLine');
    const canvas = document.getElementById('chopperWaveformCanvas');
    if (playhead && canvas) {
      playhead.classList.remove('hidden');

      function updatePlayhead() {
        if (!state.previewVoice) return;
        const elapsed = ctx.currentTime - state.previewVoice.startCtxTime;
        if (elapsed >= state.previewVoice.duration) {
          stopPreviewVoice();
          return;
        }

        const currPlayTime = startTime + elapsed;
        const width = canvas.clientWidth;
        const xPos = timeToCanvasX(currPlayTime, width);

        if (xPos >= 0 && xPos <= width) {
          playhead.style.left = `${xPos}px`;
          playhead.style.display = 'block';
        } else {
          playhead.style.display = 'none';
        }

        state.previewAnimId = requestAnimationFrame(updatePlayhead);
      }

      state.previewAnimId = requestAnimationFrame(updatePlayhead);
    }
  }

  // --- Sequencer & Clock ---
  function scheduleNextStep() {
    const ctx = getAudioContext();
    const secondsPerBeat = 60.0 / state.bpm;
    const stepDuration = secondsPerBeat / 4.0; // 1/16th note
    const totalSteps = Math.max(16, state.sequence.length);

    while (state.nextStepTime < ctx.currentTime + 0.1) {
      const step = state.currentStep;
      const scheduledTime = state.nextStepTime;
      const drum16Step = step % 16;

      // 1. Play drums for this step (drum patterns loop cleanly over 16-step measures)
      if (!state.drumMute) {
        const pat = GENRE_PATTERNS[state.genre] || GENRE_PATTERNS.house;
        if (pat.kick[drum16Step]) playSynthKick(ctx, scheduledTime, state.kit, state.drumVolume);
        if (pat.snare[drum16Step]) playSynthSnare(ctx, scheduledTime, state.kit, state.drumVolume);
        if (pat.openHat && pat.openHat[drum16Step]) {
          playSynthHiHat(ctx, scheduledTime, state.kit, true, state.drumVolume);
        } else if (pat.hat[drum16Step]) {
          playSynthHiHat(ctx, scheduledTime, state.kit, false, state.drumVolume);
        }
      }

      // 2. Play sample slice for this step
      const sliceIdx = state.sequence[step];
      if (sliceIdx !== null && sliceIdx !== undefined && sliceIdx >= 0) {
        // Check if this step is a continuation/tied from the previous step
        const prevStep = (step + totalSteps - 1) % totalSteps;
        const isTiedContinuation = (state.sequence[prevStep] === sliceIdx && step !== 0);

        if (!isTiedContinuation) {
          // Count how many consecutive steps share this identical slice (tied sequence)
          let tiedCount = 1;
          for (let s = 1; s < totalSteps - step; s++) {
            if (state.sequence[step + s] === sliceIdx) {
              tiedCount++;
            } else {
              break;
            }
          }
          const sustainedDuration = stepDuration * tiedCount;
          playSlice(sliceIdx, scheduledTime, sustainedDuration);
        }
      }

      // Update UI step indicator smoothly
      const currentStepSnapshot = step;
      setTimeout(() => {
        if (state.isPlaying) updateSequencerPlayhead(currentStepSnapshot);
      }, Math.max(0, (scheduledTime - ctx.currentTime) * 1000));

      state.currentStep = (state.currentStep + 1) % totalSteps;
      state.nextStepTime += stepDuration;
    }

    if (state.isPlaying) {
      state.timerId = setTimeout(scheduleNextStep, 25);
    }
  }

  function toggleTransport() {
    const ctx = getAudioContext();
    if (state.isPlaying) {
      state.isPlaying = false;
      clearTimeout(state.timerId);
      updateTransportUI();
      updateSequencerPlayhead(-1);
    } else {
      state.isPlaying = true;
      state.currentStep = 0;
      state.playbackStartTime = ctx.currentTime;
      state.nextStepTime = ctx.currentTime + 0.05;
      updateTransportUI();
      scheduleNextStep();
    }
  }

  function updateTransportUI() {
    const btn = document.getElementById('btnChopperPlay');
    if (btn) {
      if (state.isPlaying) {
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16"></rect>
            <rect x="14" y="4" width="4" height="16"></rect>
          </svg>
          <span>Stop</span>
        `;
        btn.classList.add('btn-playing');
      } else {
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>Play Beat & Chops</span>
        `;
        btn.classList.remove('btn-playing');
      }
    }
    updateFloatingWidgetUI();
  }

  function updateFloatingWidgetUI() {
    const widget = document.getElementById('chopperFloatingWidget');
    if (!widget) return;

    // Check which tab is currently active
    const viewChopper = document.getElementById('viewChopper');
    const isChopperTabActive = viewChopper && !viewChopper.classList.contains('hidden');

    // Show floating widget only when NOT on chopper tab AND track is loaded
    if (!isChopperTabActive && state.audioBuffer) {
      widget.classList.remove('hidden');
    } else {
      widget.classList.add('hidden');
    }

    const titleEl = document.getElementById('chopperFloatingTitle');
    const subEl = document.getElementById('chopperFloatingSub');
    const playIcon = document.getElementById('chopperFloatingPlayIcon');
    const pauseIcon = document.getElementById('chopperFloatingPauseIcon');
    const playBtn = document.getElementById('btnChopperFloatingPlay');

    if (titleEl) titleEl.textContent = state.currentTitle || 'Sample Beat';
    if (subEl) {
      const bars = Math.round((state.sequence.length || 16) / 16);
      subEl.textContent = `${Math.round(state.bpm)} BPM • ${bars} Bar${bars > 1 ? 's' : ''} ${state.isPlaying ? '• Playing' : '• Paused'}`;
    }

    if (playBtn) {
      playBtn.classList.toggle('is-playing', state.isPlaying);
    }
    if (playIcon && pauseIcon) {
      if (state.isPlaying) {
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
      } else {
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
      }
    }
  }

  function updateSequencerPlayhead(stepIndex) {
    document.querySelectorAll('.seq-step-btn').forEach((btn, idx) => {
      btn.classList.toggle('step-active-playhead', idx === stepIndex);
    });
  }

  // --- UI Builders & Performance Triggers ---
  function recordHitIntoSequencer(sliceIdx) {
    if (!state.isPlaying || !state.sequence || !state.sequence.length) return;
    const ctx = getAudioContext();
    const secondsPerBeat = 60.0 / state.bpm;
    const stepDuration = secondsPerBeat / 4.0; // 1/16th note
    const totalSteps = state.sequence.length;

    // Calculate real-time step quantized to nearest 1/16th note
    const elapsed = Math.max(0, ctx.currentTime - (state.playbackStartTime || 0));
    const exactStepFloat = elapsed / stepDuration;
    const quantizedStep = Math.round(exactStepFloat) % totalSteps;

    state.sequence[quantizedStep] = sliceIdx;
    renderSequencerUI();
  }

  // MPC Note Repeat / Pad Roll Engine (Phase 4)
  let activeRollInterval = null;
  let activeRollSlot = null;
  let isShiftKeyDown = false;

  function getRollIntervalMs() {
    const beatMs = (60.0 / state.bpm) * 1000.0;
    switch (state.noteRepeatRate) {
      case '8': return beatMs / 2.0;
      case '32': return beatMs / 8.0;
      case '16t': return (beatMs / 4.0) * (2.0 / 3.0);
      case '16':
      default: return beatMs / 4.0;
    }
  }

  function startPadRoll(slot) {
    stopPadRoll();
    activeRollSlot = slot;
    triggerPadBySlot(slot);
    const intervalMs = Math.max(30, getRollIntervalMs());
    activeRollInterval = setInterval(() => {
      if (activeRollSlot !== null) {
        triggerPadBySlot(activeRollSlot);
      }
    }, intervalMs);
  }

  function stopPadRoll() {
    if (activeRollInterval) {
      clearInterval(activeRollInterval);
      activeRollInterval = null;
    }
    activeRollSlot = null;
  }

  function triggerPadBySlot(slot) {
    const bankOffset = state.padBank === 'B' ? 16 : 0;
    const is16Mode = state.is16Levels;
    const sliceIdx = is16Mode ? state.selectedSliceIndex : (slot + bankOffset);

    if (is16Mode) {
      // 16 Levels: Play state.selectedSliceIndex with scale quantize offset
      const pitchOffset = get16LevelsPitchOffset(slot, state.scale16Levels);
      playSlice(state.selectedSliceIndex, 0, null, pitchOffset);
      highlightPadSlot(slot);
    } else {
      if (sliceIdx < state.slices.length) {
        state.selectedSliceIndex = sliceIdx;
        syncSelectedPadUI();
        renderPadsUI();
        renderWaveformCanvas();
        playSlice(sliceIdx);
      }
    }

    // Phase 1: Live Overdub Recording into Sequencer
    if (state.isRecording && state.isPlaying && sliceIdx >= 0) {
      recordHitIntoSequencer(is16Mode ? state.selectedSliceIndex : sliceIdx);
    }
  }

  function renderPadsUI() {
    const container = document.getElementById('chopperPadsGrid');
    if (!container) return;

    if (state.slices.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:1rem;">No slices yet. Set a range and click "Slice" above!</div>';
      return;
    }

    const bankOffset = state.padBank === 'B' ? 16 : 0;

    // Render 16 pads in authentic bottom-to-top MPC order (Row 1 = 13..16, Row 4 = 1..4)
    container.innerHTML = MPC_VISUAL_MAP.map(item => {
      const slot = item.slot;
      const padNum = item.padNum;
      const keyShortcut = item.key;
      const sliceIdx = state.is16Levels ? state.selectedSliceIndex : (slot + bankOffset);
      const slice = state.slices[sliceIdx];

      if (!slice && !state.is16Levels) {
        return `
          <button class="chopper-pad pad-empty" data-slot="${slot}" disabled style="opacity:0.4;cursor:default;">
            <div class="pad-top-row">
              <span class="pad-number">PAD ${padNum < 10 ? '0' + padNum : padNum}</span>
              <span class="pad-key-badge">${keyShortcut}</span>
            </div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin:auto;">—</div>
          </button>
        `;
      }

      const is16Mode = state.is16Levels;
      const pitchOffset = is16Mode ? get16LevelsPitchOffset(slot, state.scale16Levels) : (slice.tuning || 0);
      const isSelected = (!is16Mode && sliceIdx === state.selectedSliceIndex) || (is16Mode && slot === 7);
      const isLocked = Boolean(slice && slice.locked);
      const isReversed = Boolean(slice && slice.isReversed);
      const atk = (slice && slice.attackMs !== undefined) ? slice.attackMs : state.attackMs;

      let pitchLabel = '';
      if (is16Mode) {
        pitchLabel = pitchOffset === 0 ? 'ROOT (0)' : (pitchOffset > 0 ? `+${pitchOffset}st` : `${pitchOffset}st`);
      } else if (slice && slice.tuning) {
        pitchLabel = slice.tuning > 0 ? `+${slice.tuning}st` : `${slice.tuning}st`;
      }

      const durStr = slice ? `${(slice.end - slice.start).toFixed(2)}s` : '0.00s';
      const noteLabel = is16Mode ? pitchLabel : (NOTE_LABELS[sliceIdx] || `S${sliceIdx + 1}`);

      return `
        <button class="chopper-pad ${isSelected ? 'selected' : ''} ${isLocked ? 'is-locked-pad' : ''}" 
                data-slot="${slot}" 
                data-slice-index="${sliceIdx}"
                title="Pad ${padNum} [Key ${keyShortcut}] • ${is16Mode ? '16 Levels (' + (state.scale16Levels || 'Chromatic') + '): ' + pitchLabel : noteLabel}${isLocked ? ' • [LOCKED]' : ''} • Attack: ${atk}ms">
          <div class="pad-top-row">
            <span class="pad-number">PAD ${padNum < 10 ? '0' + padNum : padNum}</span>
            ${isLocked ? '<span class="pad-lock-pill" title="Locked slice">🔒</span>' : ''}
            <span class="pad-key-badge">${keyShortcut}</span>
          </div>
          <div class="pad-mini-waveform-wrap">
            <canvas class="pad-mini-waveform" data-slice-index="${sliceIdx}" width="90" height="26"></canvas>
          </div>
          <div class="pad-bottom-row">
            <span class="pad-duration">${durStr}</span>
            ${pitchLabel ? `<span class="pad-tune-badge">${pitchLabel}</span>` : ''}
            ${isReversed ? '<span class="pad-reverse-badge">REV</span>' : ''}
            ${!is16Mode ? `<span class="pad-note">${noteLabel}</span>` : ''}
          </div>
        </button>
      `;
    }).join('');

    syncSelectedPadUI();
    drawSliceMiniWaveforms();

    container.querySelectorAll('.chopper-pad:not(.pad-empty)').forEach(btn => {
      const slot = parseInt(btn.getAttribute('data-slot'), 10);

      btn.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (state.isNoteRepeat || isShiftKeyDown) {
          startPadRoll(slot);
        } else {
          triggerPadBySlot(slot);
        }
      });

      btn.addEventListener('mouseup', () => stopPadRoll());
      btn.addEventListener('mouseleave', () => stopPadRoll());

      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (state.isNoteRepeat || isShiftKeyDown) {
          startPadRoll(slot);
        } else {
          triggerPadBySlot(slot);
        }
      }, { passive: false });

      btn.addEventListener('touchend', () => stopPadRoll());
    });
  }

  function drawSliceMiniWaveforms() {
    if (!state.audioBuffer) return;
    const channelData = state.audioBuffer.getChannelData(0);
    const sr = state.audioBuffer.sampleRate;

    document.querySelectorAll('.pad-mini-waveform').forEach(canvas => {
      const idx = parseInt(canvas.getAttribute('data-slice-index'), 10);
      if (idx < 0 || idx >= state.slices.length) return;
      const s = state.slices[idx];

      const w = canvas.width;
      const h = canvas.height;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, w, h);

      const startSamp = Math.floor(s.start * sr);
      const endSamp = Math.min(channelData.length, Math.floor(s.end * sr));
      const totalSamps = Math.max(1, endSamp - startSamp);
      const step = Math.max(1, Math.floor(totalSamps / w));
      const mid = h / 2;

      ctx.fillStyle = s.locked ? '#f59e0b' : (idx === state.selectedSliceIndex ? '#38bdf8' : '#818cf8');
      for (let x = 0; x < w; x++) {
        let min = 1.0;
        let max = -1.0;
        const offset = startSamp + Math.floor((x / w) * totalSamps);
        for (let j = 0; j < step && (offset + j) < channelData.length; j++) {
          const val = channelData[offset + j];
          if (val < min) min = val;
          if (val > max) max = val;
        }
        const barHeight = Math.max(1.5, (max - min) * mid);
        ctx.fillRect(x, mid - (barHeight / 2), 1, barHeight);
      }
    });
  }

  function syncSelectedPadUI() {
    const badge = document.getElementById('selectedPadBadge');
    const btnLock = document.getElementById('btnTogglePadLock');
    const lockIcon = document.getElementById('padLockIcon');
    const lockText = document.getElementById('padLockText');

    // Tune slider & label
    const tuneSlider = document.getElementById('padTuneSlider');
    const tuneLabel = document.getElementById('padTuneValLabel');

    // Attack slider & label
    const attackSlider = document.getElementById('padAttackSlider');
    const attackLabel = document.getElementById('padAttackValLabel');

    // Decay slider & label
    const decaySlider = document.getElementById('padDecaySlider');
    const decayLabel = document.getElementById('padDecayValLabel');

    // Reverse & Play Mode buttons
    const btnReverse = document.getElementById('btnTogglePadReverse');
    const btnPlayMode = document.getElementById('btnTogglePadPlayMode');
    const playModeText = document.getElementById('padPlayModeText');

    if (!badge) return;

    const idx = state.selectedSliceIndex;
    if (idx >= 0 && idx < state.slices.length) {
      const s = state.slices[idx];
      const noteName = NOTE_LABELS[idx] || `S${idx + 1}`;
      badge.textContent = `PAD ${idx + 1} (${noteName})`;

      // Tuning
      const curTune = s.tuning || 0;
      if (tuneSlider) tuneSlider.value = curTune;
      if (tuneLabel) tuneLabel.textContent = `${curTune > 0 ? '+' : ''}${curTune} st`;

      // Attack
      const atk = (s.attackMs !== undefined && s.attackMs !== null) ? s.attackMs : state.attackMs;
      if (attackSlider) attackSlider.value = atk;
      if (attackLabel) attackLabel.textContent = `${atk}ms`;

      // Decay
      const decay = (s.decayMs !== undefined) ? s.decayMs : 2500;
      if (decaySlider) decaySlider.value = decay;
      if (decayLabel) decayLabel.textContent = (decay >= 2500) ? 'FULL' : `${decay}ms`;

      // Reverse
      if (btnReverse) {
        btnReverse.classList.toggle('active', Boolean(s.isReversed));
      }

      // Play mode (oneshot vs gate)
      if (btnPlayMode && playModeText) {
        const isGated = s.playMode === 'gate';
        btnPlayMode.classList.toggle('active', isGated);
        playModeText.textContent = isGated ? 'GATED' : 'ONE-SHOT';
      }

      // Lock
      if (btnLock && lockIcon && lockText) {
        const isLocked = Boolean(s.locked);
        btnLock.classList.toggle('locked', isLocked);
        lockIcon.textContent = isLocked ? '🔒' : '🔓';
        lockText.textContent = isLocked ? 'Locked' : 'Lock Sample';
        btnLock.title = isLocked ? 'Sample is locked. Click to unlock' : 'Lock this sample so moving loop selection preserves it';
      }
    }
  }

  function renderSequencerUI() {
    const container = document.getElementById('chopperSequencerGrid');
    if (!container) return;

    const totalSteps = state.sequence.length;

    // Update section title text and length toggle buttons
    const title = document.getElementById('seqHeaderTitle');
    if (title) {
      const bars = Math.round(totalSteps / 16);
      title.textContent = `Pattern Sequencer (${totalSteps} Steps • ${bars} Bar${bars > 1 ? 's' : ''})`;
    }

    document.querySelectorAll('.seq-len-btn').forEach(btn => {
      const len = parseInt(btn.getAttribute('data-length'), 10);
      btn.classList.toggle('active', len === totalSteps);
    });

    container.innerHTML = state.sequence.map((sliceIdx, stepIdx) => {
      const hasNote = sliceIdx !== null && sliceIdx !== undefined;
      const noteLabel = hasNote ? (NOTE_LABELS[sliceIdx] || `${sliceIdx + 1}`) : '—';
      const isDownbeat = stepIdx % 4 === 0;
      const isBarStart = stepIdx % 16 === 0;
      const barNumber = Math.floor(stepIdx / 16) + 1;
      const stepInBar = (stepIdx % 16) + 1;

      // Check if this step is tied to the previous step
      const prevSlice = stepIdx > 0 ? state.sequence[stepIdx - 1] : null;
      const nextSlice = stepIdx < (totalSteps - 1) ? state.sequence[stepIdx + 1] : null;
      const isTiedFromPrev = hasNote && prevSlice === sliceIdx;
      const isTiedToNext = hasNote && nextSlice === sliceIdx;

      return `
        <div class="seq-step-wrapper step-${stepIdx} ${isBarStart ? 'bar-start' : ''} ${isTiedFromPrev ? 'is-tied-left' : ''} ${isTiedToNext ? 'is-tied-right' : ''}" data-bar="${barNumber}">
          <button class="seq-step-btn ${hasNote ? 'has-slice' : ''} ${isDownbeat ? 'downbeat' : ''} ${isTiedFromPrev ? 'tied-step' : ''}" 
                  data-step="${stepIdx}" 
                  title="Step ${stepIdx + 1} (Bar ${barNumber}.${stepInBar}): ${hasNote ? 'Slice ' + (sliceIdx + 1) : 'Rest'}\n• Click: Cycle slice\n• Alt/Option-Click: Link to previous step (sustain)\n• Right-click: Rest">
            <span class="step-num">${stepIdx + 1}</span>
            <span class="step-slice-label">${isTiedFromPrev ? '🔗 TIE' : noteLabel}</span>
          </button>
          ${hasNote && stepIdx < (totalSteps - 1) ? `
            <button class="btn-step-link ${isTiedToNext ? 'linked' : ''}" 
                    data-step="${stepIdx}" 
                    title="${isTiedToNext ? 'Unlink step (stop sustain)' : 'Link to next step (sustain slice longer)'}">
              ${isTiedToNext ? '═' : '›'}
            </button>
          ` : ''}
        </div>
      `;
    }).join('');

    // Step button clicks
    container.querySelectorAll('.seq-step-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const step = parseInt(btn.getAttribute('data-step'), 10);

        if (e.altKey && step > 0 && state.sequence[step - 1] !== null) {
          // Alt-Click: Tie to previous step's slice
          state.sequence[step] = state.sequence[step - 1];
        } else if (state.sequence[step] === null || state.sequence[step] === undefined) {
          state.sequence[step] = state.selectedSliceIndex;
        } else if (state.sequence[step] === state.selectedSliceIndex) {
          state.sequence[step] = (state.sequence[step] + 1) % Math.max(1, state.slices.length);
        } else {
          state.sequence[step] = state.selectedSliceIndex;
        }
        renderSequencerUI();
      });

      // Right click: clear step
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const step = parseInt(btn.getAttribute('data-step'), 10);
        state.sequence[step] = null;
        renderSequencerUI();
      });
    });

    // Step mini Link buttons
    container.querySelectorAll('.btn-step-link').forEach(linkBtn => {
      linkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const step = parseInt(linkBtn.getAttribute('data-step'), 10);
        const thisSlice = state.sequence[step];
        if (thisSlice === null || thisSlice === undefined) return;

        if (state.sequence[step + 1] === thisSlice) {
          // Already linked -> Unlink (set to rest)
          state.sequence[step + 1] = null;
        } else {
          // Link forward -> copy slice into next step
          state.sequence[step + 1] = thisSlice;
        }
        renderSequencerUI();
      });
    });
  }

  // --- Track Loading ---
  async function loadTrackIntoChopper(filename, title = '', bpm = null) {
    state.currentFilename = filename;
    state.currentTitle = title || filename;

    const banner = document.getElementById('chopperTrackHeader');
    if (banner) {
      banner.innerHTML = `
        <div class="chopper-title-badge">
          <span class="pulse-indicator"></span>
          <strong>${escapeHtml(state.currentTitle)}</strong>
          <span class="track-file-pill">${escapeHtml(filename)}</span>
          <button type="button" id="btnChangeChopperTrack" class="btn-change-track" title="Change song to sample">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span>Change Song</span>
          </button>
        </div>
      `;
      const btnChange = document.getElementById('btnChangeChopperTrack');
      if (btnChange) {
        btnChange.addEventListener('click', openChangeTrackModal);
      }
    }

    const emptyView = document.getElementById('chopperEmptyState');
    const activeView = document.getElementById('chopperActiveWorkspace');
    if (emptyView) emptyView.classList.add('hidden');
    if (activeView) activeView.classList.remove('hidden');

    // Switch tab to chopper
    if (window.switchTab) {
      window.switchTab('chopper');
    }

    // Update BPM if provided
    if (bpm && Number(bpm) > 40) {
      state.bpm = Math.round(Number(bpm));
      const bpmInput = document.getElementById('chopperBpmInput');
      if (bpmInput) bpmInput.value = state.bpm;
    }

    // Fetch and decode audio file
    try {
      const bannerSub = document.getElementById('chopperLoadStatus');
      if (bannerSub) bannerSub.textContent = 'Decoding waveform buffer...';

      const res = await fetch(`/api/stream/${encodeURIComponent(filename)}`);
      if (!res.ok) throw new Error('Could not stream audio');
      const arrayBuf = await res.arrayBuffer();

      const ctx = getAudioContext();
      state.audioBuffer = await ctx.decodeAudioData(arrayBuf);
      state.sourceDuration = state.audioBuffer.duration;

      // Default range: first 4 bars at project tempo, or first 8 seconds
      const fourBarsSec = (60.0 / state.bpm) * 16;
      state.rangeStart = 0;
      state.rangeEnd = Math.min(state.sourceDuration, fourBarsSec || 8.0);

      // Auto-compute 8 grid slices initially
      computeSlices('grid_8');
      renderSequencerUI();
      if (bannerSub) bannerSub.textContent = `Ready (${state.sourceDuration.toFixed(1)}s)`;
    } catch (e) {
      console.error('Audio decode error', e);
      alert('Could not decode audio file: ' + e.message);
    }
  }

  // --- Smart Sample Scout / AI Recommender Engine ---
  function analyzeAndRecommendSections(scoutType = 'best_loop') {
    if (!state.audioBuffer) {
      alert('Please load an audio track first to scan and scout samples.');
      return;
    }

    const buffer = state.audioBuffer;
    const duration = buffer.duration;
    if (duration < 3.0) return;

    const bpm = state.bpm || 126.0;
    const barCount = state.scoutBarLength || 4;
    // Window duration in seconds: barCount * 4 beats * (60 / bpm)
    const windowDuration = (60.0 / bpm) * 4 * barCount;
    const targetSpan = Math.min(duration * 0.95, Math.max(1.0, windowDuration));

    const channelData = buffer.getChannelData(0);
    const sr = buffer.sampleRate;

    // Fast scanning over track with 0.25s hop
    const hopSec = 0.25;
    const numHops = Math.floor((duration - targetSpan) / hopSec);
    if (numHops <= 0) return;

    const candidates = [];
    const samplesPerBlock = 512;
    const blocksPerWindow = 64; // evaluate 64 blocks evenly across each candidate window

    // Step by 2 hops (0.5s) for instant scan (<20ms runtime)
    for (let h = 0; h < numHops; h += 2) {
      const startTime = h * hopSec;
      const endTime = startTime + targetSpan;
      const startSamp = Math.floor(startTime * sr);
      const endSamp = Math.floor(endTime * sr);
      const spanSamps = endSamp - startSamp;
      const stepSamps = Math.max(1, Math.floor(spanSamps / blocksPerWindow));

      let sumRms = 0;
      let maxRms = 0;
      let minRms = 999;
      const rmsValues = [];

      for (let b = 0; b < blocksPerWindow; b++) {
        const bStart = startSamp + b * stepSamps;
        let sumSq = 0;
        for (let j = 0; j < samplesPerBlock && (bStart + j) < channelData.length; j++) {
          const s = channelData[bStart + j];
          sumSq += s * s;
        }
        const blockRms = Math.sqrt(sumSq / samplesPerBlock);
        sumRms += blockRms;
        if (blockRms > maxRms) maxRms = blockRms;
        if (blockRms < minRms) minRms = blockRms;
        rmsValues.push(blockRms);
      }

      const meanRms = sumRms / blocksPerWindow;
      // Skip dead silence or near silence
      if (meanRms < 0.03) continue;

      // Variance across window
      let sumVar = 0;
      for (let v of rmsValues) {
        sumVar += (v - meanRms) * (v - meanRms);
      }
      const varianceRms = Math.sqrt(sumVar / blocksPerWindow);
      const crestFactor = maxRms / (meanRms + 0.001);

      candidates.push({
        start: startTime,
        end: endTime,
        meanRms,
        maxRms,
        minRms,
        varianceRms,
        crestFactor,
        progress: startTime / duration // 0.0 to 1.0
      });
    }

    if (candidates.length === 0) return;

    let selected = null;

    if (scoutType === 'best_loop') {
      // Score: high energy + punchy crest factor + consistent rhythm (lower variance)
      // Focus on track body (10% to 85%)
      const bodyCandidates = candidates.filter(c => c.progress >= 0.10 && c.progress <= 0.85);
      const pool = bodyCandidates.length > 0 ? bodyCandidates : candidates;
      pool.sort((a, b) => {
        const scoreA = (a.meanRms * 2.0) + (a.crestFactor * 0.8) - (a.varianceRms * 1.5);
        const scoreB = (b.meanRms * 2.0) + (b.crestFactor * 0.8) - (b.varianceRms * 1.5);
        return scoreB - scoreA;
      });
      selected = pool[0];
    } else if (scoutType === 'break') {
      // Find drum break: Highest crest factor (sharp, explosive transients) with clean dynamics
      candidates.sort((a, b) => {
        const scoreA = (a.crestFactor * 3.0) - (a.meanRms * 0.8);
        const scoreB = (b.crestFactor * 3.0) - (b.meanRms * 0.8);
        return scoreB - scoreA;
      });
      selected = candidates[0];
    } else if (scoutType === 'intro') {
      // First 28% of song with warm musical energy
      const introPool = candidates.filter(c => c.progress <= 0.28 && c.meanRms >= 0.05);
      if (introPool.length > 0) {
        selected = introPool[0];
      } else {
        selected = candidates[0];
      }
    } else if (scoutType === 'outro') {
      // Outro / Vamp in final 25% of song
      const outroPool = candidates.filter(c => c.progress >= 0.70 && c.meanRms >= 0.04);
      if (outroPool.length > 0) {
        outroPool.sort((a, b) => (b.meanRms + b.crestFactor) - (a.meanRms + a.crestFactor));
        selected = outroPool[0];
      } else {
        selected = candidates[candidates.length - 1];
      }
    } else if (scoutType === 'lucky') {
      // Random groovy flip
      const goodPool = candidates.filter(c => c.meanRms >= 0.06);
      const pool = goodPool.length > 0 ? goodPool : candidates;
      selected = pool[Math.floor(Math.random() * pool.length)];
    }

    if (!selected) return;

    // Apply scouted window
    state.rangeStart = selected.start;
    state.rangeEnd = selected.end;

    // Center scroll/viewport smoothly on the scouted section
    const visibleDur = getVisibleDuration();
    state.scrollOffset = Math.max(0, state.rangeStart - (visibleDur * 0.05));
    clampScrollOffset();

    // Recompute 16 grid chops for MPC matrix
    computeSlices('grid_16');

    // Update status readout
    const statusEl = document.getElementById('chopperLoadStatus');
    const startMin = Math.floor(selected.start / 60);
    const startSec = Math.floor(selected.start % 60).toString().padStart(2, '0');
    const typeLabel = scoutType.replace('_', ' ').toUpperCase();
    if (statusEl) {
      statusEl.textContent = `🎯 Scouted ${barCount}-Bar ${typeLabel} at ${startMin}:${startSec}`;
    }

    // Immediately play Pad 1 to audition the scouted section
    playSlice(0);
  }

  // --- Export Chops + MIDI ZIP ---
  async function exportChopperPack() {
    if (!state.currentFilename || state.slices.length === 0) {
      alert('Please load an audio file and create slices first.');
      return;
    }

    const btn = document.getElementById('btnChopperExport');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>Rendering ZIP...</span>';
    }

    try {
      const sanitizedSlices = state.slices.map((s, idx) => ({
        index: idx + 1,
        start: s.start,
        end: s.end,
        note: s.note || (36 + idx)
      }));

      const payload = {
        filename: state.currentFilename,
        bpm: state.bpm,
        slices: sanitizedSlices,
        sequence: state.sequence,
        pattern_bars: Math.max(1, Math.round(state.sequence.length / 16)),
        range_start: state.rangeStart,
        range_end: state.rangeEnd,
        selection_only: true,
        highpass_hz: state.hpCutoff > 25 ? state.hpCutoff : null,
        lowpass_hz: state.lpCutoff < 19000 ? state.lpCutoff : null
      };

      const res = await fetch('/api/chopper/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Export failed');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sidekick_chops_${state.currentFilename.replace(/\.[^/.]+$/, '')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Export MIDI + Chops (.zip)</span>
        `;
      }
    }
  }

  // --- Event Listeners Setup ---
  function initChopperModule() {
    // Play button
    const btnPlay = document.getElementById('btnChopperPlay');
    if (btnPlay) btnPlay.addEventListener('click', toggleTransport);

    // Live Overdub Record button (Phase 1)
    const btnRec = document.getElementById('btnChopperRec');
    if (btnRec) {
      btnRec.addEventListener('click', () => {
        state.isRecording = !state.isRecording;
        btnRec.classList.toggle('is-recording', state.isRecording);
        if (state.isRecording && !state.isPlaying) {
          toggleTransport();
        }
      });
    }

    // BPM Input
    const bpmInput = document.getElementById('chopperBpmInput');
    if (bpmInput) {
      bpmInput.addEventListener('change', () => {
        let val = parseFloat(bpmInput.value);
        if (isNaN(val) || val < 50) val = 120;
        if (val > 220) val = 220;
        state.bpm = val;
        bpmInput.value = val;
      });
    }

    // Kit Selector (909 vs 808)
    document.querySelectorAll('.kit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.kit-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.kit = btn.getAttribute('data-kit');
      });
    });

    // Genre Presets
    const genreSelect = document.getElementById('chopperGenreSelect');
    if (genreSelect) {
      genreSelect.addEventListener('change', () => {
        state.genre = genreSelect.value;
        const pat = GENRE_PATTERNS[state.genre];
        if (pat && (!state.bpm || state.bpm === 126)) {
          state.bpm = pat.defaultBpm;
          if (bpmInput) bpmInput.value = state.bpm;
        }
      });
    }

    // Drum Mute Toggle
    const btnMuteDrums = document.getElementById('btnMuteDrums');
    if (btnMuteDrums) {
      btnMuteDrums.addEventListener('click', () => {
        state.drumMute = !state.drumMute;
        btnMuteDrums.classList.toggle('active', state.drumMute);
        btnMuteDrums.textContent = state.drumMute ? '🔇 Drums Muted' : '🥁 Drums ON';
      });
    }

    // Smart Sample Scout / Recommender Toolbar
    document.querySelectorAll('.scout-len-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.scout-len-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.scoutBarLength = parseInt(btn.getAttribute('data-bars'), 10) || 4;
      });
    });

    const btnScoutBest = document.getElementById('btnScoutBestLoop');
    if (btnScoutBest) btnScoutBest.addEventListener('click', () => analyzeAndRecommendSections('best_loop'));

    const btnScoutBreak = document.getElementById('btnScoutBreak');
    if (btnScoutBreak) btnScoutBreak.addEventListener('click', () => analyzeAndRecommendSections('break'));

    const btnScoutIntro = document.getElementById('btnScoutIntro');
    if (btnScoutIntro) btnScoutIntro.addEventListener('click', () => analyzeAndRecommendSections('intro'));

    const btnScoutOutro = document.getElementById('btnScoutOutro');
    if (btnScoutOutro) btnScoutOutro.addEventListener('click', () => analyzeAndRecommendSections('outro'));

    const btnScoutLucky = document.getElementById('btnScoutLucky');
    if (btnScoutLucky) btnScoutLucky.addEventListener('click', () => analyzeAndRecommendSections('lucky'));

    // MPC Performance Bar Toggles
    const btnBankA = document.getElementById('btnBankA');
    const btnBankB = document.getElementById('btnBankB');
    if (btnBankA && btnBankB) {
      btnBankA.addEventListener('click', () => {
        state.padBank = 'A';
        btnBankA.classList.add('active');
        btnBankB.classList.remove('active');
        renderPadsUI();
      });
      btnBankB.addEventListener('click', () => {
        state.padBank = 'B';
        btnBankB.classList.add('active');
        btnBankA.classList.remove('active');
        renderPadsUI();
      });
    }

    const btnToggle16Levels = document.getElementById('btnToggle16Levels');
    const scaleSelect = document.getElementById('mpc16LevelsScale');
    if (btnToggle16Levels) {
      btnToggle16Levels.addEventListener('click', () => {
        state.is16Levels = !state.is16Levels;
        btnToggle16Levels.classList.toggle('active', state.is16Levels);
        if (scaleSelect) {
          scaleSelect.classList.toggle('hidden', !state.is16Levels);
        }
        renderPadsUI();
      });
    }
    if (scaleSelect) {
      scaleSelect.addEventListener('change', () => {
        state.scale16Levels = scaleSelect.value;
        renderPadsUI();
      });
    }

    const btnToggleChoke = document.getElementById('btnToggleChoke');
    const chokeModeText = document.getElementById('chokeModeText');
    if (btnToggleChoke) {
      btnToggleChoke.addEventListener('click', () => {
        state.isMonoChoke = !state.isMonoChoke;
        btnToggleChoke.classList.toggle('active', state.isMonoChoke);
        if (chokeModeText) {
          chokeModeText.textContent = state.isMonoChoke ? 'CHOKE: MONO' : 'CHOKE: POLY';
        }
      });
    }

    const btnToggleFullLevel = document.getElementById('btnToggleFullLevel');
    if (btnToggleFullLevel) {
      btnToggleFullLevel.addEventListener('click', () => {
        state.isFullLevel = !state.isFullLevel;
        btnToggleFullLevel.classList.toggle('active', state.isFullLevel);
      });
    }

    // MPC Note Repeat / Pad Roll Toggle & Rates (Phase 4)
    const btnToggleNoteRepeat = document.getElementById('btnToggleNoteRepeat');
    const rollRatesContainer = document.getElementById('mpcRollRates');
    if (btnToggleNoteRepeat) {
      btnToggleNoteRepeat.addEventListener('click', () => {
        state.isNoteRepeat = !state.isNoteRepeat;
        btnToggleNoteRepeat.classList.toggle('active', state.isNoteRepeat);
        if (rollRatesContainer) {
          rollRatesContainer.classList.toggle('hidden', !state.isNoteRepeat);
        }
        if (!state.isNoteRepeat) {
          stopPadRoll();
        }
      });
    }

    document.querySelectorAll('.roll-rate-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.roll-rate-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.noteRepeatRate = btn.getAttribute('data-rate') || '16';
      });
    });

    // Vintage Texture Color Engine (Phase 2)
    const vintageSelect = document.getElementById('chopperVintageColor');
    if (vintageSelect) {
      vintageSelect.addEventListener('change', () => {
        state.vintageColor = vintageSelect.value;
      });
    }

    // Slice Mode Buttons
    document.querySelectorAll('.slice-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.slice-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.getAttribute('data-mode');
        state.sliceMode = mode;
        computeSlices(mode);
      });
    });

    // Lock Sample Toggle Button
    const btnTogglePadLock = document.getElementById('btnTogglePadLock');
    if (btnTogglePadLock) {
      btnTogglePadLock.addEventListener('click', () => {
        const idx = state.selectedSliceIndex;
        if (idx >= 0 && idx < state.slices.length) {
          state.slices[idx].locked = !state.slices[idx].locked;
          state.slices[idx].slot = idx;
          syncSelectedPadUI();
          renderPadsUI();
          renderWaveformCanvas();
        }
      });
    }

    // Length Toggle Buttons (16, 32, 48, 64 steps / 1 to 4 bars)
    document.querySelectorAll('.seq-len-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetLen = parseInt(btn.getAttribute('data-length'), 10);
        if (!targetLen || targetLen === state.sequence.length) return;

        const currentLen = state.sequence.length;
        if (targetLen > currentLen) {
          // Extend by looping/repeating the existing pattern into the new bars
          const extended = [...state.sequence];
          while (extended.length < targetLen) {
            extended.push(...state.sequence.slice(0, Math.min(state.sequence.length, targetLen - extended.length)));
          }
          state.sequence = extended;
        } else {
          // Truncate to target length
          state.sequence = state.sequence.slice(0, targetLen);
        }

        state.patternSteps = targetLen;
        state.patternBars = Math.round(targetLen / 16);
        if (state.currentStep >= targetLen) {
          state.currentStep = state.currentStep % targetLen;
        }
        renderSequencerUI();
      });
    });

    // Preset Sequence buttons (Straight, Bounce, Duplicate 1-16, Clear)
    const btnSeqStraight = document.getElementById('btnSeqStraight');
    if (btnSeqStraight) {
      btnSeqStraight.addEventListener('click', () => {
        const len = state.sequence.length;
        const base = [0, null, 1, null, 2, null, 3, null, 4, null, 5, null, 6, null, 7, null];
        const newSeq = [];
        for (let i = 0; i < len; i++) {
          newSeq.push(base[i % 16]);
        }
        state.sequence = newSeq;
        renderSequencerUI();
      });
    }
    const btnSeqFour = document.getElementById('btnSeqFour');
    if (btnSeqFour) {
      btnSeqFour.addEventListener('click', () => {
        const len = state.sequence.length;
        const base = [0, 0, 1, 1, 2, 2, 3, 3, 0, 0, 1, 1, 2, 2, 3, 3];
        const newSeq = [];
        for (let i = 0; i < len; i++) {
          newSeq.push(base[i % 16]);
        }
        state.sequence = newSeq;
        renderSequencerUI();
      });
    }
    const btnSeqDuplicate = document.getElementById('btnSeqDuplicate');
    if (btnSeqDuplicate) {
      btnSeqDuplicate.addEventListener('click', () => {
        const len = state.sequence.length;
        const first16 = state.sequence.slice(0, 16);
        const newSeq = [];
        for (let i = 0; i < len; i++) {
          newSeq.push(first16[i % 16]);
        }
        state.sequence = newSeq;
        renderSequencerUI();
      });
    }
    const btnSeqClear = document.getElementById('btnSeqClear');
    if (btnSeqClear) {
      btnSeqClear.addEventListener('click', () => {
        state.sequence = Array(state.sequence.length).fill(null);
        renderSequencerUI();
      });
    }

    // Export button
    const btnExport = document.getElementById('btnChopperExport');
    if (btnExport) btnExport.addEventListener('click', exportChopperPack);

    // Gate % Slider
    const gateSlider = document.getElementById('chopperGateSlider');
    const gateValLabel = document.getElementById('gateValLabel');
    if (gateSlider) {
      gateSlider.addEventListener('input', () => {
        const val = parseInt(gateSlider.value, 10);
        state.gate = val / 100.0;
        if (gateValLabel) gateValLabel.textContent = `${val}%`;
      });
    }

    // Global Attack (De-click) Slider
    const attackSlider = document.getElementById('chopperAttackSlider');
    const attackValLabel = document.getElementById('attackValLabel');
    if (attackSlider) {
      attackSlider.addEventListener('input', () => {
        const val = parseInt(attackSlider.value, 10);
        state.attackMs = val;
        if (attackValLabel) attackValLabel.textContent = `${val}ms`;
        // Update all pads that don't have custom override
        state.slices.forEach(s => { s.attackMs = val; });
        renderPadsUI();
      });
    }

    // Per-Pad Attack Slider
    const padAttackSlider = document.getElementById('padAttackSlider');
    const padAttackValLabel = document.getElementById('padAttackValLabel');
    if (padAttackSlider) {
      padAttackSlider.addEventListener('input', () => {
        const val = parseInt(padAttackSlider.value, 10);
        const idx = state.selectedSliceIndex;
        if (idx >= 0 && idx < state.slices.length) {
          state.slices[idx].attackMs = val;
          if (padAttackValLabel) padAttackValLabel.textContent = `${val}ms`;
          renderPadsUI();
        }
      });
    }

    // Per-Pad Tuning Slider & Reset
    const padTuneSlider = document.getElementById('padTuneSlider');
    const padTuneValLabel = document.getElementById('padTuneValLabel');
    if (padTuneSlider) {
      padTuneSlider.addEventListener('input', () => {
        const val = parseInt(padTuneSlider.value, 10);
        const idx = state.selectedSliceIndex;
        if (idx >= 0 && idx < state.slices.length) {
          state.slices[idx].tuning = val;
          if (padTuneValLabel) padTuneValLabel.textContent = `${val > 0 ? '+' : ''}${val} st`;
          renderPadsUI();
        }
      });
    }
    const btnResetPadTune = document.getElementById('btnResetPadTune');
    if (btnResetPadTune) {
      btnResetPadTune.addEventListener('click', () => {
        const idx = state.selectedSliceIndex;
        if (idx >= 0 && idx < state.slices.length) {
          state.slices[idx].tuning = 0;
          if (padTuneSlider) padTuneSlider.value = 0;
          if (padTuneValLabel) padTuneValLabel.textContent = '0 st';
          renderPadsUI();
        }
      });
    }

    // Per-Pad Decay Slider
    const padDecaySlider = document.getElementById('padDecaySlider');
    const padDecayValLabel = document.getElementById('padDecayValLabel');
    if (padDecaySlider) {
      padDecaySlider.addEventListener('input', () => {
        const val = parseInt(padDecaySlider.value, 10);
        const idx = state.selectedSliceIndex;
        if (idx >= 0 && idx < state.slices.length) {
          state.slices[idx].decayMs = val;
          if (padDecayValLabel) padDecayValLabel.textContent = (val >= 2500) ? 'FULL' : `${val}ms`;
        }
      });
    }

    // Per-Pad Nudge Start (-15ms / +15ms)
    const btnNudgeStartMinus = document.getElementById('btnNudgeStartMinus');
    if (btnNudgeStartMinus) {
      btnNudgeStartMinus.addEventListener('click', () => {
        const idx = state.selectedSliceIndex;
        if (idx >= 0 && idx < state.slices.length) {
          const s = state.slices[idx];
          s.start = Math.max(0, s.start - 0.015);
          s._reversedBuffer = null;
          if (idx > 0) state.slices[idx - 1].end = s.start;
          renderPadsUI();
          renderWaveformCanvas();
          playSlice(idx);
        }
      });
    }
    const btnNudgeStartPlus = document.getElementById('btnNudgeStartPlus');
    if (btnNudgeStartPlus) {
      btnNudgeStartPlus.addEventListener('click', () => {
        const idx = state.selectedSliceIndex;
        if (idx >= 0 && idx < state.slices.length) {
          const s = state.slices[idx];
          s.start = Math.min(s.end - 0.02, s.start + 0.015);
          s._reversedBuffer = null;
          if (idx > 0) state.slices[idx - 1].end = s.start;
          renderPadsUI();
          renderWaveformCanvas();
          playSlice(idx);
        }
      });
    }

    // Per-Pad Reverse Toggle
    const btnTogglePadReverse = document.getElementById('btnTogglePadReverse');
    if (btnTogglePadReverse) {
      btnTogglePadReverse.addEventListener('click', () => {
        const idx = state.selectedSliceIndex;
        if (idx >= 0 && idx < state.slices.length) {
          const s = state.slices[idx];
          s.isReversed = !s.isReversed;
          s._reversedBuffer = null;
          syncSelectedPadUI();
          renderPadsUI();
          playSlice(idx);
        }
      });
    }

    // Per-Pad Play Mode Toggle (One-Shot vs Gated)
    const btnTogglePadPlayMode = document.getElementById('btnTogglePadPlayMode');
    if (btnTogglePadPlayMode) {
      btnTogglePadPlayMode.addEventListener('click', () => {
        const idx = state.selectedSliceIndex;
        if (idx >= 0 && idx < state.slices.length) {
          const s = state.slices[idx];
          s.playMode = s.playMode === 'gate' ? 'oneshot' : 'gate';
          syncSelectedPadUI();
        }
      });
    }

    // High-Pass Filter Slider
    const hpSlider = document.getElementById('chopperHpSlider');
    const hpValLabel = document.getElementById('hpValLabel');
    if (hpSlider) {
      hpSlider.addEventListener('input', () => {
        const val = parseInt(hpSlider.value, 10);
        state.hpCutoff = val;
        if (hpValLabel) hpValLabel.textContent = val <= 25 ? 'OFF' : `${val} Hz`;
      });
    }

    // Low-Pass Filter Slider
    const lpSlider = document.getElementById('chopperLpSlider');
    const lpValLabel = document.getElementById('lpValLabel');
    if (lpSlider) {
      lpSlider.addEventListener('input', () => {
        const val = parseInt(lpSlider.value, 10);
        state.lpCutoff = val;
        if (lpValLabel) lpValLabel.textContent = val >= 19500 ? 'OFF' : (val >= 1000 ? `${(val/1000).toFixed(1)}k Hz` : `${val} Hz`);
      });
    }

    // Zoom Controls (+, -, Fit)
    const zoomLevelLabel = document.getElementById('zoomLevelLabel');
    function updateZoomUI() {
      if (zoomLevelLabel) zoomLevelLabel.textContent = `${state.zoom.toFixed(1)}x`;
      renderWaveformCanvas();
    }

    const btnZoomIn = document.getElementById('btnZoomIn');
    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', () => {
        state.zoom = Math.min(10.0, state.zoom * 1.5);
        updateZoomUI();
      });
    }

    const btnZoomOut = document.getElementById('btnZoomOut');
    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', () => {
        state.zoom = Math.max(1.0, state.zoom / 1.5);
        if (state.zoom <= 1.05) state.scrollOffset = 0;
        updateZoomUI();
      });
    }

    const btnZoomReset = document.getElementById('btnZoomReset');
    if (btnZoomReset) {
      btnZoomReset.addEventListener('click', () => {
        state.zoom = 1.0;
        state.scrollOffset = 0;
        updateZoomUI();
      });
    }

    // Audition entire loop region
    const btnPreviewLoop = document.getElementById('btnPreviewLoop');
    if (btnPreviewLoop) {
      btnPreviewLoop.addEventListener('click', () => {
        const dur = Math.max(0.1, state.rangeEnd - state.rangeStart);
        previewAudioFromTime(state.rangeStart, dur);
      });
    }

    // Waveform: Space+Drag to pan, Double-Click to add marker, Drag to set loop range or nudge markers
    const canvas = document.getElementById('chopperWaveformCanvas');
    const canvasWrapper = document.getElementById('waveformCanvasWrapper');
    let isSpaceKeyDown = false;

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (e.code === 'Space') {
        const chopperView = document.getElementById('viewChopper');
        if (chopperView && !chopperView.classList.contains('hidden')) {
          e.preventDefault();
          if (!isSpaceKeyDown) {
            isSpaceKeyDown = true;
            if (canvasWrapper) canvasWrapper.classList.add('panning');
          }
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        isSpaceKeyDown = false;
        if (canvasWrapper) canvasWrapper.classList.remove('panning');
      }
    });

    if (canvas) {
      // Mouse wheel to zoom and pan
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (!state.audioBuffer) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const timeAtMouse = canvasXToTime(mouseX, canvas.clientWidth);

        if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          // Zoom in/out centered on cursor
          const zoomFactor = e.deltaY < 0 ? 1.2 : 0.83;
          const newZoom = Math.max(1.0, Math.min(12.0, state.zoom * zoomFactor));
          state.zoom = newZoom;
          const newVisibleDur = getVisibleDuration();
          state.scrollOffset = Math.max(0, timeAtMouse - (mouseX / canvas.clientWidth) * newVisibleDur);
          updateZoomUI();
        } else {
          // Horizontal pan
          const panTime = (e.deltaX / canvas.clientWidth) * getVisibleDuration();
          state.scrollOffset += panTime;
          clampScrollOffset();
          renderWaveformCanvas();
        }
      }, { passive: false });

      // Interaction states
      let isPanning = false;
      let panStartX = 0;
      let panStartOffset = 0;

      let isDraggingRange = false;
      let dragStartTime = 0;

      let draggingSliceIdx = -1;

      // Double-click to drop a new slice marker at cursor
      canvas.addEventListener('dblclick', (e) => {
        if (!state.audioBuffer) return;
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickTime = Math.max(0, Math.min(state.audioBuffer.duration, canvasXToTime(clickX, canvas.clientWidth)));

        // Add new slice marker at this exact time
        const newSlice = {
          index: state.slices.length + 1,
          start: clickTime,
          end: Math.min(state.audioBuffer.duration, clickTime + 0.5),
          note: 36 + state.slices.length
        };
        state.slices.push(newSlice);
        state.slices.sort((a, b) => a.start - b.start);
        // Re-index & re-calculate slice ends
        state.slices.forEach((s, idx) => {
          s.index = idx + 1;
          s.note = 36 + idx;
          if (idx < state.slices.length - 1) {
            s.end = state.slices[idx + 1].start;
          } else {
            s.end = Math.max(s.start + 0.1, state.rangeEnd);
          }
        });
        renderPadsUI();
        renderWaveformCanvas();
      });

      canvas.addEventListener('mousedown', (e) => {
        if (!state.audioBuffer) return;
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickTime = canvasXToTime(clickX, canvas.clientWidth);

        if (isSpaceKeyDown || e.button === 1) {
          // Space + drag (or middle mouse): Pan waveform view
          isPanning = true;
          panStartX = e.clientX;
          panStartOffset = state.scrollOffset;
          if (canvasWrapper) canvasWrapper.classList.add('panning');
          return;
        }

        // Check if user clicked near an existing slice marker to drag it
        const hitThresholdPx = 10;
        let hitIdx = -1;
        for (let i = 0; i < state.slices.length; i++) {
          const sliceCanvasX = timeToCanvasX(state.slices[i].start, canvas.clientWidth);
          if (Math.abs(sliceCanvasX - clickX) <= hitThresholdPx) {
            hitIdx = i;
            break;
          }
        }

        if (hitIdx >= 0) {
          // Dragging slice marker
          draggingSliceIdx = hitIdx;
          state.selectedSliceIndex = hitIdx;
          renderPadsUI();
          renderWaveformCanvas();
          return;
        }

        // Regular click & drag: reposition active sample loop region (rangeStart to rangeEnd)
        isDraggingRange = true;
        dragStartTime = Math.max(0, Math.min(state.audioBuffer.duration, clickTime));
        state.rangeStart = dragStartTime;
        state.rangeEnd = Math.min(state.audioBuffer.duration, dragStartTime + 0.05);
        renderWaveformCanvas();
      });

      window.addEventListener('mousemove', (e) => {
        if (!state.audioBuffer) return;
        const rect = canvas.getBoundingClientRect();

        if (isPanning) {
          const deltaPx = e.clientX - panStartX;
          const timeDelta = (deltaPx / canvas.clientWidth) * getVisibleDuration();
          state.scrollOffset = panStartOffset - timeDelta;
          clampScrollOffset();
          renderWaveformCanvas();
          return;
        }

        if (draggingSliceIdx >= 0) {
          const currX = e.clientX - rect.left;
          const newTime = Math.max(state.rangeStart, Math.min(state.rangeEnd, canvasXToTime(currX, canvas.clientWidth)));
          state.slices[draggingSliceIdx].start = newTime;
          // Keep previous slice end updated
          if (draggingSliceIdx > 0) {
            state.slices[draggingSliceIdx - 1].end = newTime;
          }
          renderWaveformCanvas();
          return;
        }

        if (isDraggingRange) {
          const currX = e.clientX - rect.left;
          const currTime = Math.max(0, Math.min(state.audioBuffer.duration, canvasXToTime(currX, canvas.clientWidth)));
          state.rangeStart = Math.min(dragStartTime, currTime);
          state.rangeEnd = Math.max(dragStartTime, currTime);
          renderWaveformCanvas();
        }
      });

      window.addEventListener('mouseup', () => {
        if (isPanning) {
          isPanning = false;
          if (!isSpaceKeyDown && canvasWrapper) canvasWrapper.classList.remove('panning');
        }

        if (draggingSliceIdx >= 0) {
          draggingSliceIdx = -1;
          renderPadsUI();
          renderWaveformCanvas();
        }

        if (isDraggingRange) {
          isDraggingRange = false;
          if (state.rangeEnd - state.rangeStart < 0.25) {
            // Expand to minimum 2 bars if tiny click/drag
            const twoBars = (60.0 / state.bpm) * 8;
            state.rangeEnd = Math.min(state.audioBuffer.duration, state.rangeStart + twoBars);
          }
          computeSlices(state.sliceMode || 'grid_8');
        }
      });
    }

    // Authentic MPC Finger Drumming Keyboard Listeners:
    // Z X C V (Pads 1-4) • A S D F (Pads 5-8) • Q W E R (Pads 9-12) • 1 2 3 4 (Pads 13-16)
    const KEY_TO_PAD_SLOT = {
      '1': 12, '2': 13, '3': 14, '4': 15,
      'Q': 8,  'W': 9,  'E': 10, 'R': 11,
      'A': 4,  'S': 5,  'D': 6,  'F': 7,
      'Z': 0,  'X': 1,  'C': 2,  'V': 3
    };

    window.addEventListener('keydown', (e) => {
      // Don't intercept if typing in an input
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      if (e.key === 'Shift') {
        isShiftKeyDown = true;
        return;
      }

      if (e.repeat) return;

      const key = e.key.toUpperCase();
      const slot = KEY_TO_PAD_SLOT[key];
      if (slot !== undefined) {
        e.preventDefault();
        if (state.isNoteRepeat || isShiftKeyDown) {
          startPadRoll(slot);
        } else {
          triggerPadBySlot(slot);
        }
      }
    });

    // Keyup for Gated playback mode & Pad Roll release
    window.addEventListener('keyup', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      if (e.key === 'Shift') {
        isShiftKeyDown = false;
        stopPadRoll();
        return;
      }

      const key = e.key.toUpperCase();
      const slot = KEY_TO_PAD_SLOT[key];
      if (slot !== undefined) {
        stopPadRoll();
        const bankOffset = state.padBank === 'B' ? 16 : 0;
        const sliceIdx = state.is16Levels ? state.selectedSliceIndex : (slot + bankOffset);
        const slice = state.slices[sliceIdx];
        if (slice && slice.playMode === 'gate' && state.currentActiveVoice) {
          try {
            const ctx = getAudioContext();
            const curTime = ctx.currentTime;
            state.currentActiveVoice.gain.gain.cancelScheduledValues(curTime);
            state.currentActiveVoice.gain.gain.setValueAtTime(state.currentActiveVoice.gain.gain.value, curTime);
            state.currentActiveVoice.gain.gain.exponentialRampToValueAtTime(0.0001, curTime + 0.015);
            state.currentActiveVoice.source.stop(curTime + 0.02);
            state.currentActiveVoice = null;
          } catch (err) {}
        }
      }
    });

    // Populate quick-picker in empty state
    populateChopperFilePicker();
    setupChangeTrackModalEvents();
    setupFloatingWidgetEvents();
  }

  function setupFloatingWidgetEvents() {
    const playBtn = document.getElementById('btnChopperFloatingPlay');
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTransport();
      });
    }

    const returnBtn = document.getElementById('btnChopperFloatingReturn');
    if (returnBtn) {
      returnBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.switchTab) window.switchTab('chopper');
      });
    }

    const infoEl = document.getElementById('chopperFloatingInfo');
    if (infoEl) {
      infoEl.addEventListener('click', () => {
        if (window.switchTab) window.switchTab('chopper');
      });
    }
  }

  let cachedAudioFiles = [];

  function setupChangeTrackModalEvents() {
    const modal = document.getElementById('chopperChangeTrackModal');
    const btnClose = document.getElementById('btnCloseChangeTrackModal');
    const searchInput = document.getElementById('changeTrackSearchInput');

    if (btnClose) {
      btnClose.addEventListener('click', closeChangeTrackModal);
    }
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeChangeTrackModal();
      });
    }
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        renderModalFilesList(e.target.value.toLowerCase().trim());
      });
    }
  }

  function openChangeTrackModal() {
    const modal = document.getElementById('chopperChangeTrackModal');
    const searchInput = document.getElementById('changeTrackSearchInput');
    if (!modal) return;
    modal.classList.remove('hidden');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }

    fetch('/api/files')
      .then(res => res.json())
      .then(files => {
        cachedAudioFiles = files.filter(f => !f.is_video);
        renderModalFilesList('');
      })
      .catch(err => {
        console.error('Failed to load library files', err);
      });
  }

  function closeChangeTrackModal() {
    const modal = document.getElementById('chopperChangeTrackModal');
    if (modal) modal.classList.add('hidden');
  }

  function renderModalFilesList(searchTerm = '') {
    const list = document.getElementById('chopperModalFilesList');
    if (!list) return;

    const filtered = cachedAudioFiles.filter(f => {
      if (!searchTerm) return true;
      const title = (f.title || '').toLowerCase();
      const artist = (f.artist || '').toLowerCase();
      const filename = (f.filename || '').toLowerCase();
      return title.includes(searchTerm) || artist.includes(searchTerm) || filename.includes(searchTerm);
    });

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="empty-picker-prompt" style="padding: 2rem; text-align: center; color: var(--text-muted);">
          <p>${cachedAudioFiles.length === 0 ? 'No downloaded audio files yet.' : 'No matching tracks found.'}</p>
        </div>
      `;
      return;
    }

    window.currentChopperModalFiles = filtered;

    list.innerHTML = filtered.map((f, idx) => {
      const isCurrent = state.currentFilename === f.filename;
      return `
        <div class="chopper-modal-file-card ${isCurrent ? 'active-track' : ''}" onclick="window.selectChopperModalTrackByIndex(${idx})">
          <div class="file-card-icon">${isCurrent ? '▶️' : '🎵'}</div>
          <div class="file-card-body">
            <div class="file-card-title">${escapeHtml(f.title)}</div>
            <div class="file-card-sub">${escapeHtml(f.artist || 'Unknown')} • ${f.duration_str} ${f.bpm ? '• ' + f.bpm + ' BPM' : ''}</div>
          </div>
          <button type="button" class="btn-secondary" style="font-size:0.78rem;padding:0.4rem 0.75rem;">
            ${isCurrent ? 'Current' : 'Select'}
          </button>
        </div>
      `;
    }).join('');
  }

  window.selectChopperModalTrackByIndex = function(idx) {
    if (!window.currentChopperModalFiles || !window.currentChopperModalFiles[idx]) return;
    const f = window.currentChopperModalFiles[idx];
    window.selectChopperModalTrack(f.filename, f.title, f.bpm || '');
  };

  function populateChopperFilePicker() {
    const list = document.getElementById('chopperRecentFilesList');
    if (!list) return;

    fetch('/api/files')
      .then(res => res.json())
      .then(files => {
        const audioOnly = files.filter(f => !f.is_video);
        cachedAudioFiles = audioOnly;
        window.currentChopperRecentFiles = audioOnly;
        if (audioOnly.length === 0) {
          list.innerHTML = `
            <div class="empty-picker-prompt">
              <p>No audio files in your stash yet.</p>
              <button class="btn-primary" onclick="window.switchTab('youtube')">Convert a YouTube URL First</button>
            </div>
          `;
          return;
        }

        list.innerHTML = audioOnly.map((f, idx) => `
          <div class="chopper-file-card" onclick="window.loadChopperRecentTrackByIndex(${idx})">
            <div class="file-card-icon">🎵</div>
            <div class="file-card-body">
              <div class="file-card-title">${escapeHtml(f.title)}</div>
              <div class="file-card-sub">${escapeHtml(f.artist || 'Unknown')} • ${f.duration_str} ${f.bpm ? '• ' + f.bpm + ' BPM' : ''}</div>
            </div>
            <button class="btn-secondary" style="font-size:0.75rem;padding:0.35rem 0.65rem;">Load ✂️</button>
          </div>
        `).join('');
      })
      .catch(() => {});
  }

  window.loadChopperRecentTrackByIndex = function(idx) {
    if (!window.currentChopperRecentFiles || !window.currentChopperRecentFiles[idx]) return;
    const f = window.currentChopperRecentFiles[idx];
    window.loadTrackIntoChopper(f.filename, f.title, f.bpm || '');
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Expose API globally
  window.loadTrackIntoChopper = (encodedFilename, title, bpm) => {
    loadTrackIntoChopper(decodeURIComponent(encodedFilename), title, bpm);
  };
  window.selectChopperModalTrack = (encodedFilename, title, bpm) => {
    closeChangeTrackModal();
    loadTrackIntoChopper(decodeURIComponent(encodedFilename), title, bpm);
  };
  window.openChangeTrackModal = openChangeTrackModal;
  window.initChopperModule = initChopperModule;
  window.refreshChopperFilePicker = populateChopperFilePicker;
  window.updateChopperFloatingWidget = updateFloatingWidgetUI;
})();
