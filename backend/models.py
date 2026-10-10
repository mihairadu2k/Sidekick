from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class AudioFormat(str, Enum):
    # Audio formats
    MP3_320 = "320k"
    MP3_256 = "256k"
    MP3_192 = "192k"
    MP3_128 = "128k"
    FLAC = "flac"
    WAV = "wav"
    M4A = "m4a"
    # Video formats
    MP4_BEST = "mp4_best"
    MP4_1080 = "mp4_1080"
    MP4_720 = "mp4_720"
    MP4_480 = "mp4_480"
    MKV_BEST = "mkv_best"


class TaskStatus(str, Enum):
    QUEUED = "queued"
    FETCHING_INFO = "fetching_info"
    DOWNLOADING = "downloading"
    CONVERTING = "converting"
    TAGGING = "tagging"
    COMPLETED = "completed"
    ERROR = "error"
    CANCELLED = "cancelled"


class VideoInfoRequest(BaseModel):
    url: str


class PlaylistEntry(BaseModel):
    id: str
    title: str
    duration: Optional[int] = 0
    duration_str: Optional[str] = "0:00"
    uploader: Optional[str] = ""
    thumbnail: Optional[str] = ""
    url: str


class VideoInfoResponse(BaseModel):
    id: str
    url: str
    title: str
    artist: Optional[str] = ""
    uploader: Optional[str] = ""
    channel: Optional[str] = ""
    duration: Optional[int] = 0
    duration_str: Optional[str] = "0:00"
    thumbnail: Optional[str] = ""
    views: Optional[int] = 0
    is_playlist: bool = False
    playlist_count: Optional[int] = 0
    playlist_title: Optional[str] = None
    entries: Optional[List[PlaylistEntry]] = None


class DownloadRequest(BaseModel):
    url: str
    quality: AudioFormat = AudioFormat.MP3_320
    custom_title: Optional[str] = None
    custom_artist: Optional[str] = None
    embed_thumbnail: bool = True
    embed_metadata: bool = True


class PlaylistDownloadRequest(BaseModel):
    url: str
    quality: AudioFormat = AudioFormat.MP3_320
    embed_thumbnail: bool = True
    embed_metadata: bool = True
    selected_ids: Optional[List[str]] = None


class DownloadProgressUpdate(BaseModel):
    task_id: str
    status: TaskStatus
    progress: float = 0.0
    speed: Optional[str] = None
    eta: Optional[str] = None
    total_bytes_str: Optional[str] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    thumbnail: Optional[str] = None
    filename: Optional[str] = None
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    error: Optional[str] = None


class AudioFileItem(BaseModel):
    id: str
    title: str
    artist: str
    filename: str
    file_size_bytes: int
    file_size_mb: str
    duration_str: str
    format: str
    bitrate: Optional[str] = None
    download_url: str
    stream_url: str
    thumbnail_url: Optional[str] = None
    created_at: str
    is_video: bool = False
    bpm: Optional[int] = None
    key: Optional[str] = None
    camelot: Optional[str] = None
    key_display: Optional[str] = None


class SimilarTrackItem(BaseModel):
    id: str
    title: str
    artist: Optional[str] = ""
    uploader: Optional[str] = ""
    duration_str: str = "0:00"
    duration: int = 0
    thumbnail: Optional[str] = ""
    url: str
    views_str: Optional[str] = None


class SimilarTracksResponse(BaseModel):
    query: str
    tracks: List[SimilarTrackItem]
    count: int

