// State Management
let currentVideoInfo = null;
let activeTasks = new Map();
let downloadedFiles = [];
let ws = null;
let currentPlayingFile = null;

// Navigation Tabs DOM
const tabBtnYoutube = document.getElementById('tabBtnYoutube');
const tabBtnCrate = document.getElementById('tabBtnCrate');
const tabBtnChopper = document.getElementById('tabBtnChopper');
const viewYoutube = document.getElementById('viewYoutube');
const viewCrate = document.getElementById('viewCrate');
const viewChopper = document.getElementById('viewChopper');

// YouTube Converter DOM Elements
const youtubeUrlInput = document.getElementById('youtubeUrl');
const btnPaste = document.getElementById('btnPaste');
const audioQualitySelect = document.getElementById('audioQuality');
const embedCoverCheck = document.getElementById('embedCover');
const embedTagsCheck = document.getElementById('embedTags');
const btnInspect = document.getElementById('btnInspect');
const btnDownload = document.getElementById('btnDownload');
const urlForm = document.getElementById('urlForm');
const ffmpegStatusBadge = document.getElementById('ffmpegStatusBadge');
const btnOpenFolder = document.getElementById('btnOpenFolder');

// Media Mode DOM (Audio vs Video)
const btnModeAudio = document.getElementById('btnModeAudio');
const btnModeVideo = document.getElementById('btnModeVideo');
const cardTitleText = document.getElementById('cardTitleText');
const qualityPill = document.getElementById('qualityPill');
const formatLabel = document.getElementById('formatLabel');
const btnDownloadText = document.getElementById('btnDownloadText');

// Video Modal DOM
const videoModal = document.getElementById('videoModal');
const btnCloseVideoModal = document.getElementById('btnCloseVideoModal');
const nativeVideo = document.getElementById('nativeVideoElement');
const videoModalTitle = document.getElementById('videoModalTitle');
const videoModalMeta = document.getElementById('videoModalMeta');
const btnDownloadCurrentVideo = document.getElementById('btnDownloadCurrentVideo');

// Preview DOM
const previewContainer = document.getElementById('previewContainer');
const previewThumbnail = document.getElementById('previewThumbnail');
const previewDuration = document.getElementById('previewDuration');
const previewType = document.getElementById('previewType');
const previewTitle = document.getElementById('previewTitle');
const previewArtist = document.getElementById('previewArtist');
const customTitleInput = document.getElementById('customTitleInput');
const customArtistInput = document.getElementById('customArtistInput');
const playlistTracksContainer = document.getElementById('playlistTracksContainer');
const playlistTracksList = document.getElementById('playlistTracksList');
const playlistCount = document.getElementById('playlistCount');
const btnSelectAll = document.getElementById('btnSelectAll');
const btnFindSimilar = document.getElementById('btnFindSimilar');
const btnPreviewToggleFavorite = document.getElementById('btnPreviewToggleFavorite');
const previewFavIcon = document.getElementById('previewFavIcon');
const similarTracksContainer = document.getElementById('similarTracksContainer');
const similarTracksList = document.getElementById('similarTracksList');
const similarLoading = document.getElementById('similarLoading');
const similarCount = document.getElementById('similarCount');

// Queue & Library DOM
const tasksList = document.getElementById('tasksList');
const emptyQueue = document.getElementById('emptyQueue');
const activeTasksCount = document.getElementById('activeTasksCount');
const btnStopAll = document.getElementById('btnStopAll');
const btnClearCompleted = document.getElementById('btnClearCompleted');
const libraryList = document.getElementById('libraryList');
const emptyLibrary = document.getElementById('emptyLibrary');
const searchLibrary = document.getElementById('searchLibrary');
const btnRefreshLibrary = document.getElementById('btnRefreshLibrary');

// Audio Player DOM
const audioPlayerBar = document.getElementById('audioPlayerBar');
const nativeAudio = document.getElementById('nativeAudioElement');
const btnPlayerPlay = document.getElementById('btnPlayerPlay');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const playerTitle = document.getElementById('playerTitle');
const playerArtist = document.getElementById('playerArtist');
const playerBpmKey = document.getElementById('playerBpmKey');
const playerSeek = document.getElementById('playerSeek');
const playerCurrentTime = document.getElementById('playerCurrentTime');
const playerTotalTime = document.getElementById('playerTotalTime');
const playerVolume = document.getElementById('playerVolume');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkHealth();
  initWebSocket();
  fetchLibrary();
  setupEventListeners();
  setupCrateEventListeners();
  if (window.initChopperModule) window.initChopperModule();

  // Periodic poll for library changes
  setInterval(fetchLibrary, 5000);
});

// Tab Navigation
window.switchTab = function(tabName) {
  if (tabName === 'crate') {
    if (tabBtnCrate) tabBtnCrate.classList.add('active');
    if (tabBtnYoutube) tabBtnYoutube.classList.remove('active');
    if (tabBtnChopper) tabBtnChopper.classList.remove('active');
    if (viewCrate) viewCrate.classList.remove('hidden');
    if (viewYoutube) viewYoutube.classList.add('hidden');
    if (viewChopper) viewChopper.classList.add('hidden');
    // Initialize crate genres and library seeds on first open
    loadCrateGenres();
    loadCrateLibrarySeeds();
  } else if (tabName === 'chopper') {
    if (tabBtnChopper) tabBtnChopper.classList.add('active');
    if (tabBtnYoutube) tabBtnYoutube.classList.remove('active');
    if (tabBtnCrate) tabBtnCrate.classList.remove('active');
    if (viewChopper) viewChopper.classList.remove('hidden');
    if (viewYoutube) viewYoutube.classList.add('hidden');
    if (viewCrate) viewCrate.classList.add('hidden');
    if (window.refreshChopperFilePicker) window.refreshChopperFilePicker();
  } else {
    if (tabBtnYoutube) tabBtnYoutube.classList.add('active');
    if (tabBtnCrate) tabBtnCrate.classList.remove('active');
    if (tabBtnChopper) tabBtnChopper.classList.remove('active');
    if (viewYoutube) viewYoutube.classList.remove('hidden');
    if (viewCrate) viewCrate.classList.add('hidden');
    if (viewChopper) viewChopper.classList.add('hidden');
  }

  // Update floating play / pause widget for chopper
  if (window.updateChopperFloatingWidget) {
    window.updateChopperFloatingWidget();
  }
};

// Media Mode Switcher (Audio vs Video)
let currentMediaType = 'audio';

