import numpy as np
from pathlib import Path
from backend.audio_analyzer import (
    estimate_bpm,
    estimate_key,
    compute_spectral_novelty,
    compute_chromagram,
    analyze_track_dsp
)


def test_estimate_bpm_synthetic():
    """Generates synthetic impulses at 120 BPM and tests BPM detection."""
    sr = 22050
    duration = 10.0  # seconds
    y = np.zeros(int(sr * duration), dtype=np.float32)

    # 120 BPM = 2 beats per second (every 0.5s)
    beat_interval = int(sr * 0.5)
    for i in range(0, len(y), beat_interval):
        # Add a short click/burst
        burst_len = min(500, len(y) - i)
        y[i:i + burst_len] = np.sin(2 * np.pi * 1000 * np.arange(burst_len) / sr)

    bpm = estimate_bpm(y, sr)
    assert bpm is not None
    # Tolerance of ±3 BPM
    assert abs(bpm - 120) <= 3


def test_estimate_key_synthetic_a_minor():
    """Generates a synthetic A-minor chord (A4=440Hz, C5=523.25Hz, E5=659.25Hz)."""
    sr = 22050
    duration = 5.0
    t = np.arange(int(sr * duration)) / sr
    
    # A minor triad tones
    chord = (
        np.sin(2 * np.pi * 440.0 * t) +
        np.sin(2 * np.pi * 523.25 * t) +
        np.sin(2 * np.pi * 659.25 * t)
    ).astype(np.float32)

    key_name, camelot = estimate_key(chord, sr)
    assert "A" in key_name
    assert "Minor" in key_name
    assert camelot == "8A"


def test_estimate_key_synthetic_c_major():
    """Generates a synthetic C-major chord (C4=261.63Hz, E4=329.63Hz, G4=392.0Hz)."""
    sr = 22050
    duration = 5.0
    t = np.arange(int(sr * duration)) / sr

    chord = (
        np.sin(2 * np.pi * 261.63 * t) +
        np.sin(2 * np.pi * 329.63 * t) +
        np.sin(2 * np.pi * 392.00 * t)
    ).astype(np.float32)

    key_name, camelot = estimate_key(chord, sr)
    assert "C" in key_name
    assert "Major" in key_name
    assert camelot == "8B"
