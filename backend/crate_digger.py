"""
Crate Digger & Sample Discovery Engine
Specialized discovery system for finding rare, obscure, and high-potential sample material on YouTube:
- Curated vintage genre digging queries (Funk, Soul, Japanese Jazz, Library Music, Psych, Ambient, Soviet Groove)
- "Surprise Me" holy grail crate randomizer
- "Dig Deeper / Sample Rabbit Hole" crawler for finding obscure musical cousins to a seed track or URL
- Sampleability heuristic scoring (Obscurity, Length sweet spot, Channel provenance, Aesthetic tags)
"""

import json
import time
from pathlib import Path
import random
import re
import urllib.parse
from typing import List, Optional, Dict, Any, Set
from pydantic import BaseModel
import yt_dlp

from .downloader import parse_artist_title, format_duration, DOWNLOADS_DIR


class CrateGenre(BaseModel):
    id: str
    name: str
    icon: str
    description: str
    search_queries: List[str]
    suggested_tags: List[str]


class CrateTrackItem(BaseModel):
    id: str
    title: str
    artist: str
    uploader: str
    duration: int
    duration_str: str
    thumbnail: str
    url: str
    views: Optional[int] = None
    views_str: Optional[str] = "Unknown"
    sampleability_score: int
    sample_tags: List[str]
    genre_category: Optional[str] = None
    preview_url: Optional[str] = None


class CrateDigRequest(BaseModel):
    genre_id: Optional[str] = None
    seed_query_or_url: Optional[str] = None
    era: Optional[str] = None  # 'any', '60s', '70s', '80s', '90s', '00s'
    obscurity_level: Optional[str] = "deep"  # 'deep' (<50k views priority), 'moderate', 'any'
    limit: Optional[int] = 12


class CrateFeedbackRequest(BaseModel):
    track_id: str
    title: Optional[str] = ""
    artist: Optional[str] = ""
    uploader: Optional[str] = ""
    reason: Optional[str] = "not_sampleable"  # 'talking_vlog', 'not_sampleable', 'poor_quality', 'modern_pop', 'other'
    note: Optional[str] = ""


class CrateFeedbackResponse(BaseModel):
    status: str
    message: str
    disliked_ids_count: int
    learned_negative_tokens: List[str]


class CrateDigResponse(BaseModel):
    mode: str
    headline: str
    category: Optional[str] = None
    era: Optional[str] = None
    tracks: List[CrateTrackItem]
    count: int


CRATE_ERAS: Dict[str, Dict[str, str]] = {
    "any": {"label": "All Eras", "search_token": ""},
    "60s": {"label": "1960s", "search_token": "1960s 60s vintage"},
    "70s": {"label": "1970s", "search_token": "1970s 70s analog"},
    "80s": {"label": "1980s", "search_token": "1980s 80s vintage"},
    "90s": {"label": "1990s", "search_token": "1990s 90s classic"},
    "00s": {"label": "2000s", "search_token": "2000s 00s retro"},
}