function updateDownloadButtonLabel() {
  if (!btnDownload) return;
  const isPlaylist = currentVideoInfo && currentVideoInfo.is_playlist;
  const isVideo = currentMediaType === 'video';
  
  let label = '';
  if (isPlaylist) {
    const count = currentVideoInfo.playlist_count || '';
    label = isVideo ? `Ingest Playlist Videos (${count})` : `Ingest Entire Playlist (${count})`;
  } else {
    label = isVideo ? 'Ingest MP4 Video' : 'Ingest High-Quality Audio';
  }

  btnDownload.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
    <span id="btnDownloadText">${escapeHtml(label)}</span>
  `;
}

function setMediaType(type) {
  currentMediaType = type;
  if (type === 'video') {
    if (btnModeVideo) btnModeVideo.classList.add('active');
    if (btnModeAudio) btnModeAudio.classList.remove('active');
    if (cardTitleText) cardTitleText.textContent = 'Ingest Video Sample / Reference';
    if (qualityPill) {
      qualityPill.textContent = '1080p / 4K MP4 Video';
      qualityPill.style.background = 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(249, 115, 22, 0.2))';
      qualityPill.style.borderColor = 'rgba(245, 158, 11, 0.4)';
      qualityPill.style.color = '#fbbf24';
    }
    if (formatLabel) formatLabel.textContent = 'Format & Resolution (Video)';
    if (audioQualitySelect) {
      const videoOptions = ['mp4_best', 'mp4_1080', 'mp4_720', 'mp4_480', 'mkv_best'];
      if (!videoOptions.includes(audioQualitySelect.value)) {
        audioQualitySelect.value = 'mp4_best';
      }
    }
  } else {
    if (btnModeAudio) btnModeAudio.classList.add('active');
    if (btnModeVideo) btnModeVideo.classList.remove('active');
    if (cardTitleText) cardTitleText.textContent = 'Ingest Audio & Video Samples';
    if (qualityPill) {
      qualityPill.textContent = 'Studio 320kbps CBR';
      qualityPill.style.background = '';
      qualityPill.style.borderColor = '';
      qualityPill.style.color = '';
    }
    if (formatLabel) formatLabel.textContent = 'Format & Quality (Audio)';
    if (audioQualitySelect) {
      const audioOptions = ['320k', '256k', '192k', '128k', 'flac', 'm4a', 'wav'];
      if (!audioOptions.includes(audioQualitySelect.value)) {
        audioQualitySelect.value = '320k';
      }
    }
  }
  updateDownloadButtonLabel();
}

// Video Player Modal Controller
window.playVideoFile = function(encodedFilename, title, format, sizeMb) {
  const filename = decodeURIComponent(encodedFilename);
  // Pause audio player if currently playing
  if (nativeAudio && !nativeAudio.paused) {
    nativeAudio.pause();
    if (playIcon) playIcon.classList.remove('hidden');
    if (pauseIcon) pauseIcon.classList.add('hidden');
  }

  if (nativeVideo && videoModal) {
    nativeVideo.src = `/api/stream/${encodeURIComponent(filename)}`;
    if (videoModalTitle) videoModalTitle.textContent = title;
    if (videoModalMeta) videoModalMeta.textContent = `${format} Video • ${sizeMb}`;
    if (btnDownloadCurrentVideo) {
      btnDownloadCurrentVideo.href = `/api/files/${encodeURIComponent(filename)}`;
      btnDownloadCurrentVideo.download = filename;
    }
    videoModal.classList.remove('hidden');
    nativeVideo.play().catch(e => console.warn('Video auto-play prevented:', e));
  }
};

function closeVideoModal() {
  if (nativeVideo) {
    nativeVideo.pause();
    nativeVideo.src = '';
  }
  if (videoModal) {
    videoModal.classList.add('hidden');
  }
}

// Event Listeners Setup
function setupEventListeners() {
  if (tabBtnYoutube) tabBtnYoutube.addEventListener('click', () => switchTab('youtube'));
  if (tabBtnCrate) tabBtnCrate.addEventListener('click', () => switchTab('crate'));
  if (tabBtnChopper) tabBtnChopper.addEventListener('click', () => switchTab('chopper'));

  if (btnModeAudio) btnModeAudio.addEventListener('click', () => setMediaType('audio'));
  if (btnModeVideo) btnModeVideo.addEventListener('click', () => setMediaType('video'));

  if (audioQualitySelect) {
    audioQualitySelect.addEventListener('change', () => {
      const val = audioQualitySelect.value;
      if (['mp4_best', 'mp4_1080', 'mp4_720', 'mp4_480', 'mkv_best'].includes(val)) {
        setMediaType('video');
      } else {
        setMediaType('audio');
      }
    });
  }

  if (btnCloseVideoModal) btnCloseVideoModal.addEventListener('click', closeVideoModal);
  if (videoModal) {
    videoModal.addEventListener('click', (e) => {
      if (e.target === videoModal) closeVideoModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && videoModal && !videoModal.classList.contains('hidden')) {
      closeVideoModal();
    }
  });

  if (btnPaste) {
    btnPaste.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && youtubeUrlInput) {
          youtubeUrlInput.value = text.trim();
          handleUrlChanged();
        }
      } catch (e) {
        console.warn('Clipboard read failed:', e);
      }
    });
  }

  if (youtubeUrlInput) {
    youtubeUrlInput.addEventListener('change', handleUrlChanged);
    youtubeUrlInput.addEventListener('paste', () => {
      setTimeout(handleUrlChanged, 50);
    });
  }

  if (btnInspect) {
    btnInspect.addEventListener('click', (e) => {
      e.preventDefault();
      inspectUrl();
    });
  }

  if (urlForm) {
    urlForm.addEventListener('submit', (e) => {
      e.preventDefault();
      triggerDownload();
    });
  }

  if (btnStopAll) {
    btnStopAll.addEventListener('click', stopAllTasks);
  }
  
  if (btnClearCompleted) {
    btnClearCompleted.addEventListener('click', clearCompletedTasks);
  }

  if (btnOpenFolder) {
    btnOpenFolder.addEventListener('click', async () => {
      try {
        await fetch('/api/open-folder', { method: 'POST' });
      } catch (err) {
        console.error(err);
      }
    });
  }

  if (btnRefreshLibrary) btnRefreshLibrary.addEventListener('click', fetchLibrary);
  if (searchLibrary) searchLibrary.addEventListener('input', renderLibrary);

  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', () => {
      if (!playlistTracksList) return;
      const checkboxes = playlistTracksList.querySelectorAll('input[type="checkbox"]');
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      checkboxes.forEach(cb => cb.checked = !allChecked);
    });
  }

  if (btnFindSimilar) {
    btnFindSimilar.addEventListener('click', fetchSimilarTracks);
  }

  if (btnPreviewToggleFavorite) {
    btnPreviewToggleFavorite.addEventListener('click', () => {
      if (currentVideoInfo) {
        // Ensure track object has full fields
        const trackObj = {
          id: currentVideoInfo.id,
          title: (customTitleInput && customTitleInput.value.trim()) || currentVideoInfo.title,
          artist: (customArtistInput && customArtistInput.value.trim()) || currentVideoInfo.artist || currentVideoInfo.uploader || '',
          uploader: currentVideoInfo.uploader || '',
          duration: currentVideoInfo.duration || 0,
          duration_str: currentVideoInfo.duration_str || '0:00',
          thumbnail: currentVideoInfo.thumbnail || '',
          url: (youtubeUrlInput && youtubeUrlInput.value.trim()) || `https://www.youtube.com/watch?v=${currentVideoInfo.id}`
        };
        toggleFavoriteTrack(trackObj);
      }
    });
  }

  // Audio Player Listeners
  if (btnPlayerPlay) btnPlayerPlay.addEventListener('click', toggleAudioPlay);
  
  if (nativeAudio) {
    nativeAudio.addEventListener('timeupdate', () => {
      if (nativeAudio.duration && playerSeek && playerCurrentTime && playerTotalTime) {
        const pct = (nativeAudio.currentTime / nativeAudio.duration) * 100;
        playerSeek.value = pct;
        playerCurrentTime.textContent = formatTime(nativeAudio.currentTime);
        playerTotalTime.textContent = formatTime(nativeAudio.duration);
      }
    });

    nativeAudio.addEventListener('ended', () => {
      if (playIcon) playIcon.classList.remove('hidden');
      if (pauseIcon) pauseIcon.classList.add('hidden');
      if (playerSeek) playerSeek.value = 0;
    });
  }

  if (playerSeek) {
    playerSeek.addEventListener('input', () => {
      if (nativeAudio && nativeAudio.duration) {
        nativeAudio.currentTime = (playerSeek.value / 100) * nativeAudio.duration;
      }
    });
  }

  if (playerVolume) {
    playerVolume.addEventListener('input', (e) => {
      if (nativeAudio) nativeAudio.volume = parseFloat(e.target.value);
    });
  }
}

// Check Backend Health & FFmpeg
async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.ffmpeg_installed) {
      if (ffmpegStatusBadge) {
        ffmpegStatusBadge.className = 'status-pill ready';
        ffmpegStatusBadge.innerHTML = '<span class="dot"></span><span class="status-text">FFmpeg Ready (320k)</span>';
      }
    } else {
      if (ffmpegStatusBadge) {
        ffmpegStatusBadge.className = 'status-pill warning';
        ffmpegStatusBadge.innerHTML = '<span class="dot"></span><span class="status-text">FFmpeg Missing</span>';
      }
    }
  } catch (err) {
    if (ffmpegStatusBadge) {
      ffmpegStatusBadge.className = 'status-pill warning';
      ffmpegStatusBadge.innerHTML = '<span class="dot"></span><span class="status-text">Server Offline</span>';
    }
  }
}

// WebSocket for Realtime Progress
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/progress`;
  ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const taskUpdate = JSON.parse(event.data);
      updateTaskUI(taskUpdate);
      if (taskUpdate.status === 'completed' || taskUpdate.status === 'tagging') {
        fetchLibrary();
      }
    } catch (e) {
      console.error('WebSocket parse error', e);
    }
  };

  ws.onclose = () => {
    setTimeout(initWebSocket, 2000);
  };
}

// URL Change Handlers
function handleUrlChanged() {
  if (!youtubeUrlInput) return;
  const url = youtubeUrlInput.value.trim();
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    inspectUrl();
  }
}

async function inspectUrl() {
  if (!youtubeUrlInput) return;
  const url = youtubeUrlInput.value.trim();
  if (!url) return;

  if (btnInspect) {
    btnInspect.disabled = true;
    btnInspect.innerHTML = '<span>Inspecting...</span>';
  }

  try {
    const res = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to inspect URL');
    }

    currentVideoInfo = await res.json();
    renderPreview(currentVideoInfo);
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    if (btnInspect) {
      btnInspect.disabled = false;
      btnInspect.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <span>Preview Info</span>
      `;
    }
  }
}

function renderPreview(info) {
  if (!previewContainer) return;
  previewContainer.classList.remove('hidden');
  if (previewThumbnail) previewThumbnail.src = info.thumbnail || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23222" width="100%" height="100%"/></svg>';
  if (previewDuration) previewDuration.textContent = info.duration_str;
  if (previewTitle) previewTitle.textContent = info.title;
  if (previewArtist) previewArtist.textContent = `${info.artist || info.uploader} • ${info.channel || ''}`;
  if (customTitleInput) customTitleInput.value = info.title;
  if (customArtistInput) customArtistInput.value = info.artist || info.uploader;

  if (info.is_playlist) {
    if (previewType) previewType.textContent = `Playlist (${info.playlist_count} tracks)`;
    updateDownloadButtonLabel();
    if (playlistTracksContainer) playlistTracksContainer.classList.remove('hidden');
    if (playlistCount) playlistCount.textContent = info.playlist_count;
    
    if (playlistTracksList) {
      playlistTracksList.innerHTML = info.entries.map((entry, idx) => `
        <div class="playlist-item">
          <input type="checkbox" id="track_${idx}" value="${entry.id}" checked />
          <label for="track_${idx}" class="playlist-item-title">${idx + 1}. ${escapeHtml(entry.title)}</label>
          <span class="playlist-item-dur">${entry.duration_str}</span>
        </div>
      `).join('');
    }
  } else {
    if (previewType) previewType.textContent = 'Single Track';
    updateDownloadButtonLabel();
    if (playlistTracksContainer) playlistTracksContainer.classList.add('hidden');
  }

  // Update preview favorite button state
  if (btnPreviewToggleFavorite && previewFavIcon) {
    const isFav = info.id ? isTrackFavorite(info.id) : false;
    btnPreviewToggleFavorite.classList.toggle('is-favorite', isFav);
    previewFavIcon.textContent = isFav ? '❤️ Saved Favorite' : '🤍 Save to Favorites';
    btnPreviewToggleFavorite.title = isFav ? 'Saved in Crate Favorites & Anchors' : 'Save to Crate Favorites & Anchors';
  }

  // Hide similar container until user clicks "Find Similar Songs"
  if (similarTracksContainer) similarTracksContainer.classList.add('hidden');
}

