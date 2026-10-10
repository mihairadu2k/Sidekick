"""
Audio DSP Analysis Engine for BPM and Key/Scale Detection.
Pure Python + NumPy + SciPy implementation without heavy dependencies.

Features:
- Onset envelope & autocorrelation-based BPM detection
- 12-pitch chromagram extraction & Krumhansl-Schmuckler key profile matching
- Musical key names (e.g. 'C Major', 'F# Minor') and Camelot wheel notation (e.g. '8B', '11A')
- High performance: decodes a representative audio window (e.g. 60s) via ffmpeg
"""

import io
import os
import math
import shutil
import subprocess
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
import numpy as np
from scipy import signal
from scipy.io import wavfile

# Krumhansl-Schmuckler key profiles for Major and Minor keys
KRUMHANSL_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], dtype=np.float32)
KRUMHANSL_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17], dtype=np.float32)

PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Camelot Wheel Mapping: (tonic_index, is_minor) -> Camelot code
CAMELOT_MAP = {
    # Minor Keys (A)
    ("A", True): "8A",
    ("E", True): "9A",
    ("B", True): "10A",
    ("F#", True): "11A",
    ("C#", True): "12A",
    ("G#", True): "1A",
    ("D#", True): "2A",
    ("A#", True): "3A",
    ("F", True): "4A",
    ("C", True): "5A",
    ("G", True): "6A",
    ("D", True): "7A",
    # Major Keys (B)
    ("C", False): "8B",
    ("G", False): "9B",
    ("D", False): "10B",
    ("A", False): "11B",
    ("E", False): "12B",
    ("B", False): "1B",
    ("F#", False): "2B",
    ("C#", False): "3B",
    ("G#", False): "4B",
    ("D#", False): "5B",
    ("A#", False): "6B",
    ("F", False): "7B",
}


PROJECT_ROOT = Path(__file__).resolve().parent.parent
BIN_DIR = PROJECT_ROOT / "bin"


def get_ffmpeg_binary() -> Optional[str]:
    """Finds ffmpeg in PATH or project local bin/ directory."""
    ffmpeg_in_bin = BIN_DIR / "ffmpeg"
    if ffmpeg_in_bin.exists() and os.access(str(ffmpeg_in_bin), os.X_OK):
        return str(ffmpeg_in_bin)
    return shutil.which("ffmpeg")


