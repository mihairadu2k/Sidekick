/**
 * Sidekick Studio — Reference & Drum Break Analyzer Module
 * Provides 16-step Web Audio sequencer (808/909/707/606/505 kits + synths),
 * arrangement section timeline, drum fills breakdown, sonic frequency/mix architecture,
 * and 1-click DAW MIDI export.
 */

(function () {
  'use strict';

  // State
  let currentAnalysis = null;
  let audioCtx = null;
  let isPlaying = false;
  let currentStep = 0;
  let stepIntervalId = null;
  let tempo = 120;
  let selectedKit = '808';
  let selectedBass = 'saw';
  let selectedLead = 'saw';
  let mutedTracks = {};
  let soloedTracks = {};
  let currentGrid = null;
  let originalGrid = null;

  // Track definitions
  const TRACK_ORDER = [
    { key: 'kick', label: 'Kick Drum', note: 'C1 / 36', color: '#f59e0b' },
    { key: 'snare', label: 'Snare / Clap', note: 'D1 / 38', color: '#f97316' },
    { key: 'hihat', label: 'Closed Hi-Hat', note: 'F#1 / 42', color: '#10b981' },
    { key: 'openHat', label: 'Open Hi-Hat', note: 'A#1 / 46', color: '#06b6d4' },
    { key: 'tom', label: 'Toms / Perc', note: 'A1 / 45', color: '#8b5cf6' },
    { key: 'bass', label: 'Synth Bass', note: 'Sub 808', color: '#ec4899' },
    { key: 'lead', label: 'Lead / Chords', note: 'Stab', color: '#eab308' },
    { key: 'vocal', label: 'Vocal Chops', note: 'Chop', color: '#a855f7' },
  ];

  // Drum Kit Profiles
  const DRUM_KITS = {
    '808': { name: 'TR-808', tag: 'Sub Boom', desc: 'Deep sub sine boom, snappy noise snare & sizzle hats' },
    '909': { name: 'TR-909', tag: 'Techno Punch', desc: 'Hard punch transient kick, dual-osc snare & ringing hats' },
    '707': { name: 'TR-707', tag: '80s Digital', desc: 'Crisp PCM acoustic digital kick, bright mid snare & dry hats' },
    '606': { name: 'TR-606', tag: 'Analog Pop', desc: 'Rubber analog pop kick, thin metallic snare & ticky hats' },
    '505': { name: 'TR-505', tag: 'Dry New Wave', desc: 'Dry 80s pop rhythm box, boxy tone snare & punchy drums' },
  };

  // Bass Presets
  const BASS_PRESETS = {
    'saw': { name: 'Saw Synth', desc: 'Raw cutting sawtooth with energetic mid-range bite' },
    'house': { name: 'House Organ', desc: 'Deep hollow square-wave organ bass for house grooves' },
    'moog': { name: 'Moog Sub', desc: 'Fat resonant analog sub with deep low-end warmth' },
  };

  // Lead Presets
  const LEAD_PRESETS = {
    'piano': { name: 'E-Piano Bell', desc: 'Warm electronic key bell tone' },
    'saw': { name: 'Saw Stabs', desc: 'Bright energetic sawtooth lead synth' },
    'square': { name: 'Square Wave', desc: 'Classic vintage square wave lead stab' },
  };

  // DOM Elements cache
  let elements = {};

  function initAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // --- Web Audio Synthesizer Engine ---
  function playKick(time, kit) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    if (kit === '808') {
      osc.frequency.setValueAtTime(160, time);
      osc.frequency.exponentialRampToValueAtTime(32, time + 0.3);
      gain.gain.setValueAtTime(1.0, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(time);
      osc.stop(time + 0.35);
    } else if (kit === '909') {
      osc.frequency.setValueAtTime(260, time);
      osc.frequency.exponentialRampToValueAtTime(48, time + 0.18);
      gain.gain.setValueAtTime(1.0, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      // Click transient
      const click = audioCtx.createOscillator();
      const clickGain = audioCtx.createGain();
      click.type = 'triangle';
      click.frequency.setValueAtTime(800, time);
      click.frequency.exponentialRampToValueAtTime(100, time + 0.02);
      clickGain.gain.setValueAtTime(0.5, time);
      clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.025);
      click.connect(clickGain);
      clickGain.connect(audioCtx.destination);
      click.start(time);
      click.stop(time + 0.025);

      osc.start(time);
      osc.stop(time + 0.22);
    } else {
      // 707 / 606 / 505
      osc.frequency.setValueAtTime(180, time);
      osc.frequency.exponentialRampToValueAtTime(45, time + 0.15);
      gain.gain.setValueAtTime(0.95, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(time);
      osc.stop(time + 0.18);
    }
  }

  function playSnare(time, kit) {
    if (!audioCtx) return;
    // Tone oscillator
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.frequency.setValueAtTime(kit === '808' ? 240 : 200, time);
    osc.frequency.exponentialRampToValueAtTime(90, time + 0.1);
    oscGain.gain.setValueAtTime(0.7, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + 0.12);

    // Noise burst
    const bufferSize = audioCtx.sampleRate * 0.2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = kit === '909' ? 1200 : 900;
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.75, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + (kit === '808' ? 0.22 : 0.18));
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    noise.start(time);
    noise.stop(time + 0.25);
  }

  function playHiHat(time, isOpen, kit) {
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * (isOpen ? 0.35 : 0.05);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = kit === '909' ? 9500 : 8000;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.45, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + (isOpen ? 0.3 : 0.05));
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    noise.start(time);
    noise.stop(time + (isOpen ? 0.35 : 0.06));
  }

  function playTom(time, kit) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(65, time + 0.22);
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  function playBass(time, preset) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();

    if (preset === 'moog') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(55, time); // A1
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(350, time);
      filter.frequency.exponentialRampToValueAtTime(100, time + 0.3);
      gain.gain.setValueAtTime(0.7, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    } else if (preset === 'house') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(65, time); // C2
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, time);
      filter.frequency.exponentialRampToValueAtTime(200, time + 0.25);
      gain.gain.setValueAtTime(0.55, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    } else {
      // Saw synth
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(55, time);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, time);
      filter.frequency.exponentialRampToValueAtTime(150, time + 0.28);
      gain.gain.setValueAtTime(0.65, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    }

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + 0.35);
  }

  function playLead(time, preset) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = preset === 'square' ? 'square' : (preset === 'piano' ? 'triangle' : 'sawtooth');
    osc.frequency.setValueAtTime(330, time); // E4
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  function playVocal(time) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, time);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, time);
    filter.Q.value = 3.0;
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + 0.15);
  }

  function triggerStepSounds(stepIndex, gridToPlay) {
    initAudioContext();
    if (!audioCtx) return;

    const hasAnySolo = Object.values(soloedTracks).some(Boolean);
    const shouldPlay = (key) => {
      if (mutedTracks[key]) return false;
      if (hasAnySolo) return !!soloedTracks[key];
      return true;
    };

    const now = audioCtx.currentTime;

    if (shouldPlay('kick') && gridToPlay.kick && gridToPlay.kick[stepIndex]) playKick(now, selectedKit);
    if (shouldPlay('snare') && gridToPlay.snare && gridToPlay.snare[stepIndex]) playSnare(now, selectedKit);
    if (shouldPlay('hihat') && gridToPlay.hihat && gridToPlay.hihat[stepIndex]) playHiHat(now, false, selectedKit);
    if (shouldPlay('openHat') && gridToPlay.openHat && gridToPlay.openHat[stepIndex]) playHiHat(now, true, selectedKit);
    if (shouldPlay('tom') && gridToPlay.tom && gridToPlay.tom[stepIndex]) playTom(now, selectedKit);
    if (shouldPlay('bass') && gridToPlay.bass && gridToPlay.bass[stepIndex]) playBass(now, selectedBass);
    if (shouldPlay('lead') && gridToPlay.lead && gridToPlay.lead[stepIndex]) playLead(now, selectedLead);
    if (shouldPlay('vocal') && gridToPlay.vocal && gridToPlay.vocal[stepIndex]) playVocal(now);
  }

  // --- Sequencer Clock Engine ---
  function startSequencer() {
    initAudioContext();
    if (isPlaying) return;
    isPlaying = true;
    updatePlayButtonUI();

    const secondsPerStep = (60 / Math.max(40, Math.min(260, tempo))) / 4;
    const msPerStep = secondsPerStep * 1000;

    stepIntervalId = setInterval(() => {
      triggerStepSounds(currentStep, currentGrid);
      highlightStepUI(currentStep);
      currentStep = (currentStep + 1) % 16;
    }, msPerStep);
  }

  function stopSequencer() {
    if (!isPlaying) return;
    isPlaying = false;
    if (stepIntervalId) {
      clearInterval(stepIntervalId);
      stepIntervalId = null;
    }
    updatePlayButtonUI();
    clearStepHighlights();
  }

  function togglePlay() {
    if (isPlaying) {
      stopSequencer();
    } else {
      startSequencer();
    }
  }

  function updatePlayButtonUI() {
    const btn = document.getElementById('btnRefPlaySequencer');
    if (!btn) return;
    if (isPlaying) {
      btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
        <span>Stop Beat</span>
      `;
      btn.classList.add('playing');
    } else {
      btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>Audition Groove</span>
      `;
      btn.classList.remove('playing');
    }
  }

  function highlightStepUI(stepIndex) {
    // Step header indicators
    document.querySelectorAll('.ref-step-indicator').forEach((el, idx) => {
      if (idx === stepIndex) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    // Step cell glow
    document.querySelectorAll('.ref-grid-cell').forEach((el) => {
      const step = parseInt(el.dataset.step, 10);
      if (step === stepIndex) {
        el.classList.add('step-current');
      } else {
        el.classList.remove('step-current');
      }
    });
  }

  function clearStepHighlights() {
    document.querySelectorAll('.ref-step-indicator').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.ref-grid-cell').forEach((el) => el.classList.remove('step-current'));
    currentStep = 0;
  }

  // --- Grid & UI Rendering ---
  function renderSequencerGrid() {
    const gridContainer = document.getElementById('refSequencerRows');
    if (!gridContainer || !currentGrid) return;

    let html = '';

    TRACK_ORDER.forEach((track) => {
      const isMuted = !!mutedTracks[track.key];
      const isSolo = !!soloedTracks[track.key];
      const rowData = currentGrid[track.key] || Array(16).fill(false);

      html += `
        <div class="ref-track-row ${isMuted ? 'muted' : ''} ${isSolo ? 'soloed' : ''}" data-track="${track.key}">
          <div class="ref-track-header">
            <div class="ref-track-color-pill" style="background: ${track.color};"></div>
            <div class="ref-track-meta">
              <span class="ref-track-name">${escapeHtml(track.label)}</span>
              <span class="ref-track-note">${track.note}</span>
            </div>
            <div class="ref-track-actions">
              <button type="button" class="ref-btn-ms ${isMuted ? 'active' : ''}" data-action="mute" data-track="${track.key}" title="Mute track">M</button>
              <button type="button" class="ref-btn-ms ${isSolo ? 'active' : ''}" data-action="solo" data-track="${track.key}" title="Solo track">S</button>
            </div>
          </div>
          <div class="ref-steps-cells">
      `;

      for (let s = 0; s < 16; s++) {
        const isActive = !!rowData[s];
        const isDownbeat = s % 4 === 0;
        html += `
          <button type="button" 
            class="ref-grid-cell ${isActive ? 'active' : ''} ${isDownbeat ? 'downbeat' : ''}"
            data-track="${track.key}"
            data-step="${s}"
            style="${isActive ? `background: ${track.color}; box-shadow: 0 0 10px ${track.color}44;` : ''}"
            title="${track.label} — Step ${s + 1}"
          ></button>
        `;
      }

      html += `
          </div>
        </div>
      `;
    });

    gridContainer.innerHTML = html;

    // Attach cell toggle clicks
    gridContainer.querySelectorAll('.ref-grid-cell').forEach((cell) => {
      cell.addEventListener('click', () => {
        const trackKey = cell.dataset.track;
        const step = parseInt(cell.dataset.step, 10);
        if (!currentGrid[trackKey]) currentGrid[trackKey] = Array(16).fill(false);
        currentGrid[trackKey][step] = !currentGrid[trackKey][step];
        renderSequencerGrid();
        // Play click sample preview
        if (currentGrid[trackKey][step]) {
          triggerStepSounds(step, currentGrid);
        }
      });
    });

    // Attach Mute / Solo clicks
    gridContainer.querySelectorAll('.ref-btn-ms').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const trackKey = btn.dataset.track;
        if (action === 'mute') {
          mutedTracks[trackKey] = !mutedTracks[trackKey];
        } else if (action === 'solo') {
          soloedTracks[trackKey] = !soloedTracks[trackKey];
        }
        renderSequencerGrid();
      });
    });
  }

  // --- Arrangement Section Timeline ---
  function renderSectionsTimeline(sections) {
    const container = document.getElementById('refSectionsTimeline');
    if (!container || !sections) return;

    let html = '';
    const totalBars = sections.reduce((acc, s) => acc + (s.bars || 8), 0);

    sections.forEach((sec, idx) => {
      const widthPct = Math.max(12, Math.round(((sec.bars || 8) / totalBars) * 100));
      html += `
        <div class="ref-section-block" style="flex: ${widthPct}; border-top: 3px solid ${sec.color || '#f59e0b'};" data-sec-idx="${idx}">
          <div class="ref-sec-top">
            <span class="ref-sec-badge" style="color: ${sec.color || '#f59e0b'};">${escapeHtml(sec.name)}</span>
            <span class="ref-sec-bars">${sec.bars} bars</span>
          </div>
          <div class="ref-sec-time">${sec.startTime} → ${sec.endTime}</div>
          <div class="ref-sec-energy">
            <div class="ref-energy-bar" style="width: ${(sec.energy || 5) * 10}%; background: ${sec.color || '#f59e0b'};"></div>
          </div>
          <div class="ref-sec-actions">
            <button type="button" class="btn-xs btn-sec-load" data-sec-idx="${idx}" title="Load this section's drum pattern into the sequencer">Load Grid</button>
            <button type="button" class="btn-xs btn-sec-seek" data-sec-start="${sec.startSeconds}" title="Jump to this section in the track player">Seek</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Attach Load Grid & Seek actions
    container.querySelectorAll('.btn-sec-load').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.secIdx, 10);
        const sec = sections[idx];
        if (sec && sec.patternGrid) {
          currentGrid = JSON.parse(JSON.stringify(sec.patternGrid));
          renderSequencerGrid();
          showNotification(`Loaded "${sec.name}" drum pattern into sequencer!`);
        }
      });
    });

    container.querySelectorAll('.btn-sec-seek').forEach((btn) => {
      btn.addEventListener('click', () => {
        const startSec = parseFloat(btn.dataset.secStart);
        const audioEl = document.getElementById('nativeAudioElement');
        if (audioEl) {
          audioEl.currentTime = startSec;
          if (audioEl.paused) audioEl.play();
        }
      });
    });
  }

  // --- Drum Fills Rendering ---
  function renderDrumFills(fills) {
    const container = document.getElementById('refFillsList');
    if (!container || !fills || fills.length === 0) {
      if (container) container.innerHTML = `<p class="empty-state-text">No notable drum fills detected.</p>`;
      return;
    }

    let html = '';
    fills.forEach((fill, idx) => {
      html += `
        <div class="ref-fill-card" data-fill-idx="${idx}">
          <div class="ref-fill-header">
            <span class="ref-fill-time">${fill.timestamp}</span>
            <span class="ref-fill-type">${escapeHtml(fill.type)}</span>
          </div>
          <p class="ref-fill-desc">${escapeHtml(fill.description)}</p>
          <div class="ref-fill-actions">
            <button type="button" class="btn-secondary btn-xs btn-audition-fill" data-fill-idx="${idx}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              <span>Audition Fill</span>
            </button>
            <button type="button" class="btn-secondary btn-xs btn-load-fill" data-fill-idx="${idx}">Load to Grid</button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.btn-audition-fill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.fillIdx, 10);
        const fill = fills[idx];
        if (fill && fill.fillGrid) {
          auditionFillPattern(fill.fillGrid);
        }
      });
    });

    container.querySelectorAll('.btn-load-fill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.fillIdx, 10);
        const fill = fills[idx];
        if (fill && fill.fillGrid) {
          currentGrid = JSON.parse(JSON.stringify(fill.fillGrid));
          renderSequencerGrid();
          showNotification(`Loaded fill pattern (${fill.type}) into sequencer!`);
        }
      });
    });
  }

  function auditionFillPattern(fillGrid) {
    initAudioContext();
    if (!audioCtx) return;
    const stepDur = (60 / Math.max(40, tempo)) / 4;
    for (let s = 0; s < 16; s++) {
      const stepTime = audioCtx.currentTime + s * stepDur;
      setTimeout(() => {
        triggerStepSounds(s, fillGrid);
      }, s * stepDur * 1000);
    }
  }

  // --- Sonic Spectrum & Mix Architecture ---
  function renderSonicStructure(sonic) {
    const container = document.getElementById('refSonicElementsList');
    if (!container || !sonic || !sonic.elements) return;

    let html = '';
    sonic.elements.forEach((elem) => {
      const freq = elem.frequencyRange || { minHz: 50, maxHz: 200, bandName: 'Mid' };
      const spatial = elem.spatialPosition || { pan: 0, widthPercent: 0, stereoType: 'Mono Mid' };
      const vol = elem.volumePercentage || 85;

      html += `
        <div class="ref-sonic-card">
          <div class="ref-sonic-card-head">
            <div class="ref-sonic-name-group">
              <span class="ref-sonic-role-tag">${escapeHtml(elem.mixRole || 'Element')}</span>
              <h4>${escapeHtml(elem.name)}</h4>
            </div>
            <div class="ref-sonic-band-pill">${freq.bandName} (${freq.minHz}Hz - ${freq.maxHz}Hz)</div>
          </div>

          <div class="ref-sonic-meters-grid">
            <div class="ref-meter-col">
              <span class="ref-meter-lbl">Stereo Field: ${spatial.stereoType} (${spatial.widthPercent}%)</span>
              <div class="ref-pan-display">
                <span class="pan-l">L</span>
                <div class="pan-track">
                  <div class="pan-thumb" style="left: ${50 + (spatial.pan || 0) / 2}%;"></div>
                </div>
                <span class="pan-r">R</span>
              </div>
            </div>

            <div class="ref-meter-col">
              <span class="ref-meter-lbl">Mix Level: ${elem.volumeDb || 0} dB</span>
              <div class="ref-vu-bar-track">
                <div class="ref-vu-bar-fill" style="width: ${vol}%;"></div>
              </div>
            </div>
          </div>

          <p class="ref-sonic-pocket-note">${escapeHtml(elem.frequencyPocketNote || '')}</p>
        </div>
      `;
    });

    container.innerHTML = html;

    // Render Clashes & Stereo Advice
    const adviceEl = document.getElementById('refStereoAdviceText');
    if (adviceEl) adviceEl.textContent = sonic.stereoFieldAdvice || 'Clean mono low-end with wide side elements.';

    const clashesContainer = document.getElementById('refClashesList');
    if (clashesContainer && sonic.frequencyClashNotes) {
      clashesContainer.innerHTML = sonic.frequencyClashNotes
        .map((c) => `<li><span class="clash-bullet">⚠</span> <span>${escapeHtml(c)}</span></li>`)
        .join('');
    }

    const tipsContainer = document.getElementById('refProducerTipsList');
    if (tipsContainer && currentAnalysis.producerTips) {
      tipsContainer.innerHTML = currentAnalysis.producerTips
        .map((tip) => `<li><span class="tip-bullet">✦</span> <span>${escapeHtml(tip)}</span></li>`)
        .join('');
    }
  }

  // --- Display Full Analysis ---
  function displayAnalysis(analysis) {
    currentAnalysis = analysis;
    tempo = analysis.bpm || 120;
    currentGrid = JSON.parse(JSON.stringify(analysis.drumAnalysis.grooveGrid));
    originalGrid = JSON.parse(JSON.stringify(analysis.drumAnalysis.grooveGrid));

    // Overview Header & Cards
    const titleEl = document.getElementById('refTrackTitle');
    const artistEl = document.getElementById('refTrackArtist');
    const bpmEl = document.getElementById('refBpmValue');
    const keyEl = document.getElementById('refKeyValue');
    const timeSigEl = document.getElementById('refTimeSigValue');
    const energyEl = document.getElementById('refEnergyValue');
    const grooveEl = document.getElementById('refGrooveStyle');
    const engineBadge = document.getElementById('refEngineBadge');
    const tempoSlider = document.getElementById('refTempoSlider');
    const tempoDisplay = document.getElementById('refTempoDisplay');

    if (titleEl) titleEl.textContent = analysis.title || 'Untitled Track';
    if (artistEl) artistEl.textContent = analysis.artist || 'Unknown Artist';
    if (bpmEl) bpmEl.textContent = `${analysis.bpm} BPM`;
    if (keyEl) keyEl.textContent = `${analysis.key} (${analysis.camelot || ''})`;
    if (timeSigEl) timeSigEl.textContent = analysis.timeSignature || '4/4';
    if (energyEl) energyEl.textContent = analysis.energyLevel || 'Medium';
    if (grooveEl) grooveEl.textContent = analysis.grooveStyle || 'Groove';

    if (engineBadge) {
      if (analysis.engineUsed === 'gemini_ai') {
        engineBadge.textContent = 'Deep AI Analysis';
        engineBadge.className = 'status-pill ready ai';
      } else {
        engineBadge.textContent = 'Local DSP Engine';
        engineBadge.className = 'status-pill ready dsp';
      }
    }

    if (tempoSlider) tempoSlider.value = tempo;
    if (tempoDisplay) tempoDisplay.textContent = `${tempo} BPM`;

    // Rhythm Relationships
    const rr = analysis.drumAnalysis.rhythmRelationships || {};
    const bassKickEl = document.getElementById('refBassKickInterlock');
    const vocalEl = document.getElementById('refVocalAlignment');
    const leadEl = document.getElementById('refLeadCounterpoint');
    const pocketEl = document.getElementById('refPocketNote');

    if (bassKickEl) bassKickEl.textContent = rr.bassKickInterlock || 'Bass and kick interlock tightly.';
    if (vocalEl) vocalEl.textContent = rr.vocalBeatAlignment || 'Vocal phrases align with downbeat.';
    if (leadEl) leadEl.textContent = rr.leadRhythmicCounterpoint || 'Counterpoint rhythm balances the pocket.';
    if (pocketEl) pocketEl.textContent = rr.pocketFeelNote || 'Groove locked in the pocket.';

    // Render Subcomponents
    renderSequencerGrid();
    renderSectionsTimeline(analysis.sections);
    renderDrumFills(analysis.drumAnalysis.fills);
    renderSonicStructure(analysis.sonicStructure);

    // Unhide the analysis content
    const emptyState = document.getElementById('refEmptyState');
    const contentArea = document.getElementById('refContentArea');
    if (emptyState) emptyState.classList.add('hidden');
    if (contentArea) contentArea.classList.remove('hidden');
  }

  // --- API Calls ---
  async function analyzeTrack(params) {
    const loadingOverlay = document.getElementById('refLoadingOverlay');
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');

    try {
      const res = await fetch('/api/reference/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Analysis request failed');
      }

      const data = await res.json();
      displayAnalysis(data);
    } catch (e) {
      console.error('[Reference] Analysis error:', e);
      alert(`Could not analyze reference: ${e.message}`);
    } finally {
      if (loadingOverlay) loadingOverlay.classList.add('hidden');
    }
  }

  async function exportMidi() {
    if (!currentGrid) return;
    try {
      const payload = {
        bpm: tempo,
        title: currentAnalysis ? currentAnalysis.title : 'Drum Pattern',
        grid: currentGrid,
      };

      const res = await fetch('/api/reference/export-midi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('MIDI export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = (currentAnalysis ? currentAnalysis.title : 'pattern')
        .replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `${safeTitle}_${tempo}BPM.mid`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      showNotification('MIDI file downloaded to your system! Drag & drop directly into your DAW.');
    } catch (e) {
      alert(`MIDI Export error: ${e.message}`);
    }
  }

  // --- Track Picker Dropdown ---
  function populateTrackPicker() {
    const select = document.getElementById('refTrackSelect');
    if (!select || !window.getDownloadedFiles) return;

    const files = window.getDownloadedFiles();
    select.innerHTML = '<option value="">-- Choose a downloaded track --</option>';
    files.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f.filename;
      opt.textContent = `${f.title || f.filename} (${f.bpm ? f.bpm + ' BPM' : 'Ready'})`;
      select.appendChild(opt);
    });
  }

  // Helper notification toast
  function showNotification(msg) {
    const toast = document.createElement('div');
    toast.className = 'ref-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }, 2800);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // --- Public API & Global Integration ---
  window.loadTrackIntoReference = function (trackInfo) {
    // Switch to reference tab
    if (window.switchTab) window.switchTab('reference');

    // Trigger analysis
    if (trackInfo.filename) {
      analyzeTrack({ file_name: trackInfo.filename, force_ai: false });
    } else if (trackInfo.youtube_url) {
      analyzeTrack({
        youtube_url: trackInfo.youtube_url,
        song_title: trackInfo.title,
        artist: trackInfo.artist,
        force_ai: false,
      });
    } else if (trackInfo.title) {
      analyzeTrack({
        song_title: trackInfo.title,
        artist: trackInfo.artist,
        force_ai: false,
      });
    }
  };

  // --- Event Listeners Setup ---
  function setupReferenceListeners() {
    // Track picker analyze
    const btnAnalyzePicked = document.getElementById('btnRefAnalyzePicked');
    if (btnAnalyzePicked) {
      btnAnalyzePicked.addEventListener('click', () => {
        const select = document.getElementById('refTrackSelect');
        const filename = select ? select.value : '';
        if (!filename) {
          alert('Please pick a track from your library first.');
          return;
        }
        analyzeTrack({ file_name: filename, force_ai: false });
      });
    }

    // YouTube URL analyze
    const btnAnalyzeUrl = document.getElementById('btnRefAnalyzeUrl');
    if (btnAnalyzeUrl) {
      btnAnalyzeUrl.addEventListener('click', () => {
        const input = document.getElementById('refYoutubeUrlInput');
        const url = input ? input.value.trim() : '';
        if (!url) {
          alert('Please paste a YouTube URL or song query.');
          return;
        }
        analyzeTrack({ youtube_url: url, force_ai: false });
      });
    }

    // Deep AI re-analyze toggle
    const btnDeepAi = document.getElementById('btnRefDeepAiAnalyze');
    if (btnDeepAi) {
      btnDeepAi.addEventListener('click', () => {
        if (!currentAnalysis) return;
        analyzeTrack({
          song_title: currentAnalysis.title,
          artist: currentAnalysis.artist,
          force_ai: true,
        });
      });
    }

    // Sequencer Play / Stop
    const btnPlaySeq = document.getElementById('btnRefPlaySequencer');
    if (btnPlaySeq) {
      btnPlaySeq.addEventListener('click', togglePlay);
    }

    // Reset pattern
    const btnResetSeq = document.getElementById('btnRefResetSequencer');
    if (btnResetSeq) {
      btnResetSeq.addEventListener('click', () => {
        if (originalGrid) {
          currentGrid = JSON.parse(JSON.stringify(originalGrid));
          renderSequencerGrid();
          showNotification('Pattern reset to reference transcription.');
        }
      });
    }

    // Clear pattern
    const btnClearSeq = document.getElementById('btnRefClearSequencer');
    if (btnClearSeq) {
      btnClearSeq.addEventListener('click', () => {
        if (currentGrid) {
          Object.keys(currentGrid).forEach((k) => {
            currentGrid[k] = Array(16).fill(false);
          });
          renderSequencerGrid();
          showNotification('Cleared all steps.');
        }
      });
    }

    // Tempo Slider
    const tempoSlider = document.getElementById('refTempoSlider');
    const tempoDisplay = document.getElementById('refTempoDisplay');
    if (tempoSlider) {
      tempoSlider.addEventListener('input', (e) => {
        tempo = parseInt(e.target.value, 10);
        if (tempoDisplay) tempoDisplay.textContent = `${tempo} BPM`;
        if (isPlaying) {
          stopSequencer();
          startSequencer();
        }
      });
    }

    // Drum Kit selector
    const kitSelect = document.getElementById('refDrumKitSelect');
    if (kitSelect) {
      kitSelect.addEventListener('change', (e) => {
        selectedKit = e.target.value;
      });
    }

    // Bass preset selector
    const bassSelect = document.getElementById('refBassPresetSelect');
    if (bassSelect) {
      bassSelect.addEventListener('change', (e) => {
        selectedBass = e.target.value;
      });
    }

    // MIDI Export
    const btnExportMidi = document.getElementById('btnRefExportMidi');
    if (btnExportMidi) {
      btnExportMidi.addEventListener('click', exportMidi);
    }
  }

  // Expose initialization hook
  window.initReferenceModule = function () {
    setupReferenceListeners();
    populateTrackPicker();
  };

  // Re-populate when library updates
  window.addEventListener('library-updated', populateTrackPicker);
})();
