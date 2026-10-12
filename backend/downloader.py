import os
import re
import uuid
import time
import asyncio
import logging
import shutil
from pathlib import Path
from typing import Optional, Dict, Any, Callable, Coroutine, List
import requests

import yt_dlp
import mutagen
from mutagen.easyid3 import EasyID3
from mutagen.id3 import ID3, APIC, TIT2, TPE1, TALB, TDRC, ID3NoHeaderError
from mutagen.flac import FLAC, Picture
from mutagen.mp4 import MP4, MP4Cover

from .models import (
    AudioFormat,
    TaskStatus,
    VideoInfoResponse,
    PlaylistEntry,
    DownloadProgressUpdate,
    SimilarTrackItem,
)

# Project paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BIN_DIR = PROJECT_ROOT / "bin"
if BIN_DIR.exists():
    os.environ["PATH"] = f"{BIN_DIR}:{os.environ.get('PATH', '')}"

logger = logging.getLogger("yt2mp3.downloader")

DOWNLOADS_DIR = PROJECT_ROOT / "downloads"
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)


def find_node_executable() -> Optional[str]:
    """Finds a nodejs binary on the system to solve YouTube JS signature challenges and prevent HTTP 403."""
    # 1. System PATH
    p = shutil.which("node")
    if p:
        return p
    # 2. Common NVM locations
    nvm_dir = Path.home() / ".nvm" / "versions" / "node"
    if nvm_dir.exists():
        for v in sorted(nvm_dir.iterdir(), reverse=True):
            candidate = v / "bin" / "node"
            if candidate.is_file() and os.access(candidate, os.X_OK):
                return str(candidate)
    # 3. Common brew / system paths
    for fixed in ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]:
        if os.path.isfile(fixed) and os.access(fixed, os.X_OK):
            return fixed
    return None

# Ensure node directory is in PATH
_node_path = find_node_executable()
if _node_path:
    _node_dir = str(Path(_node_path).parent)
    if _node_dir not in os.environ.get("PATH", ""):
        os.environ["PATH"] = f"{_node_dir}:{os.environ.get('PATH', '')}"


def find_cookie_file() -> Optional[str]:
    """Finds or creates a cookie file from environment variables, Render secrets, or disk."""
    # 1. Custom path via env var
    custom_path = os.environ.get("COOKIE_FILE", "").strip()
    if custom_path and Path(custom_path).is_file():
        return custom_path

    # 2. Raw cookie content passed via YOUTUBE_COOKIES env var (ideal for Render dashboard)
    cookies_env = os.environ.get("YOUTUBE_COOKIES", "").strip()
    if cookies_env:
        try:
            # Handle possible base64 encoding
            if not cookies_env.startswith("#") and len(cookies_env) > 40:
                try:
                    import base64
                    decoded = base64.b64decode(cookies_env).decode("utf-8")
                    if "# Netscape" in decoded or "\t" in decoded:
                        cookies_env = decoded
                except Exception:
                    pass
            tmp_cookie = Path("/tmp/youtube_cookies.txt")
            tmp_cookie.write_text(cookies_env, encoding="utf-8")
            return str(tmp_cookie)
        except Exception as e:
            logger.warning(f"Failed to write YOUTUBE_COOKIES to /tmp: {e}")

    # 3. Render Secret File mount
    render_secret = Path("/etc/secrets/cookies.txt")
    if render_secret.is_file():
        return str(render_secret)

    # 4. Local cookies.txt in project root or downloads
    for local_cand in [PROJECT_ROOT / "cookies.txt", DOWNLOADS_DIR / "cookies.txt"]:
        if local_cand.is_file():
            return str(local_cand)

    return None


def get_base_ydl_opts() -> dict:
    """Returns baseline yt-dlp options configured to defeat YouTube bot throttling, HTTP 403, and datacenter IP blocks."""
    opts: Dict[str, Any] = {
        'quiet': True,
        'no_warnings': True,
        'remote_components': ['ejs:github'],
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'ios', 'tv', 'web'],
            }
        },
    }
    nb = find_node_executable()
    if nb:
        opts['js_runtimes'] = {'node': {}}
    if BIN_DIR.exists():
        opts['ffmpeg_location'] = str(BIN_DIR)

    cookie_file = find_cookie_file()
    if cookie_file:
        opts['cookiefile'] = cookie_file
        logger.info(f"Using cookies file for YouTube authentication: {cookie_file}")

    return opts