// Similar Songs Discovery
async function fetchSimilarTracks() {
  const url = youtubeUrlInput ? youtubeUrlInput.value.trim() : '';
  const title = customTitleInput && customTitleInput.value.trim() ? customTitleInput.value.trim() : (currentVideoInfo ? currentVideoInfo.title : '');
  const artist = customArtistInput && customArtistInput.value.trim() ? customArtistInput.value.trim() : (currentVideoInfo ? (currentVideoInfo.artist || currentVideoInfo.uploader) : '');

  if (!url && !title) return;

  if (similarTracksContainer) similarTracksContainer.classList.remove('hidden');
  if (similarLoading) similarLoading.classList.remove('hidden');
  if (similarTracksList) similarTracksList.innerHTML = '';
  if (similarCount) similarCount.textContent = '...';

  if (btnFindSimilar) {
    btnFindSimilar.disabled = true;
    btnFindSimilar.innerHTML = '<span>Searching similar...</span>';
  }

  try {
    const params = new URLSearchParams();
    if (url) params.append('url', url);
    if (title) params.append('title', title);
    if (artist) params.append('artist', artist);
    params.append('limit', '8');

    const res = await fetch(`/api/similar?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to find similar songs' }));
      throw new Error(err.detail || 'Could not fetch similar tracks');
    }

    const data = await res.json();
    renderSimilarTracks(data.tracks || []);
  } catch (err) {
    if (similarTracksList) {
      similarTracksList.innerHTML = `<p style="color: var(--text-muted); padding: 1rem; grid-column: 1/-1;">Could not load recommendations: ${escapeHtml(err.message)}</p>`;
    }
  } finally {
    if (similarLoading) similarLoading.classList.add('hidden');
    if (btnFindSimilar) {
      btnFindSimilar.disabled = false;
      btnFindSimilar.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
        <span>Find Similar Songs</span>
      `;
    }
  }
}

function renderSimilarTracks(tracks) {
  if (!similarTracksList) return;
  if (similarCount) similarCount.textContent = tracks.length;

  if (!tracks || tracks.length === 0) {
    similarTracksList.innerHTML = '<p style="color: var(--text-muted); padding: 1rem; grid-column: 1/-1;">No similar tracks found. Try a different song or artist query.</p>';
    return;
  }

  // Store in global window for index lookup
  window.currentSimilarTracks = tracks;

  similarTracksList.innerHTML = tracks.map((track, idx) => {
    const encUrl = encodeURIComponent(track.url);
    const encTitle = encodeURIComponent(track.title);
    const encArtist = encodeURIComponent(track.artist || track.uploader || '');
    const thumb = track.thumbnail || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23222" width="100%" height="100%"/></svg>';
    const isFav = isTrackFavorite(track.id);
    const isDownloaded = isTrackDownloaded(track.id, track.title);

    return `
      <div class="similar-track-card">
        <div class="similar-thumb-box">
          <img src="${escapeHtml(thumb)}" alt="${escapeHtml(track.title)}" loading="lazy" />
          <span class="similar-dur-pill">${track.duration_str}</span>
          ${isDownloaded ? `
          <span class="similar-downloaded-pill" title="Already in your library / sample stash">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Downloaded</span>
          </span>
          ` : (track.views_str ? `<span class="similar-views-pill">${track.views_str}</span>` : '')}
        </div>
        <div class="similar-card-body">
          <div>
            <div class="similar-title" title="${escapeHtml(track.title)}">${escapeHtml(track.title)}</div>
            <div class="similar-artist" title="${escapeHtml(track.artist || track.uploader)}">${escapeHtml(track.artist || track.uploader)}</div>
          </div>
          <div class="similar-card-actions">
            <button type="button" class="btn-similar-download ${isDownloaded ? 'is-downloaded' : ''}" onclick="startSimilarDownload('${encUrl}', '${encTitle}', '${encArtist}')" title="${isDownloaded ? 'Already downloaded (Click to re-download)' : 'Download directly with current settings'}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                ${isDownloaded ? `
                <polyline points="20 6 9 17 4 12"></polyline>
                ` : `
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
                `}
              </svg>
              <span>${isDownloaded ? 'In Stash' : 'Download'}</span>
            </button>
            <button type="button" class="btn-similar-load" onclick="loadSimilarTrackByIndex(${idx})" title="Load into Preview & Ingest">
              <span>Load</span>
            </button>
            <button type="button" class="btn-similar-fav ${isFav ? 'is-favorite' : ''}" data-track-id="${escapeHtml(track.id)}" onclick="toggleSimilarFavoriteByIndex(${idx})" title="${isFav ? 'Remove from favorites' : 'Save to Favorites'}">
              ${isFav ? '❤️' : '🤍'}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.toggleSimilarFavoriteByIndex = function(idx) {
  if (window.currentSimilarTracks && window.currentSimilarTracks[idx]) {
    toggleFavoriteTrack(window.currentSimilarTracks[idx]);
  }
};

window.loadSimilarTrackByIndex = function(idx) {
  if (!window.currentSimilarTracks || !window.currentSimilarTracks[idx]) return;
  const track = window.currentSimilarTracks[idx];
  loadSimilarTrack(track.url, track.title, track.artist || track.uploader, track.thumbnail, track.duration_str, track.id, track.duration);
};

window.startSimilarDownload = async function(encodedUrl, encodedTitle, encodedArtist) {
  const url = decodeURIComponent(encodedUrl);
  const custom_title = decodeURIComponent(encodedTitle);
  const custom_artist = decodeURIComponent(encodedArtist);
  const quality = audioQualitySelect ? audioQualitySelect.value : '320k';
  const embed_thumbnail = embedCoverCheck ? embedCoverCheck.checked : true;
  const embed_metadata = embedTagsCheck ? embedTagsCheck.checked : true;

  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        quality,
        custom_title,
        custom_artist,
        embed_thumbnail,
        embed_metadata
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Download failed' }));
      throw new Error(err.detail || 'Could not start download');
    }
  } catch (err) {
    alert(`Download Error: ${err.message}`);
  }
};

window.loadSimilarTrack = function(url, title, artist, thumbnail, duration_str, trackId, duration) {
  if (youtubeUrlInput) {
    youtubeUrlInput.value = url;
  }
  if (customTitleInput) {
    customTitleInput.value = title || '';
  }
  if (customArtistInput) {
    customArtistInput.value = artist || '';
  }

  // Populate currentVideoInfo immediately so preview renders cleanly
  currentVideoInfo = {
    id: trackId || (url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/) ? url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/)[1] : ''),
    title: title || '',
    artist: artist || '',
    uploader: artist || '',
    duration: duration || 0,
    duration_str: duration_str || '0:00',
    thumbnail: thumbnail || '',
    is_playlist: false
  };

  renderPreview(currentVideoInfo);
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Automatically fetch new alternatives for the loaded track
  fetchSimilarTracks();
};

// Download Trigger
async function triggerDownload() {
  if (!youtubeUrlInput) return;
  const url = youtubeUrlInput.value.trim();
  if (!url) return;

  const quality = audioQualitySelect ? audioQualitySelect.value : '320k';
  const embed_thumbnail = embedCoverCheck ? embedCoverCheck.checked : true;
  const embed_metadata = embedTagsCheck ? embedTagsCheck.checked : true;
  const custom_title = customTitleInput && customTitleInput.value.trim() ? customTitleInput.value.trim() : undefined;
  const custom_artist = customArtistInput && customArtistInput.value.trim() ? customArtistInput.value.trim() : undefined;

  if (currentVideoInfo && currentVideoInfo.is_playlist) {
    let selected_ids = [];
    if (playlistTracksList) {
      const checkedBoxes = playlistTracksList.querySelectorAll('input[type="checkbox"]:checked');
      selected_ids = Array.from(checkedBoxes).map(cb => cb.value);
    }

    try {
      const res = await fetch('/api/download-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          quality,
          embed_thumbnail,
          embed_metadata,
          selected_ids
        })
      });
      if (!res.ok) throw new Error('Failed to start playlist download');
    } catch (e) {
      alert(e.message);
    }
  } else {
    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          quality,
          custom_title,
          custom_artist,
          embed_thumbnail,
          embed_metadata
        })
      });
      if (!res.ok) throw new Error('Failed to start download');
    } catch (e) {
      alert(e.message);
    }
  }
}

// Stop All Tasks
async function stopAllTasks() {
  try {
    const res = await fetch('/api/stop-all', { method: 'POST' });
    if (res.ok) {
      for (const [id, task] of activeTasks.entries()) {
        if (!['completed', 'error', 'cancelled'].includes(task.status)) {
          task.status = 'cancelled';
          task.error = 'Cancelled by user';
          updateTaskUI(task);
        }
      }
    }
  } catch (err) {
    console.error('Stop all error', err);
  }
}

// Cancel Single Task
window.cancelTask = async function(taskId) {
  try {
    await fetch(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST' });
    const task = activeTasks.get(taskId);
    if (task) {
      task.status = 'cancelled';
      task.error = 'Cancelled by user';
      updateTaskUI(task);
    }
  } catch (err) {
    console.error('Cancel task error', err);
  }
};

// Clear Completed Tasks
async function clearCompletedTasks() {
  try {
    await fetch('/api/tasks/clear-completed', { method: 'POST' });
    for (const [id, task] of Array.from(activeTasks.entries())) {
      if (['completed', 'error', 'cancelled'].includes(task.status)) {
        activeTasks.delete(id);
        const card = document.getElementById(`task-${id}`);
        if (card) card.remove();
      }
    }
    if (activeTasks.size === 0 && emptyQueue) {
      emptyQueue.classList.remove('hidden');
    }
    updateActiveCount();
  } catch (err) {
    console.error('Clear completed error', err);
  }
}

function updateActiveCount() {
  if (!activeTasksCount) return;
  const count = Array.from(activeTasks.values()).filter(t => !['completed', 'error', 'cancelled'].includes(t.status)).length;
  activeTasksCount.textContent = count;
}

// UI Task Queue Rendering
function updateTaskUI(task) {
  // Merge with existing task state so title/artist are never lost on intermediate updates
  const existing = activeTasks.get(task.task_id) || {};
  const mergedTask = { ...existing, ...task };
  if (!task.title && existing.title) mergedTask.title = existing.title;
  if (!task.artist && existing.artist) mergedTask.artist = existing.artist;
  if (!task.thumbnail && existing.thumbnail) mergedTask.thumbnail = existing.thumbnail;
  activeTasks.set(task.task_id, mergedTask);
  task = mergedTask;

  if (emptyQueue) emptyQueue.classList.add('hidden');

  let card = document.getElementById(`task-${task.task_id}`);
  if (!card && tasksList) {
    card = document.createElement('div');
    card.id = `task-${task.task_id}`;
    card.className = 'task-card';
    tasksList.prepend(card);
  }

  if (!card) return;

  const badgeClass = `badge-${task.status}`;
  const statusLabelMap = {
    queued: 'Queued',
    fetching_info: 'Fetching Stream',
    downloading: 'Downloading Audio',
    converting: 'Encoding to 320k',
    tagging: 'Tagging & Album Art',
    completed: 'Completed',
    error: 'Failed',
    cancelled: 'Cancelled'
  };

  const statusLabel = statusLabelMap[task.status] || task.status;
  const title = task.title || currentVideoInfo?.title || 'Ingesting Audio Sample';
  const pct = Math.min(100, Math.max(0, task.progress));
  const isFinished = ['completed', 'error', 'cancelled'].includes(task.status);

  card.innerHTML = `
    <div class="task-header">
      <div class="task-header-left">
        <span class="task-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
        ${task.artist ? `<span class="task-artist-sub" style="font-size: 0.78rem; color: var(--text-muted); margin-left: 0.5rem;">${escapeHtml(task.artist)}</span>` : ''}
      </div>
      <div class="task-header-right">
        <span class="task-badge ${badgeClass}">${statusLabel}</span>
        ${!isFinished ? `
          <button class="btn-task-cancel" onclick="cancelTask('${task.task_id}')" title="Cancel this download">✕</button>
        ` : ''}
      </div>
    </div>
    <div class="task-progress-bg">
      <div class="task-progress-fill" style="width: ${pct}%"></div>
    </div>
    <div class="task-meta">
      <span>${task.speed ? task.speed : (task.status === 'completed' ? 'Saved to disk' : `${pct.toFixed(0)}%`)}</span>
      <span>${task.eta ? `ETA: ${task.eta}` : (task.total_bytes_str || '')}</span>
    </div>
    ${task.error ? `<div style="color:var(--accent-error);font-size:0.75rem;margin-top:4px;">${escapeHtml(task.error)}</div>` : ''}
  `;

  updateActiveCount();
}

// Library Management
async function fetchLibrary() {
  try {
    const res = await fetch('/api/files');
    if (res.ok) {
      const newFiles = await res.json();
      const filesChanged = !downloadedFiles ||
        downloadedFiles.length !== newFiles.length ||
        JSON.stringify(newFiles.map(f => f.filename)) !== JSON.stringify(downloadedFiles.map(f => f.filename));

      downloadedFiles = newFiles;
      if (filesChanged) {
        renderLibrary();
      }
      // Update downloaded status badges in place without re-rendering or jumping scroll
      updateCrateDownloadedBadges();
      updateSimilarDownloadedBadges();
    }
  } catch (err) {
    console.error('Failed to fetch library files', err);
  }
}

function updateCrateDownloadedBadges() {
  if (!currentCrateTracks || currentCrateTracks.length === 0) return;
  const cards = document.querySelectorAll('.crate-card');
  cards.forEach(card => {
    const idx = parseInt(card.getAttribute('data-track-index'), 10);
    const track = currentCrateTracks[idx];
    if (!track) return;
    const isDownloaded = isTrackDownloaded(track.id, track.title);
    card.classList.toggle('is-downloaded-card', isDownloaded);

    const media = card.querySelector('.crate-card-media');
    let pill = card.querySelector('.crate-downloaded-pill');
    if (isDownloaded && !pill && media) {
      const newPill = document.createElement('div');
      newPill.className = 'crate-downloaded-pill';
      newPill.title = 'Already in your library / sample stash';
      newPill.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span>Downloaded</span>
      `;
      media.appendChild(newPill);
    } else if (!isDownloaded && pill) {
      pill.remove();
    }

    const sampleBtn = card.querySelector('.btn-card-sample');
    if (sampleBtn) {
      sampleBtn.classList.toggle('is-downloaded', isDownloaded);
      sampleBtn.title = isDownloaded ? 'Already downloaded (Click to re-download or convert)' : 'Download audio';
      const span = sampleBtn.querySelector('span');
      if (span) span.textContent = isDownloaded ? 'In Stash' : 'Download';
      const svg = sampleBtn.querySelector('svg');
      if (svg) {
        svg.innerHTML = isDownloaded 
          ? '<polyline points="20 6 9 17 4 12"></polyline>' 
          : '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>';
      }
    }
  });
}