# Curated Crate Genres with tuned digging search tokens
CRATE_GENRES: Dict[str, CrateGenre] = {
    "rare_groove": CrateGenre(
        id="rare_groove",
        name="Rare Groove & Soul/Funk",
        icon="🥁",
        description="Deep funk 45s, rare soul breaks, blaxploitation OST, sweet soul harmony",
        search_queries=[
            "rare groove 45rpm vinyl rip funk soul",
            "obscure funk breakbeat vinyl",
            "rare soul 45s private press instrumental",
            "sweet soul obscure vinyl rip",
            "deep funk 45 break vinyl transfer",
        ],
        suggested_tags=["Drum Break", "Raw Funk", "Soulful Vocals", "Vintage Brass"]
    ),
    "disco": CrateGenre(
        id="disco",
        name="Vintage Disco & Boogie",
        icon="🪩",
        description="Obscure 12\" disco singles, post-disco boogie, italo disco, soulful garage grooves",
        search_queries=[
            "obscure 12 inch disco vinyl rip rare",
            "rare boogie 80s disco funk vinyl",
            "italo disco obscure 12 inch vinyl rip",
            "rare underground disco 12 inch extended",
            "deep boogie funk vinyl rip instrumental",
        ],
        suggested_tags=["Four-On-The-Floor", "Slap Bass", "Lush Strings", "Boogie Synth"]
    ),
    "hiphop": CrateGenre(
        id="hiphop",
        name="Underground & Golden Era Hip Hop",
        icon="🎤",
        description="Boom bap sample foundations, 90s underground 12\" white labels, dusty drum breaks",
        search_queries=[
            "underground hip hop 90s vinyl rip 12 inch",
            "boom bap sample source dusty vinyl rip",
            "golden era hip hop instrumental rare b-side",
            "rare 90s hip hop 12 inch vinyl white label",
            "random rap obscure 12 inch 90s vinyl",
        ],
        suggested_tags=["Dusty Drums", "Boom Bap", "SP-1200 Vibe", "Chopped Motif"]
    ),
    "japanese_jazz": CrateGenre(
        id="japanese_jazz",
        name="Japanese Jazz & City Pop",
        icon="🌸",
        description="Japanese fusion, Three Blind Mice jazz, funky city pop, Rhodes grooves",
        search_queries=[
            "japanese jazz fusion vinyl rip",
            "japanese obscure city pop vinyl b-side",
            "three blind mice jazz vinyl rip",
            "japanese ambient jazz vinyl",
            "japanese jazz funk rhodes electric piano",
        ],
        suggested_tags=["Rhodes Chords", "Melodic Chops", "Clean Basslines", "Warm Fusion"]
    ),
    "library_music": CrateGenre(
        id="library_music",
        name="Vintage Library Music & OSTs",
        icon="📼",
        description="KPM, Bruton, Chappell, Italian Giallo crime themes, obscure television cues",
        search_queries=[
            "library music KPM vinyl rip",
            "italian giallo soundtrack vinyl rip",
            "bruton music library vinyl rip synth",
            "obscure crime OST library groove",
            "chappell music library vintage cue",
        ],
        suggested_tags=["Cinematic Motif", "Tense Bass", "Dark Melodies", "Dramedy Horns"]
    ),
    "latin_boogaloo": CrateGenre(
        id="latin_boogaloo",
        name="Latin Boogaloo, Salsa & Cumbia",
        icon="🎺",
        description="Fania label Latin soul, 60s boogaloo 45s, vintage Colombian/Peruvian chicha cumbia, fiery montuno pianos & timbales",
        search_queries=[
            "latin soul boogaloo 45rpm rare vinyl rip",
            "chicha cumbia psicodelica peru rare vinyl",
            "fania all stars rare instrumental salsa vinyl",
            "colombian cumbia 70s obscure 45 vinyl rip",
            "latin jazz descargas rare vinyl piano timbales",
        ],
        suggested_tags=["Montuno Piano", "Timbales Break", "Cumbia Groove", "Boogaloo Horns"]
    ),
    "brazilian_bossa": CrateGenre(
        id="brazilian_bossa",
        name="Brazilian Bossa Nova, MPB & Samba-Jazz",
        icon="🇧🇷",
        description="70s MPB, Marcos Valle / Arthur Verocai style lush arrangements, samba-jazz piano trios, nylon acoustic guitar chops",
        search_queries=[
            "brazilian samba jazz 60s 70s rare vinyl rip",
            "mpb bossa nova obscure 70s vinyl instrumental",
            "brazilian jazz funk rare groove vinyl",
            "arthur verocai style brazilian arrangements vinyl",
            "som tres samba jazz piano trio vinyl rip",
        ],
        suggested_tags=["Bossa Chords", "Samba Swing", "Nylon Guitar", "Lush Brazilian Strings"]
    ),
    "afrobeat_groove": CrateGenre(
        id="afrobeat_groove",
        name="Afrobeat, Highlife & Zamrock",
        icon="🌍",
        description="70s West African Afrobeat, Nigerian highlife, Ghanaian funk, Zamrock fuzzy guitars, hypnotic polyrhythmic percussion",
        search_queries=[
            "afro funk 70s rare 45rpm vinyl rip nigeria ghana",
            "zamrock obscure 70s vinyl fuzz guitar",
            "west african highlife 70s instrumental vinyl",
            "afrobeat horn section obscure 70s vinyl",
            "rare african groove 45 vinyl rip",
        ],
        suggested_tags=["Polyrhythms", "Fuzz Guitar", "Afro Percussion", "Hypnotic Horns"]
    ),
    "spanish_flamenco": CrateGenre(
        id="spanish_flamenco",
        name="Spanish Rumba, Flamenco-Jazz & Psych",
        icon="🇪🇸",
        description="70s Spanish rumba catalana, flamenco-jazz fusion, prog-flamenco, Spanish nylon guitar runs, palmas handclaps",
        search_queries=[
            "flamenco jazz fusion 70s rare vinyl rip",
            "spanish rumba catalana obscure 70s vinyl",
            "prog flamenco rock 70s spain rare vinyl",
            "spanish guitar instrumental rare 45rpm",
            "guitarra flamenca psicodelica vinilo 70s",
        ],
        suggested_tags=["Flamenco Guitar", "Palmas Claps", "Rumba Rhythm", "Spanish Passion"]
    ),
    "ambient_synth": CrateGenre(
        id="ambient_synth",
        name="Vintage Synth & Ambient New Age",
        icon="🌌",
        description="Berlin school, early synthesizer experiments, cassette ambient, lush pads",
        search_queries=[
            "obscure synthesizer ambient cassette rip",
            "berlin school synth rare vinyl",
            "vintage new age cassette private press",
            "early modular synthesizer minimal",
            "japanese environmental ambient vinyl",
        ],
        suggested_tags=["Lush Pads", "Ethereal Chops", "Modular Arp", "Vinyl Texture"]
    ),
    "eastern_groove": CrateGenre(
        id="eastern_groove",
        name="Soviet & Eastern European Groove",
        icon="📻",
        description="Melodiya label jazz, Polish groove, Yugoslavian funk, Hungarian psych",
        search_queries=[
            "melodiya jazz funk rare vinyl rip",
            "polish jazz groove vinyl",
            "yugoslavian funk rock obscure",
            "soviet groove instrumental vinyl rip",
            "hungarian jazz rock rare",
        ],
        suggested_tags=["Heavy Drums", "Raw Organs", "Off-Kilter Breaks", "Cold War Groove"]
    ),
    "french_pop": CrateGenre(
        id="french_pop",
        name="French Pop, Chanson & Yé-Yé",
        icon="🥐",
        description="60s-70s French pop, Serge Gainsbourg cinematic arrangements, yé-yé, Cortex style jazz, moody chanson",
        search_queries=[
            "french pop 60s 70s rare vinyl rip",
            "french chanson obscure vinyl instrumental",
            "french ye ye pop 45rpm vinyl rip",
            "french cinematic pop 70s rare groove",
            "french jazz funk rhodes vintage vinyl rip",
        ],
        suggested_tags=["Cinematic Strings", "Moody Chords", "French Chanson", "Yé-Yé Groove"]
    ),
    "uk_classics": CrateGenre(
        id="uk_classics",
        name="UK Classics, Prog & Trip-Hop Seeds",
        icon="🇬🇧",
        description="British folk-rock, UK prog/psych, Canterbury scene, Bristol trip-hop sample sources, rare 70s UK vinyl",
        search_queries=[
            "uk prog rock 70s rare vinyl rip flute acoustic",
            "british folk rock obscure 70s vinyl sample",
            "canterbury scene obscure vinyl rip",
            "trip hop sample source 70s uk vinyl",
            "vertigo swirl label rare vinyl rip uk",
        ],
        suggested_tags=["Haunting Flutes", "Acoustic Chops", "Bristol Vibe", "Prog Dynamics"]
    ),
    "us_country": CrateGenre(
        id="us_country",
        name="US Vintage Country, Bluegrass & Americana",
        icon="🤠",
        description="Vintage outlaw country, pedal steel licks, dusty bluegrass banjo, Delta blues 78/45s, lonely acoustic guitars",
        search_queries=[
            "vintage pedal steel guitar instrumental rare vinyl",
            "dusty outlaw country 70s vinyl b-side",
            "rare bluegrass banjo acoustic vinyl rip",
            "delta blues rare 45rpm acoustic guitar",
            "americana private press acoustic vinyl 70s",
        ],
        suggested_tags=["Pedal Steel", "Fingerpicking", "Dusty Guitar", "Americana Twang"]
    ),
    "reggae_dub": CrateGenre(
        id="reggae_dub",
        name="Vintage Reggae, Roots & Dub",
        icon="🌴",
        description="Studio One roots reggae, King Tubby style dub versions, tape echo, heavy basslines & drum chops",
        search_queries=[
            "roots reggae dub version 7 inch vinyl rip",
            "king tubby dub tape echo rare vinyl",
            "studio one instrumental reggae 45",
            "rare 70s dub reggae b-side vinyl rip",
            "rocksteady instrumental obscure 45rpm",
        ],
        suggested_tags=["Heavy Bassline", "Tape Echo Dub", "Skank Rhythm", "One Drop Drums"]
    ),
}