def format_duration(seconds: Optional[int]) -> str:
    if not seconds or seconds < 0:
        return "0:00"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def parse_artist_title(title: str, uploader: str = "") -> tuple[str, str]:
    """Extract clean (Artist, Title) from YouTube title and uploader."""
    clean_title = title.strip()
    noise_pattern = r'[\(\[\{](?:official|audio|video|music\s*video|lyric|lyrics|hd|hq|4k|remastered|visualizer|mv|clip|live|vinyl\s*rip|full\s*album|45rpm|7"|12")[^\)\]\}]*[\)\]\}]'
    
    # Genre / label prefixes commonly found on crate rips (e.g. "SOUL-JAZZ Cavril", "[Rare Groove] ...")
    genre_prefix_re = re.compile(
        r'^(?:\[[^\]]+\]\s*|\b(?:soul[- ]jazz|jazz[- ]funk|rare[- ]groove|city[- ]pop|boogie|disco|funk|ambient|psychedelic[- ]rock|library[- ]music)\b\s*[-—:]?\s*)',
        re.IGNORECASE
    )

    # Common separators: " - ", " – ", " — ", " : ", " // "
    for sep in [" - ", " – ", " — ", " : ", " // "]:
        if sep in clean_title:
            parts = clean_title.split(sep, 1)
            artist = parts[0].strip()
            song_title = parts[1].strip()
            
            # Clean noise and genre prefixes
            artist = genre_prefix_re.sub('', artist).strip()
            artist = re.sub(noise_pattern, '', artist, flags=re.IGNORECASE).strip()
            song_title = re.sub(noise_pattern, '', song_title, flags=re.IGNORECASE).strip()
            
            if artist and song_title:
                return artist, song_title

    # Fallback: remove " - Topic" from uploader
    clean_uploader = uploader.replace(" - Topic", "").strip() if uploader else ""
    generic_uploaders = ["tunetotube", "taiko rarities", "my analog journal", "terminal passage", "rare grooves", "vinyl archeology", "vevo"]
    if any(g in clean_uploader.lower() for g in generic_uploaders):
        artist = "Unknown Artist"
    else:
        artist = clean_uploader or "Unknown Artist"

    clean_title = genre_prefix_re.sub('', clean_title).strip()
    clean_title = re.sub(noise_pattern, '', clean_title, flags=re.IGNORECASE).strip()
    return artist, clean_title


