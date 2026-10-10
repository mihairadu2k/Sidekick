import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.crate_digger import calculate_sampleability, CRATE_GENRES, format_views


client = TestClient(app)


def test_crate_genres_endpoint():
    response = client.get("/api/crate/genres")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 12
    genre_ids = [g["id"] for g in data]
    assert "rare_groove" in genre_ids
    assert "disco" in genre_ids
    assert "hiphop" in genre_ids
    assert "japanese_jazz" in genre_ids
    assert "library_music" in genre_ids
    assert "latin_boogaloo" in genre_ids
    assert "brazilian_bossa" in genre_ids
    assert "afrobeat_groove" in genre_ids
    assert "spanish_flamenco" in genre_ids
    assert "french_pop" in genre_ids
    assert "uk_classics" in genre_ids
    assert "us_country" in genre_ids
    assert "reggae_dub" in genre_ids


def test_crate_eras_endpoint():
    response = client.get("/api/crate/eras")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    era_ids = [e["id"] for e in data]
    assert "any" in era_ids
    assert "60s" in era_ids
    assert "70s" in era_ids
    assert "80s" in era_ids
    assert "90s" in era_ids
    assert "00s" in era_ids


def test_is_creator_talk_video():
    from backend.crate_digger import is_creator_talk_video
    # Creator vlog from screenshot
    assert is_creator_talk_video(
        "Starting a Brazilian - MPB/PSYCH/FUNK Vinyl Collection!",
        "Pieces of Vinyl"
    ) is True
    # Vinyl collection review / haul
    assert is_creator_talk_video(
        "My 70s Soul Vinyl Record Collection Review",
        "Record Collector"
    ) is True
    # Tutorial / how-to
    assert is_creator_talk_video(
        "How to Dig for Vinyl in Tokyo Thrift Stores",
        "Crate Digger Vlog"
    ) is True
    # Genuine musical vinyl rip
    assert is_creator_talk_video(
        "Som Três - Spooky (1969) Brazilian Jazz Funk Vinyl Rip",
        "Samba Archivist"
    ) is False


def test_calculate_sampleability_scoring():
    # Obscure vintage vinyl track with drum break in title
    score_break, tags_break = calculate_sampleability(
        duration=180,
        views=1200,
        title="Rare Funk 45 Drum Break Solo Vinyl Rip",
        uploader="Obscure Vinyl Channel"
    )
    assert score_break >= 80
    assert "Drum Break" in tags_break or "Ultra Obscure Gem" in tags_break

    # Vocal version track (should receive penalty)
    score_vocal, tags_vocal = calculate_sampleability(
        duration=220,
        views=3500,
        title="Kozmic (Vocal Version) [1983]",
        uploader="Italo Collector"
    )
    assert score_vocal < score_break
    assert "Vocal Heavy" in tags_vocal

    # 1-hour cassette / full LP rip (should receive penalty compared to isolated 3-min single)
    score_album, tags_album = calculate_sampleability(
        duration=4800,
        views=250,
        title="Cassette Sony Metal XR 80 Maxi Vinyl 80's",
        uploader="Collector"
    )
    assert score_album < score_break
    assert "Full Cassette / LP" in tags_album

    # Mainstream viral pop video
    score_pop, tags_pop = calculate_sampleability(
        duration=250,
        views=50_000_000,
        title="Famous Pop Hit Official Video",
        uploader="Vevo"
    )
    assert score_pop < 50


def test_format_views():
    assert format_views(None) == "Unknown"
    assert format_views(450) == "450 views"
    assert format_views(4500) == "4.5K views"
    assert format_views(1200000) == "1.2M views"


