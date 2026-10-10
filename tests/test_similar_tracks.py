import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from backend.main import app
from backend.downloader import find_similar_tracks, format_views


def test_format_views():
    assert format_views(0) == ""
    assert format_views(None) == ""
    assert format_views(500) == "500 views"
    assert format_views(2500) == "2K views"
    assert format_views(1500000) == "1.5M views"


def test_find_similar_tracks_mocked():
    mock_entries = [
        {
            "id": "abc12345678",
            "title": "Daft Punk - One More Time (Official Audio)",
            "uploader": "Daft Punk - Topic",
            "duration": 320,
            "thumbnail": "https://example.com/thumb1.jpg",
            "view_count": 50000000
        },
        {
            "id": "def87654321",
            "title": "Justice - D.A.N.C.E.",
            "uploader": "Justice",
            "duration": 210,
            "thumbnail": "https://example.com/thumb2.jpg",
            "view_count": 12000000
        }
    ]

    with patch("yt_dlp.YoutubeDL") as mock_ydl:
        instance = MagicMock()
        instance.extract_info.return_value = {"entries": mock_entries}
        mock_ydl.return_value.__enter__.return_value = instance

        results = find_similar_tracks("https://www.youtube.com/watch?v=orig1234567", title="Around the World", artist="Daft Punk", limit=5)
        
        assert len(results) == 2
        assert results[0].id == "abc12345678"
        assert results[0].artist == "Daft Punk"
        assert results[0].duration_str == "5:20"
        assert results[0].views_str == "50.0M views"
        assert results[1].id == "def87654321"
        assert results[1].title == "D.A.N.C.E."


def test_api_similar_tracks_endpoint():
    client = TestClient(app)

    mock_entries = [
        {
            "id": "sim11111111",
            "title": "The Weeknd - Blinding Lights",
            "uploader": "The Weeknd",
            "duration": 200,
            "thumbnail": "https://example.com/thumb.jpg",
            "view_count": 100000000
        }
    ]

    with patch("yt_dlp.YoutubeDL") as mock_ydl:
        instance = MagicMock()
        instance.extract_info.return_value = {"entries": mock_entries}
        mock_ydl.return_value.__enter__.return_value = instance

        res = client.get("/api/similar?title=Starboy&artist=The%20Weeknd")
        assert res.status_code == 200
        data = res.json()
        assert data["count"] == 1
        assert len(data["tracks"]) == 1
        assert data["tracks"][0]["title"] == "Blinding Lights"
        assert data["tracks"][0]["artist"] == "The Weeknd"


def test_parse_artist_title_crate_rips():
    from backend.downloader import parse_artist_title
    
    artist, title = parse_artist_title("SOUL-JAZZ Cavril - Feeling Good / Sunny (1971)", "Taiko Rarities")
    assert artist == "Cavril"
    assert "Feeling Good / Sunny" in title

    artist, title = parse_artist_title("[Rare Groove] Cortex - Troupeau Bleu (1975)", "Vinyl Archeology")
    assert artist == "Cortex"
    assert "Troupeau Bleu" in title

    artist, title = parse_artist_title("JAZZ-FUNK Patrice Rushen - Number One (1979)", "Tunetotube.com")
    assert artist == "Patrice Rushen"
    assert "Number One" in title