function updateSimilarDownloadedBadges() {
  if (!window.currentSimilarTracks || window.currentSimilarTracks.length === 0) return;
  const cards = document.querySelectorAll('.similar-track-card');
  cards.forEach((card, idx) => {
    const track = window.currentSimilarTracks[idx];
    if (!track) return;
    const isDownloaded = isTrackDownloaded(track.id, track.title);
    const btn = card.querySelector('.btn-similar-download');
    if (btn) {
      btn.classList.toggle('is-downloaded', isDownloaded);
      btn.title = isDownloaded ? 'Already downloaded (Click to re-download)' : 'Download directly with current settings';
      const span = btn.querySelector('span');
      if (span) span.textContent = isDownloaded ? 'In Stash' : 'Download';
      const svg = btn.querySelector('svg');
      if (svg) {
        svg.innerHTML = isDownloaded 
          ? '<polyline points="20 6 9 17 4 12"></polyline>' 
          : '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>';
      }
    }
  });
}

function renderLibrary() {
  if (!libraryList) return;
  const query = searchLibrary ? searchLibrary.value.toLowerCase().trim() : '';
  const filtered = downloadedFiles.filter(f => 
    f.title.toLowerCase().includes(query) || 
    f.artist.toLowerCase().includes(query) ||
    f.filename.toLowerCase().includes(query) ||
    (f.key_display && f.key_display.toLowerCase().includes(query)) ||
    (f.bpm && `${f.bpm} bpm`.includes(query))
  );

  if (filtered.length === 0) {
    if (emptyLibrary) emptyLibrary.classList.remove('hidden');
    libraryList.innerHTML = '';
    if (emptyLibrary) libraryList.appendChild(emptyLibrary);
    return;
  }

  if (emptyLibrary) emptyLibrary.classList.add('hidden');

  // Store in global window for index lookup
  window.currentLibraryFiles = filtered;

  libraryList.innerHTML = filtered.map((f, idx) => {
    const isVid = !!f.is_video;
    const playBtnHtml = isVid
      ? `<button class="btn-file-play video-play" onclick="window.playLibraryFileByIndex(${idx})" title="Watch Video">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>`
      : `<button class="btn-file-play" onclick="window.playLibraryFileByIndex(${idx})" title="Play Audio">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>`;

    const badgeHtml = isVid
      ? `<span class="file-bitrate-pill video-badge">🎬 ${f.format} Video</span>`
      : `<span class="file-bitrate-pill">${f.bitrate || '320 kbps'}</span>`;

    const bpmBadge = f.bpm ? `<span class="file-bpm-pill" title="Detected Tempo">⚡ ${f.bpm} BPM</span>` : '';
    const keyBadge = f.key_display ? `<span class="file-key-pill" title="Musical Key & Camelot">🎵 ${f.key_display}</span>` : '';

    return `
      <div class="file-row">
        <div class="file-info-group">
          ${playBtnHtml}
          <div class="file-titles">
            <div class="file-main-title" title="${escapeHtml(f.title)}">${escapeHtml(f.title)}</div>
            <div class="file-artist-name">${escapeHtml(f.artist)}</div>
          </div>
        </div>

        <div class="file-badges">
          ${bpmBadge}
          ${keyBadge}
          ${badgeHtml}
          <span class="file-size-label">${f.file_size_mb}</span>
          <span class="file-size-label">${f.duration_str}</span>
        </div>

        <div class="file-actions">
          ${!isVid ? `
          <button class="btn-icon-subtle btn-action-chop" onclick="window.chopLibraryFileByIndex(${idx})" title="Chop & Sketch Beat (MPC / Ableton Style)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="6" cy="6" r="3"></circle>
              <circle cx="6" cy="18" r="3"></circle>
              <line x1="20" y1="4" x2="8.12" y2="15.88"></line>
              <line x1="14.47" y1="14.48" x2="20" y2="20"></line>
              <line x1="8.12" y1="8.12" x2="12" y2="12"></line>
            </svg>
          </button>
          ` : ''}
          <button class="btn-icon-subtle btn-action-harmonic" onclick="window.digHarmonicFromLibraryByIndex(${idx})" title="Dig Harmonic Cousins (Match BPM & Key in Crate)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polygon points="12 8 8 12 12 16 16 12 12 8"></polygon>
            </svg>
          </button>
          <button class="btn-icon-subtle" onclick="window.findSimilarLibraryByIndex(${idx})" title="Find Similar Songs">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </button>
          <a href="${f.download_url}" download class="btn-icon-subtle" title="Save to disk">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </a>
          <button class="btn-icon-subtle" onclick="window.deleteLibraryByIndex(${idx})" title="Delete">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.playLibraryFileByIndex = function(idx) {
  if (!window.currentLibraryFiles || !window.currentLibraryFiles[idx]) return;
  const f = window.currentLibraryFiles[idx];
  if (f.is_video) {
    playVideoFile(f.filename, f.title, f.format, f.file_size_mb);
  } else {
    playFile(f.filename, f.title, f.artist, f.bpm || '', f.key_display || '');
  }
};

window.chopLibraryFileByIndex = function(idx) {
  if (!window.currentLibraryFiles || !window.currentLibraryFiles[idx]) return;
  const f = window.currentLibraryFiles[idx];
  if (window.loadTrackIntoChopper) {
    window.loadTrackIntoChopper(f.filename, f.title, f.bpm || '');
  }
};

window.findSimilarLibraryByIndex = function(idx) {
  if (!window.currentLibraryFiles || !window.currentLibraryFiles[idx]) return;
  const f = window.currentLibraryFiles[idx];
  findSimilarForTrack(f.filename, f.title, f.artist);
};

window.digHarmonicFromLibraryByIndex = async function(idx) {
  if (!window.currentLibraryFiles || !window.currentLibraryFiles[idx]) return;
  const f = window.currentLibraryFiles[idx];

  // 1. Switch tab to Crate Digging
  if (typeof switchTab === 'function') {
    switchTab('crate');
  }

  // 2. Ensure library seeds are loaded
  await loadCrateLibrarySeeds();

  // 3. Set library seed dropdown and target values
  const seedSelect = document.getElementById('crateLibrarySeedSelect');
  const bpmInput = document.getElementById('crateTargetBpm');
  const keySelect = document.getElementById('crateTargetKey');
  const rabbitInput = document.getElementById('crateRabbitHoleInput');

  if (seedSelect) seedSelect.value = f.filename;
  if (bpmInput) bpmInput.value = f.bpm ? Math.round(f.bpm) : '';
  if (keySelect && f.camelot) keySelect.value = f.camelot;

  updateHarmonicFilterUI();

  // 4. Populate Rabbit Hole input with track artist/title or URL
  if (rabbitInput) {
    const vidIdMatch = f.filename && f.filename.match(/\[([0-9A-Za-z_-]{11})\]/);
    if (vidIdMatch) {
      rabbitInput.value = `https://www.youtube.com/watch?v=${vidIdMatch[1]}`;
    } else {
      rabbitInput.value = `${f.artist || ''} ${f.title || ''}`.trim();
    }
  }

  // 5. Trigger rabbit hole search for algorithmic & harmonic cousins
  triggerRabbitHoleDig();
};

