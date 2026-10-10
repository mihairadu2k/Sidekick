import os
import sys
import uuid
import shutil
import asyncio
import subprocess
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query, BackgroundTasks, UploadFile, File, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from mutagen.mp3 import MP3
from mutagen.flac import FLAC
from mutagen.mp4 import MP4
from mutagen.easyid3 import EasyID3

from .models import (
    VideoInfoRequest,
    VideoInfoResponse,
    DownloadRequest,
    PlaylistDownloadRequest,
    DownloadProgressUpdate,
    AudioFileItem,
    TaskStatus,
    SimilarTracksResponse,
)
from .downloader import (
    DownloadManager,
    extract_video_info,
    find_similar_tracks,
    DOWNLOADS_DIR,
    PROJECT_ROOT,
    BIN_DIR,
    format_duration,
)

from .crate_digger import (
    CRATE_GENRES,
    CRATE_ERAS,
    CrateDigRequest,
    CrateDigResponse,
    CrateFeedbackRequest,
    CrateFeedbackResponse,
    dig_by_genre,
    dig_surprise_me,
    dig_rabbit_hole,
    register_crate_feedback,
    _crate_feedback_data,
)
from .audio_analyzer import analyze_track_dsp
from .chopper import ChopperExportRequest


# Ensure local bin/ directory is in PATH
if BIN_DIR.exists():
    os.environ["PATH"] = f"{BIN_DIR}:{os.environ.get('PATH', '')}"

app = FastAPI(title="The Producer Sidekick", version="1.0.0", description="Every music hero needs a Sidekick")

# Enable CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    if request.url.path.endswith((".html", ".js", ".css")) or request.url.path == "/":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

download_manager = DownloadManager(DOWNLOADS_DIR, max_concurrent=2)

# Connected WebSocket clients
active_websockets: List[WebSocket] = []


async def broadcast_ws(update: DownloadProgressUpdate):
    disconnected = []
    payload = update.model_dump()
    for ws in list(active_websockets):
        try:
            await ws.send_json(payload)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        if ws in active_websockets:
            active_websockets.remove(ws)


# Hook download manager to WebSocket broadcaster
download_manager.register_listener(broadcast_ws)


@app.get("/api/health")
async def health_check():
    ffmpeg_path = shutil.which("ffmpeg")
    return {
        "status": "healthy",
        "ffmpeg_installed": bool(ffmpeg_path),
        "ffmpeg_path": ffmpeg_path,
        "downloads_dir": str(DOWNLOADS_DIR),
        "active_tasks_count": len(download_manager.active_tasks),
    }


@app.post("/api/info", response_model=VideoInfoResponse)
async def get_video_info(request: VideoInfoRequest):
    if not request.url or not request.url.strip():
        raise HTTPException(status_code=400, detail="YouTube URL is required.")
    
    try:
        info = await asyncio.to_thread(extract_video_info, request.url.strip())
        return info
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch video information: {str(e)}")