def extract_video_info(url: str) -> VideoInfoResponse:
    """Extract metadata for a YouTube URL (video or playlist) without downloading."""
    ydl_opts = get_base_ydl_opts()
    ydl_opts.update({
        'extract_flat': 'in_playlist',
        'skip_download': True,
    })
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as first_err:
        err_msg = str(first_err).lower()
        if any(w in err_msg for w in ["403", "forbidden", "bot", "sign in"]):
            logger.warning(f"Metadata challenge encountered for {url}: {err_msg[:80]}. Retrying with android client...")
            fallback_opts = dict(ydl_opts)
            fallback_opts['extractor_args'] = {'youtube': {'player_client': ['android', 'web']}}
            try:
                with yt_dlp.YoutubeDL(fallback_opts) as fydl:
                    info = fydl.extract_info(url, download=False)
            except Exception as second_err:
                logger.warning(f"Fallback 1 failed: {second_err}. Retrying with ios client...")
                fallback_opts2 = dict(ydl_opts)
                fallback_opts2['extractor_args'] = {'youtube': {'player_client': ['ios', 'web']}}
                with yt_dlp.YoutubeDL(fallback_opts2) as fydl2:
                    info = fydl2.extract_info(url, download=False)
        else:
            raise first_err
        
    if not info:
        raise ValueError("Could not extract information from the provided URL.")

    # Check if playlist
    if 'entries' in info and info['entries'] is not None:
        entries = []
        raw_entries = list(info['entries'])
        for entry in raw_entries:
            if not entry:
                continue
            entry_id = entry.get('id', '')
            entry_title = entry.get('title', 'Unknown')
            entry_dur = entry.get('duration', 0)
            entry_uploader = entry.get('uploader', entry.get('channel', ''))
            entry_thumb = entry.get('thumbnail', '')
            entry_url = entry.get('url', f"https://www.youtube.com/watch?v={entry_id}" if entry_id else '')
            entries.append(PlaylistEntry(
                id=entry_id,
                title=entry_title,
                duration=entry_dur,
                duration_str=format_duration(entry_dur),
                uploader=entry_uploader,
                thumbnail=entry_thumb,
                url=entry_url,
            ))
            
        return VideoInfoResponse(
            id=info.get('id', 'playlist'),
            url=url,
            title=info.get('title', 'YouTube Playlist'),
            artist=info.get('uploader', info.get('channel', '')),
            uploader=info.get('uploader', info.get('channel', '')),
            channel=info.get('channel', ''),
            duration=sum((e.duration or 0) for e in entries),
            duration_str=format_duration(sum((e.duration or 0) for e in entries)),
            thumbnail=entries[0].thumbnail if entries else '',
            views=info.get('view_count', 0),
            is_playlist=True,
            playlist_count=len(entries),
            playlist_title=info.get('title', 'YouTube Playlist'),
            entries=entries
        )

    # Single video
    video_id = info.get('id', '')
    title = info.get('title', 'Unknown Title')
    uploader = info.get('uploader', info.get('channel', ''))
    artist, song_title = parse_artist_title(title, uploader)
    duration = info.get('duration', 0)
    thumbnail = info.get('thumbnail', '')
    
    if 'thumbnails' in info and info['thumbnails']:
        thumbs = [t for t in info['thumbnails'] if t.get('url')]
        if thumbs:
            thumbnail = thumbs[-1]['url']

    return VideoInfoResponse(
        id=video_id,
        url=url,
        title=title,
        artist=info.get('artist') or info.get('creator') or artist,
        uploader=uploader,
        channel=info.get('channel', ''),
        duration=duration,
        duration_str=format_duration(duration),
        thumbnail=thumbnail,
        views=info.get('view_count', 0),
        is_playlist=False
    )