window.deleteLibraryByIndex = function(idx) {
  if (!window.currentLibraryFiles || !window.currentLibraryFiles[idx]) return;
  const f = window.currentLibraryFiles[idx];
  deleteFile(f.filename);
};

window.findSimilarForTrack = function(encFilename, title, artist) {
  const filename = decodeURIComponent(encFilename);
  if (tabBtnYoutube) {
    tabBtnYoutube.click();
  }

  // Find file in downloadedFiles if available
  const fileObj = (downloadedFiles || []).find(f => f.filename === filename);
  const durStr = fileObj ? fileObj.duration_str : '0:00';
  const thumb = fileObj && fileObj.thumbnail_url ? fileObj.thumbnail_url : '';
  const vidIdMatch = filename.match(/\[([0-9A-Za-z_-]{11})\]/);
  const trackId = vidIdMatch ? vidIdMatch[1] : filename;
  const trackUrl = vidIdMatch ? `https://www.youtube.com/watch?v=${vidIdMatch[1]}` : '';

  if (youtubeUrlInput) youtubeUrlInput.value = trackUrl;
  if (customTitleInput) customTitleInput.value = title;
  if (customArtistInput) customArtistInput.value = artist;

  currentVideoInfo = {
    id: trackId,
    title: title,
    artist: artist,
    uploader: artist,
    duration_str: durStr,
    thumbnail: thumb,
    url: trackUrl,
    is_playlist: false
  };

  renderPreview(currentVideoInfo);
  if (previewType) previewType.textContent = 'Library Track';

  if (previewContainer) {
    previewContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  fetchSimilarTracks();
};

// Audio Player Playback
window.playFile = function(encodedFilename, title, artist, bpm, keyDisplay) {
  const filename = decodeURIComponent(encodedFilename);
  currentPlayingFile = filename;
  if (nativeAudio) {
    nativeAudio.src = `/api/stream/${encodeURIComponent(filename)}`;
    if (playerTitle) playerTitle.textContent = title;
    if (playerArtist) playerArtist.textContent = artist;
    
    if (playerBpmKey) {
      const tags = [];
      if (bpm) tags.push(`⚡ ${bpm} BPM`);
      if (keyDisplay) tags.push(`🎵 ${keyDisplay}`);
      if (tags.length > 0) {
        playerBpmKey.textContent = tags.join(' • ');
        playerBpmKey.classList.remove('hidden');
      } else {
        playerBpmKey.classList.add('hidden');
      }
    }

    if (audioPlayerBar) {
      audioPlayerBar.classList.remove('hidden');
      document.body.classList.add('audio-bar-active');
    }

    nativeAudio.play().then(() => {
      if (playIcon) playIcon.classList.add('hidden');
      if (pauseIcon) pauseIcon.classList.remove('hidden');
    }).catch(e => console.error('Play error', e));
  }
};

function toggleAudioPlay() {
  if (!nativeAudio) return;
  if (nativeAudio.paused) {
    nativeAudio.play();
    if (playIcon) playIcon.classList.add('hidden');
    if (pauseIcon) pauseIcon.classList.remove('hidden');
  } else {
    nativeAudio.pause();
    if (playIcon) playIcon.classList.remove('hidden');
    if (pauseIcon) pauseIcon.classList.add('hidden');
  }
}

window.deleteFile = async function(encodedFilename) {
  const filename = decodeURIComponent(encodedFilename);
  if (!confirm(`Delete "${filename}"?`)) return;

  try {
    const res = await fetch(`/api/files/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    if (res.ok) {
      if (currentPlayingFile === filename && nativeAudio) {
        nativeAudio.pause();
        if (audioPlayerBar) {
          audioPlayerBar.classList.add('hidden');
          document.body.classList.remove('audio-bar-active');
        }
      }
      fetchLibrary();
    }
  } catch (err) {
    alert(`Failed to delete: ${err.message}`);
  }
};



function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}


// =============================================================================
// CRATE DIGGER & SAMPLE DISCOVERY CONTROLLER
// =============================================================================

let crateGenresLoaded = false;
let crateErasLoaded = false;
let selectedCrateEra = 'any';
let selectedCrateGenreId = null;
let currentAuditionTrack = null;
let auditionAudioElement = new Audio();
let crateFavorites = [];
let isVaultOnlyActive = false;
let crateLibrarySeeds = [];
let crateLibrarySeedsLoaded = false;

function getHarmonicParams() {
  const bpmInput = document.getElementById('crateTargetBpm');
  const keySelect = document.getElementById('crateTargetKey');
  const seedSelect = document.getElementById('crateLibrarySeedSelect');

  const target_bpm = bpmInput && bpmInput.value ? parseFloat(bpmInput.value) : undefined;
  const target_key = keySelect && keySelect.value ? keySelect.value : undefined;
  const seed_library_file = seedSelect && seedSelect.value ? seedSelect.value : undefined;
  const vault_only = isVaultOnlyActive ? true : false;

  return { target_bpm, target_key, seed_library_file, vault_only };
}

function updateHarmonicFilterUI() {
  const { target_bpm, target_key, seed_library_file, vault_only } = getHarmonicParams();
  const resetBtn = document.getElementById('btnResetHarmonicFilters');
  const hasFilter = !!(target_bpm || target_key || seed_library_file || vault_only);
  if (resetBtn) {
    resetBtn.classList.toggle('hidden', !hasFilter);
  }
}

function resetHarmonicFilters() {
  const bpmInput = document.getElementById('crateTargetBpm');
  const keySelect = document.getElementById('crateTargetKey');
  const seedSelect = document.getElementById('crateLibrarySeedSelect');
  const vaultBtn = document.getElementById('btnToggleVaultOnly');

  if (bpmInput) bpmInput.value = '';
  if (keySelect) keySelect.value = '';
  if (seedSelect) seedSelect.value = '';
  isVaultOnlyActive = false;
  if (vaultBtn) vaultBtn.classList.remove('active');

  updateHarmonicFilterUI();
}

async function loadCrateLibrarySeeds() {
  const seedSelect = document.getElementById('crateLibrarySeedSelect');
  if (!seedSelect) return;

  try {
    const res = await fetch('/api/crate/library-seeds');
    if (!res.ok) return;
    crateLibrarySeeds = await res.json();
    crateLibrarySeedsLoaded = true;

    const currentVal = seedSelect.value;
    seedSelect.innerHTML = '<option value="">None (Custom / Any)</option>' +
      crateLibrarySeeds.map(s => {
        const parts = [];
        if (s.bpm) parts.push(`${Math.round(s.bpm)} BPM`);
        if (s.camelot) parts.push(s.camelot);
        const metaStr = parts.length > 0 ? ` (${parts.join(' • ')})` : '';
        const label = `${s.title || s.filename}${metaStr}`;
        return `<option value="${escapeHtml(s.filename)}">${escapeHtml(label)}</option>`;
      }).join('');

    if (currentVal) seedSelect.value = currentVal;
  } catch (err) {
    console.warn('Could not load crate library seeds:', err);
  }
}

// Load favorites from localStorage
try {
  const saved = localStorage.getItem('crate_favorites');
  if (saved) crateFavorites = JSON.parse(saved);
} catch (e) {
  crateFavorites = [];
}

function saveCrateFavorites() {
  try {
    localStorage.setItem('crate_favorites', JSON.stringify(crateFavorites));
  } catch (e) {}
  renderCrateFavorites();
}

function isTrackFavorite(trackId) {
  return crateFavorites.some(t => t.id === trackId);
}

function isTrackDownloaded(trackId, title) {
  if (!downloadedFiles || downloadedFiles.length === 0) return false;
  if (!trackId && !title) return false;

  const normalizedTitle = title ? title.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

  return downloadedFiles.some(f => {
    // 1. Direct match on YouTube video ID in filename pattern [VIDEO_ID]
    if (trackId && f.filename) {
      if (f.filename.includes(`[${trackId}]`)) return true;
    }
    // 2. Direct match on f.id
    if (trackId && f.id === trackId) return true;

    // 3. Match by normalized title if title is reasonably specific
    if (normalizedTitle && normalizedTitle.length >= 6 && f.title) {
      const fNorm = f.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (fNorm && (fNorm.includes(normalizedTitle) || normalizedTitle.includes(fNorm))) {
        return true;
      }
    }
    return false;
  });
}

function toggleFavoriteTrack(track) {
  if (!track || !track.id) return;
  const idx = crateFavorites.findIndex(t => t.id === track.id);
  if (idx >= 0) {
    crateFavorites.splice(idx, 1);
  } else {
    crateFavorites.unshift(track);
  }
  saveCrateFavorites();
  updateFavoriteIcons(track.id);
}

function updateFavoriteIcons(trackId) {
  const isFav = isTrackFavorite(trackId);
  // Update Crate card buttons
  document.querySelectorAll(`.btn-card-fav[data-track-id="${trackId}"]`).forEach(btn => {
    btn.innerHTML = isFav ? '❤️' : '🤍';
    btn.classList.toggle('is-favorite', isFav);
    btn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
  });
  // Update Similar track card buttons
  document.querySelectorAll(`.btn-similar-fav[data-track-id="${trackId}"]`).forEach(btn => {
    btn.innerHTML = isFav ? '❤️' : '🤍';
    btn.classList.toggle('is-favorite', isFav);
    btn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
  });
  // Update Preview Card favorite button if current track matches
  if (currentVideoInfo && currentVideoInfo.id === trackId && btnPreviewToggleFavorite && previewFavIcon) {
    btnPreviewToggleFavorite.classList.toggle('is-favorite', isFav);
    previewFavIcon.textContent = isFav ? '❤️ Saved Favorite' : '🤍 Save to Favorites';
    btnPreviewToggleFavorite.title = isFav ? 'Saved in Crate Favorites & Anchors' : 'Save to Crate Favorites & Anchors';
  }
  // Update modal icon if current track matches
  if (currentAuditionTrack && currentAuditionTrack.id === trackId) {
    const modalIcon = document.getElementById('modalFavIcon');
    if (modalIcon) modalIcon.textContent = isFav ? '❤️' : '🤍';
  }
}

function renderCrateFavorites() {
  const sec = document.getElementById('crateFavoritesSection');
  const countPill = document.getElementById('favoritesCountPill');
  const carousel = document.getElementById('favoritesCarousel');
  if (!sec || !carousel) return;

  if (crateFavorites.length === 0) {
    sec.classList.add('hidden');
    return;
  }

  sec.classList.remove('hidden');
  if (countPill) countPill.textContent = `${crateFavorites.length} saved`;

  carousel.innerHTML = crateFavorites.map((t, idx) => `
    <div class="favorite-item-card" data-fav-id="${escapeHtml(t.id)}">
      <img class="favorite-thumb" src="${escapeHtml(t.thumbnail)}" alt="${escapeHtml(t.title)}" />
      <div class="favorite-info">
        <div class="favorite-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</div>
        <div class="favorite-uploader">${escapeHtml(t.uploader || t.artist)} • ${escapeHtml(t.duration_str)}</div>
        <div class="favorite-actions">
          <button class="btn-anchor-hop" onclick="hopFromFavoriteByIndex(${idx})" title="Find similar tracks">
            <span>Find Similar</span>
          </button>
          <button class="btn-fav-remove" onclick="removeFavoriteByIndex(${idx})" title="Remove from favorites">
            ✕
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

window.hopFromFavoriteByIndex = function(idx) {
  const track = crateFavorites[idx];
  if (track) {
    const input = document.getElementById('crateRabbitHoleInput');
    if (input) {
      input.value = track.url;
      triggerRabbitHoleDig();
    }
  }
};

window.removeFavoriteByIndex = function(idx) {
  if (idx >= 0 && idx < crateFavorites.length) {
    const track = crateFavorites[idx];
    crateFavorites.splice(idx, 1);
    saveCrateFavorites();
    if (track) updateFavoriteIcons(track.id);
  }
};

function setupCrateEventListeners() {
  const btnSurpriseMe = document.getElementById('btnSurpriseMe');
  if (btnSurpriseMe) {
    btnSurpriseMe.addEventListener('click', triggerSurpriseMeDig);
  }

  const btnDigRabbitHole = document.getElementById('btnDigRabbitHole');
  const crateRabbitHoleInput = document.getElementById('crateRabbitHoleInput');
  if (btnDigRabbitHole) {
    btnDigRabbitHole.addEventListener('click', triggerRabbitHoleDig);
  }
  if (crateRabbitHoleInput) {
    crateRabbitHoleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') triggerRabbitHoleDig();
    });
  }

  // Harmonic Toolbar Listeners
  const crateLibrarySeedSelect = document.getElementById('crateLibrarySeedSelect');
  const crateTargetBpm = document.getElementById('crateTargetBpm');
  const crateTargetKey = document.getElementById('crateTargetKey');
  const btnToggleVaultOnly = document.getElementById('btnToggleVaultOnly');
  const btnResetHarmonicFilters = document.getElementById('btnResetHarmonicFilters');

  if (crateLibrarySeedSelect) {
    crateLibrarySeedSelect.addEventListener('change', () => {
      const selectedFilename = crateLibrarySeedSelect.value;
      if (selectedFilename && crateLibrarySeeds) {
        const seed = crateLibrarySeeds.find(s => s.filename === selectedFilename);
        if (seed) {
          if (seed.bpm && crateTargetBpm) crateTargetBpm.value = Math.round(seed.bpm);
          if (seed.camelot && crateTargetKey) crateTargetKey.value = seed.camelot;
        }
      }
      updateHarmonicFilterUI();
    });
  }

  if (crateTargetBpm) {
    crateTargetBpm.addEventListener('input', updateHarmonicFilterUI);
    crateTargetBpm.addEventListener('change', updateHarmonicFilterUI);
  }

  if (crateTargetKey) {
    crateTargetKey.addEventListener('change', updateHarmonicFilterUI);
  }

  if (btnToggleVaultOnly) {
    btnToggleVaultOnly.addEventListener('click', () => {
      isVaultOnlyActive = !isVaultOnlyActive;
      btnToggleVaultOnly.classList.toggle('active', isVaultOnlyActive);
      updateHarmonicFilterUI();

      // If a genre is currently selected, re-dig with updated vault filter
      if (selectedCrateGenreId) {
        const activeGenreBtn = document.querySelector('.genre-pill-btn.active');
        const label = activeGenreBtn ? activeGenreBtn.innerText : selectedCrateGenreId;
        digGenreCrate(selectedCrateGenreId, label);
      }
    });
  }

  if (btnResetHarmonicFilters) {
    btnResetHarmonicFilters.addEventListener('click', () => {
      resetHarmonicFilters();
      if (selectedCrateGenreId) {
        const activeGenreBtn = document.querySelector('.genre-pill-btn.active');
        const label = activeGenreBtn ? activeGenreBtn.innerText : selectedCrateGenreId;
        digGenreCrate(selectedCrateGenreId, label);
      }
    });
  }

  const btnClearFavorites = document.getElementById('btnClearFavorites');
  if (btnClearFavorites) {
    btnClearFavorites.addEventListener('click', () => {
      if (confirm('Clear all saved crate anchors and favorites?')) {
        crateFavorites = [];
        saveCrateFavorites();
        document.querySelectorAll('.btn-card-fav').forEach(btn => {
          btn.innerHTML = '🤍';
          btn.classList.remove('is-favorite');
        });
      }
    });
  }

  // Audition Modal Controls
  const btnCloseCrateYtModal = document.getElementById('btnCloseCrateYtModal');
  const crateAuditionModal = document.getElementById('crateAuditionModal');
  if (btnCloseCrateYtModal) {
    btnCloseCrateYtModal.addEventListener('click', closeCrateYtModal);
  }
  if (crateAuditionModal) {
    crateAuditionModal.addEventListener('click', (e) => {
      if (e.target === crateAuditionModal) closeCrateYtModal();
    });
  }

  const btnModalToggleFavorite = document.getElementById('btnModalToggleFavorite');
  if (btnModalToggleFavorite) {
    btnModalToggleFavorite.addEventListener('click', () => {
      if (currentAuditionTrack) toggleFavoriteTrack(currentAuditionTrack);
    });
  }

  const btnModalSampleNow = document.getElementById('btnModalSampleNow');
  if (btnModalSampleNow) {
    btnModalSampleNow.addEventListener('click', () => {
      if (currentAuditionTrack) {
        const trackToSample = currentAuditionTrack;
        sampleCrateTrack(trackToSample);
      }
    });
  }

  const btnModalBadSuggestion = document.getElementById('btnModalBadSuggestion');
  if (btnModalBadSuggestion) {
    btnModalBadSuggestion.addEventListener('click', () => {
      if (currentAuditionTrack) {
        openFeedbackModal(currentAuditionTrack);
      }
    });
  }

  // Feedback Modal Event Listeners
  const btnCloseFeedbackModal = document.getElementById('btnCloseFeedbackModal');
  const btnCancelFeedback = document.getElementById('btnCancelFeedback');
  const btnSubmitFeedback = document.getElementById('btnSubmitFeedback');
  const crateFeedbackModal = document.getElementById('crateFeedbackModal');

  if (btnCloseFeedbackModal) btnCloseFeedbackModal.addEventListener('click', closeFeedbackModal);
  if (btnCancelFeedback) btnCancelFeedback.addEventListener('click', closeFeedbackModal);
  if (btnSubmitFeedback) btnSubmitFeedback.addEventListener('click', submitCrateFeedback);
  if (crateFeedbackModal) {
    crateFeedbackModal.addEventListener('click', (e) => {
      if (e.target === crateFeedbackModal) closeFeedbackModal();
    });
  }

  // Hotspot Jump Buttons
  document.querySelectorAll('.btn-hotspot').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const posFraction = parseFloat(e.currentTarget.getAttribute('data-pos') || '0');
      jumpAuditionHotspot(posFraction);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (crateFeedbackModal && !crateFeedbackModal.classList.contains('hidden')) {
        closeFeedbackModal();
      } else if (crateAuditionModal && !crateAuditionModal.classList.contains('hidden')) {
        closeCrateYtModal();
      }
    }
  });

  renderCrateFavorites();
}

