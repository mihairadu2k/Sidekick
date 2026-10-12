import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from backend.main import app
from backend.reference_analyzer import (
    build_genre_groove_archetype,
    build_sections_timeline,
    build_drum_fills,
    build_sonic_structure,
    export_reference_midi_file,
)
import mido
import io

client = TestClient(app)

def test_genre_groove_archetypes():
    # Boom Bap: 85 BPM
    bb = build_genre_groove_archetype(85.0, "Boom Bap Track")
    assert "Boom-Bap" in bb["style"]
    assert bb["grid"]["kick"][0] is True
    assert bb["grid"]["snare"][4] is True

    # House: 124 BPM
    house = build_genre_groove_archetype(124.0, "Deep House")
    assert "House" in house["style"]
    # 4 on the floor
    assert house["grid"]["kick"][0] is True
    assert house["grid"]["kick"][4] is True
    assert house["grid"]["kick"][8] is True
    assert house["grid"]["kick"][12] is True
    # Offbeat open hat
    assert house["grid"]["openHat"][2] is True

    # Drum & Bass: 174 BPM
    dnb = build_genre_groove_archetype(174.0, "Liquid DnB")
    assert "Drum & Bass" in dnb["style"]


def test_build_sections_and_fills():
    grid = build_genre_groove_archetype(120.0)["grid"]
    sections = build_sections_timeline(180.0, 120.0, grid)
    assert len(sections) >= 5
    assert sections[0]["name"] == "Intro"
    assert sections[0]["startSeconds"] == 0.0
    assert sections[-1]["name"] == "Outro"

    fills = build_drum_fills(sections, grid)
    assert len(fills) > 0
    assert fills[0]["timestamp"] != ""
    assert fills[0]["type"] in ["Snare Roll", "Tom Fill", "Kick Syncopation", "Cymbal Choke"]


def test_sonic_structure():
    sonic = build_sonic_structure("Solar Flare", 128.0, "A Minor")
    assert len(sonic["elements"]) == 7
    names = [e["name"] for e in sonic["elements"]]
    assert "Kick Drum" in names
    assert "Sub & Bassline" in names
    assert "Snare Drum / Clap" in names
    assert len(sonic["frequencyClashNotes"]) >= 2
    assert len(sonic["producerTips"]) >= 3


def test_export_reference_midi_file():
    grid = build_genre_groove_archetype(126.0)["grid"]
    midi_bytes = export_reference_midi_file(126.0, "Test Track", grid)
    assert len(midi_bytes) > 0

    # Parse with mido
    mid = mido.MidiFile(file=io.BytesIO(midi_bytes))
    assert len(mid.tracks) == 1
    track = mid.tracks[0]

    # Verify tempo & notes
    tempo_msgs = [m for m in track if m.type == 'set_tempo']
    assert len(tempo_msgs) == 1
    note_ons = [m for m in track if m.type == 'note_on' and m.velocity > 0]
    assert len(note_ons) > 0


def test_api_reference_analyze_endpoint():
    res = client.post("/api/reference/analyze", json={
        "song_title": "Summer Vibes",
        "artist": "Sidekick",
        "force_ai": False
    })
    assert res.status_code == 200
    data = res.json()
    assert data["title"] == "Summer Vibes"
    assert data["artist"] == "Sidekick"
    assert data["bpm"] > 0
    assert len(data["sections"]) >= 3
    assert "grooveGrid" in data["drumAnalysis"]
    assert len(data["drumAnalysis"]["grooveGrid"]["kick"]) == 16


def test_api_reference_export_midi_endpoint():
    grid = build_genre_groove_archetype(120.0)["grid"]
    res = client.post("/api/reference/export-midi", json={
        "bpm": 120.0,
        "title": "House Break",
        "grid": grid
    })
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/midi"
    assert len(res.content) > 100
