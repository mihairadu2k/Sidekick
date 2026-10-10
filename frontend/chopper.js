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

    // Slices: [ { start: number, end: number, note: number } ]
    slices: [],
    selectedSliceIndex: 0,

    // Gate length factor (0.1 to 1.0)
    gate: 1.0,

    // Filter EQ (High-Pass and Low-Pass)
    hpCutoff: 20,    // 20 Hz (effectively bypassed)
    lpCutoff: 20000, // 20 kHz (effectively bypassed)

    // Step Sequencer: 16 steps, each holds slice index (0..15) or null
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

  const NOTE_LABELS = ['C1', 'C#1', 'D1', 'D#1', 'E1', 'F1', 'F#1', 'G1', 'G#1', 'A1', 'A#1', 'B1', 'C2', 'C#2', 'D2', 'D#2'];

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

    // Draw slice markers within range
    state.slices.forEach((s, idx) => {
      const sliceX = timeToCanvasX(s.start, width);
      if (sliceX >= 0 && sliceX <= width) {
        ctx.strokeStyle = idx === state.selectedSliceIndex ? '#38bdf8' : 'rgba(56, 189, 248, 0.65)';
        ctx.lineWidth = idx === state.selectedSliceIndex ? 2.5 : 1.5;
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.moveTo(sliceX, 0);
        ctx.lineTo(sliceX, height);
        ctx.stroke();
        ctx.setLineDash([]);

        // Slice badge on top
        ctx.fillStyle = idx === state.selectedSliceIndex ? '#0284c7' : 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(sliceX - 12, 4, 24, 16);
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(NOTE_LABELS[idx] || `${idx + 1}`, sliceX, 16);
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
    state.slices = [];

    if (mode.startsWith('grid')) {
      const parts = mode === 'grid_4' ? 4 : (mode === 'grid_8' ? 8 : 16);
      const sliceLen = totalSpan / parts;
      for (let i = 0; i < parts; i++) {
        state.slices.push({
          index: i + 1,
          start: start + (i * sliceLen),
          end: start + ((i + 1) * sliceLen),
          note: 36 + i
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
        state.slices.push({
          index: i + 1,
          start: sTime,
          end: Math.min(eTime, end),
          note: 36 + i
        });
      }
    }

    renderPadsUI();
    renderWaveformCanvas();
  }

  // --- Voice Playback (Choke group / Monophonic Sampler) ---
  function playSlice(sliceIndex, when = 0, durationOverride = null) {
    if (!state.audioBuffer || sliceIndex < 0 || sliceIndex >= state.slices.length) return;
    const ctx = getAudioContext();
    const slice = state.slices[sliceIndex];

    // Choke existing voice
    if (state.currentActiveVoice) {
      try {
        state.currentActiveVoice.gain.gain.setValueAtTime(state.currentActiveVoice.gain.gain.value, ctx.currentTime);
        state.currentActiveVoice.gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.005);
        state.currentActiveVoice.source.stop(ctx.currentTime + 0.006);
      } catch (e) {}
      state.currentActiveVoice = null;
    }

    const source = ctx.createBufferSource();
    source.buffer = state.audioBuffer;

    // Filters: High-pass and Low-pass
    const hpFilter = ctx.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.setValueAtTime(Math.max(20, state.hpCutoff), when > 0 ? when : ctx.currentTime);

    const lpFilter = ctx.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.setValueAtTime(Math.min(20000, state.lpCutoff), when > 0 ? when : ctx.currentTime);

    const gainNode = ctx.createGain();
    const targetGain = state.sliceVolume;
    const startTime = when > 0 ? when : ctx.currentTime;
    
    // Calculate duration: if sequence tied steps gave durationOverride, use it, else slice span * gate factor
    const rawDuration = durationOverride !== null ? durationOverride : Math.max(0.05, slice.end - slice.start);
    const gatedDuration = Math.max(0.03, rawDuration * Math.min(1.0, Math.max(0.1, state.gate)));

    // Apply envelope: clean attack and fade-out at gated duration
    gainNode.gain.setValueAtTime(targetGain, startTime);
    const fadeOutStart = Math.max(startTime + 0.01, startTime + gatedDuration - 0.015);
    gainNode.gain.setValueAtTime(targetGain, fadeOutStart);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + gatedDuration);

    // Audio node chain: source -> hpFilter -> lpFilter -> gainNode -> destination
    source.connect(hpFilter);
    hpFilter.connect(lpFilter);
    lpFilter.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start(startTime, slice.start, gatedDuration);

    state.currentActiveVoice = { source, gain: gainNode };
    highlightPad(sliceIndex);
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

  function highlightPad(idx) {
    const pad = document.querySelector(`.chopper-pad[data-slice-index="${idx}"]`);
    if (pad) {
      pad.classList.add('active-trigger');
      setTimeout(() => pad.classList.remove('active-trigger'), 120);
    }
  }

  // --- Sequencer & Clock ---
  function scheduleNextStep() {
    const ctx = getAudioContext();
    const secondsPerBeat = 60.0 / state.bpm;
    const stepDuration = secondsPerBeat / 4.0; // 1/16th note

    while (state.nextStepTime < ctx.currentTime + 0.1) {
      const step = state.currentStep;
      const scheduledTime = state.nextStepTime;

      // 1. Play drums for this step
      if (!state.drumMute) {
        const pat = GENRE_PATTERNS[state.genre] || GENRE_PATTERNS.house;
        if (pat.kick[step]) playSynthKick(ctx, scheduledTime, state.kit, state.drumVolume);
        if (pat.snare[step]) playSynthSnare(ctx, scheduledTime, state.kit, state.drumVolume);
        if (pat.openHat && pat.openHat[step]) {
          playSynthHiHat(ctx, scheduledTime, state.kit, true, state.drumVolume);
        } else if (pat.hat[step]) {
          playSynthHiHat(ctx, scheduledTime, state.kit, false, state.drumVolume);
        }
      }

      // 2. Play sample slice for this step
      const sliceIdx = state.sequence[step];
      if (sliceIdx !== null && sliceIdx !== undefined && sliceIdx >= 0) {
        // Check if this step is a continuation/tied from the previous step
        const prevStep = (step + 15) % 16;
        const isTiedContinuation = (state.sequence[prevStep] === sliceIdx && step !== 0);

        if (!isTiedContinuation) {
          // Count how many consecutive steps share this identical slice (tied sequence)
          let tiedCount = 1;
          for (let s = 1; s < 16 - step; s++) {
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

      state.currentStep = (state.currentStep + 1) % 16;
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
      state.nextStepTime = ctx.currentTime + 0.05;
      updateTransportUI();
      scheduleNextStep();
    }
  }

  function updateTransportUI() {
    const btn = document.getElementById('btnChopperPlay');
    if (!btn) return;
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

  function updateSequencerPlayhead(stepIndex) {
    document.querySelectorAll('.seq-step-btn').forEach((btn, idx) => {
      btn.classList.toggle('step-active-playhead', idx === stepIndex);
    });
  }

  // --- UI Builders ---
  function renderPadsUI() {
    const container = document.getElementById('chopperPadsGrid');
    if (!container) return;

    if (state.slices.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:1rem;">No slices yet. Set a range and click "Slice" above!</div>';
      return;
    }

    container.innerHTML = state.slices.map((s, idx) => {
      const keyName = NOTE_LABELS[idx] || `S${idx + 1}`;
      return `
        <button class="chopper-pad ${idx === state.selectedSliceIndex ? 'selected' : ''}" data-slice-index="${idx}" title="Audition Pad ${idx + 1} (${keyName})">
          <div class="pad-number">${idx + 1}</div>
          <div class="pad-note">${keyName}</div>
          <div class="pad-duration">${(s.end - s.start).toFixed(2)}s</div>
        </button>
      `;
    }).join('');

    container.querySelectorAll('.chopper-pad').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-slice-index'), 10);
        state.selectedSliceIndex = idx;
        renderPadsUI();
        renderWaveformCanvas();
        playSlice(idx);
      });
    });
  }

  function renderSequencerUI() {
    const container = document.getElementById('chopperSequencerGrid');
    if (!container) return;

    container.innerHTML = state.sequence.map((sliceIdx, stepIdx) => {
      const hasNote = sliceIdx !== null && sliceIdx !== undefined;
      const noteLabel = hasNote ? (NOTE_LABELS[sliceIdx] || `${sliceIdx + 1}`) : '—';
      const isDownbeat = stepIdx % 4 === 0;

      // Check if this step is tied to the previous step
      const prevSlice = stepIdx > 0 ? state.sequence[stepIdx - 1] : null;
      const nextSlice = stepIdx < 15 ? state.sequence[stepIdx + 1] : null;
      const isTiedFromPrev = hasNote && prevSlice === sliceIdx;
      const isTiedToNext = hasNote && nextSlice === sliceIdx;

      return `
        <div class="seq-step-wrapper ${isTiedFromPrev ? 'is-tied-left' : ''} ${isTiedToNext ? 'is-tied-right' : ''}">
          <button class="seq-step-btn ${hasNote ? 'has-slice' : ''} ${isDownbeat ? 'downbeat' : ''} ${isTiedFromPrev ? 'tied-step' : ''}" 
                  data-step="${stepIdx}" 
                  title="Step ${stepIdx + 1}: ${hasNote ? 'Slice ' + (sliceIdx + 1) : 'Rest'}\n• Click: Cycle slice\n• Alt/Option-Click: Link to previous step (sustain)\n• Right-click: Rest">
            <span class="step-num">${stepIdx + 1}</span>
            <span class="step-slice-label">${isTiedFromPrev ? '🔗 TIE' : noteLabel}</span>
          </button>
          ${hasNote && stepIdx < 15 ? `
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
        </div>
      `;
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
      const payload = {
        filename: state.currentFilename,
        bpm: state.bpm,
        slices: state.slices,
        sequence: state.sequence,
        pattern_bars: 1,
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

    // Slice Mode Buttons
    document.querySelectorAll('.slice-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.slice-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.getAttribute('data-mode');
        computeSlices(mode);
      });
    });

    // Preset Sequence buttons (Straight, Skip, Offbeat, Fill)
    const btnSeqStraight = document.getElementById('btnSeqStraight');
    if (btnSeqStraight) {
      btnSeqStraight.addEventListener('click', () => {
        state.sequence = [0, null, 1, null, 2, null, 3, null, 4, null, 5, null, 6, null, 7, null];
        renderSequencerUI();
      });
    }
    const btnSeqFour = document.getElementById('btnSeqFour');
    if (btnSeqFour) {
      btnSeqFour.addEventListener('click', () => {
        state.sequence = [0, 0, 1, 1, 2, 2, 3, 3, 0, 0, 1, 1, 2, 2, 3, 3];
        renderSequencerUI();
      });
    }
    const btnSeqClear = document.getElementById('btnSeqClear');
    if (btnSeqClear) {
      btnSeqClear.addEventListener('click', () => {
        state.sequence = Array(16).fill(null);
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

    // Waveform click to preview audio & shift-drag to set range
    const canvas = document.getElementById('chopperWaveformCanvas');
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

      // Click to preview / drag to reposition range
      let isDraggingRange = false;
      let dragStartTime = 0;

      canvas.addEventListener('mousedown', (e) => {
        if (!state.audioBuffer) return;
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickTime = Math.max(0, Math.min(state.audioBuffer.duration, canvasXToTime(clickX, canvas.clientWidth)));

        if (e.shiftKey) {
          // Shift + drag: redefine sample range
          isDraggingRange = true;
          dragStartTime = clickTime;
          state.rangeStart = clickTime;
          state.rangeEnd = Math.min(state.audioBuffer.duration, clickTime + 0.1);
          renderWaveformCanvas();
        } else {
          // Plain click: immediately preview audio from clicked point!
          previewAudioFromTime(clickTime, 3.5);
        }
      });

      canvas.addEventListener('mousemove', (e) => {
        if (isDraggingRange && state.audioBuffer) {
          const rect = canvas.getBoundingClientRect();
          const currX = e.clientX - rect.left;
          const currTime = Math.max(0, Math.min(state.audioBuffer.duration, canvasXToTime(currX, canvas.clientWidth)));
          state.rangeStart = Math.min(dragStartTime, currTime);
          state.rangeEnd = Math.max(dragStartTime, currTime);
          renderWaveformCanvas();
        }
      });

      window.addEventListener('mouseup', () => {
        if (isDraggingRange) {
          isDraggingRange = false;
          if (state.rangeEnd - state.rangeStart < 0.2) {
            // Expand to minimum 2 bars if tiny drag
            const twoBars = (60.0 / state.bpm) * 8;
            state.rangeEnd = Math.min(state.audioBuffer.duration, state.rangeStart + twoBars);
          }
          computeSlices('grid_8');
        }
      });
    }

    // Keyboard pad triggers (1-8 and Q-I)
    window.addEventListener('keydown', (e) => {
      // Don't intercept if typing in an input
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      const key = e.key.toUpperCase();
      const keyMap = {
        '1': 0, '2': 1, '3': 2, '4': 3,
        '5': 4, '6': 5, '7': 6, '8': 7,
        'Q': 8, 'W': 9, 'E': 10, 'R': 11,
        'T': 12, 'Y': 13, 'U': 14, 'I': 15
      };

      if (keyMap[key] !== undefined && keyMap[key] < state.slices.length) {
        playSlice(keyMap[key]);
      } else if (e.code === 'Space') {
        const chopperView = document.getElementById('viewChopper');
        if (chopperView && !chopperView.classList.contains('hidden')) {
          e.preventDefault();
          toggleTransport();
        }
      }
    });

    // Populate quick-picker in empty state
    populateChopperFilePicker();
  }

  function populateChopperFilePicker() {
    const list = document.getElementById('chopperRecentFilesList');
    if (!list) return;

    fetch('/api/files')
      .then(res => res.json())
      .then(files => {
        const audioOnly = files.filter(f => !f.is_video);
        if (audioOnly.length === 0) {
          list.innerHTML = `
            <div class="empty-picker-prompt">
              <p>No audio files in your stash yet.</p>
              <button class="btn-primary" onclick="window.switchTab('youtube')">Convert a YouTube URL First</button>
            </div>
          `;
          return;
        }

        list.innerHTML = audioOnly.map(f => `
          <div class="chopper-file-card" onclick="window.loadTrackIntoChopper('${encodeURIComponent(f.filename)}', '${escapeHtml(f.title).replace(/'/g, "\\'")}', '${f.bpm || ''}')">
            <div class="file-card-icon">🎵</div>
            <div class="file-card-body">
              <div class="file-card-title">${escapeHtml(f.title)}</div>
              <div class="file-card-sub">${escapeHtml(f.artist || 'Unknown')} • ${f.duration_str} ${f.bpm ? '• ⚡ ' + f.bpm + ' BPM' : ''}</div>
            </div>
            <button class="btn-secondary" style="font-size:0.75rem;padding:0.35rem 0.65rem;">Load ✂️</button>
          </div>
        `).join('');
      })
      .catch(() => {});
  }

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
  window.initChopperModule = initChopperModule;
  window.refreshChopperFilePicker = populateChopperFilePicker;
})();