SURPRISE_QUERIES = [
    "obscure vinyl rip 1973 private press",
    "rare groove 45rpm forgotten soul",
    "library music vintage instrumental cue",
    "70s japanese jazz funk vinyl rip",
    "french pop 70s cinematic vinyl rip",
    "brazilian samba jazz 70s rare vinyl rip",
    "chicha cumbia psicodelica peru rare vinyl",
    "afro funk 70s rare 45rpm vinyl rip",
    "flamenco jazz fusion 70s rare vinyl rip",
    "uk prog rock 70s rare vinyl sample",
    "vintage pedal steel guitar instrumental vinyl",
    "rare psych rock private press 1971",
    "vintage cassette ambient 1982 new age",
    "soviet jazz rock melodiya vinyl rip",
    "roots reggae dub version 7 inch vinyl",
    "forgotten funk 45 solo drum break",
    "rare vintage soundtrack instrumental theme 1976",
]


def format_views(count: Optional[int]) -> str:
    if count is None:
        return "Unknown"
    if count >= 1_000_000:
        return f"{count / 1_000_000:.1f}M views"
    if count >= 1_000:
        return f"{count / 1_000:.1f}K views"
    return f"{count} views"


def calculate_sampleability(
    duration: int,
    views: Optional[int],
    title: str,
    uploader: str
) -> tuple[int, List[str]]:
    """
    Computes a realistic sampleability score (25% to 98%) based on:
    - Instrumental & break keywords (bonus)
    - Full album length vs single track (albums get penalized unless scrubbed)
    - Vocal version / lyric video / live concert / cover (penalized because hard to sample)
    - Obscurity / view count curve (rare finds get boosted, viral hits get penalized)
    """
    score = 50  # Balanced baseline
    tags = []
    lower_title = title.lower()
    lower_uploader = uploader.lower()

    # 1. Negative filters & penalties (things producers HATE sampling)
    if "vocal version" in lower_title or "full vocal" in lower_title:
        score -= 18
        tags.append("Vocal Heavy")
    elif "live" in lower_title or "concert" in lower_title or "live at" in lower_title:
        score -= 15
        tags.append("Live Recording")
    elif "cover" in lower_title or "tribute" in lower_title:
        score -= 12
        tags.append("Cover Version")
    elif "remix" in lower_title or "mashup" in lower_title:
        score -= 8

    # 2. Positive keywords (sample gold indicators)
    if "instrumental" in lower_title or "dub version" in lower_title:
        score += 20
        tags.append("Clean Instrumental")
    if "break" in lower_title or "drum break" in lower_title or "solo break" in lower_title:
        score += 22
        tags.append("Drum Break")
    if "45rpm" in lower_title or "rare 45" in lower_title or "7 inch" in lower_title or "7\"" in lower_title:
        score += 10
        tags.append("45rpm Press")
    if "vinyl rip" in lower_title or "vinyl transfer" in lower_title:
        score += 8
        tags.append("Vinyl Texture")
    if "library" in lower_title or "kpm" in lower_title or "bruton" in lower_title or "chappell" in lower_title:
        score += 14
        tags.append("Library Cue")
    if "rhodes" in lower_title or "electric piano" in lower_title:
        score += 12
        tags.append("Warm Rhodes")
    if "synth" in lower_title or "synthesizer" in lower_title or "moog" in lower_title:
        score += 10
        tags.append("Vintage Synth")
    if "groove" in lower_title or "funk" in lower_title or "boogie" in lower_title:
        score += 8
        tags.append("Rhythmic Groove")
    if "b-side" in lower_title or "b side" in lower_title or "flip side" in lower_title:
        score += 10
        tags.append("Rare B-Side")
    if "private press" in lower_title or "acetate" in lower_title:
        score += 12
        tags.append("Private Press")
    if "pedal steel" in lower_title or "steel guitar" in lower_title:
        score += 12
        tags.append("Pedal Steel")
    if "banjo" in lower_title or "fingerpicking" in lower_title:
        score += 10
        tags.append("Dusty Guitar")
    if "chanson" in lower_title or "ye-ye" in lower_title or "yé-yé" in lower_title:
        score += 8
        tags.append("French Chanson")
    if "prog" in lower_title or "canterbury" in lower_title:
        score += 8
        tags.append("Prog Dynamics")
    if "dub" in lower_title or "king tubby" in lower_title:
        score += 14
        tags.append("Tape Echo Dub")
    if "bossa" in lower_title or "samba" in lower_title or "mpb" in lower_title:
        score += 12
        tags.append("Bossa Chords")
    if "boogaloo" in lower_title or "cumbia" in lower_title or "salsa" in lower_title:
        score += 12
        tags.append("Latin Groove")
    if "afro" in lower_title or "highlife" in lower_title or "zamrock" in lower_title:
        score += 14
        tags.append("Afro Percussion")
    if "flamenco" in lower_title or "rumba" in lower_title:
        score += 10
        tags.append("Flamenco Guitar")

    # 3. Duration Heuristics
    if 90 <= duration <= 320:
        # Ideal 1:30 - 5:20 sweet spot for clean sampleable track
        score += 10
    elif 320 < duration <= 540:
        score += 4
    elif duration > 1800:
        # 30+ min long mix / full album rip (harder to isolate specific 4 bars)
        score -= 15
        tags.append("Full Cassette / LP")
    elif duration < 45:
        score -= 20

    # 4. View Count / Obscurity curve
    if views is not None:
        if views < 2_000:
            score += 12
            if "Ultra Obscure Gem" not in tags and len(tags) < 3:
                tags.append("Ultra Obscure Gem")
        elif views < 25_000:
            score += 8
            if "Under The Radar" not in tags and len(tags) < 3:
                tags.append("Under The Radar")
        elif views > 500_000:
            score -= 15
        elif views > 5_000_000:
            score -= 28

    # Fallback tags if empty
    if not tags:
        tags = ["Vintage Recording", "Sample Prospect"]

    # Final realistic range: 25% to 98%
    score = max(25, min(98, score))
    return score, tags[:3]