def embed_tags_and_cover(
    file_path: Path,
    title: str,
    artist: str,
    album: str = "",
    thumbnail_url: Optional[str] = None,
    year: Optional[str] = None
):
    """Embed ID3 / metadata tags and album art into audio file."""
    ext = file_path.suffix.lower()
    thumb_data = None
    
    if thumbnail_url:
        try:
            resp = requests.get(thumbnail_url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
            if resp.status_code == 200:
                thumb_data = resp.content
        except Exception as e:
            logger.warning(f"Failed to fetch thumbnail for embedding: {e}")

    try:
        if ext == '.mp3':
            try:
                tags = ID3(str(file_path))
            except ID3NoHeaderError:
                tags = ID3()

            tags.add(TIT2(encoding=3, text=title))
            tags.add(TPE1(encoding=3, text=artist))
            if album:
                tags.add(TALB(encoding=3, text=album))
            if year:
                tags.add(TDRC(encoding=3, text=str(year)))
            if thumb_data:
                mime_type = 'image/png' if thumbnail_url and '.png' in thumbnail_url else 'image/jpeg'
                tags.add(APIC(
                    encoding=3,
                    mime=mime_type,
                    type=3,
                    desc='Cover',
                    data=thumb_data
                ))
            tags.save(str(file_path), v2_version=3)

        elif ext == '.flac':
            audio = FLAC(str(file_path))
            audio['title'] = title
            audio['artist'] = artist
            if album:
                audio['album'] = album
            if thumb_data:
                pic = Picture()
                pic.type = 3
                pic.mime = 'image/jpeg'
                pic.desc = 'Cover'
                pic.data = thumb_data
                audio.clear_pictures()
                audio.add_picture(pic)
            audio.save()

        elif ext in ('.m4a', '.mp4'):
            audio = MP4(str(file_path))
            audio['\xa9nam'] = title
            audio['\xa9ART'] = artist
            if album:
                audio['\xa9alb'] = album
            if thumb_data:
                audio['covr'] = [
                    MP4Cover(thumb_data, imageformat=MP4Cover.FORMAT_JPEG)
                ]
            audio.save()

    except Exception as e:
        logger.error(f"Error embedding tags in {file_path}: {e}")


class DownloadManager:
    def __init__(self, downloads_dir: Path = DOWNLOADS_DIR, max_concurrent: int = 2):
        self.downloads_dir = downloads_dir
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.active_tasks: Dict[str, DownloadProgressUpdate] = {}
        self.async_tasks: Dict[str, asyncio.Task] = {}
        self.cancelled_task_ids: set[str] = set()
        self.listeners: List[Callable[[DownloadProgressUpdate], Coroutine[Any, Any, None]]] = []

    def register_listener(self, listener: Callable[[DownloadProgressUpdate], Coroutine[Any, Any, None]]):
        self.listeners.append(listener)

    def unregister_listener(self, listener: Callable[[DownloadProgressUpdate], Coroutine[Any, Any, None]]):
        if listener in self.listeners:
            self.listeners.remove(listener)

    async def _notify(self, update: DownloadProgressUpdate):
        self.active_tasks[update.task_id] = update
        dead_listeners = []
        for listener in self.listeners:
            try:
                await listener(update)
            except Exception:
                dead_listeners.append(listener)
        for dead in dead_listeners:
            if dead in self.listeners:
                self.listeners.remove(dead)

    async def start_download(
        self,
        task_id: str,
        url: str,
        quality: AudioFormat = AudioFormat.MP3_320,
        custom_title: Optional[str] = None,
        custom_artist: Optional[str] = None,
        embed_thumbnail: bool = True,
        embed_metadata: bool = True,
    ) -> DownloadProgressUpdate:
        """Enqueues asynchronous download task with concurrency control."""
        initial_update = DownloadProgressUpdate(
            task_id=task_id,
            status=TaskStatus.QUEUED,
            progress=0.0
        )
        await self._notify(initial_update)
        
        # Create and track task
        coro = self._queued_download(
            task_id=task_id,
            url=url,
            quality=quality,
            custom_title=custom_title,
            custom_artist=custom_artist,
            embed_thumbnail=embed_thumbnail,
            embed_metadata=embed_metadata,
        )
        task = asyncio.create_task(coro)
        self.async_tasks[task_id] = task
        return initial_update

    async def cancel_task(self, task_id: str) -> bool:
        """Cancels a specific active or queued task."""
        self.cancelled_task_ids.add(task_id)
        if task_id in self.async_tasks:
            task = self.async_tasks[task_id]
            task.cancel()
            self.async_tasks.pop(task_id, None)

        update = DownloadProgressUpdate(
            task_id=task_id,
            status=TaskStatus.CANCELLED,
            progress=0.0,
            error="Cancelled by user"
        )
        await self._notify(update)
        return True

    async def cancel_all(self) -> int:
        """Cancels all currently running and queued tasks."""
        count = 0
        task_ids = list(self.active_tasks.keys())
        for task_id in task_ids:
            task_obj = self.active_tasks.get(task_id)
            if task_obj and task_obj.status not in (TaskStatus.COMPLETED, TaskStatus.ERROR, TaskStatus.CANCELLED):
                await self.cancel_task(task_id)
                count += 1
        return count

    def clear_completed(self):
        """Cleans up completed, errored, and cancelled tasks from memory."""
        to_remove = [
            t_id for t_id, task in self.active_tasks.items()
            if task.status in (TaskStatus.COMPLETED, TaskStatus.ERROR, TaskStatus.CANCELLED)
        ]
        for t_id in to_remove:
            self.active_tasks.pop(t_id, None)
            self.async_tasks.pop(t_id, None)
            self.cancelled_task_ids.discard(t_id)

    async def _queued_download(
        self,
        task_id: str,
        url: str,
        quality: AudioFormat,
        custom_title: Optional[str],
        custom_artist: Optional[str],
        embed_thumbnail: bool,
        embed_metadata: bool,
    ):
        try:
            # Concurrency gate
            async with self.semaphore:
                if task_id in self.cancelled_task_ids:
                    return
                await self._execute_download(
                    task_id=task_id,
                    url=url,
                    quality=quality,
                    custom_title=custom_title,
                    custom_artist=custom_artist,
                    embed_thumbnail=embed_thumbnail,
                    embed_metadata=embed_metadata,
                )
        except asyncio.CancelledError:
            logger.info(f"Task {task_id} was cancelled.")
        except Exception as e:
            logger.exception(f"Unexpected exception in task {task_id}: {e}")
        finally:
            self.async_tasks.pop(task_id, None)

    async def _execute_download(
        self,
        task_id: str,
        url: str,
        quality: AudioFormat,
        custom_title: Optional[str],
        custom_artist: Optional[str],
        embed_thumbnail: bool,
        embed_metadata: bool,
    ):
        loop = asyncio.get_running_loop()
        
        quality_val = str(quality.value if hasattr(quality, 'value') else quality).lower()
        is_video = quality_val in {"mp4_best", "mp4_1080", "mp4_720", "mp4_480", "mkv_best"}

        if is_video:
            if quality_val == "mp4_1080":
                ydl_format = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best'
                target_ext = 'mp4'
                merge_format = 'mp4'
            elif quality_val == "mp4_720":
                ydl_format = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]/best'
                target_ext = 'mp4'
                merge_format = 'mp4'
            elif quality_val == "mp4_480":
                ydl_format = 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480]/best'
                target_ext = 'mp4'
                merge_format = 'mp4'
            elif quality_val == "mkv_best":
                ydl_format = 'bestvideo+bestaudio/best'
                target_ext = 'mkv'
                merge_format = 'mkv'
            else:  # mp4_best
                ydl_format = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best'
                target_ext = 'mp4'
                merge_format = 'mp4'

            postprocessors = []
            codec = target_ext
        else:
            format_map = {
                AudioFormat.MP3_320: ('mp3', '320'),
                AudioFormat.MP3_256: ('mp3', '256'),
                AudioFormat.MP3_192: ('mp3', '192'),
                AudioFormat.MP3_128: ('mp3', '128'),
                AudioFormat.FLAC: ('flac', '0'),
                AudioFormat.WAV: ('wav', None),
                AudioFormat.M4A: ('m4a', '256'),
            }
            codec, bit_quality = format_map.get(quality, ('mp3', '320'))
            ydl_format = 'bestaudio/best'
            target_ext = codec
            merge_format = None
            postprocessors = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': codec,
            }]
            if bit_quality:
                postprocessors[0]['preferredquality'] = bit_quality

        await self._notify(DownloadProgressUpdate(
            task_id=task_id,
            status=TaskStatus.FETCHING_INFO,
            progress=5.0,
            title=custom_title,
            artist=custom_artist
        ))

        def progress_hook(d):
            if task_id in self.cancelled_task_ids:
                raise Exception("Download cancelled by user")
            status = d.get('status')
            
            info_dict = d.get('info_dict') or {}
            live_title = custom_title or info_dict.get('title')
            live_artist = custom_artist or info_dict.get('uploader')

            if status == 'downloading':
                downloaded = d.get('downloaded_bytes', 0)
                total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
                pct = 5.0
                if total and total > 0:
                    pct = round(5.0 + (downloaded / total) * 75.0, 1)  # 5% to 80%
                
                speed_str = d.get('_speed_str', '')
                eta_str = d.get('_eta_str', '')
                total_str = d.get('_total_bytes_str') or d.get('_total_bytes_estimate_str', '')

                update = DownloadProgressUpdate(
                    task_id=task_id,
                    status=TaskStatus.DOWNLOADING,
                    progress=pct,
                    title=live_title,
                    artist=live_artist,
                    speed=speed_str,
                    eta=f"{eta_str}s" if eta_str and not eta_str.endswith('s') else eta_str,
                    total_bytes_str=total_str,
                )
                asyncio.run_coroutine_threadsafe(self._notify(update), loop)

            elif status == 'finished':
                update = DownloadProgressUpdate(
                    task_id=task_id,
                    status=TaskStatus.CONVERTING,
                    progress=85.0,
                    title=live_title,
                    artist=live_artist
                )
                asyncio.run_coroutine_threadsafe(self._notify(update), loop)

        out_template = str(self.downloads_dir / '%(title)s [%(id)s].%(ext)s')

        ydl_opts = get_base_ydl_opts()
        ydl_opts.update({
            'format': ydl_format,
            'outtmpl': out_template,
            'progress_hooks': [progress_hook],
            'ignoreerrors': False,
            'nocheckcertificate': True,
            'retries': 5,
            'fragment_retries': 10,
        })
        if postprocessors:
            ydl_opts['postprocessors'] = postprocessors
        if merge_format:
            ydl_opts['merge_output_format'] = merge_format

        try:
            if task_id in self.cancelled_task_ids:
                return

            def run_yt_dlp():
                try:
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        return ydl.extract_info(url, download=True)
                except Exception as first_err:
                    err_msg = str(first_err).lower()
                    if any(w in err_msg for w in ["403", "forbidden", "bot", "sign in"]):
                        logger.warning(f"Download challenge encountered for {url}: {err_msg[:80]}. Retrying with android client fallback...")
                        fallback_opts = dict(ydl_opts)
                        fallback_opts['extractor_args'] = {'youtube': {'player_client': ['android', 'web']}}
                        try:
                            with yt_dlp.YoutubeDL(fallback_opts) as fallback_ydl:
                                return fallback_ydl.extract_info(url, download=True)
                        except Exception as second_err:
                            logger.warning(f"Fallback 1 failed: {second_err}. Retrying with ios client fallback...")
                            fallback_opts2 = dict(ydl_opts)
                            fallback_opts2['extractor_args'] = {'youtube': {'player_client': ['ios', 'web']}}
                            try:
                                with yt_dlp.YoutubeDL(fallback_opts2) as fallback_ydl2:
                                    return fallback_ydl2.extract_info(url, download=True)
                            except Exception as third_err:
                                logger.warning(f"Fallback 2 failed: {third_err}. Retrying with tv client fallback...")
                                fallback_opts3 = dict(ydl_opts)
                                fallback_opts3['extractor_args'] = {'youtube': {'player_client': ['tv', 'web']}}
                                with yt_dlp.YoutubeDL(fallback_opts3) as fallback_ydl3:
                                    return fallback_ydl3.extract_info(url, download=True)
                    raise first_err

            info = await asyncio.to_thread(run_yt_dlp)

            if not info:
                raise ValueError("Download failed or empty video information.")

            if task_id in self.cancelled_task_ids:
                return

            video_title = info.get('title', 'Unknown')
            video_id = info.get('id', '')
            uploader = info.get('uploader', info.get('channel', ''))
            thumbnail_url = info.get('thumbnail', '')
            if 'thumbnails' in info and info['thumbnails']:
                thumbnail_url = info['thumbnails'][-1].get('url', thumbnail_url)

            parsed_artist, parsed_title = parse_artist_title(video_title, uploader)
            final_title = custom_title.strip() if custom_title and custom_title.strip() else parsed_title
            final_artist = custom_artist.strip() if custom_artist and custom_artist.strip() else parsed_artist
            
            # Robust file search in downloads dir
            final_path = None
            for candidate in sorted(self.downloads_dir.iterdir(), key=lambda f: f.stat().st_mtime, reverse=True):
                if candidate.is_file() and candidate.suffix.lower() == f".{target_ext}":
                    if video_id and video_id in candidate.name:
                        final_path = candidate
                        break

            if not final_path:
                expected_filename = f"{video_title} [{video_id}].{target_ext}"
                candidate = self.downloads_dir / expected_filename
                if candidate.exists():
                    final_path = candidate

            if not final_path:
                for candidate in sorted(self.downloads_dir.iterdir(), key=lambda f: f.stat().st_mtime, reverse=True):
                    if candidate.is_file() and video_id and video_id in candidate.name:
                        final_path = candidate
                        break

            await self._notify(DownloadProgressUpdate(
                task_id=task_id,
                status=TaskStatus.TAGGING,
                progress=92.0,
                title=final_title,
                artist=final_artist,
                thumbnail=thumbnail_url
            ))

            # Year & Album detection
            extracted_year = None
            year_match = re.search(r'[\(\[\{]((?:19|20)\d{2})[\)\]\}]', video_title)
            if year_match:
                extracted_year = year_match.group(1)
            elif info.get('release_year'):
                extracted_year = str(info.get('release_year'))
            elif info.get('upload_date') and len(str(info['upload_date'])) >= 4:
                extracted_year = str(info['upload_date'])[:4]
            final_year = extracted_year or str(time.localtime().tm_year)
            final_album = info.get('album') or "Sample Stash"

            # Embed ID3 Tags & Album Cover
            if final_path and final_path.exists() and embed_metadata:
                try:
                    await asyncio.to_thread(
                        embed_tags_and_cover,
                        file_path=final_path,
                        title=final_title,
                        artist=final_artist,
                        album=final_album,
                        thumbnail_url=thumbnail_url if embed_thumbnail else None,
                        year=final_year
                    )
                except Exception as tag_err:
                    logger.warning(f"Metadata embedding warning: {tag_err}")

            file_size = final_path.stat().st_size if final_path and final_path.exists() else 0
            filename = final_path.name if final_path else f"{final_title}.{target_ext}"

            completed_update = DownloadProgressUpdate(
                task_id=task_id,
                status=TaskStatus.COMPLETED,
                progress=100.0,
                title=final_title,
                artist=final_artist,
                thumbnail=thumbnail_url,
                filename=filename,
                file_path=str(final_path) if final_path else None,
                file_size=file_size
            )
            await self._notify(completed_update)

        except Exception as e:
            if task_id in self.cancelled_task_ids:
                logger.info(f"Task {task_id} exited due to cancellation.")
                return
            logger.exception(f"Download failed for task {task_id}")
            error_update = DownloadProgressUpdate(
                task_id=task_id,
                status=TaskStatus.ERROR,
                progress=0.0,
                error=str(e)
            )
            await self._notify(error_update)


