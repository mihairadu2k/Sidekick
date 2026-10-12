import pytest
from pathlib import Path
from backend.chopper import (
    SliceItem,
    generate_midi_file,
    midi_note_to_name,
    package_chopper_zip,
)
import mido
import zipfile
import io

def test_midi_note_naming():
    assert midi_note_to_name(36) == "C1"
    assert midi_note_to_name(37) == "Cs1"
    assert midi_note_to_name(48) == "C2"

def test_generate_midi_file():
    slices = [
        SliceItem(index=1, start=0.0, end=0.5, note=36),
        SliceItem(index=2, start=0.5, end=1.0, note=37),
    ]
    # 16-step sequence: step 0 triggers slice 0, step 2 triggers slice 1, others rest
    sequence = [0, None, 1, None] + [None] * 12
    midi_bytes = generate_midi_file(bpm=128.0, slices=slices, sequence=sequence)
    
    assert len(midi_bytes) > 0
    # Read back with mido
    mid = mido.MidiFile(file=io.BytesIO(midi_bytes))
    assert len(mid.tracks) == 1
    
    note_ons = [msg for msg in mid.tracks[0] if msg.type == 'note_on']
    assert len(note_ons) == 2
    assert note_ons[0].note == 36
    assert note_ons[1].note == 37

def test_package_chopper_zip(tmp_path, monkeypatch):
    from backend import chopper
    # Create dummy source audio in tmp_path
    dummy_wav = tmp_path / "test.mp3"
    dummy_wav.write_bytes(b"DUMMY_AUDIO_DATA")
    monkeypatch.setattr(chopper, "DOWNLOADS_DIR", tmp_path)
    # Monkeypatch slice_audio_files and extract_full_selection_wav
    monkeypatch.setattr(chopper, "slice_audio_files", lambda src, sls, hp=None, lp=None: {"slice_01_C1.wav": b"RIFFWAVE"})
    monkeypatch.setattr(chopper, "extract_full_selection_wav", lambda src, st, en, hp=None, lp=None: b"MASTERLOOPWAV")

    slices = [SliceItem(index=1, start=0.0, end=0.5, note=36)]
    # Tied sequence: step 0 and 1 are both slice 0 (linked/sustained)
    sequence = [0, 0] + [None] * 14
    zip_buf = package_chopper_zip(
        "test.mp3", 126.0, slices, sequence,
        range_start=1.0, range_end=5.0, highpass_hz=200, lowpass_hz=3500
    )

    zf = zipfile.ZipFile(zip_buf)
    file_list = zf.namelist()
    assert "sequence.mid" in file_list
    assert "master_selection_loop.wav" in file_list
    assert "slices/slice_01_C1.wav" in file_list
    assert "README.txt" in file_list

def test_tied_steps_midi_duration():
    slices = [SliceItem(index=1, start=0.0, end=1.0, note=36)]
    # Step 0, 1, 2 all slice 0 (3 tied steps)
    sequence = [0, 0, 0] + [None] * 13
    midi_bytes = generate_midi_file(bpm=120.0, slices=slices, sequence=sequence)
    mid = mido.MidiFile(file=io.BytesIO(midi_bytes))
    
    note_ons = [msg for msg in mid.tracks[0] if msg.type == 'note_on']
    note_offs = [msg for msg in mid.tracks[0] if msg.type == 'note_off']
    assert len(note_ons) == 1
    assert len(note_offs) == 1
    # 3 steps = 3 * 120 ticks = 360 ticks - 10 = 350 ticks
    assert note_offs[0].time == 350

def test_extended_sequence_midi_export():
    slices = [
        SliceItem(index=1, start=0.0, end=0.5, note=36),
        SliceItem(index=2, start=0.5, end=1.0, note=37),
    ]
    # 64-step sequence (4 bars of 16 steps)
    sequence = ([0, None, 1, None] + [None] * 12) * 4
    assert len(sequence) == 64
    midi_bytes = generate_midi_file(bpm=128.0, slices=slices, sequence=sequence, pattern_bars=4)
    mid = mido.MidiFile(file=io.BytesIO(midi_bytes))
    note_ons = [msg for msg in mid.tracks[0] if msg.type == 'note_on']
    assert len(note_ons) == 8