def load_audio_segment(file_path: Path, max_duration: float = 60.0, target_sr: int = 22050) -> Tuple[np.ndarray, int]:
    """
    Decodes audio to a mono float32 numpy array at target_sr.
    To maximize speed on long files, extracts up to max_duration seconds starting around 15s in.
    """
    ffmpeg_bin = get_ffmpeg_binary()
    if not ffmpeg_bin:
        # Fallback to wavfile if it's already a wav
        if file_path.suffix.lower() == ".wav":
            sr, data = wavfile.read(str(file_path))
            if data.ndim > 1:
                data = np.mean(data, axis=1)
            data = data.astype(np.float32)
            if np.max(np.abs(data)) > 1.5:
                data = data / 32768.0
            return data[:int(max_duration * sr)], sr
        raise RuntimeError("ffmpeg is required to load compressed audio formats.")

    # Run ffmpeg to decode as 16-bit mono PCM wav pipe
    cmd = [
        ffmpeg_bin,
        "-v", "error",
        "-ss", "15",            # Skip introductory quiet/applause
        "-t", str(max_duration),
        "-i", str(file_path),
        "-f", "wav",
        "-ac", "1",
        "-ar", str(target_sr),
        "pipe:1"
    ]
    
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    wav_bytes, err = proc.communicate(timeout=15)
    
    # If 15s offset failed (e.g. file is shorter than 15s), try from start
    if proc.returncode != 0 or len(wav_bytes) < 44:
        cmd_from_start = [
            ffmpeg_bin,
            "-v", "error",
            "-t", str(max_duration),
            "-i", str(file_path),
            "-f", "wav",
            "-ac", "1",
            "-ar", str(target_sr),
            "pipe:1"
        ]
        proc2 = subprocess.Popen(cmd_from_start, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        wav_bytes, _ = proc2.communicate(timeout=15)

    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        sr, data = wavfile.read(io.BytesIO(wav_bytes))
    data = data.astype(np.float32)
    if np.max(np.abs(data)) > 1.5:
        data = data / 32768.0
    return data, sr


def compute_spectral_novelty(y: np.ndarray, sr: int, hop_length: int = 512, n_fft: int = 1024) -> Tuple[np.ndarray, float]:
    """
    Computes spectral novelty / onset flux envelope for tempo estimation.
    Returns (novelty_curve, sample_rate_of_curve).
    """
    if len(y) < n_fft:
        return np.zeros(1, dtype=np.float32), 1.0

    # STFT
    window = np.hanning(n_fft)
    _, _, zxx = signal.stft(y, fs=sr, window=window, nperseg=n_fft, noverlap=n_fft - hop_length, boundary=None)
    mag = np.abs(zxx)  # (freq_bins, time_frames)

    # Log compression: log(1 + 10 * |X|)
    log_mag = np.log1p(10.0 * mag)

    # Half-wave rectified first-order difference along time axis (spectral flux)
    diff = np.diff(log_mag, axis=1)
    flux = np.sum(np.maximum(0.0, diff), axis=0)

    # Normalize novelty curve
    if np.std(flux) > 1e-6:
        flux = (flux - np.mean(flux)) / np.std(flux)
        flux = np.maximum(0.0, flux)

    fs_flux = sr / hop_length
    return flux.astype(np.float32), fs_flux


def estimate_bpm(y: np.ndarray, sr: int, min_bpm: float = 65.0, max_bpm: float = 190.0) -> Optional[int]:
    """
    Estimates BPM using spectral flux onset envelope autocorrelation.
    """
    if len(y) < sr * 3:  # Need at least 3 seconds of audio
        return None

    flux, fs_flux = compute_spectral_novelty(y, sr)
    if len(flux) < int(fs_flux * 4):
        return None

    # Autocorrelation of flux envelope
    n = len(flux)
    flux_zero_mean = flux - np.mean(flux)
    autocorr = signal.correlate(flux_zero_mean, flux_zero_mean, mode='full')
    autocorr = autocorr[n - 1:]  # Keep non-negative lags

    # Convert BPM range to lag sample indices
    # lag = fs_flux * (60.0 / bpm)
    min_lag = int(fs_flux * (60.0 / max_bpm))
    max_lag = int(fs_flux * (60.0 / min_bpm))
    max_lag = min(max_lag, len(autocorr) - 1)

    if min_lag >= max_lag:
        return None

    # Search for peak within [min_lag, max_lag]
    search_window = autocorr[min_lag:max_lag + 1]
    peak_offset = np.argmax(search_window)
    best_lag = min_lag + peak_offset

    # Parabolic interpolation for sub-frame precision
    if 0 < peak_offset < len(search_window) - 1:
        alpha = float(search_window[peak_offset - 1])
        beta = float(search_window[peak_offset])
        gamma = float(search_window[peak_offset + 1])
        denom = (alpha - 2.0 * beta + gamma)
        if abs(denom) > 1e-7:
            delta = 0.5 * (alpha - gamma) / denom
            best_lag += delta

    raw_bpm = (60.0 * fs_flux) / best_lag

    # Standardize to typical dance/pop window [70, 160] if octaved
    while raw_bpm < 70.0:
        raw_bpm *= 2.0
    while raw_bpm > 165.0:
        raw_bpm /= 2.0

    return int(round(raw_bpm))


def compute_chromagram(y: np.ndarray, sr: int, n_fft: int = 4096, hop_length: int = 1024) -> np.ndarray:
    """
    Computes a 12-dimensional pitch class profile (chromagram) summed over time.
    """
    if len(y) < n_fft:
        return np.ones(12, dtype=np.float32) / 12.0

    window = np.hanning(n_fft)
    _, _, zxx = signal.stft(y, fs=sr, window=window, nperseg=n_fft, noverlap=n_fft - hop_length, boundary=None)
    mag = np.abs(zxx)

    freqs = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    # Pitch classes sum: ignore below 65 Hz (C2) and above 2100 Hz (C7)
    valid_mask = (freqs >= 65.0) & (freqs <= 2100.0)
    valid_freqs = freqs[valid_mask]
    valid_mag = mag[valid_mask, :]

    chroma = np.zeros(12, dtype=np.float32)

    if len(valid_freqs) == 0:
        return np.ones(12, dtype=np.float32) / 12.0

    # Map each frequency to a continuous MIDI pitch: 69 + 12*log2(f/440)
    midi_pitches = 69.0 + 12.0 * np.log2(valid_freqs / 440.0)
    pitch_classes = (np.round(midi_pitches).astype(int)) % 12

    mag_energy = np.sum(valid_mag, axis=1)

    for pc in range(12):
        mask = (pitch_classes == pc)
        if np.any(mask):
            chroma[pc] = np.sum(mag_energy[mask])

    # Normalize chromagram
    total = np.sum(chroma)
    if total > 0:
        chroma /= total
    return chroma


def estimate_key(y: np.ndarray, sr: int) -> Tuple[str, str]:
    """
    Estimates the musical scale / key and Camelot code using Krumhansl-Schmuckler correlation.
    Returns (key_name, camelot_code), e.g. ('A Minor', '8A') or ('C Major', '8B').
    """
    chroma = compute_chromagram(y, sr)

    best_score = -float('inf')
    best_key_name = "C Major"
    best_camelot = "8B"

    # Normalize profiles
    norm_major = (KRUMHANSL_MAJOR - np.mean(KRUMHANSL_MAJOR)) / np.std(KRUMHANSL_MAJOR)
    norm_minor = (KRUMHANSL_MINOR - np.mean(KRUMHANSL_MINOR)) / np.std(KRUMHANSL_MINOR)

    chroma_norm = chroma - np.mean(chroma)
    chroma_std = np.std(chroma)
    if chroma_std > 1e-7:
        chroma_norm /= chroma_std
    else:
        return "C Major", "8B"

    for i in range(12):
        # Rotate profile for tonic i
        rot_major = np.roll(norm_major, i)
        score_major = float(np.dot(chroma_norm, rot_major))
        if score_major > best_score:
            best_score = score_major
            tonic = PITCH_CLASSES[i]
            best_key_name = f"{tonic} Major"
            best_camelot = CAMELOT_MAP.get((tonic, False), "")

        rot_minor = np.roll(norm_minor, i)
        score_minor = float(np.dot(chroma_norm, rot_minor))
        if score_minor > best_score:
            best_score = score_minor
            tonic = PITCH_CLASSES[i]
            best_key_name = f"{tonic} Minor"
            best_camelot = CAMELOT_MAP.get((tonic, True), "")

    return best_key_name, best_camelot


def analyze_track_dsp(file_path: Path) -> Dict[str, Any]:
    """
    Runs both BPM and Key analysis on the given audio file.
    Returns:
    {
        "bpm": 128,
        "key": "A Minor",
        "camelot": "8A",
        "key_display": "A Minor (8A)"
    }
    """
    try:
        y, sr = load_audio_segment(file_path, max_duration=60.0, target_sr=22050)
        bpm = estimate_bpm(y, sr)
        key_name, camelot = estimate_key(y, sr)
        key_display = f"{key_name} ({camelot})" if camelot else key_name
        return {
            "bpm": bpm,
            "key": key_name,
            "camelot": camelot,
            "key_display": key_display
        }
    except Exception as e:
        return {
            "bpm": None,
            "key": None,
            "camelot": None,
            "key_display": None,
            "error": str(e)
        }