def format_views(views: Optional[int]) -> str:
    """Format view count to compact human readable string."""
    if not views or views <= 0:
        return ""
    if views >= 1_000_000:
        return f"{views / 1_000_000:.1f}M views"
    if views >= 1_000:
        return f"{views / 1_000:.0f}K views"
    return f"{views} views"


def find_similar_tracks(query_or_url: str, title: Optional[str] = None, artist: Optional[str] = None, limit: int = 8) -> List[SimilarTrackItem]:
    """
    Finds recommended / similar songs based on YouTube URL, track title, or artist query.
    """
    clean_artist = (artist or "").strip()
    clean_title = (title or "").strip()
    original_video_id = ""

    # If URL given, extract video ID if possible
    if "youtube.com" in query_or_url or "youtu.be" in query_or_url:
        vid_match = re.search(r'(?:v=|\/)([0-9A-Za-z_-]{11}).*', query_or_url)
        if vid_match:
            original_video_id = vid_match.group(1)

        if not clean_artist or not clean_title or clean_artist == "Unknown Artist":
            try:
                info = extract_video_info(query_or_url)
                clean_artist = info.artist or info.uploader or ""
                clean_title = info.title
            except Exception:
                pass

    if clean_artist and clean_artist != "Unknown Artist" and clean_title:
        search_query = f"{clean_artist} {clean_title} songs similar radio audio"
    elif clean_artist and clean_artist != "Unknown Artist":
        search_query = f"{clean_artist} popular songs music"
    elif clean_title:
        search_query = f"{clean_title} similar tracks audio"
    else:
        search_query = f"{query_or_url} similar songs audio"

    ydl_opts = get_base_ydl_opts()
    ydl_opts.update({
        'extract_flat': True,
        'skip_download': True,
    })

    results: List[SimilarTrackItem] = []
    seen_ids = {original_video_id} if original_video_id else set()

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        search_target = f"ytsearch15:{search_query}"
        try:
            search_info = ydl.extract_info(search_target, download=False)
            if search_info and 'entries' in search_info:
                for entry in search_info['entries']:
                    if not entry:
                        continue
                    v_id = entry.get('id', '')
                    if not v_id or v_id in seen_ids:
                        continue
                    
                    duration = entry.get('duration') or 0
                    if duration > 900 or (duration == 0 and not entry.get('is_live')):
                        continue

                    seen_ids.add(v_id)
                    raw_title = entry.get('title', 'Unknown Title')
                    raw_uploader = entry.get('uploader', entry.get('channel', ''))
                    parsed_artist, parsed_title = parse_artist_title(raw_title, raw_uploader)
                    
                    thumbnail = entry.get('thumbnail') or f"https://i.ytimg.com/vi/{v_id}/hqdefault.jpg"
                    views = entry.get('view_count')

                    results.append(SimilarTrackItem(
                        id=v_id,
                        title=parsed_title,
                        artist=parsed_artist,
                        uploader=raw_uploader,
                        duration=int(duration),
                        duration_str=format_duration(duration),
                        thumbnail=thumbnail,
                        url=f"https://www.youtube.com/watch?v={v_id}",
                        views_str=format_views(views),
                    ))

                    if len(results) >= limit:
                        break
        except Exception as err:
            logger.warning(f"Similar tracks search error: {err}")

    return results

