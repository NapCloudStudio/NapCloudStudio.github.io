/* global YT */
"use strict";

// ── Constants ──────────────────────────────────────────
const PAGE_SIZE = 10; // videos to fetch per API call
const STORAGE_KEY = "yt_watchlist_config";

// ── State ──────────────────────────────────────────────
let apiKey = "";
let playlistId = "";
let nextPageToken = null;
let isFetching = false;
let allFetched = false;
let ytReady = false;
let pendingPlayerCards = [];

// ── DOM refs ───────────────────────────────────────────
const setupScreen = document.getElementById("setup-screen");
const feedScreen = document.getElementById("feed-screen");
const feedInner = document.getElementById("feed-inner");
const loader = document.getElementById("loader");
const endMessage = document.getElementById("end-message");
const errorMsg = document.getElementById("error-msg");
const btnLoad = document.getElementById("btn-load");
const btnBack = document.getElementById("btn-back");
const inputApiKey = document.getElementById("api-key");
const inputPlaylist = document.getElementById("playlist-id");

// ── YouTube IFrame API bootstrap ───────────────────────
window.onYouTubeIframeAPIReady = function () {
  ytReady = true;
  // Initialise any cards that were waiting for the API
  pendingPlayerCards.forEach(({ el, videoId }) => attachPlayer(el, videoId));
  pendingPlayerCards = [];
};

function loadYTScript() {
  if (document.getElementById("yt-iframe-api")) return;
  const tag = document.createElement("script");
  tag.id = "yt-iframe-api";
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
}

// ── Setup form ─────────────────────────────────────────
// Pre-fill saved playlist ID only (API key is not persisted for security)
(function restoreSaved() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
    if (saved.playlistId) inputPlaylist.value = saved.playlistId;
  } catch (_) {}
})();

btnLoad.addEventListener("click", startFeed);
inputApiKey.addEventListener("keydown", (e) => e.key === "Enter" && startFeed());
inputPlaylist.addEventListener("keydown", (e) => e.key === "Enter" && startFeed());

async function startFeed() {
  errorMsg.textContent = "";
  apiKey = inputApiKey.value.trim();
  playlistId = inputPlaylist.value.trim();

  if (!apiKey || !playlistId) {
    errorMsg.textContent = "Please fill in both fields.";
    return;
  }

  btnLoad.disabled = true;
  btnLoad.textContent = "Loading…";

  const ok = await fetchVideos();
  if (!ok) {
    btnLoad.disabled = false;
    btnLoad.textContent = "Load My Watchlist";
    return;
  }

  // Save playlist ID for convenience (API key intentionally not persisted)
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ playlistId }));
  } catch (_) {}

  setupScreen.style.display = "none";
  feedScreen.classList.add("active");
  loadYTScript();
  observeLoader();
}

btnBack.addEventListener("click", () => {
  feedScreen.classList.remove("active");
  setupScreen.style.display = "flex";
  // Reset state
  nextPageToken = null;
  allFetched = false;
  isFetching = false;
  feedInner.innerHTML = "";
  feedInner.appendChild(loader);
  endMessage.style.display = "none";
  btnLoad.disabled = false;
  btnLoad.textContent = "Load My Watchlist";
});

// ── YouTube Data API v3 ────────────────────────────────
async function fetchVideos() {
  if (isFetching || allFetched) return true;
  isFetching = true;

  let url =
    `https://www.googleapis.com/youtube/v3/playlistItems` +
    `?part=snippet&maxResults=${PAGE_SIZE}` +
    `&playlistId=${encodeURIComponent(playlistId)}` +
    `&key=${encodeURIComponent(apiKey)}`;

  if (nextPageToken) {
    url += `&pageToken=${encodeURIComponent(nextPageToken)}`;
  }

  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `HTTP ${res.status}`);
    }
  } catch (err) {
    errorMsg.textContent = `Error: ${err.message}`;
    isFetching = false;
    return false;
  }

  nextPageToken = data.nextPageToken || null;
  if (!nextPageToken) allFetched = true;

  const items = (data.items || []).filter(
    (item) =>
      item.snippet?.resourceId?.videoId &&
      item.snippet.title !== "Private video" &&
      item.snippet.title !== "Deleted video"
  );

  items.forEach((item) => appendCard(item.snippet));

  isFetching = false;
  return true;
}