# Creator video patterns: talking heads, vlogs, reviews, tier lists, vinyl collection showcases
CREATOR_PATTERNS = [
    "collection", "vinyl collection", "record collection", "starting a",
    "unboxing", "review", "vinyl community", "crate digging in", "digging in",
    "how to", "tutorial", "top 10", "top 5", "tier list", "my favorite",
    "reaction", "reacts", "talking about", "haul", "vinyl haul", "record haul",
    "thrift store haul", "what i bought", "guide to", "tips for", "podcast",
    "interview", "discussion", "documentary", "vlog", "history of",
]

# Persistent feedback file for negative signals & adaptive learning
CRATE_FEEDBACK_FILE = DOWNLOADS_DIR / ".crate_feedback.json"
_crate_feedback_data: Dict[str, Any] = {
    "disliked_video_ids": {},    # video_id -> {title, uploader, reason, note, timestamp}
    "disliked_channels": {},     # uploader_lower -> count
    "negative_keywords": {},     # phrase_lower -> count
}


def load_crate_feedback():
    global _crate_feedback_data
    if CRATE_FEEDBACK_FILE.exists():
        try:
            with open(CRATE_FEEDBACK_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    _crate_feedback_data.update(loaded)
        except Exception:
            pass


def save_crate_feedback():
    try:
        with open(CRATE_FEEDBACK_FILE, "w", encoding="utf-8") as f:
            json.dump(_crate_feedback_data, f, indent=2)
    except Exception:
        pass


def get_crate_feedback_data() -> Dict[str, Any]:
    global _crate_feedback_data
    load_crate_feedback()
    return _crate_feedback_data


load_crate_feedback()


def extract_negative_ngrams(text: str) -> List[str]:
    """Extracts distinctive phrases or n-grams from a disliked video title to prevent similar suggestions."""
    clean = re.sub(r"[^\w\s-]", " ", text.lower())
    words = [w.strip() for w in clean.split() if len(w.strip()) > 2]
    
    # Common stop words to ignore
    stop_words = {
        "the", "and", "for", "with", "from", "that", "this", "feat", "ft",
        "vol", "part", "track", "vinyl", "album", "music", "song", "rip",
        "official", "audio", "video", "records", "stereo", "mono"
    }
    meaningful = [w for w in words if w not in stop_words]
    
    ngrams = []
    # 2-word phrases
    for i in range(len(meaningful) - 1):
        ngrams.append(f"{meaningful[i]} {meaningful[i+1]}")
    # distinctive single words (>= 4 chars)
    for w in meaningful:
        if len(w) >= 4 and w not in ngrams:
            ngrams.append(w)
    return ngrams[:12]


def register_crate_feedback(req: CrateFeedbackRequest) -> CrateFeedbackResponse:
    """
    Registers a disliked/bad crate suggestion, learns from its channel and title tokens,
    and saves to persistent memory.
    """
    global _crate_feedback_data
    load_crate_feedback()

    vid_id = req.track_id.strip()
    title = req.title.strip() if req.title else ""
    uploader = req.uploader.strip() if req.uploader else ""
    reason = req.reason or "not_sampleable"
    note = req.note or ""

    _crate_feedback_data["disliked_video_ids"][vid_id] = {
        "title": title,
        "uploader": uploader,
        "reason": reason,
        "note": note,
        "timestamp": int(time.time()),
    }

    # If user reported channel or multiple bad tracks from channel, track uploader
    if uploader:
        up_clean = uploader.lower().strip()
        _crate_feedback_data["disliked_channels"][up_clean] = (
            _crate_feedback_data["disliked_channels"].get(up_clean, 0) + 1
        )

    # Extract learned negative keywords
    learned_tokens = []
    if title:
        ngrams = extract_negative_ngrams(title)
        for phrase in ngrams:
            _crate_feedback_data["negative_keywords"][phrase] = (
                _crate_feedback_data["negative_keywords"].get(phrase, 0) + 1
            )
            learned_tokens.append(phrase)

    save_crate_feedback()

    return CrateFeedbackResponse(
        status="success",
        message=f"Registered feedback for '{title or vid_id}'. Adaptive filters updated.",
        disliked_ids_count=len(_crate_feedback_data["disliked_video_ids"]),
        learned_negative_tokens=learned_tokens[:5],
    )


def is_feedback_disliked(video_id: str, title: str, uploader: str) -> tuple[bool, str]:
    """
    Checks if a video matches registered feedback or learned negative patterns.
    Returns (is_disliked, match_reason).
    """
    # 1. Exact video ID blocklist
    if video_id in _crate_feedback_data.get("disliked_video_ids", {}):
        return True, "Exact video previously disliked by user"

    lower_uploader = uploader.lower().strip()
    lower_title = title.lower()

    # 2. Channel blocklist (channels with 2+ complaints or marked as talking/bad)
    disliked_channels = _crate_feedback_data.get("disliked_channels", {})
    if lower_uploader in disliked_channels and disliked_channels[lower_uploader] >= 2:
        return True, f"Uploader '{uploader}' has repeated negative feedback"

    # 3. Learned negative keywords (phrases from previously disliked tracks)
    neg_kw = _crate_feedback_data.get("negative_keywords", {})
    for phrase, count in neg_kw.items():
        if count >= 1 and phrase in lower_title:
            # Match only if phrase is meaningful
            return True, f"Matches learned negative pattern: '{phrase}'"

    return False, ""


def is_creator_talk_video(title: str, uploader: str) -> bool:
    """Returns True if the video is likely a creator talking/vlog/showcase rather than an audio track."""
    lower_title = title.lower()
    lower_uploader = uploader.lower()

    for pattern in CREATOR_PATTERNS:
        # Match whole words/phrases
        if pattern in lower_title:
            return True
    
    # Common talking channel titles
    creator_channel_keywords = ["vinyl community", "record collector", "vlog", "podcast", "talks"]
    for kw in creator_channel_keywords:
        if kw in lower_uploader and ("how" in lower_title or "my" in lower_title or "haul" in lower_title):
            return True

    return False


def dig_crate_query(
    search_query: str,
    category_name: str = "Crate Dig",
    limit: int = 12,
    obscurity_level: str = "deep"
) -> List[CrateTrackItem]:
    """
    Executes a crate digging query using yt-dlp flat extraction and ranks tracks
    prioritizing obscure, sample-friendly vinyl rips and tracks.
    Filters out creator talking videos, vlogs, tutorials, and collection hauls.
    """
    ydl_opts = {
        'extract_flat': True,
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
    }

    # Ask for extra results so we can discard creator videos and keep pure musical audio
    fetch_count = min(40, max(limit * 3, 30))
    search_target = f"ytsearch{fetch_count}:{search_query}"

    items: List[CrateTrackItem] = []
    seen_ids = set()

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(search_target, download=False)
            entries = info.get('entries', []) if info else []
        except Exception:
            entries = []

    for entry in entries:
        if not entry:
            continue
        v_id = entry.get('id', '')
        if not v_id or v_id in seen_ids:
            continue

        raw_title = entry.get('title', 'Unknown Track')
        raw_uploader = entry.get('uploader', entry.get('channel', ''))

        # Hard filter out creator vlogs, reviews, collection videos, tutorials
        if is_creator_talk_video(raw_title, raw_uploader):
            continue

        # Filter out disliked tracks & learned negative patterns from user feedback
        disliked, _ = is_feedback_disliked(v_id, raw_title, raw_uploader)
        if disliked:
            continue

        duration = entry.get('duration') or 0
        # Discard shorts or zero-duration live streams
        if duration < 30 and not entry.get('is_live'):
            continue

        views = entry.get('view_count')

        # Filter by obscurity level if requested
        if obscurity_level == "deep" and views and views > 200_000:
            # Demote mainstream pop tracks
            continue

        parsed_artist, parsed_title = parse_artist_title(raw_title, raw_uploader)
        thumbnail = entry.get('thumbnail') or f"https://i.ytimg.com/vi/{v_id}/hqdefault.jpg"
        score, tags = calculate_sampleability(duration, views, raw_title, raw_uploader)

        seen_ids.add(v_id)
        items.append(CrateTrackItem(
            id=v_id,
            title=parsed_title,
            artist=parsed_artist,
            uploader=raw_uploader,
            duration=int(duration),
            duration_str=format_duration(duration),
            thumbnail=thumbnail,
            url=f"https://www.youtube.com/watch?v={v_id}",
            views=views,
            views_str=format_views(views),
            sampleability_score=score,
            sample_tags=tags,
            genre_category=category_name,
        ))

    # Sort items by sampleability score descending
    items.sort(key=lambda x: x.sampleability_score, reverse=True)
    return items[:limit]


def dig_by_genre(
    genre_id: str,
    era: Optional[str] = "any",
    limit: int = 12,
    obscurity_level: str = "deep"
) -> CrateDigResponse:
    """Discovers tracks from a curated crate genre with optional era/decade filter."""
    if genre_id not in CRATE_GENRES:
        genre_id = "rare_groove"

    genre = CRATE_GENRES[genre_id]
    base_query = random.choice(genre.search_queries)

    era_key = era if era in CRATE_ERAS else "any"
    era_info = CRATE_ERAS[era_key]
    era_token = era_info.get("search_token", "")
    era_label = era_info.get("label", "All Eras")

    if era_token:
        search_query = f"{base_query} {era_token}"
        headline = f"Crate: {genre.name} ({era_label})"
    else:
        search_query = base_query
        headline = f"Crate: {genre.name}"

    tracks = dig_crate_query(
        search_query,
        category_name=f"{genre.name} • {era_label}",
        limit=limit,
        obscurity_level=obscurity_level
    )

    return CrateDigResponse(
        mode="genre",
        headline=headline,
        category=genre.name,
        era=era_key,
        tracks=tracks,
        count=len(tracks),
    )


def dig_surprise_me(era: Optional[str] = "any", limit: int = 12) -> CrateDigResponse:
    """Spins a random holy-grail digging formula with optional era constraint."""
    base_query = random.choice(SURPRISE_QUERIES)

    era_key = era if era in CRATE_ERAS else "any"
    era_info = CRATE_ERAS[era_key]
    era_token = era_info.get("search_token", "")
    era_label = era_info.get("label", "All Eras")

    if era_token:
        search_query = f"{base_query} {era_token}"
        headline = f"🎲 Mystery Vault Dig ({era_label})"
    else:
        search_query = base_query
        headline = "🎲 Mystery Vinyl Vault Dig"

    tracks = dig_crate_query(
        search_query,
        category_name=f"Surprise Vault • {era_label}",
        limit=limit,
        obscurity_level="deep"
    )

    return CrateDigResponse(
        mode="surprise",
        headline=headline,
        category="Holy Grail Discovery",
        era=era_key,
        tracks=tracks,
        count=len(tracks),
    )


def dig_rabbit_hole(seed_input: str, era: Optional[str] = "any", limit: int = 12) -> CrateDigResponse:
    """
    Finds obscure sample cousins based on a seed song, YouTube URL, or artist query.
    """
    clean_query = seed_input.strip()
    original_video_id = ""

    # If it's a YouTube URL, extract video id and metadata first
    if "youtube.com" in clean_query or "youtu.be" in clean_query:
        parsed_url = urllib.parse.urlparse(clean_query)
        if "youtu.be" in parsed_url.netloc:
            original_video_id = parsed_url.path.lstrip("/")
        elif "youtube.com" in parsed_url.netloc:
            qs = urllib.parse.parse_qs(parsed_url.query)
            original_video_id = qs.get("v", [""])[0]

        ydl_opts = {'quiet': True, 'skip_download': True, 'extract_flat': True}
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(clean_query, download=False)
                if info:
                    title = info.get('title', '')
                    uploader = info.get('uploader', info.get('channel', ''))
                    artist, track = parse_artist_title(title, uploader)
                    clean_query = f"{artist} {track}".strip()
        except Exception:
            pass

    # Build digging rabbit hole search formula
    digger_modifiers = [
        "vinyl rip rare sample",
        "obscure similar album track",
        "sample material instrumental vinyl",
        "rare groove companion track",
    ]
    modifier = random.choice(digger_modifiers)

    era_key = era if era in CRATE_ERAS else "any"
    era_token = CRATE_ERAS[era_key].get("search_token", "")
    era_label = CRATE_ERAS[era_key].get("label", "All Eras")

    if era_token:
        search_query = f"{clean_query} {modifier} {era_token}"
    else:
        search_query = f"{clean_query} {modifier}"

    tracks = dig_crate_query(
        search_query,
        category_name=f"Rabbit Hole: {clean_query[:35]}",
        limit=limit,
        obscurity_level="moderate"
    )

    # Filter out the original video if present
    if original_video_id:
        tracks = [t for t in tracks if t.id != original_video_id]

    return CrateDigResponse(
        mode="rabbit_hole",
        headline=f"🐇 Rabbit Hole from: \"{clean_query[:35]}\" ({era_label})",
        category="Sample Cousin Discovery",
        era=era_key,
        tracks=tracks,
        count=len(tracks),
    )
