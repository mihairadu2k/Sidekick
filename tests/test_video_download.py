import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from backend.main import app, get_file_metadata
from backend.models import AudioFormat, DownloadRequest, AudioFileItem

client = TestClient(app)

def test_video_format_models():
    assert AudioFormat.MP4_BEST == "mp4_best"
    assert AudioFormat.MP4_1080 == "mp4_1080"
    assert AudioFormat.MP4_720 == "mp4_720"
    assert AudioFormat.MP4_480 == "mp4_480"
    assert AudioFormat.MKV_BEST == "mkv_best"

    req = DownloadRequest(url="https://www.youtube.com/watch?v=dQw4w9WgXcQ", quality=AudioFormat.MP4_BEST)
    assert req.quality == AudioFormat.MP4_BEST

def test_get_file_metadata_video(tmp_path):
    test_video = tmp_path / "sample_video.mp4"
    test_video.write_bytes(b"dummy mp4 content")

    meta = get_file_metadata(test_video)
    assert meta["is_video"] is True
    assert meta["bitrate"] == "MP4 Video"

def test_get_file_metadata_audio(tmp_path):
    test_audio = tmp_path / "sample_audio.wav"
    test_audio.write_bytes(b"dummy wav content")

    meta = get_file_metadata(test_audio)
    assert meta["is_video"] is False
    assert meta["bitrate"] == "WAV"