@app.get("/api/similar", response_model=SimilarTracksResponse)
async def get_similar_tracks(
    url: Optional[str] = Query(None),
    query: Optional[str] = Query(None),
    title: Optional[str] = Query(None),
    artist: Optional[str] = Query(None),
    limit: int = Query(8, ge=1, le=20)
):
    """
    Finds recommended and musically similar songs based on YouTube URL, track title, or artist query.
    """
    target_query = url or query or title or ""
    if not target_query.strip():
        raise HTTPException(status_code=400, detail="A search query, YouTube URL, or title is required.")
    
    loop = asyncio.get_running_loop()
    try:
        tracks = await loop.run_in_executor(None, find_similar_tracks, target_query.strip(), title, artist, limit)
        return SimilarTracksResponse(
            query=target_query.strip(),
            tracks=tracks,
            count=len(tracks)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to find similar tracks: {str(e)}")



@app.post("/api/download")
async def start_download(req: DownloadRequest):
    if not req.url or not req.url.strip():
        raise HTTPException(status_code=400, detail="YouTube URL is required.")

    task_id = str(uuid.uuid4())
    update = await download_manager.start_download(
        task_id=task_id,
        url=req.url.strip(),
        quality=req.quality,
        custom_title=req.custom_title,
        custom_artist=req.custom_artist,
        embed_thumbnail=req.embed_thumbnail,
        embed_metadata=req.embed_metadata,
    )
    return {"task_id": task_id, "status": update.status}


@app.post("/api/download-playlist")
async def start_playlist_download(req: PlaylistDownloadRequest):
    try:
        info = await asyncio.to_thread(extract_video_info, req.url.strip())
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse playlist: {str(e)}")

    if not info.is_playlist or not info.entries:
        # Fallback to single download
        task_id = str(uuid.uuid4())
        await download_manager.start_download(
            task_id=task_id,
            url=req.url.strip(),
            quality=req.quality,
            embed_thumbnail=req.embed_thumbnail,
            embed_metadata=req.embed_metadata,
        )
        return {"tasks": [task_id], "count": 1}

    task_ids = []
    selected_set = set(req.selected_ids) if req.selected_ids else None

    for entry in info.entries:
        if selected_set and entry.id not in selected_set:
            continue
        entry_url = entry.url or f"https://www.youtube.com/watch?v={entry.id}"
        t_id = str(uuid.uuid4())
        task_ids.append(t_id)
        await download_manager.start_download(
            task_id=t_id,
            url=entry_url,
            quality=req.quality,
            embed_thumbnail=req.embed_thumbnail,
            embed_metadata=req.embed_metadata,
        )

    return {"tasks": task_ids, "count": len(task_ids)}


@app.post("/api/stop-all")
async def stop_all_tasks():
    """Stops and cancels all active & queued downloads."""
    stopped_count = await download_manager.cancel_all()
    return {"status": "ok", "stopped_count": stopped_count}


@app.post("/api/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    """Cancels a specific task."""
    success = await download_manager.cancel_task(task_id)
    return {"status": "ok", "task_id": task_id, "cancelled": success}


@app.post("/api/tasks/clear-completed")
async def clear_completed_tasks():
    """Clears completed/errored/cancelled tasks from memory."""
    download_manager.clear_completed()
    return {"status": "ok"}


@app.get("/api/tasks")
async def get_tasks():
    return list(download_manager.active_tasks.values())


def get_media_duration_ffprobe(file_path: Path) -> Optional[int]:
    try:
        cmd = [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(file_path)
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=3)
        if res.returncode == 0 and res.stdout.strip():
            return int(float(res.stdout.strip()))
    except Exception:
        pass
    return None


def get_file_metadata(file_path: Path) -> dict:
    ext = file_path.suffix.lower()
    is_vid = ext in {".mp4", ".mkv", ".webm"}
    meta = {
        "title": file_path.stem,
        "artist": "Unknown Artist",
        "duration_str": "0:00",
        "bitrate": "320 kbps" if ext == ".mp3" else ("MP4 Video" if is_vid else ext[1:].upper()),
        "is_video": is_vid,
    }
    
    try:
        if ext == ".mp3":
            try:
                audio = MP3(str(file_path), ID3=EasyID3)
                meta["duration_str"] = format_duration(int(audio.info.length))
                if audio.info.bitrate:
                    meta["bitrate"] = f"{int(audio.info.bitrate / 1000)} kbps"
                if "title" in audio and audio["title"]:
                    meta["title"] = audio["title"][0]
                if "artist" in audio and audio["artist"]:
                    meta["artist"] = audio["artist"][0]
            except Exception:
                pass
        elif ext == ".flac":
            try:
                audio = FLAC(str(file_path))
                meta["duration_str"] = format_duration(int(audio.info.length))
                meta["bitrate"] = "Lossless FLAC"
                if "title" in audio and audio["title"]:
                    meta["title"] = audio["title"][0]
                if "artist" in audio and audio["artist"]:
                    meta["artist"] = audio["artist"][0]
            except Exception:
                pass
        elif ext in (".m4a", ".mp4"):
            try:
                audio = MP4(str(file_path))
                if audio.info and audio.info.length:
                    meta["duration_str"] = format_duration(int(audio.info.length))
                if ext == ".mp4":
                    meta["bitrate"] = "MP4 Video"
                elif audio.info.bitrate:
                    meta["bitrate"] = f"{int(audio.info.bitrate / 1000)} kbps"
                else:
                    meta["bitrate"] = "AAC"
                if "\xa9nam" in audio and audio["\xa9nam"]:
                    meta["title"] = audio["\xa9nam"][0]
                if "\xa9ART" in audio and audio["\xa9ART"]:
                    meta["artist"] = audio["\xa9ART"][0]
            except Exception:
                pass
        
        # If duration is still 0:00 (e.g. for video or wav), fallback to ffprobe
        if meta["duration_str"] == "0:00":
            dur = get_media_duration_ffprobe(file_path)
            if dur:
                meta["duration_str"] = format_duration(dur)

    except Exception:
        pass
        
    return meta


METADATA_CACHE_FILE = DOWNLOADS_DIR / ".metadata_cache.json"
_metadata_cache: Dict[str, Any] = {}


def load_metadata_cache():
    global _metadata_cache
    if METADATA_CACHE_FILE.exists():
        try:
            with open(METADATA_CACHE_FILE, "r", encoding="utf-8") as f:
                _metadata_cache = json.load(f)
        except Exception:
            _metadata_cache = {}


def save_metadata_cache():
    try:
        with open(METADATA_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(_metadata_cache, f, indent=2)
    except Exception:
        pass


load_metadata_cache()


def get_cached_audio_analysis(file_path: Path, stat: os.stat_result) -> Dict[str, Any]:
    """Retrieves or calculates DSP analysis (BPM, key, camelot) cached by file mtime & size."""
    # Only analyze audio files (skip video or unsupported)
    ext = file_path.suffix.lower()
    if ext not in {".mp3", ".wav", ".flac", ".m4a", ".ogg"}:
        return {"bpm": None, "key": None, "camelot": None, "key_display": None}

    cache_key = f"{file_path.name}_{stat.st_size}_{int(stat.st_mtime)}"
    if cache_key in _metadata_cache:
        return _metadata_cache[cache_key]

    # Calculate DSP analysis
    analysis = analyze_track_dsp(file_path)
    res = {
        "bpm": analysis.get("bpm"),
        "key": analysis.get("key"),
        "camelot": analysis.get("camelot"),
        "key_display": analysis.get("key_display")
    }
    _metadata_cache[cache_key] = res
    save_metadata_cache()
    return res


@app.get("/api/files", response_model=List[AudioFileItem])
async def list_files():
    valid_exts = {".mp3", ".flac", ".wav", ".m4a", ".aac", ".ogg", ".mp4", ".mkv", ".webm"}
    files = []
    
    try:
        for p in sorted(DOWNLOADS_DIR.glob("*.*"), key=lambda f: f.stat().st_mtime, reverse=True):
            if p.suffix.lower() in valid_exts and p.is_file():
                stat = p.stat()
                size_mb = f"{stat.st_size / (1024 * 1024):.1f} MB"
                meta = get_file_metadata(p)
                dsp = get_cached_audio_analysis(p, stat)
                
                files.append(AudioFileItem(
                    id=p.name,
                    title=meta["title"],
                    artist=meta["artist"],
                    filename=p.name,
                    file_size_bytes=stat.st_size,
                    file_size_mb=size_mb,
                    duration_str=meta["duration_str"],
                    format=p.suffix.lower().replace(".", "").upper(),
                    bitrate=meta["bitrate"],
                    download_url=f"/api/files/{p.name}",
                    stream_url=f"/api/stream/{p.name}",
                    created_at=str(int(stat.st_mtime)),
                    is_video=meta.get("is_video", False),
                    bpm=dsp.get("bpm"),
                    key=dsp.get("key"),
                    camelot=dsp.get("camelot"),
                    key_display=dsp.get("key_display")
                ))
    except Exception as e:
        print("Error listing files:", e)
            
    return files


@app.post("/api/analyze-track/{filename}")
async def analyze_track_endpoint(filename: str):
    """Explicitly re-runs or computes BPM and key detection for a file."""
    file_path = DOWNLOADS_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Track file not found.")

    stat = file_path.stat()
    analysis = analyze_track_dsp(file_path)
    res = {
        "bpm": analysis.get("bpm"),
        "key": analysis.get("key"),
        "camelot": analysis.get("camelot"),
        "key_display": analysis.get("key_display")
    }
    cache_key = f"{file_path.name}_{stat.st_size}_{int(stat.st_mtime)}"
    _metadata_cache[cache_key] = res
    save_metadata_cache()
    return res


@app.get("/api/files/{filename}")
async def download_file(filename: str):
    file_path = DOWNLOADS_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/octet-stream"
    )


@app.get("/api/stream/{filename}")
async def stream_audio(filename: str):
    file_path = DOWNLOADS_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    
    media_types = {
        ".mp3": "audio/mpeg",
        ".flac": "audio/flac",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".ogg": "audio/ogg",
        ".mp4": "video/mp4",
        ".mkv": "video/x-matroska",
        ".webm": "video/webm",
    }
    content_type = media_types.get(file_path.suffix.lower(), "application/octet-stream")
    return FileResponse(path=str(file_path), media_type=content_type)


@app.delete("/api/files/{filename}")
async def delete_file(filename: str):
    file_path = DOWNLOADS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found.")
    file_path.unlink()
    return {"message": "File deleted successfully"}


@app.post("/api/open-folder")
async def open_downloads_folder():
    """Opens local downloads folder in Finder on macOS."""
    try:
        if sys.platform == "darwin":
            subprocess.run(["open", str(DOWNLOADS_DIR)], check=True)
        elif sys.platform.startswith("linux"):
            subprocess.run(["xdg-open", str(DOWNLOADS_DIR)], check=True)
        elif sys.platform == "win32":
            subprocess.run(["explorer", str(DOWNLOADS_DIR)], check=True)
        return {"status": "ok", "path": str(DOWNLOADS_DIR)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not open directory: {str(e)}")


@app.websocket("/ws/progress")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.append(websocket)
    try:
        for task in list(download_manager.active_tasks.values()):
            await websocket.send_json(task.model_dump())
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in active_websockets:
            active_websockets.remove(websocket)
    except Exception:
        if websocket in active_websockets:
            active_websockets.remove(websocket)





# ==========================================
# Crate Digger & Sample Discovery Endpoints
# ==========================================

@app.get("/api/crate/genres")
async def get_crate_genres():
    """Returns the list of curated crate categories and metadata."""
    return [
        {
            "id": g.id,
            "name": g.name,
            "icon": g.icon,
            "description": g.description,
            "suggested_tags": g.suggested_tags,
        }
        for g in CRATE_GENRES.values()
    ]


@app.get("/api/crate/eras")
async def get_crate_eras():
    """Returns the list of supported eras/decades."""
    return [
        {"id": era_id, "label": info["label"]}
        for era_id, info in CRATE_ERAS.items()
    ]


@app.post("/api/crate/dig")
async def dig_crate(req: CrateDigRequest):
    """
    Primary endpoint for digging tracks to sample:
    - Genre browsing with optional era filter
    - 'Surprise Me' vault randomizer
    - Seed rabbit hole crawler
    """
    loop = asyncio.get_running_loop()
    limit = req.limit or 12
    obscurity = req.obscurity_level or "deep"
    era = req.era or "any"

    try:
        if req.seed_query_or_url:
            result = await loop.run_in_executor(
                None, dig_rabbit_hole, req.seed_query_or_url, era, limit
            )
        elif req.genre_id:
            result = await loop.run_in_executor(
                None, dig_by_genre, req.genre_id, era, limit, obscurity
            )
        else:
            result = await loop.run_in_executor(
                None, dig_surprise_me, era, limit
            )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Crate digging error: {str(e)}")


@app.get("/api/crate/surprise")
async def surprise_crate(era: Optional[str] = Query("any")):
    """Quick GET endpoint for surprise me crate dig with optional era query."""
    loop = asyncio.get_running_loop()
    try:
        return await loop.run_in_executor(None, dig_surprise_me, era, 12)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Surprise dig error: {str(e)}")


@app.post("/api/crate/feedback", response_model=CrateFeedbackResponse)
async def submit_crate_feedback(req: CrateFeedbackRequest):
    """
    Registers a bad/disliked crate suggestion, learns from title keywords and uploader,
    and updates adaptive discovery filters to prevent repeating similar videos.
    """
    try:
        return register_crate_feedback(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feedback submission error: {str(e)}")


@app.get("/api/crate/feedback/stats")
async def get_crate_feedback_stats():
    """Returns overview of learned negative filters and disliked items."""
    from .crate_digger import get_crate_feedback_data
    fb_data = get_crate_feedback_data()
    disliked_ids = fb_data.get("disliked_video_ids", {})
    disliked_ch = fb_data.get("disliked_channels", {})
    neg_kw = fb_data.get("negative_keywords", {})
    return {
        "disliked_tracks_count": len(disliked_ids),
        "disliked_channels_count": len(disliked_ch),
        "learned_keywords_count": len(neg_kw),
        "top_learned_keywords": sorted(neg_kw.items(), key=lambda x: x[1], reverse=True)[:15],
    }

@app.post("/api/chopper/export")
async def export_chopper_pack(req: "ChopperExportRequest"):
    """Generates a zip package containing sequence.mid and sliced WAVs ready for Ableton/FL."""
    from .chopper import package_chopper_zip
    loop = asyncio.get_running_loop()
    try:
        zip_buf = await loop.run_in_executor(
            None,
            package_chopper_zip,
            req.filename,
            req.bpm,
            req.slices,
            req.sequence,
            req.range_start,
            req.range_end,
            req.highpass_hz,
            req.lowpass_hz,
        )
        clean_stem = Path(req.filename).stem[:30]
        export_filename = f"sidekick_chops_{clean_stem}.zip"
        return StreamingResponse(
            zip_buf,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{export_filename}"'}
        )
    except FileNotFoundError as fe:
        raise HTTPException(status_code=404, detail=str(fe))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chopper export error: {str(e)}")


# Mount frontend static files
frontend_path = PROJECT_ROOT / "frontend"
if frontend_path.exists():
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")