async function loadCrateEras() {
  if (crateErasLoaded) return;
  const crateEraPills = document.getElementById('crateEraPills');
  if (!crateEraPills) return;

  try {
    const res = await fetch('/api/crate/eras');
    if (!res.ok) return;
    const eras = await res.json();
    crateErasLoaded = true;

    crateEraPills.innerHTML = eras.map(e => `
      <button class="era-pill-btn ${e.id === selectedCrateEra ? 'active' : ''}" data-era="${escapeHtml(e.id)}">
        <span>${escapeHtml(e.label)}</span>
      </button>
    `).join('');

    crateEraPills.querySelectorAll('.era-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        crateEraPills.querySelectorAll('.era-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedCrateEra = btn.getAttribute('data-era');
        
        // If a genre is currently selected, re-dig with the newly selected era
        if (selectedCrateGenreId) {
          const activeGenreBtn = document.querySelector('.genre-pill-btn.active');
          const label = activeGenreBtn ? activeGenreBtn.innerText : selectedCrateGenreId;
          digGenreCrate(selectedCrateGenreId, label);
        }
      });
    });
  } catch (err) {
    console.warn('Could not load crate eras', err);
  }
}

async function loadCrateGenres() {
  await loadCrateEras();
  if (crateGenresLoaded) return;
  const crateGenrePills = document.getElementById('crateGenrePills');
  if (!crateGenrePills) return;

  try {
    const res = await fetch('/api/crate/genres');
    if (!res.ok) return;
    const genres = await res.json();
    crateGenresLoaded = true;

    crateGenrePills.innerHTML = genres.map(g => `
      <button class="genre-pill-btn" data-genre="${escapeHtml(g.id)}" title="${escapeHtml(g.description)}">
        <span class="pill-icon">${g.icon}</span>
        <span>${escapeHtml(g.name)}</span>
      </button>
    `).join('');

    crateGenrePills.querySelectorAll('.genre-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        crateGenrePills.querySelectorAll('.genre-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const genreId = btn.getAttribute('data-genre');
        selectedCrateGenreId = genreId;
        digGenreCrate(genreId, btn.innerText);
      });
    });
  } catch (err) {
    console.warn('Could not load crate genres', err);
  }
}