def test_crate_surprise_mocked(monkeypatch):
    from backend import crate_digger

    mock_track = crate_digger.CrateTrackItem(
        id="dQw4w9WgXcQ",
        title="Obscure Soul 45",
        artist="The Lost Band",
        uploader="Vinyl Vault",
        duration=195,
        duration_str="3:15",
        thumbnail="https://example.com/thumb.jpg",
        url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        views=4200,
        views_str="4.2K views",
        sampleability_score=92,
        sample_tags=["Ultra Obscure Gem", "Drum Break Potential"],
        genre_category="Surprise Crate"
    )

    monkeypatch.setattr(crate_digger, "dig_crate_query", lambda *args, **kwargs: [mock_track])

    response = client.get("/api/crate/surprise")
    assert response.status_code == 200
    data = response.json()
    assert data["mode"] == "surprise"
    assert data["count"] == 1
    assert data["tracks"][0]["id"] == "dQw4w9WgXcQ"
    assert data["tracks"][0]["sampleability_score"] == 92


def test_crate_dig_post_endpoint(monkeypatch):
    from backend import crate_digger

    mock_track = crate_digger.CrateTrackItem(
        id="abc123xyz",
        title="Midnight Rhodes Fusion",
        artist="Tokyo Sound Trio",
        uploader="Japanese Jazz Archivist",
        duration=240,
        duration_str="4:00",
        thumbnail="https://example.com/thumb2.jpg",
        url="https://www.youtube.com/watch?v=abc123xyz",
        views=8900,
        views_str="8.9K views",
        sampleability_score=88,
        sample_tags=["Under The Radar", "Rhodes Chords"],
        genre_category="Japanese Jazz & City Pop"
    )

    monkeypatch.setattr(crate_digger, "dig_crate_query", lambda *args, **kwargs: [mock_track])

    # Test genre dig
    res_genre = client.post("/api/crate/dig", json={"genre_id": "japanese_jazz", "limit": 6})
    assert res_genre.status_code == 200
    data_genre = res_genre.json()
    assert data_genre["mode"] == "genre"
    assert len(data_genre["tracks"]) == 1

    # Test rabbit hole dig
    res_rabbit = client.post("/api/crate/dig", json={"seed_query_or_url": "Cortex Chanson", "limit": 6})
    assert res_rabbit.status_code == 200
    data_rabbit = res_rabbit.json()
    assert data_rabbit["mode"] == "rabbit_hole"
    assert len(data_rabbit["tracks"]) == 1


def test_crate_feedback_and_learning(monkeypatch, tmp_path):
    from backend import crate_digger
    
    # Use temporary file for feedback test
    test_file = tmp_path / "test_feedback.json"
    monkeypatch.setattr(crate_digger, "CRATE_FEEDBACK_FILE", test_file)
    monkeypatch.setattr(crate_digger, "_crate_feedback_data", {
        "disliked_video_ids": {},
        "disliked_channels": {},
        "negative_keywords": {},
    })

    # Submit feedback for a talking/unusable video
    res = client.post("/api/crate/feedback", json={
        "track_id": "bad_vid_99",
        "title": "Unboxing Rare 70s Soul Vinyl Haul",
        "uploader": "VinylReviewChannel",
        "reason": "talking_vlog",
        "note": "Just a talking head haul video"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["disliked_ids_count"] == 1
    assert "haul" in data["learned_negative_tokens"] or "unboxing" in data["learned_negative_tokens"]

    # Verify exact track is now blocked
    blocked, reason = crate_digger.is_feedback_disliked("bad_vid_99", "Random Title", "OtherGuy")
    assert blocked is True
    assert "previously disliked" in reason

    # Verify learned negative pattern blocks similar tracks
    blocked_pattern, reason_pat = crate_digger.is_feedback_disliked("other_vid_11", "Huge Vinyl Haul 2024", "AnotherUploader")
    assert blocked_pattern is True
    assert "learned negative pattern" in reason_pat

    # Check stats endpoint
    stats_res = client.get("/api/crate/feedback/stats")
    assert stats_res.status_code == 200
    stats_data = stats_res.json()
    assert stats_data["disliked_tracks_count"] == 1
    assert stats_data["learned_keywords_count"] >= 1