// ── Card builder ───────────────────────────────────────
function appendCard(snippet) {
  const videoId = snippet.resourceId.videoId;
  const title = snippet.title || "Untitled";
  const channel = snippet.videoOwnerChannelTitle || "";
  const thumb =
    snippet.thumbnails?.maxres?.url ||
    snippet.thumbnails?.high?.url ||
    snippet.thumbnails?.medium?.url ||
    `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;

  const card = document.createElement("div");
  card.className = "video-card";
  card.dataset.videoId = videoId;

  // Blurred thumbnail background
  const thumbBg = document.createElement("div");
  thumbBg.className = "thumb-bg";
  thumbBg.style.backgroundImage = `url("${encodeURI(thumb)}")`;

  // Player slot
  const playerSlot = document.createElement("div");
  playerSlot.className = "player-slot";
  playerSlot.id = `player-${videoId}`;

  // Info overlay
  const cardInfo = document.createElement("div");
  cardInfo.className = "card-info";

  const titleEl = document.createElement("div");
  titleEl.className = "video-title";
  titleEl.textContent = title;

  const channelEl = document.createElement("div");
  channelEl.className = "channel-name";
  channelEl.textContent = channel;

  cardInfo.appendChild(titleEl);
  cardInfo.appendChild(channelEl);

  // Action buttons (event listeners instead of onclick)
  const actions = document.createElement("div");
  actions.className = "card-actions";

  const btnYT = document.createElement("button");
  btnYT.className = "action-btn";
  btnYT.setAttribute("aria-label", "Open on YouTube");
  btnYT.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.488 3.45.029 5.804 0 12c.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0C23.512 20.55 23.971 18.196 24 12c-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z"/>
    </svg>YouTube`;
  btnYT.addEventListener("click", () => openYT(videoId));

  const btnShare = document.createElement("button");
  btnShare.className = "action-btn";
  btnShare.setAttribute("aria-label", "Share");
  btnShare.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
    </svg>Share`;
  btnShare.addEventListener("click", () => shareVideo(videoId, title));

  actions.appendChild(btnYT);
  actions.appendChild(btnShare);

  card.appendChild(thumbBg);
  card.appendChild(playerSlot);
  card.appendChild(cardInfo);
  card.appendChild(actions);

  // Insert before the loader sentinel
  feedInner.insertBefore(card, loader);

  // Attach player once the YT API is ready
  if (ytReady) {
    attachPlayer(card, videoId);
  } else {
    pendingPlayerCards.push({ el: card, videoId });
  }
}


// ── IFrame player ──────────────────────────────────────
function attachPlayer(cardEl, videoId) {
  const slotId = `player-${videoId}`;
  if (!document.getElementById(slotId)) return;

  new YT.Player(slotId, {
    videoId,
    playerVars: {
      autoplay: 0,
      controls: 1,
      playsinline: 1,
      rel: 0,
      modestbranding: 1,
      origin: window.location.origin,
    },
    events: {
      onReady(e) {
        // Auto-play when the card enters viewport
        setupAutoplay(cardEl, e.target);
      },
    },
  });
}

// ── Intersection-based autoplay ────────────────────────
function setupAutoplay(cardEl, player) {
  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.8) {
          try { player.playVideo(); } catch (_) {}
        } else {
          try { player.pauseVideo(); } catch (_) {}
        }
      });
    },
    { threshold: 0.8 }
  );
  obs.observe(cardEl);
}

// ── Infinite scroll via IntersectionObserver ───────────
function observeLoader() {
  const obs = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        if (allFetched) {
          loader.style.display = "none";
          endMessage.style.display = "block";
        } else {
          fetchVideos();
        }
      }
    },
    { threshold: 0.1 }
  );
  obs.observe(loader);
}

// ── Utility helpers ────────────────────────────────────
function openYT(videoId) {
  window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, "_blank", "noopener,noreferrer");
}

function shareVideo(videoId, title) {
  const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  if (navigator.share) {
    navigator.share({ title, url }).catch((err) => {
      if (err.name !== "AbortError") {
        alert("Sharing failed. Copy the link manually:\n" + url);
      }
    });
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url)
      .then(() => alert("Link copied to clipboard!"))
      .catch(() => alert("Could not copy link. Please copy it manually:\n" + url));
  } else {
    alert("Copy this link:\n" + url);
  }
}