async function digGenreCrate(genreId, label) {
  const eraLabel = selectedCrateEra !== 'any' ? ` [${selectedCrateEra.toUpperCase()}]` : '';
  const { target_bpm, target_key, seed_library_file, vault_only } = getHarmonicParams();
  let statusNote = `Searching ${label.trim()}${eraLabel}`;
  if (target_bpm || target_key) {
    statusNote += ` (${target_bpm ? target_bpm + ' BPM' : ''}${target_bpm && target_key ? ' • ' : ''}${target_key || ''})`;
  }
  if (vault_only) statusNote += ' [Vaults Only]';
  statusNote += '...';

  setCrateLoading(true, statusNote);
  try {
    const res = await fetch('/api/crate/dig', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        genre_id: genreId,
        era: selectedCrateEra,
        limit: 12,
        obscurity_level: 'deep',
        target_bpm,
        target_key,
        seed_library_file,
        vault_only
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to find tracks' }));
      throw new Error(err.detail || 'Search error');
    }
    const data = await res.json();
    renderCrateResults(data);
  } catch (err) {
    alert(`Search Error: ${err.message}`);
  } finally {
    setCrateLoading(false);
  }
}

async function triggerSurpriseMeDig() {
  const eraLabel = selectedCrateEra !== 'any' ? ` [${selectedCrateEra.toUpperCase()}]` : '';
  const { target_bpm, target_key, seed_library_file, vault_only } = getHarmonicParams();
  let statusNote = `Finding a random record${eraLabel}`;
  if (target_bpm || target_key) {
    statusNote += ` (${target_bpm ? target_bpm + ' BPM' : ''}${target_bpm && target_key ? ' • ' : ''}${target_key || ''})`;
  }
  if (vault_only) statusNote += ' [Vaults Only]';
  statusNote += '...';

  setCrateLoading(true, statusNote);
  try {
    const params = new URLSearchParams({ era: selectedCrateEra });
    if (target_bpm) params.append('target_bpm', target_bpm);
    if (target_key) params.append('target_key', target_key);
    if (vault_only) params.append('vault_only', 'true');

    const url = `/api/crate/surprise?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    renderCrateResults(data);
  } catch (err) {
    alert(`Search Error: ${err.message}`);
  } finally {
    setCrateLoading(false);
  }
}

async function triggerRabbitHoleDig() {
  const input = document.getElementById('crateRabbitHoleInput');
  if (!input) return;
  const val = input.value.trim();
  if (!val) {
    input.focus();
    return;
  }

  const eraLabel = selectedCrateEra !== 'any' ? ` [${selectedCrateEra.toUpperCase()}]` : '';
  const { target_bpm, target_key, seed_library_file, vault_only } = getHarmonicParams();
  let statusNote = `Searching tracks related to "${val.slice(0, 30)}"${eraLabel}`;
  if (target_bpm || target_key) {
    statusNote += ` (${target_bpm ? target_bpm + ' BPM' : ''}${target_bpm && target_key ? ' • ' : ''}${target_key || ''})`;
  }
  if (vault_only) statusNote += ' [Vaults Only]';
  statusNote += '...';

  setCrateLoading(true, statusNote);
  try {
    const res = await fetch('/api/crate/dig', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seed_query_or_url: val,
        era: selectedCrateEra,
        limit: 12,
        target_bpm,
        target_key,
        seed_library_file,
        vault_only
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to find similar tracks' }));
      throw new Error(err.detail || 'Search error');
    }
    const data = await res.json();
    renderCrateResults(data);
  } catch (err) {
    alert(`Search Error: ${err.message}`);
  } finally {
    setCrateLoading(false);
  }
}

function setCrateLoading(loading, message = 'Searching...') {
  const loader = document.getElementById('crateLoading');
  const text = document.getElementById('crateLoadingText');
  const deck = document.getElementById('crateResultsDeck');

  if (loader) {
    if (loading) {
      loader.classList.remove('hidden');
      if (text) text.textContent = message;
      // Only hide deck if there are no existing results so page height doesn't collapse
      if (deck && (!currentCrateTracks || currentCrateTracks.length === 0)) {
        deck.classList.add('hidden');
      }
    } else {
      loader.classList.add('hidden');
    }
  }
}

let currentCrateTracks = [];

function renderCrateResults(data) {
  const deck = document.getElementById('crateResultsDeck');
  const title = document.getElementById('crateDeckTitle');
  const count = document.getElementById('crateDeckCount');
  const grid = document.getElementById('crateGrid');

  if (!deck || !grid) return;

  if (title) title.textContent = data.headline || 'Discovered Records';
  if (count) count.textContent = `${data.count} records`;

  const tracks = data.tracks || [];
  currentCrateTracks = tracks;

  if (tracks.length === 0) {
    grid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1; padding: 2rem; text-align: center;">No tracks found for this query. Try another search or genre.</p>';
    deck.classList.remove('hidden');
    return;
  }

  grid.innerHTML = tracks.map((t, idx) => {
    const tagsHtml = (t.sample_tags || []).map(tag => 
      `<span class="crate-tag">${escapeHtml(tag)}</span>`
    ).join('');
    const isDownloaded = isTrackDownloaded(t.id, t.title);

    const harmonicBadgeHtml = t.harmonic_match 
      ? `<span class="crate-badge-harmonic" title="Harmonic Sync Match">⚡ ${escapeHtml(t.harmonic_match)}</span>` 
      : '';
    const provenanceBadgeHtml = t.provenance 
      ? `<span class="crate-badge-vault" title="Archival Provenance">🏛️ ${escapeHtml(t.provenance)}</span>` 
      : '';

    return `
      <div class="crate-card ${isDownloaded ? 'is-downloaded-card' : ''}" data-track-index="${idx}">
        <div class="crate-card-media">
          <img class="crate-card-thumb" src="${escapeHtml(t.thumbnail)}" alt="${escapeHtml(t.title)}" loading="lazy" />
          <div class="crate-score-badge">
            <span>Score: ${t.sampleability_score}</span>
          </div>
          ${isDownloaded ? `
          <div class="crate-downloaded-pill" title="Already in your library / sample stash">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Downloaded</span>
          </div>
          ` : ''}
          <span class="crate-card-duration">${escapeHtml(t.duration_str)}</span>
        </div>

        <div class="crate-card-body">
          <h4 class="crate-card-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</h4>
          <div class="crate-card-uploader">${escapeHtml(t.uploader)} • ${escapeHtml(t.views_str || '')}</div>
          
          <div class="crate-card-tags">
            ${harmonicBadgeHtml}
            ${provenanceBadgeHtml}
            ${tagsHtml}
          </div>

          <div class="crate-card-footer">
            <button class="btn-card-audition" onclick="auditionCrateTrackByIndex(${idx})" title="Listen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span>Audition</span>
            </button>
            <button class="btn-card-sample ${isDownloaded ? 'is-downloaded' : ''}" onclick="sampleCrateTrackByIndex(${idx})" title="${isDownloaded ? 'Already downloaded (Click to re-download or convert)' : 'Download audio'}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${isDownloaded ? `
                <polyline points="20 6 9 17 4 12"></polyline>
                ` : `
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
                `}
              </svg>
              <span>${isDownloaded ? 'In Stash' : 'Download'}</span>
            </button>
            <button class="btn-card-fav ${isTrackFavorite(t.id) ? 'is-favorite' : ''}" data-track-id="${escapeHtml(t.id)}" onclick="toggleFavoriteByIndex(${idx})" title="${isTrackFavorite(t.id) ? 'Remove from favorites' : 'Add to favorites'}">
              ${isTrackFavorite(t.id) ? '❤️' : '🤍'}
            </button>
            <button class="btn-card-hop" onclick="hopFromTrackByIndex(${idx})" title="Find similar tracks in Rabbit Hole">
              🐇
            </button>
            <button class="btn-card-dislike" onclick="openFeedbackModalForTrackByIndex(${idx})" title="Not suitable? Hide from results">
              ✕
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  deck.classList.remove('hidden');
}

window.toggleFavoriteByIndex = function(idx) {
  const track = currentCrateTracks[idx];
  if (track) toggleFavoriteTrack(track);
};

window.auditionCrateTrackByIndex = function(idx) {
  const track = currentCrateTracks[idx];
  if (track) auditionCrateTrack(track);
};

window.sampleCrateTrackByIndex = function(idx) {
  const track = currentCrateTracks[idx];
  if (track) sampleCrateTrack(track);
};

window.hopFromTrackByIndex = function(idx) {
  const track = currentCrateTracks[idx];
  if (track) hopFromTrack(track);
};

window.auditionCrateTrack = function(track) {
  currentAuditionTrack = track;
  const modal = document.getElementById('crateAuditionModal');
  const modalTitle = document.getElementById('crateYtModalTitle');
  const iframe = document.getElementById('crateYtIframe');

  if (modalTitle) modalTitle.textContent = `${track.title} (${track.duration_str})`;

  // Pause local audio player
  if (nativeAudio && !nativeAudio.paused) nativeAudio.pause();

  // Load YouTube embedded player with autoplay and JS API enabled
  if (iframe) {
    const embedUrl = `https://www.youtube-nocookie.com/embed/${track.id}?autoplay=1&enablejsapi=1&rel=0`;
    iframe.src = embedUrl;
  }

  if (modal) modal.classList.remove('hidden');

  const btnModalOpenYt = document.getElementById('btnModalOpenYt');
  if (btnModalOpenYt) {
    btnModalOpenYt.href = track.url;
  }

  // Update modal favorite heart state
  const modalFavIcon = document.getElementById('modalFavIcon');
  if (modalFavIcon) {
    modalFavIcon.textContent = isTrackFavorite(track.id) ? '❤️' : '🤍';
  }

  // Pre-fill converter input and tags for seamless 1-click sampling
  if (youtubeUrlInput) {
    youtubeUrlInput.value = track.url;
  }
  if (customTitleInput) {
    customTitleInput.value = track.title || '';
  }
  if (customArtistInput) {
    customArtistInput.value = track.artist || track.uploader || '';
  }
};

