import io
import os
import zipfile
import subprocess
from pathlib import Path
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import mido

from .downloader import DOWNLOADS_DIR, BIN_DIR

MIDI_BASE_NOTE = 36  # C1 in standard Ableton / General MIDI mapping
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

def midi_note_to_name(note_num: int) -> str:
    octave = (note_num // 12) - 2  # 36 is C1 in Ableton convention (octave -2)
    name = NOTE_NAMES[note_num % 12].replace("#", "s")
    return f"{name}{octave}"

class SliceItem(BaseModel):
    index: int
    start: float
    end: float
    note: Optional[int] = None

class ChopperExportRequest(BaseModel):
    filename: str
    bpm: float = 126.0
    slices: List[SliceItem]
    # Sequence of 16 or 32 step slice indices (0-indexed referring to slices list), or -1 / None for rest
    sequence: List[Optional[int]]
    pattern_bars: int = 1  # 1 bar = 16 steps, 2 bars = 32 steps
    # Option to export only selection range
    range_start: Optional[float] = None
    range_end: Optional[float] = None
    selection_only: bool = True
    # Filter options (in Hz)
    highpass_hz: Optional[float] = None  # e.g. 200 Hz to remove low-end rumble
    lowpass_hz: Optional[float] = None   # e.g. 3500 Hz to remove harsh highs

def generate_midi_file(bpm: float, slices: List[SliceItem], sequence: List[Optional[int]], pattern_bars: int = 1) -> bytes:
    """
    Generates a standard Type 0 MIDI file from the slice sequence.
    Each 16th note step = 1/4 of a quarter note (ticks_per_beat / 4).
    """
    ticks_per_beat = 480
    ticks_per_step = ticks_per_beat // 4  # 120 ticks per 1/16th note

    mid = mido.MidiFile(type=0, ticks_per_beat=ticks_per_beat)
    track = mido.MidiTrack()
    mid.tracks.append(track)

    # Set tempo
    microseconds_per_beat = mido.bpm2tempo(bpm if bpm > 20 else 126.0)
    track.append(mido.MetaMessage('set_tempo', tempo=microseconds_per_beat, time=0))
    track.append(mido.MetaMessage('track_name', name='Sidekick Chop Sequence', time=0))

    # Build note events with support for tied / linked notes
    # If sequence has consecutive identical slice_idx, we can sustain or note-on each step
    current_time_offset = 0

    step_idx = 0
    total_steps = len(sequence)

    while step_idx < total_steps:
        slice_idx = sequence[step_idx]

        if slice_idx is not None and 0 <= slice_idx < len(slices):
            target_slice = slices[slice_idx]
            note_num = target_slice.note if target_slice.note is not None else (MIDI_BASE_NOTE + slice_idx)
            velocity = 100

            # Count tied/linked steps: consecutive identical slice indices extend note duration
            tied_steps = 1
            while (step_idx + tied_steps < total_steps and sequence[step_idx + tied_steps] == slice_idx):
                tied_steps += 1

            total_duration_ticks = (ticks_per_step * tied_steps) - 10
            total_duration_ticks = max(total_duration_ticks, 10)

            # Add Note On
            track.append(mido.Message('note_on', note=note_num, velocity=velocity, time=current_time_offset))
            # Note Off after tied steps duration
            track.append(mido.Message('note_off', note=note_num, velocity=0, time=total_duration_ticks))

            current_time_offset = 10  # 10 ticks margin before next step start
            step_idx += tied_steps
        else:
            current_time_offset += ticks_per_step
            step_idx += 1

    # Flush end of track
    track.append(mido.MetaMessage('end_of_track', time=max(current_time_offset, 0)))

    buf = io.BytesIO()
    mid.save(file=buf)
    return buf.getvalue()

def slice_audio_files(
    source_path: Path,
    slices: List[SliceItem],
    highpass_hz: Optional[float] = None,
    lowpass_hz: Optional[float] = None
) -> Dict[str, bytes]:
    """
    Uses ffmpeg to slice individual audio segments into crisp .wav files,
    applying highpass / lowpass filtering if specified.
    """
    sliced_files: Dict[str, bytes] = {}
    ffmpeg_cmd = "ffmpeg"
    local_ffmpeg = BIN_DIR / "ffmpeg"
    if local_ffmpeg.exists():
        ffmpeg_cmd = str(local_ffmpeg)

    # Build audio filter string if HP/LP are specified
    audio_filters = []
    if highpass_hz and highpass_hz > 20:
        audio_filters.append(f"highpass=f={int(highpass_hz)}")
    if lowpass_hz and lowpass_hz < 20000:
        audio_filters.append(f"lowpass=f={int(lowpass_hz)}")

    filter_arg = [",".join(audio_filters)] if audio_filters else []

    for i, s in enumerate(slices):
        note_num = s.note if s.note is not None else (MIDI_BASE_NOTE + i)
        note_label = midi_note_to_name(note_num)
        out_name = f"slice_{i+1:02d}_{note_label}.wav"
        
        duration = max(s.end - s.start, 0.05)
        
        cmd = [
            ffmpeg_cmd,
            "-y",
            "-ss", f"{s.start:.4f}",
            "-t", f"{duration:.4f}",
            "-i", str(source_path)
        ]

        if filter_arg:
            cmd += ["-af", filter_arg[0]]

        cmd += [
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "44100",
            "-ac", "2",
            "-f", "wav",
            "pipe:1"
        ]
        
        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            sliced_files[out_name] = res.stdout
        except subprocess.CalledProcessError:
            continue

    return sliced_files

def extract_full_selection_wav(
    source_path: Path,
    start: float,
    end: float,
    highpass_hz: Optional[float] = None,
    lowpass_hz: Optional[float] = None
) -> Optional[bytes]:
    """Extracts the entire selected loop region as a master loop .wav file."""
    ffmpeg_cmd = "ffmpeg"
    local_ffmpeg = BIN_DIR / "ffmpeg"
    if local_ffmpeg.exists():
        ffmpeg_cmd = str(local_ffmpeg)

    duration = max(end - start, 0.1)
    audio_filters = []
    if highpass_hz and highpass_hz > 20:
        audio_filters.append(f"highpass=f={int(highpass_hz)}")
    if lowpass_hz and lowpass_hz < 20000:
        audio_filters.append(f"lowpass=f={int(lowpass_hz)}")

    cmd = [
        ffmpeg_cmd,
        "-y",
        "-ss", f"{start:.4f}",
        "-t", f"{duration:.4f}",
        "-i", str(source_path)
    ]
    if audio_filters:
        cmd += ["-af", ",".join(audio_filters)]
    cmd += [
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "44100",
        "-ac", "2",
        "-f", "wav",
        "pipe:1"
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return res.stdout
    except subprocess.CalledProcessError:
        return None

def package_chopper_zip(
    filename: str,
    bpm: float,
    slices: List[SliceItem],
    sequence: List[Optional[int]],
    range_start: Optional[float] = None,
    range_end: Optional[float] = None,
    highpass_hz: Optional[float] = None,
    lowpass_hz: Optional[float] = None
) -> io.BytesIO:
    """
    Creates a complete zip package with sequence.mid, master_selection_loop.wav,
    individual sliced WAVs, and a README.
    """
    source_file = DOWNLOADS_DIR / filename
    if not source_file.exists():
        raise FileNotFoundError(f"Source file {filename} not found.")

    # Generate MIDI with tied steps support
    midi_bytes = generate_midi_file(bpm, slices, sequence)

    # Cut audio slices
    slices_wavs = slice_audio_files(source_file, slices, highpass_hz, lowpass_hz)

    # Extract master selection loop if range given
    master_loop = None
    if range_start is not None and range_end is not None and range_end > range_start:
        master_loop = extract_full_selection_wav(source_file, range_start, range_end, highpass_hz, lowpass_hz)

    # Build Zip in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # Add MIDI
        zf.writestr("sequence.mid", midi_bytes)

        # Add full selection loop WAV
        if master_loop:
            zf.writestr("master_selection_loop.wav", master_loop)

        # Add WAV slices in a subfolder
        for slice_filename, wav_bytes in slices_wavs.items():
            zf.writestr(f"slices/{slice_filename}", wav_bytes)

        # Add README
        readme_content = f"""# Sidekick Studio — Chop & Sequence Pack
Source Track: {filename}
Project Tempo: {bpm} BPM
Total Slices: {len(slices)}
Selection Range: {range_start or 0.0:.2f}s - {range_end or 0.0:.2f}s
Filters: High-Pass {highpass_hz or 'OFF'} Hz | Low-Pass {lowpass_hz or 'OFF'} Hz

## How to use in Ableton Live:
1. Drag the 'slices/' folder onto an empty Drum Rack or Simpler.
2. Slices map chromatically starting at C1 (Pad 1).
3. Drag 'sequence.mid' into the MIDI track to instantly play the chopped pattern!

## How to use in FL Studio:
1. Load FPC or Slicex.
2. Drag the slices onto the pads.
3. Import 'sequence.mid' into the Piano Roll.

Generated with Sidekick Studio.
"""
        zf.writestr("README.txt", readme_content)

    zip_buffer.seek(0)
    return zip_buffer