window.sampleCrateTrack = async function(track, autoStart = true) {
  const targetTrack = track || currentAuditionTrack;
  if (!targetTrack) {
    console.warn('sampleCrateTrack called without a valid track');
    return;
  }
  closeCrateYtModal();
  
  // 1. Switch to Sample Ingest tab
  if (tabBtnYoutube) {
    tabBtnYoutube.click();
  }

  // 2. Pre-fill URL and tags
  if (youtubeUrlInput) {
    youtubeUrlInput.value = targetTrack.url;
  }
  if (customTitleInput) {
    customTitleInput.value = targetTrack.title || '';
  }
  if (customArtistInput) {
    customArtistInput.value = targetTrack.artist || targetTrack.uploader || '';
  }

  // 3. Immediately construct and render preview card
  currentVideoInfo = {
    id: targetTrack.id,
    title: targetTrack.title,
    artist: targetTrack.artist || targetTrack.uploader,
    uploader: targetTrack.uploader || '',
    duration: targetTrack.duration,
    duration_str: targetTrack.duration_str,
    thumbnail: targetTrack.thumbnail,
    is_playlist: false
  };
  renderPreview(currentVideoInfo);
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // 4. Trigger download directly with the crate track's metadata
  if (autoStart) {
    const quality = audioQualitySelect ? audioQualitySelect.value : '320k';
    const embed_thumbnail = embedCoverCheck ? embedCoverCheck.checked : true;
    const embed_metadata = embedTagsCheck ? embedTagsCheck.checked : true;
    const custom_title = targetTrack.title;
    const custom_artist = targetTrack.artist || targetTrack.uploader;

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetTrack.url,
          quality,
          custom_title,
          custom_artist,
          embed_thumbnail,
          embed_metadata
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to start download' }));
        throw new Error(err.detail || 'Failed to start download');
      }
    } catch (e) {
      console.error('Auto sample error:', e);
      alert(`Could not start sample download: ${e.message}`);
    }
  }

  // 5. Automatically discover similar songs & recommendations (Alternatives drawer)
  fetchSimilarTracks();
};

window.hopFromTrack = function(track) {
  closeCrateYtModal();
  const input = document.getElementById('crateRabbitHoleInput');
  if (input) {
    input.value = track.url;
    triggerRabbitHoleDig();
  }
};

function jumpAuditionHotspot(fraction) {
  if (!currentAuditionTrack) return;
  const iframe = document.getElementById('crateYtIframe');
  const totalSec = currentAuditionTrack.duration || 180;
  const targetSec = Math.floor(totalSec * fraction);

  if (iframe) {
    // Reload iframe at start timestamp with autoplay
    iframe.src = `https://www.youtube-nocookie.com/embed/${currentAuditionTrack.id}?autoplay=1&start=${targetSec}&enablejsapi=1&rel=0`;
  }
}

function closeCrateYtModal() {
  const modal = document.getElementById('crateAuditionModal');
  const iframe = document.getElementById('crateYtIframe');
  if (modal) modal.classList.add('hidden');
  if (iframe) iframe.src = '';
  currentAuditionTrack = null;
}

// =============================================================================
// CRATE FEEDBACK & ADAPTIVE LEARNING
// =============================================================================

let currentFeedbackTrack = null;

window.openFeedbackModalForTrackByIndex = function(idx) {
  const track = currentCrateTracks[idx];
  if (!track) return;
  openFeedbackModal(track);
};

function openFeedbackModal(track) {
  currentFeedbackTrack = track;
  const modal = document.getElementById('crateFeedbackModal');
  const titleEl = document.getElementById('feedbackTrackTitle');
  const noteInput = document.getElementById('feedbackOptionalNote');

  if (titleEl) {
    titleEl.textContent = `${track.title} • (${track.uploader || track.artist})`;
  }
  if (noteInput) {
    noteInput.value = '';
  }

  // Default radio selection
  const defaultRadio = document.querySelector('input[name="feedbackReason"][value="talking_vlog"]');
  if (defaultRadio) defaultRadio.checked = true;

  if (modal) modal.classList.remove('hidden');
}

function closeFeedbackModal() {
  const modal = document.getElementById('crateFeedbackModal');
  if (modal) modal.classList.add('hidden');
  currentFeedbackTrack = null;
}

async function submitCrateFeedback() {
  if (!currentFeedbackTrack) return;

  const selectedReason = document.querySelector('input[name="feedbackReason"]:checked');
  const reasonVal = selectedReason ? selectedReason.value : 'not_sampleable';
  const noteVal = document.getElementById('feedbackOptionalNote') ? document.getElementById('feedbackOptionalNote').value.trim() : '';

  const payload = {
    track_id: currentFeedbackTrack.id,
    title: currentFeedbackTrack.title,
    artist: currentFeedbackTrack.artist,
    uploader: currentFeedbackTrack.uploader,
    reason: reasonVal,
    note: noteVal
  };

  const btnSubmit = document.getElementById('btnSubmitFeedback');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerText = 'Learning...';
  }

  try {
    const res = await fetch('/api/crate/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error('Failed to register feedback');
    }

    const respData = await res.json();

    // Remove the disliked track immediately from active view
    const dislikedId = currentFeedbackTrack.id;
    currentCrateTracks = currentCrateTracks.filter(t => t.id !== dislikedId);
    
    // Close modals
    closeFeedbackModal();
    closeCrateYtModal();

    // Re-render deck without the removed track
    const deck = document.getElementById('crateResultsDeck');
    const deckCount = document.getElementById('crateDeckCount');
    if (deckCount) deckCount.textContent = `${currentCrateTracks.length} tracks`;
    renderCrateResults({ tracks: currentCrateTracks });

    // Show temporary feedback toast / alert
    alert(`👍 Feedback registered! Engine learned from this track and updated negative filters (${respData.learned_negative_tokens.join(', ')}).`);
  } catch (err) {
    alert(`Feedback error: ${err.message}`);
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerText = 'Save Feedback & Learn';
    }
  }
}

