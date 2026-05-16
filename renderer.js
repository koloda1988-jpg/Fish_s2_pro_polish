const state = {
  bookPath: "",
  bookName: "",
  workdir: document.getElementById("workdir")?.value.trim() || "",
  subdir: "Silos",
  audiobooksRoot: "",    // nadpisuje workdir\\Audiobooks gdy ustawione
  filesbooksRoot: "",    // nadpisuje workdir\\Files_books gdy ustawione
  chapters: [],
  fragments: [],
  running: false,
  stopRequested: false,
  activeAudioIdx: null,
  startedAt: null,
  preprocessEnabled: true,
  phoneticEnabled: true,
  tagsEnabled: true,
  debugTtsInput: false,
  collapsedChapters: new Set(),
  handMode: null,  // set during hand mode generation
  player: {
    library: [],
    bookIndex: -1,
    sectionIndex: -1,
    trackIndex: -1,
    isLoading: false,
    search: "",
    shuffle: false,
    repeatMode: "none",
    sleepUntil: 0,
    sleepInterval: null,
    pendingResumeTime: null,
    autoResumePlayback: false,
  },
  voiceover: {
    open: false,
    videoPath: "",
    subtitlePath: "",
    sourceAudioPath: "",
    sourceAudioMuted: false,
    cues: [],
    selectedIdx: -1,
    running: false,
    generated: 0,
  },
};

const playerAudio = new Audio();
playerAudio.preload = "metadata";
const voiceoverPreviewAudio = new Audio();
const voiceoverSourceAudio = new Audio();
voiceoverSourceAudio.preload = "metadata";
const PLAYER_STATE_KEY = "ffv_player_state_v1";

// Helper paths — respect overrides from settings modal
function abRoot() { return state.audiobooksRoot || `${state.workdir}\\Audiobooks`; }
function fbRoot() { return state.filesbooksRoot || `${state.workdir}\\Files_books`; }

const DEFAULT_PREP_PROMPT = `Role: You are a professional audiobook director and phonetics specialist for the Fish Speech S2 Pro model. Your task is to prepare the book text for speech synthesis.

Task:

Chapter split: Preserve the book's structure.

Fragment split: Divide each chapter into smaller text blocks. One block must last at most 30 seconds (assume average reading pace: ~13-15 characters per second, i.e. ~400-450 characters per fragment).

Emotional Tag Injection: Analyze the narration and dialogue context. Insert appropriate tags in square brackets [tag] to bring the voice to life. Use tags such as: [whisper], [angry], [sad], [excited tone], [sigh], [inhale], [pause]. Insert tags before a sentence or inside it when an emotion shift occurs.

Phonetic Hard-Fix: The model has trouble with Polish "si", "zi", "ci", reading them too softly (e.g. "śilos"). Scan the text and change the spelling of problematic words to hard/phonetic:

Replace all "Silos" with Sy-los.

Loan words with a hard "si" write with a hyphen (e.g. s-inus, s-ingiel).

If you notice other risky clusters (e.g. "Dzieciaki"), change to D-zieciaki.`;

const els = {
  backendStatus: document.getElementById("backend-status"),
  btnPrepareBook: document.getElementById("btn-prepare-book"),
  btnPlayer: document.getElementById("btn-player"),
  btnOpenFolder: document.getElementById("btn-open-folder"),
  bookPath: document.getElementById("book-path"),
  workdir: document.getElementById("workdir"),
  subdir: document.getElementById("subdir"),
  chapterSelect: document.getElementById("chapter-select"),
  chkPhonetic: document.getElementById("chk-phonetic"),
  chkTags: document.getElementById("chk-tags"),
  chkDebugTts: document.getElementById("chk-debug-tts"),
  btnPickBook: document.getElementById("btn-pick-book"),
  btnPickWorkdir: document.getElementById("btn-default-workdir"),
  btnLoadSplit: document.getElementById("btn-load-split"),
  btnSelectAll: document.getElementById("btn-select-all"),
  btnDeselectAll: document.getElementById("btn-deselect-all"),
  btnRun: document.getElementById("btn-run"),
  btnStop: document.getElementById("btn-stop"),
  btnMergeSelected: document.getElementById("btn-merge-selected"),
  btnMergeAll: document.getElementById("btn-merge-all"),
  btnSelectN: document.getElementById("btn-select-n"),
  selectNInput: document.getElementById("select-n-input"),
    btnFirst: document.getElementById("btn-first"),
    btnLast: document.getElementById("btn-last"),
    btnPrev: document.getElementById("btn-prev"),
    btnNext: document.getElementById("btn-next"),
  // Slider dlugosci fragmentu
  fragSlider: document.getElementById("frag-slider"),
  fragSecLabel: document.getElementById("frag-sec-label"),
  fragCharsLabel: document.getElementById("frag-chars-label"),
  fragMinutes: document.getElementById("frag-minutes"),
  // Server TTS section (v3)
  chkServerMode: document.getElementById("chk-server-mode"),
  serverUrl: document.getElementById("server-url"),
  serverEndpoint: document.getElementById("server-endpoint"),
  serverGpuWorkers: document.getElementById("server-gpu-workers"),
  serverTimeout: document.getElementById("server-timeout"),
  serverRefAudio: document.getElementById("server-ref-audio"),
  serverRefText: document.getElementById("server-ref-text"),
  btnTestServer: document.getElementById("btn-test-server"),
  serverStatusBadge: document.getElementById("server-status-badge"),
  ttsTemperature: document.getElementById("tts-temperature"),
  ttsTopP: document.getElementById("tts-top-p"),
  ttsRepPenalty: document.getElementById("tts-rep-penalty"),
  ttsChunkLength: document.getElementById("tts-chunk-length"),
  ttsMaxTokens: document.getElementById("tts-max-tokens"),
  ttsTemperatureVal: document.getElementById("tts-temperature-val"),
  ttsTopPVal: document.getElementById("tts-top-p-val"),
  ttsRepPenaltyVal: document.getElementById("tts-rep-penalty-val"),
  ttsChunkLengthVal: document.getElementById("tts-chunk-length-val"),
  ttsMaxTokensVal: document.getElementById("tts-max-tokens-val"),
  fragCount: document.getElementById("frag-count"),
  tbody: document.getElementById("fragment-tbody"),
  headerCheckbox: document.getElementById("header-checkbox"),
  progressFill: document.getElementById("progress-fill"),
  progressLabel: document.getElementById("progress-label"),
  statStart: document.getElementById("stat-start"),
  statEnd: document.getElementById("stat-end"),
  statEta: document.getElementById("stat-eta"),
  statTotal: document.getElementById("stat-total"),
  toasts: document.getElementById("toasts"),
  audioPlayer: document.getElementById("audio-player"),
  editModal: document.getElementById("edit-modal"),
  editModalIdx: document.getElementById("edit-modal-idx"),
  editText: document.getElementById("edit-text"),
  editCommand: document.getElementById("edit-command"),
  editClose: document.getElementById("edit-close"),
  editCancel: document.getElementById("edit-cancel"),
  editSave: document.getElementById("edit-save"),
  prepareModal: document.getElementById("prepare-modal"),
  prepareClose: document.getElementById("prepare-close"),
  prepareCancel: document.getElementById("prepare-cancel"),
  prepareRun: document.getElementById("prepare-run"),
  prepareApiKey: document.getElementById("prepare-api-key"),
  prepareOutputName: document.getElementById("prepare-output-name"),
  preparePrompt: document.getElementById("prepare-prompt"),
  prepareModel: document.getElementById("prepare-model"),
  prepareDropzone: document.getElementById("prepare-dropzone"),
  prepareBrowseLink: document.getElementById("prepare-browse-link"),
  prepareFileInput: document.getElementById("prepare-file-input"),
  prepareInputStatus: document.getElementById("prepare-input-status"),
  prepareSaveAsBtn: document.getElementById("prepare-save-as-btn"),
  prepareChatLog: document.getElementById("prepare-chat-log"),
  prepareStatusLine: document.getElementById("prepare-status-line"),
  prepareResetPrompt: document.getElementById("prepare-reset-prompt"),
  errorModal: document.getElementById("error-modal"),
  errorModalIdx: document.getElementById("error-modal-idx"),
  errorDetail: document.getElementById("error-detail"),
  errorClose: document.getElementById("error-close"),
  errorOk: document.getElementById("error-ok"),
  // Voice Creation
  btnReloadApp: document.getElementById("btn-reload-app"),
  btnVoiceCreation: document.getElementById("btn-voice-creation"),
  voiceModal: document.getElementById("voice-modal"),
  voiceClose: document.getElementById("voice-close"),
  voiceName: document.getElementById("voice-name"),
  voiceDropzone: document.getElementById("voice-dropzone"),
  voiceBrowseLink: document.getElementById("voice-browse-link"),
  voiceFileInput: document.getElementById("voice-file-input"),
  voiceInputStatus: document.getElementById("voice-input-status"),
  voiceSegDur: document.getElementById("voice-seg-dur"),
  voiceSegVal: document.getElementById("voice-seg-val"),
  voiceSplitBtn: document.getElementById("voice-split-btn"),
  voiceLog: document.getElementById("voice-log"),
  voiceSamplesPreview: document.getElementById("voice-samples-preview"),
  voiceList: document.getElementById("voice-list"),
  voiceListHint: document.getElementById("voice-list-hint"),
  // Voice player / trimmer
  voiceSourcePlayer: document.getElementById("voice-source-player"),
  voiceStartSec:     document.getElementById("voice-start-sec"),
  voiceStartInput:   document.getElementById("voice-start-input"),
  voiceClipEnd:      document.getElementById("voice-clip-end"),
  voiceSourceDuration: document.getElementById("voice-source-duration"),
  btnVoiceSetStart:  document.getElementById("btn-voice-set-start"),
  voiceYoutubeUrl:   document.getElementById("voice-youtube-url"),
  btnVoiceDownload:  document.getElementById("btn-voice-download"),
  // Multi-voice speaker map
  speakerVoiceMap: document.getElementById("speaker-voice-map"),
  speakerVoiceMapUI: document.getElementById("speaker-voice-map-ui"),
  // Toolbar extras
  btnDeselectDone: document.getElementById("btn-deselect-done"),
  btnPickSubdir: document.getElementById("btn-pick-subdir"),
  btnGotoFrag: document.getElementById("btn-goto-frag"),
  gotoFragInput: document.getElementById("goto-frag-input"),
  mainDropzone: document.getElementById("main-dropzone"),
  mainFileInput: document.getElementById("main-file-input"),
  mainDropzoneLabel: document.getElementById("main-dropzone-label"),
  btnSaveTtsSettings: document.getElementById("btn-save-tts-settings"),
  // Buttons near the book dropdown
  btnOpenAudiobooks: document.getElementById("btn-open-audiobooks"),
  btnOpenFilesbooks: document.getElementById("btn-open-filesbooks"),
  btnBookSettings:   document.getElementById("btn-book-settings"),
  // Book settings modal
  bookSettingsModal:    document.getElementById("book-settings-modal"),
  bsmClose:             document.getElementById("bsm-close"),
  bsmBookName:          document.getElementById("bsm-book-name"),
  bsmAudiobooksPath:    document.getElementById("bsm-audiobooks-path"),
  bsmFilesbooksPath:    document.getElementById("bsm-filesbooks-path"),
  bsmDescription:       document.getElementById("bsm-description"),
  bsmNotes:             document.getElementById("bsm-notes"),
  btnBsmPickAudiobooks: document.getElementById("btn-bsm-pick-audiobooks"),
  btnBsmPickFilesbooks: document.getElementById("btn-bsm-pick-filesbooks"),
  btnBsmCancel:         document.getElementById("btn-bsm-cancel"),
  btnBsmSave:           document.getElementById("btn-bsm-save"),
  btnBsmDelete:         document.getElementById("btn-bsm-delete-book"),
  // Audiobook player
  playerModal: document.getElementById("player-modal"),
  playerClose: document.getElementById("player-close"),
  playerRefresh: document.getElementById("player-refresh"),
  playerSearch: document.getElementById("player-search"),
  playerLibrary: document.getElementById("player-library"),
  playerCover: document.getElementById("player-cover"),
  playerBookTitle: document.getElementById("player-book-title"),
  playerSectionTitle: document.getElementById("player-section-title"),
  playerTrackTitle: document.getElementById("player-track-title"),
  playerSeek: document.getElementById("player-seek"),
  playerTimeCurrent: document.getElementById("player-time-current"),
  playerTimeTotal: document.getElementById("player-time-total"),
  playerPlay: document.getElementById("player-play"),
  playerPrev: document.getElementById("player-prev"),
  playerNext: document.getElementById("player-next"),
  playerBack15: document.getElementById("player-back-15"),
  playerFwd15: document.getElementById("player-fwd-15"),
  playerVolume: document.getElementById("player-volume"),
  playerSpeed: document.getElementById("player-speed"),
  playerShuffle: document.getElementById("player-shuffle"),
  playerRepeat: document.getElementById("player-repeat"),
  playerSleepMinutes: document.getElementById("player-sleep-minutes"),
  playerSleepToggle: document.getElementById("player-sleep-toggle"),
  playerSleepLeft: document.getElementById("player-sleep-left"),
  // AI Voiceover
  btnAiVoiceover: document.getElementById("btn-ai-voiceover"),
  aiVoiceoverModal: document.getElementById("ai-voiceover-modal"),
  aiVoiceoverClose: document.getElementById("ai-voiceover-close"),
  voiceoverVideoDrop: document.getElementById("voiceover-video-drop"),
  voiceoverSubDrop: document.getElementById("voiceover-sub-drop"),
  voiceoverVideoInput: document.getElementById("voiceover-video-input"),
  voiceoverSubInput: document.getElementById("voiceover-sub-input"),
  voiceoverVideoLabel: document.getElementById("voiceover-video-label"),
  voiceoverSubLabel: document.getElementById("voiceover-sub-label"),
  voiceoverVoice: document.getElementById("voiceover-voice"),
  voiceoverWorkers: document.getElementById("voiceover-workers"),
  voiceoverAutofit: document.getElementById("voiceover-autofit"),
  voiceoverDucking: document.getElementById("voiceover-ducking"),
  voiceoverParse: document.getElementById("voiceover-parse"),
  voiceoverExtractSubtitles: document.getElementById("voiceover-extract-subtitles"),
  voiceoverGenerate: document.getElementById("voiceover-generate"),
  voiceoverPreview: document.getElementById("voiceover-preview"),
  voiceoverRender: document.getElementById("voiceover-render"),
  voiceoverToggleAudio: document.getElementById("voiceover-toggle-audio"),
  voiceoverSaveProject: document.getElementById("voiceover-save-project"),
  voiceoverLoadProject: document.getElementById("voiceover-load-project"),
  voiceoverProgress: document.getElementById("voiceover-progress"),
  voiceoverVideo: document.getElementById("voiceover-video"),
  voiceoverVideoSeek: document.getElementById("voiceover-video-seek"),
  voiceoverVideoTime: document.getElementById("voiceover-video-time"),
  voiceoverTimelineBody: document.getElementById("voiceover-timeline-body"),
};

let editingIdx = null;

function toast(message, type = "info") {
  const node = document.createElement("div");
  node.className = `toast toast-${type}`;
  node.textContent = message;
  els.toasts.appendChild(node);
  setTimeout(() => node.classList.add("show"), 20);
  setTimeout(() => {
    node.classList.remove("show");
    setTimeout(() => node.remove(), 180);
  }, 3400);
}

function formatClock(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  const locale = (typeof getLang === 'function') ? (getLang() === 'en' ? 'en-US' : 'pl-PL') : 'pl-PL';
  return d.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const rounded = Math.round(seconds);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getCurrentPlayerTrack() {
  const b = state.player.bookIndex;
  const s = state.player.sectionIndex;
  const t = state.player.trackIndex;
  const book = state.player.library[b];
  const section = book?.sections?.[s];
  const track = section?.tracks?.[t];
  return { book, section, track };
}

function savePlayerState() {
  try {
    const { book, section, track } = getCurrentPlayerTrack();
    const payload = {
      bookTitle: book?.title || null,
      sectionName: section?.name || null,
      trackName: track?.name || null,
      currentTime: Number.isFinite(playerAudio.currentTime) ? playerAudio.currentTime : 0,
      wasPlaying: !playerAudio.paused,
      volume: Number.isFinite(playerAudio.volume) ? playerAudio.volume : 1,
      speed: Number.isFinite(playerAudio.playbackRate) ? playerAudio.playbackRate : 1,
      search: state.player.search || "",
      shuffle: Boolean(state.player.shuffle),
      repeatMode: state.player.repeatMode || "none",
      sleepUntil: state.player.sleepUntil || 0,
    };
    localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(payload));
  } catch (_) {}
}

function loadPlayerState() {
  try {
    const raw = localStorage.getItem(PLAYER_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function formatSleepLeft(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function refreshSleepTimerUi() {
  if (!els.playerSleepToggle || !els.playerSleepLeft) return;
  if (!state.player.sleepUntil || state.player.sleepUntil <= Date.now()) {
    els.playerSleepToggle.textContent = (typeof t === "function") ? t("player_start_timer") : "Start timer";
    els.playerSleepLeft.textContent = (typeof t === "function") ? t("player_sleep_not_active") : "not active";
    return;
  }
  const left = state.player.sleepUntil - Date.now();
  els.playerSleepToggle.textContent = (typeof t === "function") ? t("player_cancel_timer") : "Cancel timer";
  els.playerSleepLeft.textContent = (typeof t === "function")
    ? t("player_sleep_left", { time: formatSleepLeft(left) })
    : `left ${formatSleepLeft(left)}`;
}

function clearSleepTimer(save = true) {
  if (state.player.sleepInterval) {
    clearInterval(state.player.sleepInterval);
    state.player.sleepInterval = null;
  }
  state.player.sleepUntil = 0;
  refreshSleepTimerUi();
  if (save) savePlayerState();
}

function startSleepTimer(minutes) {
  const m = Number(minutes) || 0;
  if (m <= 0) {
    clearSleepTimer(true);
    return;
  }
  if (state.player.sleepInterval) clearInterval(state.player.sleepInterval);
  state.player.sleepUntil = Date.now() + (m * 60 * 1000);
  state.player.sleepInterval = setInterval(() => {
    const left = state.player.sleepUntil - Date.now();
    if (left <= 0) {
      clearSleepTimer(false);
      pausePlayerTrack();
      toast((typeof t === "function") ? t("player_sleep_elapsed") : "Sleep timer elapsed. Playback stopped.", "info");
      savePlayerState();
      return;
    }
    refreshSleepTimerUi();
  }, 1000);
  refreshSleepTimerUi();
  savePlayerState();
}

function restorePlayerStateFromLibrary() {
  const stored = loadPlayerState();

  if (stored) {
    state.player.search = String(stored.search || "");
    state.player.shuffle = Boolean(stored.shuffle);
    state.player.repeatMode = ["none", "section", "book"].includes(stored.repeatMode) ? stored.repeatMode : "none";
    if (els.playerVolume && Number.isFinite(Number(stored.volume))) {
      els.playerVolume.value = String(Math.min(1, Math.max(0, Number(stored.volume))));
      playerAudio.volume = Number(els.playerVolume.value);
    }
    if (els.playerSpeed && Number.isFinite(Number(stored.speed))) {
      els.playerSpeed.value = String(Number(stored.speed));
      playerAudio.playbackRate = Number(els.playerSpeed.value);
    }
    if (els.playerSearch) els.playerSearch.value = state.player.search;
    if (els.playerRepeat) els.playerRepeat.value = state.player.repeatMode;

    if (Number(stored.sleepUntil) > Date.now()) {
      state.player.sleepUntil = Number(stored.sleepUntil);
      if (state.player.sleepInterval) clearInterval(state.player.sleepInterval);
      state.player.sleepInterval = setInterval(() => {
        const left = state.player.sleepUntil - Date.now();
        if (left <= 0) {
          clearSleepTimer(false);
          pausePlayerTrack();
          toast((typeof t === "function") ? t("player_sleep_elapsed") : "Sleep timer elapsed. Playback stopped.", "info");
          savePlayerState();
          return;
        }
        refreshSleepTimerUi();
      }, 1000);
    } else {
      clearSleepTimer(false);
    }
  }

  if (els.playerShuffle) {
    els.playerShuffle.textContent = (typeof t === "function")
      ? t(state.player.shuffle ? "player_shuffle_on" : "player_shuffle_off")
      : `🔀 Shuffle: ${state.player.shuffle ? "On" : "Off"}`;
  }
  refreshSleepTimerUi();

  const books = state.player.library || [];
  if (books.length === 0) {
    state.player.bookIndex = -1;
    state.player.sectionIndex = -1;
    state.player.trackIndex = -1;
    return;
  }

  if (!stored) {
    state.player.bookIndex = 0;
    state.player.sectionIndex = 0;
    state.player.trackIndex = 0;
    return;
  }

  const b = books.findIndex(x => x.title === stored.bookTitle);
  const bookIndex = b >= 0 ? b : 0;
  const sections = books[bookIndex]?.sections || [];
  const s = sections.findIndex(x => x.name === stored.sectionName);
  const sectionIndex = s >= 0 ? s : 0;
  const tracks = sections[sectionIndex]?.tracks || [];
  const t = tracks.findIndex(x => x.name === stored.trackName);
  const trackIndex = t >= 0 ? t : 0;

  state.player.bookIndex = bookIndex;
  state.player.sectionIndex = sectionIndex;
  state.player.trackIndex = trackIndex;
  state.player.pendingResumeTime = Number.isFinite(Number(stored.currentTime)) ? Number(stored.currentTime) : null;
  state.player.autoResumePlayback = Boolean(stored.wasPlaying);
}

function updatePlayerMeta() {
  const { book, section, track } = getCurrentPlayerTrack();
  if (els.playerBookTitle) {
    els.playerBookTitle.textContent = book?.title || ((typeof t === "function") ? t("player_select_book") : "Select a book");
  }
  if (els.playerSectionTitle) {
    const sectionLabel = (typeof t === "function") ? t("player_section_label") : "Section";
    els.playerSectionTitle.textContent = `${sectionLabel}: ${section?.name || "-"}`;
  }
  if (els.playerTrackTitle) {
    const trackLabel = (typeof t === "function") ? t("player_track_label") : "Track";
    els.playerTrackTitle.textContent = `${trackLabel}: ${track?.name || "-"}`;
  }
  if (els.playerCover) {
    if (book?.coverUrl) {
      els.playerCover.src = book.coverUrl;
      els.playerCover.style.visibility = "visible";
    } else {
      els.playerCover.removeAttribute("src");
      els.playerCover.style.visibility = "hidden";
    }
  }
}

function updatePlayerProgress() {
  const dur = Number.isFinite(playerAudio.duration) ? playerAudio.duration : 0;
  const cur = Number.isFinite(playerAudio.currentTime) ? playerAudio.currentTime : 0;
  const val = dur > 0 ? Math.round((cur / dur) * 1000) : 0;
  if (els.playerSeek && !els.playerSeek.matches(":active")) {
    els.playerSeek.value = String(val);
  }
  if (els.playerTimeCurrent) els.playerTimeCurrent.textContent = formatDuration(cur);
  if (els.playerTimeTotal) els.playerTimeTotal.textContent = formatDuration(dur);
}

function renderPlayerLibrary() {
  if (!els.playerLibrary) return;
  const books = state.player.library || [];
  const q = (state.player.search || "").trim().toLowerCase();
  const visibleBooks = books
    .map((book, index) => ({ book, index }))
    .filter(({ book }) => {
      if (!q) return true;
      if ((book.title || "").toLowerCase().includes(q)) return true;
      return (book.sections || []).some(sec => (sec.name || "").toLowerCase().includes(q));
    });

  if (books.length === 0) {
    els.playerLibrary.classList.remove("loading");
    const msg = (typeof t === "function")
      ? t("player_no_books_in", { path: escapeHtml(abRoot()) })
      : `No audiobooks found in ${escapeHtml(abRoot())}`;
    els.playerLibrary.innerHTML = `<div class="muted small">${msg}</div>`;
    return;
  }
  if (visibleBooks.length === 0) {
    els.playerLibrary.classList.remove("loading");
    const msg = (typeof t === "function")
      ? t("player_no_results_for", { query: escapeHtml(state.player.search) })
      : `No results for "${escapeHtml(state.player.search)}"`;
    els.playerLibrary.innerHTML = `<div class="muted small">${msg}</div>`;
    return;
  }

  els.playerLibrary.classList.remove("loading");
  els.playerLibrary.innerHTML = visibleBooks.map(({ book, index: bi }) => {
    const open = bi === state.player.bookIndex ? " open" : "";
    const sections = (book.sections || []).map((sec, si) => {
      const active = (bi === state.player.bookIndex && si === state.player.sectionIndex) ? " active" : "";
      return `<button class="player-section-item${active}" data-action="player-section" data-book="${bi}" data-section="${si}">${escapeHtml(sec.name)} <span class="muted">(${sec.tracks.length})</span></button>`;
    }).join("");
    return `<div class="player-book-item${open}">
      <div class="player-book-head" data-action="player-book" data-book="${bi}">
        <img class="player-book-thumb" src="${book.coverUrl || ""}" alt="cover" style="${book.coverUrl ? "" : "visibility:hidden;"}">
        <div>
          <div class="player-book-name">${escapeHtml(book.title)}</div>
          <div class="muted small">${(typeof t === "function") ? t("player_tracks_count", { n: book.totalTracks || 0 }) : `${book.totalTracks || 0} tracks`}</div>
        </div>
      </div>
      <div class="player-book-sections">${sections}</div>
    </div>`;
  }).join("");
}

async function loadPlayerLibrary() {
  if (!window.api.scanAudiobooks || !els.playerLibrary) return;
  state.player.isLoading = true;
  els.playerLibrary.classList.add("loading");
  els.playerLibrary.innerHTML = `<div class="player-skeleton"></div><div class="player-skeleton"></div><div class="player-skeleton"></div>`;
  try {
    const res = await window.api.scanAudiobooks({ root: abRoot() });
    state.player.library = Array.isArray(res?.books) ? res.books : [];
    restorePlayerStateFromLibrary();
    renderPlayerLibrary();
    updatePlayerMeta();
    updatePlayerProgress();
  } catch (err) {
    els.playerLibrary.classList.remove("loading");
    const msg = (typeof t === "function")
      ? t("player_scan_error", { msg: escapeHtml(err.message || String(err)) })
      : `Player scan error: ${escapeHtml(err.message || String(err))}`;
    els.playerLibrary.innerHTML = `<div class="small" style="color:#c53030;">${msg}</div>`;
  } finally {
    state.player.isLoading = false;
  }
}

function selectPlayerSection(bookIndex, sectionIndex) {
  state.player.bookIndex = bookIndex;
  state.player.sectionIndex = sectionIndex;
  state.player.trackIndex = 0;
  renderPlayerLibrary();
  updatePlayerMeta();
  savePlayerState();
}

async function playCurrentPlayerTrack() {
  const { track } = getCurrentPlayerTrack();
  if (!track?.url) return;
  if (playerAudio.src !== track.url) {
    playerAudio.src = track.url;
  }
  try {
    await playerAudio.play();
    if (els.playerPlay) els.playerPlay.textContent = "⏸ Pause";
    savePlayerState();
  } catch (err) {
    toast(`Player error: ${err.message}`, "error");
  }
}

function pausePlayerTrack() {
  playerAudio.pause();
  if (els.playerPlay) els.playerPlay.textContent = "▶ Play";
  savePlayerState();
}

function resolveShuffleTarget() {
  const { book } = getCurrentPlayerTrack();
  if (!book) return null;
  const pool = [];
  (book.sections || []).forEach((sec, si) => {
    (sec.tracks || []).forEach((_, ti) => {
      pool.push({ b: state.player.bookIndex, s: si, t: ti });
    });
  });
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  const currentKey = `${state.player.bookIndex}:${state.player.sectionIndex}:${state.player.trackIndex}`;
  const filtered = pool.filter(x => `${x.b}:${x.s}:${x.t}` !== currentKey);
  return filtered[Math.floor(Math.random() * filtered.length)] || null;
}

async function stepPlayerTrack(delta) {
  const { book, section } = getCurrentPlayerTrack();
  if (!book || !section) return;

  if (delta > 0 && state.player.shuffle) {
    const target = resolveShuffleTarget();
    if (!target) return;
    state.player.bookIndex = target.b;
    state.player.sectionIndex = target.s;
    state.player.trackIndex = target.t;
    renderPlayerLibrary();
    updatePlayerMeta();
    savePlayerState();
    await playCurrentPlayerTrack();
    return;
  }

  let b = state.player.bookIndex;
  let s = state.player.sectionIndex;
  let t = state.player.trackIndex + delta;

  if (t < 0) {
    s -= 1;
    if (s < 0) {
      b -= 1;
      if (b < 0) return;
      s = (state.player.library[b]?.sections?.length || 1) - 1;
    }
    t = (state.player.library[b]?.sections?.[s]?.tracks?.length || 1) - 1;
  }

  const sectionTracks = state.player.library[b]?.sections?.[s]?.tracks || [];
  if (t >= sectionTracks.length) {
    if (state.player.repeatMode === "section") {
      t = 0;
    } else {
      s += 1;
      t = 0;
      if (s >= (state.player.library[b]?.sections?.length || 0)) {
        if (state.player.repeatMode === "book") {
          s = 0;
          t = 0;
        } else {
          b += 1;
          s = 0;
          if (b >= state.player.library.length) {
            pausePlayerTrack();
            return;
          }
        }
      }
    }
  }

  state.player.bookIndex = b;
  state.player.sectionIndex = s;
  state.player.trackIndex = t;
  renderPlayerLibrary();
  updatePlayerMeta();
  savePlayerState();
  await playCurrentPlayerTrack();
}

function openPlayerModal() {
  if (!els.playerModal) return;
  els.playerModal.hidden = false;
  loadPlayerLibrary();
}

function closePlayerModal() {
  if (!els.playerModal) return;
  els.playerModal.hidden = true;
  pausePlayerTrack();
}

function formatMsToClock(ms) {
  const total = Math.max(0, Math.floor((ms || 0) / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function openAiVoiceoverModal() {
  if (!els.aiVoiceoverModal) return;
  els.aiVoiceoverModal.hidden = false;
  state.voiceover.open = true;
  hydrateVoiceoverVoices();
  updateVoiceoverButtons();
}

function closeAiVoiceoverModal() {
  if (!els.aiVoiceoverModal) return;
  els.aiVoiceoverModal.hidden = true;
  state.voiceover.open = false;
  try { voiceoverPreviewAudio.pause(); } catch (_) {}
  try { voiceoverSourceAudio.pause(); } catch (_) {}
  try { els.voiceoverVideo?.pause(); } catch (_) {}
}

function refreshVoiceoverAudioToggle() {
  if (!els.voiceoverToggleAudio) return;
  const hasAudio = Boolean(state.voiceover.sourceAudioPath);
  els.voiceoverToggleAudio.disabled = !hasAudio;
  if (!hasAudio) {
    els.voiceoverToggleAudio.textContent = (typeof t === "function") ? t("ai_video_audio_unavailable") : "No video audio";
    return;
  }
  els.voiceoverToggleAudio.textContent = (typeof t === "function")
    ? t(state.voiceover.sourceAudioMuted ? "ai_video_audio_off" : "ai_video_audio_on")
    : (state.voiceover.sourceAudioMuted ? "Video audio: Off" : "Video audio: On");
}

async function ensureVoiceoverSourceAudio(videoPath) {
  if (!videoPath || !window.api?.py) return;
  const baseDir = state.workdir || videoPath.replace(/[\\/][^\\/]+$/, "");
  const fileName = (videoPath.split(/[\\/]/).pop() || "video").replace(/\.[^.]+$/, "");
  const targetPath = `${baseDir}\\temp_voiceover\\${fileName}_preview_audio.wav`;

  try {
    const res = await window.api.py("voiceover_extract_video_audio", {
      video_path: videoPath,
      workdir: state.workdir,
      output_path: targetPath,
    });
    if (res?.ok && res.audio_path) {
      state.voiceover.sourceAudioPath = String(res.audio_path);
      voiceoverSourceAudio.src = toFileUrl(state.voiceover.sourceAudioPath);
      voiceoverSourceAudio.muted = state.voiceover.sourceAudioMuted;
      refreshVoiceoverAudioToggle();
      return;
    }
  } catch (err) {
    console.warn("Voiceover source audio extract failed:", err?.message || err);
  }

  state.voiceover.sourceAudioPath = "";
  voiceoverSourceAudio.removeAttribute("src");
  refreshVoiceoverAudioToggle();
}

async function hydrateVoiceoverVoices() {
  if (!els.voiceoverVoice) return;
  try {
    const result = await window.api.py("list_voices", { voices_dir: voicesDir() });
    const voices = result?.voices || [];
    if (!voices.length) {
      els.voiceoverVoice.innerHTML = `<option value="">No narrators</option>`;
      return;
    }
    els.voiceoverVoice.innerHTML = voices
      .map(v => `<option value="${escapeHtml(v.name)}">${escapeHtml(v.name)}</option>`)
      .join("");
  } catch (err) {
    els.voiceoverVoice.innerHTML = `<option value="">Error</option>`;
    toast(`Voice list error: ${err.message}`, "error");
  }
}

function updateVoiceoverButtons() {
  const hasFiles = Boolean(state.voiceover.videoPath);
  const hasCues = state.voiceover.cues.length > 0;
  if (els.voiceoverGenerate) els.voiceoverGenerate.disabled = !(hasCues && !state.voiceover.running);
  if (els.voiceoverPreview) {
    const sel = state.voiceover.cues[state.voiceover.selectedIdx];
    els.voiceoverPreview.disabled = !(hasCues && sel && !state.voiceover.running);
  }
  if (els.voiceoverRender) els.voiceoverRender.disabled = !(hasCues && state.voiceover.generated > 0 && !state.voiceover.running);
  if (els.voiceoverParse) els.voiceoverParse.disabled = !(hasFiles && !state.voiceover.running);
  if (els.voiceoverExtractSubtitles) els.voiceoverExtractSubtitles.disabled = !(hasFiles && !state.voiceover.running);
  refreshVoiceoverAudioToggle();
}

function renderVoiceoverTimeline() {
  if (!els.voiceoverTimelineBody) return;
  if (!state.voiceover.cues.length) {
    els.voiceoverTimelineBody.innerHTML = `<div class="small muted">No subtitle cues loaded.</div>`;
    updateVoiceoverButtons();
    return;
  }
  els.voiceoverTimelineBody.innerHTML = state.voiceover.cues.map((cue, i) => {
    const cls = i === state.voiceover.selectedIdx ? "voiceover-timeline-row active" : "voiceover-timeline-row";
    let statusClass = "voiceover-status";
    if (cue.status === "done") statusClass += " ok";
    else if (cue.status === "warn") statusClass += " warn";
    else if (cue.status === "error") statusClass += " err";
    const rate = cue.playback_rate ? `${Number(cue.playback_rate).toFixed(2)}x` : "-";
    return `<div class="${cls}" data-action="voiceover-row" data-idx="${i}">
      <div>${cue.idx || (i + 1)}</div>
      <div>${escapeHtml(cue.start_tc || formatMsToClock(cue.start_ms))}</div>
      <div>${escapeHtml(cue.end_tc || formatMsToClock(cue.end_ms))}</div>
      <div>${Math.round((cue.duration_ms || 0) / 1000)}s</div>
      <div><input type="number" class="voiceover-offset-input" data-action="voiceover-offset" data-idx="${i}" value="${cue.offset_ms || 0}" step="50"></div>
      <div>${rate}</div>
      <div class="${statusClass}">${escapeHtml(cue.status || "pending")}</div>
      <div class="voiceover-text" title="${escapeHtml(cue.text || "")}">${escapeHtml(cue.text || "")}</div>
    </div>`;
  }).join("");
  updateVoiceoverButtons();
}

async function parseVoiceoverSubtitles() {
  if (!state.voiceover.videoPath) {
    toast("Choose video file first.", "error");
    return;
  }
  try {
    if (!state.voiceover.subtitlePath) {
      toast("Choose subtitle file first.", "error");
      return;
    }
    const res = await window.api.py("voiceover_parse_subtitles", { path: state.voiceover.subtitlePath });

    state.voiceover.cues = (res?.cues || []).map(c => ({ ...c, offset_ms: 0, status: "pending", audio_path: "", playback_rate: 1.0 }));
    state.voiceover.generated = 0;
    state.voiceover.selectedIdx = state.voiceover.cues.length ? 0 : -1;
    if (els.voiceoverProgress) els.voiceoverProgress.textContent = `0/${state.voiceover.cues.length}`;
    renderVoiceoverTimeline();
    toast(`Parsed ${state.voiceover.cues.length} subtitle cues.`, "success");
  } catch (err) {
    toast(`Subtitle parse error: ${err.message}`, "error");
  }
}

async function extractVoiceoverSubtitlesFromVideo() {
  if (!state.voiceover.videoPath) {
    toast("Choose video file first.", "error");
    return;
  }
  try {
    const res = await window.api.py("voiceover_transcribe_video", {
      video_path: state.voiceover.videoPath,
      workdir: state.workdir,
    });
    state.voiceover.cues = (res?.cues || []).map(c => ({ ...c, offset_ms: 0, status: "pending", audio_path: "", playback_rate: 1.0 }));
    if (res?.subtitle_path) {
      state.voiceover.subtitlePath = String(res.subtitle_path);
      if (els.voiceoverSubLabel) els.voiceoverSubLabel.textContent = state.voiceover.subtitlePath.split(/[\\/]/).pop();
    }
    state.voiceover.generated = 0;
    state.voiceover.selectedIdx = state.voiceover.cues.length ? 0 : -1;
    if (els.voiceoverProgress) els.voiceoverProgress.textContent = `0/${state.voiceover.cues.length}`;
    renderVoiceoverTimeline();
    toast(`Generated ${state.voiceover.cues.length} subtitle cues from video audio.`, "success");
  } catch (err) {
    toast(`Subtitle extraction error: ${err.message}`, "error");
  }
}

function toggleVoiceoverSourceAudio() {
  if (!state.voiceover.sourceAudioPath) return;
  state.voiceover.sourceAudioMuted = !state.voiceover.sourceAudioMuted;
  voiceoverSourceAudio.muted = state.voiceover.sourceAudioMuted;
  refreshVoiceoverAudioToggle();
}

async function generateVoiceoverCue(cue, idx) {
  const tempDir = `${state.workdir}\\temp_voiceover`;
  const res = await window.api.py("voiceover_generate_fragment", {
    idx: cue.idx || (idx + 1),
    text: cue.text,
    subtitle_duration_ms: cue.duration_ms,
    workdir: state.workdir,
    temp_dir: tempDir,
    voice_name: els.voiceoverVoice?.value || "",
    auto_fit: Boolean(els.voiceoverAutofit?.checked),
  });
  if (!res?.ok) {
    cue.status = "error";
    cue.error = res?.error || "unknown";
    return false;
  }
  cue.audio_path = res.audio_path;
  cue.audio_ms = res.audio_ms;
  cue.playback_rate = res.playback_rate || 1.0;
  cue.status = res.warning ? "warn" : "done";
  cue.warning = res.warning || "";
  return true;
}

async function generateVoiceoverQueue() {
  if (state.voiceover.running) return;
  const workers = Math.max(1, Math.min(4, Number(els.voiceoverWorkers?.value || 1)));
  state.voiceover.running = true;
  updateVoiceoverButtons();

  const indices = state.voiceover.cues.map((_, i) => i);
  let cursor = 0;
  let finished = state.voiceover.cues.filter(c => !!c.audio_path).length;
  if (els.voiceoverProgress) els.voiceoverProgress.textContent = `${finished}/${state.voiceover.cues.length}`;

  async function workerLoop() {
    while (cursor < indices.length) {
      const my = cursor;
      cursor += 1;
      const i = indices[my];
      const cue = state.voiceover.cues[i];
      cue.status = "processing";
      renderVoiceoverTimeline();
      const ok = await generateVoiceoverCue(cue, i);
      if (!ok) {
        toast(`Cue #${cue.idx} failed: ${cue.error || cue.warning || "error"}`, "error");
      }
      finished += 1;
      state.voiceover.generated = state.voiceover.cues.filter(c => !!c.audio_path).length;
      if (els.voiceoverProgress) els.voiceoverProgress.textContent = `${finished}/${state.voiceover.cues.length}`;
      renderVoiceoverTimeline();
    }
  }

  await Promise.all(Array.from({ length: workers }, () => workerLoop()));
  state.voiceover.running = false;
  updateVoiceoverButtons();
  toast(`Voiceover queue finished. Generated ${state.voiceover.generated}/${state.voiceover.cues.length}.`, "success");
}

async function generateVoiceoverPreview() {
  const idx = state.voiceover.selectedIdx;
  if (idx < 0) return;
  const cue = state.voiceover.cues[idx];
  if (!cue.audio_path) {
    cue.status = "processing";
    renderVoiceoverTimeline();
    const ok = await generateVoiceoverCue(cue, idx);
    if (!ok) {
      renderVoiceoverTimeline();
      toast(`Preview generation failed: ${cue.error || "error"}`, "error");
      return;
    }
  }
  try {
    if (els.voiceoverVideo) {
      const startMs = Math.max(0, Number(cue.start_ms || 0) + Number(cue.offset_ms || 0));
      els.voiceoverVideo.currentTime = startMs / 1000;
      if (state.voiceover.videoPath) {
        await els.voiceoverVideo.play().catch(() => {});
      }
    }
    voiceoverPreviewAudio.src = toFileUrl(cue.audio_path);
    voiceoverPreviewAudio.currentTime = 0;
    await voiceoverPreviewAudio.play();
  } catch (err) {
    toast(`Preview error: ${err.message}`, "error");
  }
}

async function fullRenderVoiceover() {
  if (!state.voiceover.videoPath) {
    toast("Choose video file first.", "error");
    return;
  }
  const cuesReady = state.voiceover.cues.filter(c => !!c.audio_path);
  if (!cuesReady.length) {
    toast("Generate voice clips first.", "error");
    return;
  }
  const out = await window.api.saveFile({
    defaultPath: "video_with_voiceover.mp4",
    filters: [{ name: "MP4", extensions: ["mp4"] }],
  });
  if (!out) return;

  state.voiceover.running = true;
  updateVoiceoverButtons();
  try {
    const res = await window.api.py("voiceover_render_video", {
      video_path: state.voiceover.videoPath,
      cues: state.voiceover.cues.map(c => ({
        idx: c.idx,
        start_ms: c.start_ms,
        end_ms: c.end_ms,
        duration_ms: c.duration_ms,
        offset_ms: c.offset_ms || 0,
        audio_path: c.audio_path || "",
      })),
      output_path: out,
      ducking_percent: Number(els.voiceoverDucking?.value || 0),
    });
    if (!res?.ok) throw new Error(res?.error || "render failed");
    toast(`Render done: ${res.output_path}`, "success");
  } catch (err) {
    toast(`Render error: ${err.message}`, "error");
  } finally {
    state.voiceover.running = false;
    updateVoiceoverButtons();
  }
}

async function saveVoiceoverProject() {
  if (!state.voiceover.cues.length) {
    toast("No cues to save. Parse subtitles first.", "error");
    return;
  }
  const out = await window.api.saveFile({
    defaultPath: "voiceover_project.json",
    filters: [{ name: "Voiceover Project", extensions: ["json"] }],
  });
  if (!out) return;

  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    videoPath: state.voiceover.videoPath || "",
    subtitlePath: state.voiceover.subtitlePath || "",
    voiceName: els.voiceoverVoice?.value || "",
    workers: Number(els.voiceoverWorkers?.value || 1),
    autoFit: Boolean(els.voiceoverAutofit?.checked),
    duckingPercent: Number(els.voiceoverDucking?.value || 0),
    selectedIdx: Number(state.voiceover.selectedIdx || 0),
    cues: state.voiceover.cues,
  };

  try {
    const json = JSON.stringify(payload, null, 2);
    await window.api.writeTextFile(out, json);
    toast("Project saved.", "success");
  } catch (err) {
    toast(`Project save error: ${err.message}`, "error");
  }
}

async function loadVoiceoverProject() {
  const path = await window.api.openFile({
    filters: [{ name: "Voiceover Project", extensions: ["json"] }],
  });
  if (!path) return;
  try {
    const txt = await window.api.readTextFile(path);
    const data = JSON.parse(txt);
    const cues = Array.isArray(data?.cues) ? data.cues : [];
    state.voiceover.videoPath = String(data?.videoPath || "");
    state.voiceover.subtitlePath = String(data?.subtitlePath || "");
    state.voiceover.cues = cues.map((c, i) => ({
      idx: Number(c.idx || (i + 1)),
      start_ms: Number(c.start_ms || 0),
      end_ms: Number(c.end_ms || 0),
      duration_ms: Number(c.duration_ms || 0),
      start_tc: String(c.start_tc || formatMsToClock(Number(c.start_ms || 0))),
      end_tc: String(c.end_tc || formatMsToClock(Number(c.end_ms || 0))),
      text: String(c.text || ""),
      offset_ms: Number(c.offset_ms || 0),
      status: String(c.status || "pending"),
      audio_path: String(c.audio_path || ""),
      playback_rate: Number(c.playback_rate || 1),
      warning: String(c.warning || ""),
      error: String(c.error || ""),
    }));
    state.voiceover.generated = state.voiceover.cues.filter(c => !!c.audio_path).length;
    state.voiceover.selectedIdx = Math.max(0, Math.min(Number(data?.selectedIdx || 0), Math.max(0, state.voiceover.cues.length - 1)));

    if (els.voiceoverVideoLabel) {
      els.voiceoverVideoLabel.textContent = state.voiceover.videoPath ? state.voiceover.videoPath.split(/[\\/]/).pop() : "Drop video here or click to select";
    }
    if (els.voiceoverSubLabel) {
      els.voiceoverSubLabel.textContent = state.voiceover.subtitlePath ? state.voiceover.subtitlePath.split(/[\\/]/).pop() : "Drop subtitles here or click to select";
    }
    if (state.voiceover.videoPath && els.voiceoverVideo) {
      els.voiceoverVideo.src = toFileUrl(state.voiceover.videoPath);
      ensureVoiceoverSourceAudio(state.voiceover.videoPath);
    }
    if (els.voiceoverWorkers && Number.isFinite(Number(data?.workers))) {
      els.voiceoverWorkers.value = String(Math.max(1, Math.min(4, Number(data.workers))));
    }
    if (els.voiceoverAutofit) {
      els.voiceoverAutofit.checked = Boolean(data?.autoFit);
    }
    if (els.voiceoverDucking && Number.isFinite(Number(data?.duckingPercent))) {
      els.voiceoverDucking.value = String(Math.max(0, Math.min(100, Number(data.duckingPercent))));
    }
    if (els.voiceoverVoice && data?.voiceName) {
      const opt = Array.from(els.voiceoverVoice.options).find(o => o.value === data.voiceName);
      if (opt) els.voiceoverVoice.value = data.voiceName;
    }

    if (els.voiceoverProgress) {
      els.voiceoverProgress.textContent = `${state.voiceover.generated}/${state.voiceover.cues.length}`;
    }
    renderVoiceoverTimeline();
    updateVoiceoverButtons();
    toast(`Project loaded (${state.voiceover.cues.length} cues).`, "success");
  } catch (err) {
    toast(`Project load error: ${err.message}`, "error");
  }
}

function estimateSecondsFromText(text) {
  // ~13 znakow na sekunde (srednie tempo polskiego TTS)
  return Math.round((text || "").replace(/\s+/g, "").length / 13);
}

function setBackendStatus(text, kind) {
  els.backendStatus.textContent = text;
  els.backendStatus.classList.remove("ready", "error");
  if (kind) els.backendStatus.classList.add(kind);
}

function getChapterIndex() {
  return Array.from(els.chapterSelect.selectedOptions).map(o => o.value);
}

function updateButtonsState() {
  const selectedCount = state.fragments.filter((f) => f.selected).length;
  const hasFragments = state.fragments.length > 0;
  els.btnRun.disabled = !hasFragments || selectedCount === 0 || state.running;
  els.btnStop.disabled = !state.running;
  els.btnMergeSelected.disabled = selectedCount === 0 || state.running;
  els.btnMergeAll.disabled = !hasFragments || state.running;
  els.btnLoadSplit.disabled = !state.bookPath;
}

function updateHeaderCheckbox() {
  if (state.fragments.length === 0) {
    els.headerCheckbox.checked = false;
    els.headerCheckbox.indeterminate = false;
    return;
  }
  const selected = state.fragments.filter((f) => f.selected).length;
  els.headerCheckbox.checked = selected === state.fragments.length;
  els.headerCheckbox.indeterminate = selected > 0 && selected < state.fragments.length;
}

function updateProgress() {
  const selected = state.fragments.filter((f) => f.selected);
  const done = selected.filter((f) => f.status === "success" || f.status === "error").length;
  const total = selected.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  els.progressFill.style.width = `${percent}%`;
  els.progressLabel.textContent = `${done}/${total} (${percent}%)`;

  const totalSeconds = selected.reduce((acc, item) => acc + (item.audioSeconds || item.estimatedSeconds || 0), 0);
  els.statTotal.textContent = formatDuration(totalSeconds);

  if (state.startedAt && total > 0 && done > 0 && state.running) {
    const elapsed = (Date.now() - state.startedAt.getTime()) / 1000;
    const perOne = elapsed / done;
    const remaining = Math.max(0, (total - done) * perOne);
    els.statEta.textContent = formatDuration(remaining);
  } else if (!state.running) {
    els.statEta.textContent = "-";
  }
}

function statusLabel(status) {
  if (status === "processing") return (typeof t === 'function') ? t('status_processing') : 'Przetwarzam';
  if (status === "success")    return (typeof t === 'function') ? t('status_success')    : 'Gotowe';
  if (status === "error")      return (typeof t === 'function') ? t('status_error')      : 'Blad';
  return (typeof t === 'function') ? t('status_pending') : 'Oczekuje';
}

function wavForIndex(idx) {
  const f = state.fragments[idx];
  return f?.wavPath || null;
}

function toFileUrl(filePath) {
  return `file:///${encodeURI(filePath.replace(/\\/g, "/"))}`;
}

function renderFragmentRow(f, i) {
  const status = f.status || "pending";
  const playLabel = state.activeAudioIdx === i ? "||" : ">";
  const canPlay = Boolean(f.wavPath);
  const dur = f.audioSeconds ? formatDuration(f.audioSeconds) : `~${formatDuration(f.estimatedSeconds)}`;
  const charCount = f.text ? f.text.length : 0;
  const charCls = charCount > 700 ? "chars-danger" : charCount > 500 ? "chars-warn" : "chars-ok";
  return `<tr data-idx="${i}" data-status="${status}">
    <td class="col-chk"><input type="checkbox" data-action="toggle" data-idx="${i}" ${f.selected ? "checked" : ""}></td>
    <td class="col-nr">${i + 1}</td>
    <td class="col-status">
      <span class="status-pill" data-status="${status}"${status === 'error' ? ` data-action="show-error" data-idx="${i}" title="${(typeof t === 'function') ? t('click_see_error') : 'Kliknij, aby zobaczyc blad'}"` : ''}>
        <span class="dot"></span>${statusLabel(status)}
      </span>
    </td>
    <td class="col-play">
      <button class="play-btn ${state.activeAudioIdx === i ? "playing" : ""}" data-action="play" data-idx="${i}" ${canPlay ? "" : "disabled"}>${playLabel}</button>
    </td>
    <td class="col-dur">${dur}</td>
    <td class="col-chars ${charCls}" title="${(typeof t === 'function') ? t('chars_tooltip', {n: charCount}) : charCount + ' chars'}">${charCount > 700 ? "⚠ " : ""}${charCount}</td>
    ${renderTagsCell(f.text)}
    <td class="col-speaker">${escapeHtml(resolveVoiceForFragment(f).label || "Maciej")}</td>
    <td class="col-text" data-action="edit" data-idx="${i}" title="${(typeof t === 'function') ? t('click_edit') : 'Kliknij, aby edytowac'}">${renderTextWithBoldTags(f.text)}</td>
  </tr>`;
}

function renderFragments() {
  const data = state.fragments;
  els.fragCount.textContent = (typeof t === 'function') ? t('frag_count', {n: data.length}) : `${data.length} fragments`;

  if (data.length === 0) {
    els.tbody.innerHTML = `
      <tr class="empty-state">
        <td colspan="9">
          <div class="empty-state-content">
            <p>${(typeof t === 'function') ? t('empty_no_frags') : 'No fragments. Load a book and run split.'}</p>
          </div>
        </td>
      </tr>
    `;
    updateProgress();
    updateHeaderCheckbox();
    updateButtonsState();
    return;
  }

  // Group by chapter
  const groupMap = new Map();
  data.forEach((f, i) => {
    const ci = f.chapterIdx !== undefined ? f.chapterIdx : 0;
    if (!groupMap.has(ci)) {
      groupMap.set(ci, { title: f.chapterTitle || "Section", idx: ci, indices: [] });
    }
    groupMap.get(ci).indices.push(i);
  });
  const groups = [...groupMap.values()].sort((a, b) => a.idx - b.idx);
  const multiChapter = groups.length > 1;

  let html = "";
  for (const group of groups) {
    if (multiChapter) {
      const total = group.indices.length;
      const done = group.indices.filter(i => data[i].status === "success" || data[i].status === "error").length;
      const pct = total > 0 ? Math.round(done / total * 100) : 0;
      const collapsed = state.collapsedChapters.has(group.idx);
      const allSelected = group.indices.length > 0 && group.indices.every(i => data[i].selected);
      const someSelected = !allSelected && group.indices.some(i => data[i].selected);
      html += `<tr class="chapter-header-row${collapsed ? ' collapsed' : ''}" data-chapter="${group.idx}">
        <td colspan="9" class="chapter-header-cell">
          <div class="chapter-header-inner">
            <input type="checkbox" class="chapter-chk" data-action="toggle-chapter-select" data-chapter="${group.idx}" ${allSelected ? 'checked' : ''} ${someSelected ? 'data-indeterminate="1"' : ''} title="Select/deselect entire chapter">
            <span class="chapter-arrow" data-action="toggle-chapter">${collapsed ? '▶' : '▼'}</span>
            <b data-action="toggle-chapter">${(typeof t === 'function') ? t('chapter_n', {n: group.idx + 1}) : 'Chapter ' + (group.idx + 1)}</b>
            <span class="chapter-subtitle muted" data-action="toggle-chapter">${escapeHtml(group.title)}</span>
            <span class="chapter-count muted">${done}/${total}</span>
            <div class="chapter-progress-wrap" data-action="toggle-chapter"><div class="chapter-progress-fill" style="width:${pct}%"></div></div>
          </div>
        </td>
      </tr>`;
      if (collapsed) continue;
    }
    for (const i of group.indices) {
      html += renderFragmentRow(data[i], i);
    }
  }

  els.tbody.innerHTML = html;
  // Fix indeterminate state on chapter checkboxes (can't be set via HTML attribute)
  els.tbody.querySelectorAll(".chapter-chk[data-indeterminate]").forEach(chk => {
    chk.indeterminate = true;
  });
  updateProgress();
  updateHeaderCheckbox();
  updateButtonsState();
}

function extractTags(text) {
  // Matches [anything inside brackets] — Fish Speech emotion tags
  const matches = text.match(/\[[^\]]{1,60}\]/g) || [];
  return matches;
}

function renderTagsCell(text) {
  const tags = extractTags(text);
  if (tags.length === 0) return '<td class="col-tags"><span class="tag-empty muted">—</span></td>';
  const pills = tags.map(t => `<b class="tag-pill">${escapeHtml(t)}</b>`).join(' ');
  return `<td class="col-tags"><span class="tag-count">${tags.length}</span>${pills}</td>`;
}

function escapeHtml(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  // Normalize Unicode NFKC form to ensure consistent encoding
  const normalized = text.normalize('NFKC');
  return normalized
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderTextWithBoldTags(text) {
  if (!text || typeof text !== 'string') return '';
  // Split on [tag] boundaries, escape each part, wrap tags in <b>
  const parts = text.split(/(\[[^\]]{1,60}\])/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      // it's a tag
      return `<b class="inline-tag">${escapeHtml(part)}</b>`;
    }
    return escapeHtml(part);
  }).join('');
}

function openEditModal(idx) {
  const frag = state.fragments[idx];
  if (!frag) return;
  editingIdx = idx;
  els.editModalIdx.textContent = `#${idx + 1}`;
  els.editText.value = frag.text;
  window.api.py("build_command_preview", {
    text: frag.text,
    idx: idx + 1,
    subdir: state.subdir,
  }).then((res) => {
    els.editCommand.textContent = res.command || "";
  }).catch(() => {
    els.editCommand.textContent = "Nie mozna wygenerowac podgladu komendy.";
  });
  els.editModal.hidden = false;
}

function closeEditModal() {
  editingIdx = null;
  els.editModal.hidden = true;
}

// ─── Modal: Book Settings ──────────────────────────────────────────
function bookMetaKey() { return `book_meta_${state.subdir || "default"}`; }

function loadBookMeta() {
  try { return JSON.parse(localStorage.getItem(bookMetaKey()) || "{}"); }
  catch (_) { return {}; }
}

function saveBookMeta(meta) {
  localStorage.setItem(bookMetaKey(), JSON.stringify(meta));
}

function openBookSettingsModal() {
  if (!els.bookSettingsModal) return;
  const meta = loadBookMeta();
  els.bsmBookName.value        = state.subdir || "";
  els.bsmAudiobooksPath.value  = abRoot();
  els.bsmFilesbooksPath.value  = fbRoot();
  els.bsmDescription.value     = meta.description || "";
  els.bsmNotes.value           = meta.notes || "";
  els.bookSettingsModal.hidden = false;
}

function closeBookSettingsModal() {
  if (els.bookSettingsModal) els.bookSettingsModal.hidden = true;
}

function saveBookSettings() {
  const newName     = (els.bsmBookName.value || "").trim();
  const newAbRoot   = (els.bsmAudiobooksPath.value || "").trim();
  const newFbRoot   = (els.bsmFilesbooksPath.value || "").trim();
  const description = els.bsmDescription.value;
  const notes       = els.bsmNotes.value;

  // Rename book / subdir
  if (newName && newName !== state.subdir) {
    if (els.subdir) {
      const opt = Array.from(els.subdir.options).find(o => o.value === state.subdir);
      if (opt) { opt.value = newName; opt.textContent = newName; }
    }
    state.subdir = newName;
    if (els.subdir) els.subdir.value = newName;
  }

  // Update paths
  state.audiobooksRoot = newAbRoot;
  state.filesbooksRoot = newFbRoot;

  // Save metadata to localStorage (after possible subdir rename)
  saveBookMeta({ description, notes });

  toast("Book settings saved.", "success");
  closeBookSettingsModal();
}

// Initialize book settings modal handlers (called by attachEvents)
function attachBookSettingsModalEvents() {
  if (els.bsmClose)             els.bsmClose.addEventListener("click", closeBookSettingsModal);
  if (els.btnBsmCancel)         els.btnBsmCancel.addEventListener("click", closeBookSettingsModal);
  if (els.btnBsmSave)           els.btnBsmSave.addEventListener("click", saveBookSettings);

  // Delete book (red button in Book Settings footer)
  if (els.btnBsmDelete) {
    els.btnBsmDelete.addEventListener("click", async () => {
      const bookName = (els.bsmBookName?.value || els.subdir?.value || "").trim();
      if (!bookName) {
        toast("No book name to delete.", "error");
        return;
      }
      const confirmed = await customPrompt(
        "Enter the book name '" + bookName + "' to confirm deletion (irreversible).",
        ""
      );
      if (confirmed === null) return;
      if (confirmed.trim() !== bookName) {
        toast("Name mismatch, cancelled.", "error");
        return;
      }
      try {
        const audiobooksDir = els.bsmAudiobooksPath?.value || (state.workdir + "\\Audiobooks");
        const res = await window.api.py("delete_book", {
          audiobooks_dir: audiobooksDir,
          book_name: bookName,
        });
        if (res && res.ok) {
          toast("Book deleted: " + bookName, "success");
          if (els.bookSettingsModal) els.bookSettingsModal.hidden = true;
          if (typeof scanAudiobooksSubdirs === "function") {
            await scanAudiobooksSubdirs();
          }
        } else {
          toast("Delete error: " + (res && res.error ? res.error : "unknown"), "error");
        }
      } catch (err) {
        toast("Error: " + err.message, "error");
      }
    });
  }
  if (els.bookSettingsModal)    els.bookSettingsModal.querySelector(".modal-backdrop")
                                  ?.addEventListener("click", closeBookSettingsModal);
  if (els.btnBsmPickAudiobooks) els.btnBsmPickAudiobooks.addEventListener("click", async () => {
    const dir = await window.api.openDirectory({ defaultPath: els.bsmAudiobooksPath.value });
    if (dir) els.bsmAudiobooksPath.value = dir;
  });
  if (els.btnBsmPickFilesbooks) els.btnBsmPickFilesbooks.addEventListener("click", async () => {
    const dir = await window.api.openDirectory({ defaultPath: els.bsmFilesbooksPath.value });
    if (dir) els.bsmFilesbooksPath.value = dir;
  });
}



function showErrorModal(idx) {
  const frag = state.fragments[idx];
  if (!frag) return;
  els.errorModalIdx.textContent = `#${idx + 1}`;
  els.errorDetail.textContent = frag.errorMsg || "(no error details)";
  els.errorModal.hidden = false;
}

function closeErrorModal() {
  els.errorModal.hidden = true;
}

// ─── Prepare modal state ────────────────────────────────────────────────────
let prepareInputPath = "";   // selected input file path
let prepareOutputPath = "";  // optional full output path ("Save as" dialog)

function prepareChatAppend(text, cls = "") {
  const el = els.prepareChatLog;
  if (!el) return;
  el.style.display = "flex";
  const line = document.createElement("div");
  line.className = cls;
  line.textContent = text;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
}

function setPrepareInputFile(path) {
  prepareInputPath = path;
  const name = path.split(/[\\/]/).pop();
  if (els.prepareInputStatus) {
    els.prepareInputStatus.textContent = name;
    els.prepareInputStatus.style.color = "#5bf5a3";
  }
  if (!els.prepareOutputName.value.trim()) {
    const stem = name.replace(/\.[^.]+$/, "");
    els.prepareOutputName.value = `${stem}_tagged.txt`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VOICE CREATION
// ═══════════════════════════════════════════════════════════════════════════════
let voiceSourcePath = "";

function voicesDir() {
  return `${state.workdir}\\Lectors`;
}

// Find a book file in Files_books matching the selected folder name (subdir)
async function autoLoadBookForSubdir(subdir) {
  if (!subdir) return;
  const filesDir = fbRoot();
  try {
    const res = await window.api.py("list_files", { path: filesDir, extensions: ["epub", "txt", "pdf"] });
    const files = res?.files || [];
    if (!files.length) return;

    // Matching: find the best file for this folder name
    const subdirLow = subdir.toLowerCase();
    let best = null;

    // 1. Exact match (stem == subdir)
    best = files.find(f => f.stem.toLowerCase() === subdirLow);

    // 2. Stem starts with subdir (e.g. "Silos" -> "Silos_TTS_tagged_v3")
    if (!best) best = files.find(f => f.stem.toLowerCase().startsWith(subdirLow));

    // 3. Subdir starts with stem (e.g. folder "1. Silos - Hugh Howey" -> file "1. Silos - ...")
    if (!best) best = files.find(f => subdirLow.startsWith(f.stem.toLowerCase()));

    // 4. Stem contains subdir or subdir contains stem (loose match)
    if (!best) best = files.find(f => f.stem.toLowerCase().includes(subdirLow) || subdirLow.includes(f.stem.toLowerCase()));

    if (!best) {
      toast(`No book file for "${subdir}" in Files_books.`, "info");
      return;
    }

    toast(`Auto-loading: ${best.name}`, "info");
    await pickBookFromPath(best.path);

    // pickBookFromPath sets state.subdir = file stem; restore selected dropdown value
    if (state.subdir !== subdir) {
      // Remove temporary option added from file stem if different from subdir
      const stemOpt = els.subdir ? Array.from(els.subdir.options).find(o => o.value === state.subdir) : null;
      if (stemOpt && state.subdir !== subdir) stemOpt.remove();
      state.subdir = subdir;
      if (els.subdir) els.subdir.value = subdir;
    }
  } catch (_) {
    // Files_books does not exist or no permissions; ignore silently
  }
}

function sanitizeFolderName(name) {
  // Remove characters not allowed in Windows folder names
  return (name || "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().replace(/[._]+$/, "").trim() || "Chapter";
}

function openVoiceModal() {
  els.voiceModal.hidden = false;
  refreshVoiceList();
}

function closeVoiceModal() {
  els.voiceModal.hidden = true;
}

function voiceLogAppend(msg) {
  if (!els.voiceLog) return;
  els.voiceLog.style.display = "flex";
  const line = document.createElement("div");
  line.textContent = msg;
  els.voiceLog.appendChild(line);
  els.voiceLog.scrollTop = els.voiceLog.scrollHeight;
}

function setVoiceSource(path) {
  voiceSourcePath = path;
  const name = path.split(/[\\/]/).pop();
  if (els.voiceInputStatus) {
    els.voiceInputStatus.textContent = name;
    els.voiceInputStatus.style.color = "#5bf5a3";
  }
  // Auto-fill voice name from filename stem
  if (els.voiceName && !els.voiceName.value.trim()) {
    els.voiceName.value = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, "_");
  }
  // Load into audio player
  if (els.voiceSourcePlayer) {
    els.voiceSourcePlayer.src = toFileUrl(path);
    els.voiceSourcePlayer.load();
    const onMeta = () => {
      const dur = els.voiceSourcePlayer.duration || 0;
      if (els.voiceStartSec) {
        els.voiceStartSec.max = Math.max(0, dur - 1).toFixed(1);
        els.voiceStartSec.value = 0;
      }
      if (els.voiceStartInput) els.voiceStartInput.value = "0";
      if (els.voiceSourceDuration) els.voiceSourceDuration.textContent = `file: ${dur.toFixed(1)}s`;
      updateVoiceStartLabels();
      els.voiceSourcePlayer.removeEventListener("loadedmetadata", onMeta);
    };
    els.voiceSourcePlayer.addEventListener("loadedmetadata", onMeta);
  }
  if (els.voiceSplitBtn) els.voiceSplitBtn.disabled = false;
}

function updateVoiceStartLabels() {
  const start = parseFloat(els.voiceStartSec?.value || 0);
  const dur = parseInt(els.voiceSegDur?.value || 10, 10);
  if (els.voiceClipEnd) els.voiceClipEnd.textContent = `end: ${(start + dur).toFixed(1)}s`;
}

async function splitVoice() {
  const name = (els.voiceName?.value || "").trim();
  if (!name) { toast("Enter narrator name.", "error"); return; }
  if (!voiceSourcePath) { toast("Select an audio file.", "error"); return; }

  const startSec = parseFloat(els.voiceStartSec?.value || 0);
  const durationSec = parseInt(els.voiceSegDur?.value || 10, 10);
  const lectors = voicesDir();
  const tempDir = lectors + "\\Temp";

  els.voiceSplitBtn.disabled = true;
  els.voiceLog.innerHTML = "";
  els.voiceLog.style.display = "flex";
  if (els.voiceSamplesPreview) els.voiceSamplesPreview.style.display = "none";
  voiceLogAppend(`▶ Source: ${voiceSourcePath}`);
  voiceLogAppend(`  Narrator: ${name}  |  Start: ${startSec.toFixed(1)}s  |  Length: ${durationSec}s`);

  try {
    const result = await window.api.py("create_voice_sample", {
      source_path:  voiceSourcePath,
      start_sec:    startSec,
      duration_sec: durationSec,
      voice_name:   name,
      lectors_dir:  lectors,
      temp_dir:     tempDir,
    });
    if (result.ok === false) throw new Error(result.error || "Backend error");
    voiceLogAppend(`✅ WAV: ${result.wav_path}`);
    voiceLogAppend(`✅ TXT: ${result.txt_path}`);
    if (result.text) voiceLogAppend(`🎙 Transcript: ${result.text.slice(0, 120)}…`);
    const samples = [result.temp_clip, result.wav_path].filter(Boolean);
    renderVoiceSamplesPreview(samples);
    await refreshVoiceList();
    toast(`Narrator "${name}" saved.`, "success");
  } catch (err) {
    voiceLogAppend(`❌ Error: ${err.message}`);
    toast(`Error: ${err.message}`, "error");
  } finally {
    els.voiceSplitBtn.disabled = false;
  }
}

function renderVoiceSamplesPreview(samples) {
  if (!els.voiceSamplesPreview) return;
  if (!samples || samples.length === 0) {
    els.voiceSamplesPreview.style.display = "none";
    return;
  }
  els.voiceSamplesPreview.style.display = "flex";
  els.voiceSamplesPreview.innerHTML = samples.map((p, i) => {
    const name = p.split(/[\\/]/).pop();
    return `<div class="voice-sample-row">
      <button class="btn btn-ghost" data-action="preview-play" data-path="${escapeHtml(p)}">▶</button>
      <span>${i + 1}. ${name}</span>
    </div>`;
  }).join("");
}

function playVoiceSample(path, playBtn) {
  if (!path) return;
  if (!els.audioPlayer) return;
  const url = toFileUrl(path);
  // Toggle: jeśli ten sam plik gra → zatrzymaj
  if (els.audioPlayer.src === url && !els.audioPlayer.paused) {
    els.audioPlayer.pause();
    els.audioPlayer.currentTime = 0;
    // Przywróć wszystkie przyciski play
    els.voiceList?.querySelectorAll(".voice-play-btn").forEach(b => { b.textContent = "▶"; });
    return;
  }
  // Zatrzymaj poprzedni
  els.audioPlayer.pause();
  els.audioPlayer.currentTime = 0;
  els.voiceList?.querySelectorAll(".voice-play-btn").forEach(b => { b.textContent = "▶"; });
  // Zmień kliknięty przycisk na Stop (element przekazany bezpośrednio)
  if (playBtn) playBtn.textContent = "⏹";
  els.audioPlayer.src = url;
  els.audioPlayer.play().catch(() => {});
  els.audioPlayer.addEventListener("ended", () => {
    if (playBtn) playBtn.textContent = "▶";
  }, { once: true });
}

async function refreshVoiceList() {
  try {
    const result = await window.api.py("list_voices", { voices_dir: voicesDir() });
    renderVoiceList(result.voices || []);
    // Po kazdej zmianie listy lektorow — odswiez tez dropdowny w mapie speaker->voice
    await refreshVoicesAndMap();
  } catch (_) {
    renderVoiceList([]);
  }
}

function renderVoiceList(voices) {
  if (!els.voiceList) return;
  if (voices.length === 0) {
    els.voiceList.innerHTML = "";
    if (els.voiceListHint) els.voiceListHint.style.display = "";
    return;
  }
  if (els.voiceListHint) els.voiceListHint.style.display = "none";
  const activeVoice = els.serverRefAudio?.value || "";
  els.voiceList.innerHTML = voices.map(v => {
    const isActive = activeVoice && (activeVoice.includes(`\\${v.name}.wav`) || activeVoice.includes(`/${v.name}.wav`) || activeVoice.includes(v.name));
    const en = (s) => escapeHtml(s || "");
    const escapedName = en(v.name);
    const escapedSample = en(v.first_sample || "");
    const transcript = v.transcript ? `<div class="voice-card-transcript">${en(v.transcript.slice(0, 140))}…</div>` : "";
    const playBtn = escapedSample
      ? `<button class="btn btn-ghost voice-play-btn" title="Play sample" data-action="voice-play" data-sample="${escapedSample}">▶</button>`
      : "";
    return `<div class="voice-card${isActive ? ' voice-card--active' : ''}" data-voice="${escapedName}" data-sample="${escapedSample}">
      <div class="voice-card-header">
        ${playBtn}
        <div class="voice-card-name">${escapedName}${isActive ? ' <span class="voice-active-badge">AKTYWNY</span>' : ""}</div>
      </div>
      <div class="voice-card-meta">${v.sample_count || 1} samples · ${en(v.source || "manual/yt")}</div>
      ${transcript}
      <div class="voice-card-actions">
        <button class="btn ${isActive ? 'btn-secondary' : 'btn-primary'}" style="font-size:11px;padding:4px 12px;"
          data-action="voice-activate" data-voice="${escapedName}" data-sample="${escapedSample}">
          ${isActive ? "✓ Active" : "Set default"}
        </button>
        <button class="btn btn-secondary" style="font-size:11px;padding:4px 10px;"
          data-action="voice-rename" data-voice="${escapedName}">Rename</button>
        <button class="btn btn-secondary" style="font-size:11px;padding:4px 10px;background:rgba(220,38,38,0.15);border-color:rgba(220,38,38,0.4);color:#ff6b6b;"
          data-action="voice-delete" data-voice="${escapedName}">Delete</button>
      </div>
    </div>`;
  }).join("");
}

async function renameVoicePrompt(name) {
  const newName = await customPrompt(`New narrator name (was: "${name}")`, name);
  if (!newName || newName.trim() === name || !newName.trim()) return;
  try {
    await window.api.py("rename_voice", { voice_name: name, new_name: newName.trim(), voices_dir: voicesDir() });
    toast(`Renamed: "${name}" → "${newName.trim()}"`, "success");
    refreshVoiceList();
  } catch (err) {
    toast(`Rename error: ${err.message}`, "error");
  }
}

async function activateVoice(name, firstSample) {
  // Set ref_audio and ref_text to selected narrator files
  const lectors = voicesDir();
  const wavPath = firstSample || (lectors + "\\" + name + ".wav");
  const txtPath = lectors + "\\" + name + ".txt";
  if (els.serverRefAudio) els.serverRefAudio.value = wavPath;
  if (els.serverRefText)  els.serverRefText.value  = txtPath;
  toast(`Narrator "${name}" set as active.`, "success");
  renderVoiceList(await (async () => {
    try { const r = await window.api.py("list_voices", { voices_dir: voicesDir() }); return r.voices || []; } catch (_) { return []; }
  })());
}

async function deleteVoice(name) {
  if (!confirm(`Delete narrator "${name}" and all samples?`)) return;
  try {
    await window.api.py("delete_voice", { voice_name: name, voices_dir: voicesDir() });
    toast(`Narrator "${name}" deleted.`, "success");
    refreshVoiceList();
  } catch (err) {
    toast(`Delete error: ${err.message}`, "error");
  }
}

// ─── Custom prompt (Electron blocks window.prompt) ──────────────────────────
function customPrompt(message, defaultValue) {
  return new Promise((resolve) => {
    // Lazy create modal at first use
    let modal = document.getElementById("custom-prompt-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "custom-prompt-modal";
      modal.className = "modal";
      modal.hidden = true;
      modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-window" style="max-width:480px;width:90vw;">
          <div class="modal-header">
            <h3 id="custom-prompt-title">Enter value</h3>
            <button class="btn btn-ghost btn-icon" id="custom-prompt-x">×</button>
          </div>
          <div class="modal-body">
            <input type="text" id="custom-prompt-input" style="width:100%;padding:8px;font-size:14px;
              background:#1f2330;color:#e8eaed;border:1px solid #2a3148;border-radius:4px;">
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="custom-prompt-cancel">Cancel</button>
            <button class="btn btn-primary" id="custom-prompt-ok">OK</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }
    const titleEl  = modal.querySelector("#custom-prompt-title");
    const inputEl  = modal.querySelector("#custom-prompt-input");
    const okBtn    = modal.querySelector("#custom-prompt-ok");
    const cancelBtn= modal.querySelector("#custom-prompt-cancel");
    const xBtn     = modal.querySelector("#custom-prompt-x");
    titleEl.textContent = message || "Enter value";
    inputEl.value = defaultValue || "";
    modal.hidden = false;
    setTimeout(() => { inputEl.focus(); inputEl.select(); }, 50);

    function done(val) {
      modal.hidden = true;
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      xBtn.removeEventListener("click", onCancel);
      inputEl.removeEventListener("keydown", onKey);
      resolve(val);
    }
    function onOk()     { done(inputEl.value); }
    function onCancel() { done(null); }
    function onKey(e)   {
      if (e.key === "Enter")  { e.preventDefault(); done(inputEl.value); }
      if (e.key === "Escape") { e.preventDefault(); done(null); }
    }
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    xBtn.addEventListener("click", onCancel);
    inputEl.addEventListener("keydown", onKey);
  });
}


function openPrepareModal() {
  // Allows opening the modal even without a loaded book
  if (!els.preparePrompt.value.trim()) {
    els.preparePrompt.value = DEFAULT_PREP_PROMPT;
  }
  // If we already have bookPath from main view, pre-fill
  if (state.bookPath && !prepareInputPath) {
    setPrepareInputFile(state.bookPath);
  }
  els.prepareChatLog.style.display = "none";
  els.prepareChatLog.innerHTML = "";
  if (els.prepareStatusLine) els.prepareStatusLine.textContent = "Ready.";
  els.prepareModal.hidden = false;
}

function closePrepareModal() {
  els.prepareModal.hidden = true;
}

async function runPrepareBook() {
  const apiKey = (els.prepareApiKey.value || "").trim();
  const prompt = (els.preparePrompt.value || "").trim();
  const outputFileName = (els.prepareOutputName.value || "").trim();
  const model = els.prepareModel?.value || "gemini-2.5-flash";

  const bookPath = prepareInputPath || state.bookPath || "";
  if (!bookPath) {
    toast("Select input file (PDF/EPUB/TXT).", "error");
    return;
  }
  if (!apiKey) { toast("Enter Gemini API key.", "error"); return; }
  if (!prompt) { toast("Enter book preparation prompt.", "error"); return; }

  els.prepareRun.disabled = true;
  if (els.prepareStatusLine) els.prepareStatusLine.textContent = "Sending to Gemini...";
  els.prepareChatLog.style.display = "flex";
  els.prepareChatLog.innerHTML = "";
  prepareChatAppend(`📄 File: ${bookPath.split(/[\\/]/).pop()}`, "");
  prepareChatAppend(`🤖 Model: ${model}`, "");
  prepareChatAppend(`📤 Sending text to Gemini...`, "");

  try {
    const result = await window.api.prepareBookWithGemini({
      apiKey, prompt, bookPath, outputFileName,
      model, outputPath: prepareOutputPath || "",
    });

    const sizeKb = result?.size ? Math.round(result.size / 1024) : "?";
    prepareChatAppend(`✅ Done! Model: ${result?.model || model}. File: ${sizeKb} KB.`, "");
    prepareChatAppend(`💾 Saved: ${result?.outputPath || "?"}`, "");
    if (els.prepareStatusLine) els.prepareStatusLine.textContent = "Done!";

    closePrepareModal();
    toast(`Gemini tagged book (${sizeKb} KB) — ${result?.model || model}.`, "success");

    if (result?.outputPath) {
      state.bookPath = result.outputPath;
      els.bookPath.value = result.outputPath;
      prepareInputPath = result.outputPath;
      await pickBookFromPath(result.outputPath);
    }
  } catch (err) {
    prepareChatAppend(`❌ Error: ${err.message}`, "");
    if (els.prepareStatusLine) els.prepareStatusLine.textContent = "Error.";
    toast(`Preparation error: ${err.message}`, "error");
  } finally {
    els.prepareRun.disabled = false;
  }
}

async function pickBookFromPath(path) {
  if (!path) return;

  state.bookPath = path;
  els.bookPath.value = path;
  els.chapterSelect.disabled = true;
  els.chapterSelect.innerHTML = "<option>Loading...</option>";

  try {
    const data = await window.api.py("load_book", { path });
    state.chapters = data.chapters || [];

    // === Auto-populate speaker->voice map from detected characters ===
    // python_backend returns data.speakers (sidecar *.speakers.txt or
    // extraction of [speaker:Name] from text). For each new character that
    // is missing in textarea, append an empty line "Name => ".
    const detectedSpeakers = Array.isArray(data.speakers) ? data.speakers : [];
    if (detectedSpeakers.length > 0 && els.speakerVoiceMap) {
      const currentMap = parseSpeakerVoiceMapText(els.speakerVoiceMap.value || "");
      const currentKeys = Object.keys(currentMap);
      const linesToAdd = [];
      for (const sp of detectedSpeakers) {
        if (!currentKeys.includes(sp.toLowerCase())) {
          linesToAdd.push(sp + " => ");
        }
      }
      if (linesToAdd.length > 0) {
        const sep = (els.speakerVoiceMap.value && !els.speakerVoiceMap.value.endsWith("\n")) ? "\n" : "";
        els.speakerVoiceMap.value = (els.speakerVoiceMap.value || "") + sep + linesToAdd.join("\n");
        toast("Detected " + detectedSpeakers.length + " characters — assign narrators in the map.", "info");
        // Rebuild character/narrator card UI to show new characters
        buildSpeakerVoiceMapUI();
      } else {
        toast("Detected " + detectedSpeakers.length + " characters — all already in the map.", "info");
      }
    }

    // === Auto-create directory Audiobooks\{book_name} ===
    const rawBookName = state.bookPath.split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
    state.bookName = rawBookName;
    const bookSubdir = rawBookName;
    const bookDirPath = `${abRoot()}\\${rawBookName}`;
    try {
      await window.api.py("ensure_dir", { path: bookDirPath });
    } catch (_) {}
    // Add to dropdown if missing and set active
    if (els.subdir) {
      let opt = Array.from(els.subdir.options).find(o => o.value === bookSubdir);
      if (!opt) {
        opt = document.createElement("option");
        opt.value = bookSubdir;
        opt.textContent = bookSubdir;
        els.subdir.appendChild(opt);
      }
      els.subdir.value = bookSubdir;
      state.subdir = bookSubdir;
    }

    if (state.chapters.length === 0) {
      els.chapterSelect.innerHTML = "<option>No sections</option>";
      toast("No content found in file.", "error");
    } else {
      const totalFragments = state.chapters.reduce((sum, c) => sum + (c.fragment_count || 0), 0);
      const allOption = `<option value="all">0. All (${totalFragments} fragments)</option>`;
      const items = state.chapters
        .map((c, i) => {
          const count = c.fragment_count || 0;
          const label = `${i + 1}. ${escapeHtml(c.title || "Section")} (${count} fragments)`;
          return `<option value="${i}">${label}</option>`;
        })
        .join("");

      els.chapterSelect.innerHTML = allOption + items;
      els.chapterSelect.disabled = false;
      // Select "All" by default
      els.chapterSelect.options[0].selected = true;
      toast(`Loaded ${state.chapters.length} sections (${totalFragments} fragments).`, "success");
    }
  } catch (err) {
    toast(`Load error: ${err.message}`, "error");
    els.chapterSelect.innerHTML = "<option>Error</option>";
  }

  updateButtonsState();
}

async function pickBook() {
  const path = await window.api.openFile({
    filters: [
      { name: "Books", extensions: ["epub", "pdf", "txt"] },
      { name: "All", extensions: ["*"] },
    ],
  });
  await pickBookFromPath(path);
}

async function loadAndSplit() {
  if (!state.bookPath) {
    toast("Select a file first.", "error");
    return;
  }
  const selected = getChapterIndex();
  if (selected.length === 0) {
    toast("Select at least one section.", "error");
    return;
  }

  // Build chapter list for splitting while preserving indices
  let chaptersToSplit;
  if (selected.includes("all")) {
    chaptersToSplit = state.chapters.map((c, i) => ({ ...c, _origIdx: i }));
  } else {
    const indices = selected.map(Number).filter(n => Number.isFinite(n));
    chaptersToSplit = indices.map(i => ({ ...state.chapters[i], _origIdx: i })).filter(Boolean);
  }
  if (chaptersToSplit.length === 0 || chaptersToSplit.every(c => !(c.text || "").trim())) {
    toast("No text to split.", "error");
    return;
  }

  const fragSec = parseInt(els.fragSlider?.value, 10) || 25;
  const targetChars = fragSec * 15;
  const allFragments = [];

  try {
    for (const chapter of chaptersToSplit) {
      if (!(chapter.text || "").trim()) continue;
      const res = await window.api.py("split_text", { text: chapter.text, target_chars: targetChars });
      for (const text of (res.fragments || [])) {
        allFragments.push({
          text,
          selected: true,
          status: "pending",
          wavPath: null,
          audioSeconds: 0,
          estimatedSeconds: estimateSecondsFromText(text),
          chapterTitle: chapter.title || `Section ${chapter._origIdx + 1}`,
          chapterIdx: chapter._origIdx,
        });
      }
    }

    state.fragments = allFragments;
    state.startedAt = null;
    state.collapsedChapters = new Set();
    els.statStart.textContent = "-";
    els.statEnd.textContent = "-";
    els.statEta.textContent = "-";

    // Check existing audio files
    try {
      const scan = await window.api.py("scan_existing_wavs", {
        workdir: state.workdir,
        subdir: state.subdir,
        count: state.fragments.length,
      });
      let foundCount = 0;
      for (const entry of (scan.existing || [])) {
        const f = state.fragments[entry.idx];
        if (f) {
          f.wavPath = entry.path;
          f.audioSeconds = entry.audio_seconds || 0;
          f.status = "success";
          f.selected = false;
          foundCount++;
        }
      }
      if (foundCount > 0) toast(`Found ${foundCount} completed fragments — deselected.`, "success");
    } catch (_) {}

    renderFragments();
    const label = selected.includes("all") ? "All" : chaptersToSplit.map(c => c.title || "Section").join(" + ");
    toast(`Split ${label} into ${state.fragments.length} fragments.`, "success");
  } catch (err) {
    toast(`Split error: ${err.message}`, "error");
  }
}

async function testServer() {
  const url = els.serverUrl.value.trim() || "http://127.0.0.1:8080";
  els.serverStatusBadge.textContent = "(testing...)";
  try {
    const res = await window.api.py("server_ping", { url });
    if (res && res.ok) {
      els.serverStatusBadge.textContent = "(ONLINE)";
      els.serverStatusBadge.style.color = "#10b981";
      toast("s2.cpp server responding (" + url + ")", "success");
    } else {
      els.serverStatusBadge.textContent = "(OFFLINE)";
      els.serverStatusBadge.style.color = "#ef4444";
      toast("Server NOT responding. Run start_server.bat", "error");
    }
  } catch (e) {
    els.serverStatusBadge.textContent = "(BLAD)";
    els.serverStatusBadge.style.color = "#ef4444";
    toast("Server test error: " + e.message, "error");
  }
}

async function runSelectedServer(selectedIdx, wd, subdir) {
  // Server pipeline with multi-voice: groups fragments by narrator
  const url = els.serverUrl.value.trim();
  const endpoint = els.serverEndpoint.value.trim() || "/v1/audio/speech";
  const gpuWorkers = parseInt(els.serverGpuWorkers.value, 10) || 2;
  const timeout = parseInt(els.serverTimeout.value, 10) || 1800;
  const temperature = parseFloat(els.ttsTemperature.value);
  const topP = parseFloat(els.ttsTopP.value);
  const repPenalty = parseFloat(els.ttsRepPenalty.value);
  const chunkLength = parseInt(els.ttsChunkLength.value, 10);
  const maxTokens = parseInt(els.ttsMaxTokens.value, 10);

  // Default voice from UI fields
  const defaultRefAudio = els.serverRefAudio.value.trim();
  const defaultRefText = els.serverRefText.value.trim();
  const defaultRefAudioPath = defaultRefAudio.includes(":") ? defaultRefAudio : `${wd}\\${defaultRefAudio}`;
  const defaultRefTextPath = defaultRefText.includes(":") ? defaultRefText : `${wd}\\${defaultRefText}`;

  // Group fragments by narrator
  const groups = new Map(); // key = "refAudio|refText" → {refAudioPath, refTextPath, label, fragments[]}
  for (const idx of selectedIdx) {
    const frag = state.fragments[idx];
    const voice = resolveVoiceForFragment(frag);
    const raPath = voice.refAudio
      ? (voice.refAudio.includes(":") ? voice.refAudio : `${wd}\\${voice.refAudio}`)
      : defaultRefAudioPath;
    const rtPath = voice.refText
      ? (voice.refText.includes(":") ? voice.refText : `${wd}\\${voice.refText}`)
      : defaultRefTextPath;
    const key = `${raPath}|${rtPath}`;
    if (!groups.has(key)) {
      groups.set(key, { refAudioPath: raPath, refTextPath: rtPath, label: voice.label || "default", fragments: [] });
    }
    // Set per-fragment subdir: Audiobooks\{book}\{chapter}
    const chapterFolder = sanitizeFolderName(frag.chapterTitle || `Chapter_${(frag.chapterIdx || 0) + 1}`);
    const fragSubdir = `Audiobooks\\${state.subdir}\\${chapterFolder}`;
    groups.get(key).fragments.push({ idx: idx + 1, text: frag.text, frag_subdir: fragSubdir });
  }

  // Map fileIdx -> fragArrayIdx for progress events
  state.serverIdxMap = {};
  for (const idx of selectedIdx) {
    state.serverIdxMap[idx + 1] = idx;
  }

  toast(`Server pipeline: ${selectedIdx.length} fragments, ${groups.size} narrator(s), GPU: ${gpuWorkers}`, "info");

  for (const [, group] of groups) {
    if (state.stopRequested) break;
    toast(`Narrator: ${group.label} (${group.fragments.length} frags.)`, "info");
    try {
      const res = await window.api.py("server_run_queue", {
        url, endpoint, workdir: wd, subdir,
        voice_label: group.label,
        ref_audio_path: group.refAudioPath,
        ref_text_file: group.refTextPath,
        fragments: group.fragments,
        gpu_workers: gpuWorkers,
        timeout,
        max_retries: 2,
        temperature, top_p: topP,
        repetition_penalty: repPenalty,
        chunk_length: chunkLength,
        max_new_tokens: maxTokens,
        output_format: "mp3",
      });
      if (res && (res.error || res.ok === false)) {
        toast("Pipeline error: " + (res.error || res.reason || "unknown error"), "error");
      }
    } catch (e) {
      toast("Pipeline exception: " + e.message, "error");
    }
  }
}

async function runSelected() {
  if (state.running) return;
  const selectedIdx = state.fragments
    .map((f, i) => (f.selected ? i : -1))
    .filter((x) => x >= 0);

  if (selectedIdx.length === 0) {
    toast("No fragments selected.", "error");
    return;
  }

  // ─ Warning for overly long fragments ─────────────────────────────────────
  const CHAR_WARN = 600;
  const tooLong = selectedIdx.filter(i => (state.fragments[i].text || "").length > CHAR_WARN);
  if (tooLong.length > 0) {
    const lines = tooLong.map(i => `#${i + 1}: ${state.fragments[i].text.length} chars`).join("\n");
    const ok = confirm(
      `⚠ Warning: ${tooLong.length} selected fragment(s) is too long for Fish Speech:\n\n${lines}\n\n` +
      `Fragments >600 chars may take several hours instead of a few minutes.\n` +
      `Continue anyway?`
    );
    if (!ok) return;
  }
  // ─────────────────────────────────────────────────────────────────────────

  state.running = true;
  state.stopRequested = false;
  state.startedAt = new Date();
  els.statStart.textContent = formatClock(state.startedAt);
  els.statEnd.textContent = "-";
  updateButtonsState();

  const wd = state.workdir || els.workdir.value.trim();
  const subdir = state.subdir || els.subdir.value.trim();

  try {
    await window.api.py("ensure_dir", { path: `${wd}\\${subdir}` });
  } catch (_) {}

  // Server pipeline mode (v3) - jeden request, model raz w VRAM
  if (els.chkServerMode && els.chkServerMode.checked) {
    await runSelectedServer(selectedIdx, wd, subdir);
    state.running = false;
    state.endedAt = new Date();
    els.statEnd.textContent = formatClock(state.endedAt);
    updateButtonsState();
    return;
  }

  for (const idx of selectedIdx) {
    if (state.stopRequested) break;

    const frag = state.fragments[idx];
    frag.status = "processing";
    renderFragments();

    try {
      const res = await window.api.py("process_fragment", {
        idx: idx + 1,
        text: frag.text,
        workdir: wd,
        subdir,
        preprocess: {
          enabled: state.phoneticEnabled || state.tagsEnabled,
          debug: state.debugTtsInput,
          pause_tags: state.tagsEnabled,
          normalize_punctuation: true,
          hard_phonetic: state.phoneticEnabled,
          use_zwsp: true,
          use_dot_break: false,
        },
      });

      if (res.error) {
        frag.status = "error";
        frag.errorMsg = res.error;
        toast(`Fragment ${idx + 1}: ${res.error}`, "error");
      } else {
        frag.status = "success";
        frag.wavPath = res.wav_path;
        frag.audioSeconds = Number(res.audio_seconds || 0);
      }
    } catch (err) {
      frag.status = "error";
      frag.errorMsg = err.message;
      toast(`Fragment ${idx + 1}: ${err.message}`, "error");
    }

    renderFragments();
  }

  state.running = false;
  state.stopRequested = false;
  els.statEnd.textContent = formatClock(new Date());
  updateButtonsState();
  updateProgress();
  toast("Processing complete.", "success");
  // Auto-merge: check whether any chapter is fully ready
  checkAutoMergeChapters();
}

async function checkAutoMergeChapters() {
  // Find all unique chapterIdx values
  const chapters = [...new Set(state.fragments.map(f => f.chapterIdx).filter(x => x !== undefined))];
  for (const chIdx of chapters) {
    const chFrags = state.fragments.filter(f => f.chapterIdx === chIdx);
    if (!chFrags.length) continue;
    if (!chFrags.every(f => f.status === "success" && f.wavPath)) continue;
    const paths = chFrags.map(f => f.wavPath);
    const bookName = (state.subdir || "audiobook").replace(/[^a-zA-Z0-9_ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, "_");
    const outName = `Chapter${chIdx + 1}_${bookName}.mp3`;
    const outPath = `${abRoot()}\\${state.subdir}\\${outName}`;
    // Check if file already exists (avoid double merge)
    try {
      const ex = await window.api.py("exists", { path: outPath });
      if (ex.exists) continue;
    } catch (_) {}
    toast(`Merging chapter ${chIdx + 1} (${chFrags.length} files)…`, "info");
    try {
      await window.api.py("merge_wavs", { paths, out_path: outPath });
      toast(`✅ Chapter ${chIdx + 1} merged → ${outName}`, "success");
    } catch (err) {
      toast(`Chapter ${chIdx + 1} merge error: ${err.message}`, "error");
    }
  }
}

function stopRun() {
  if (!state.running) return;
  state.stopRequested = true;
  toast("Queue will stop after current fragment.", "info");
  // Send abort to s2_server to prevent starting next fragments
  const abortUrl = (els.serverUrl?.value?.trim() || "http://127.0.0.1:8080") + "/abort";
  fetch(abortUrl, { method: "POST" }).catch(() => {});
}

// ─── Select N pending ───────────────────────────────────────────────────────
function selectNPending() {
  const n = parseInt(els.selectNInput?.value, 10);
  if (!n || n < 1) { toast("Enter number of fragments to select.", "error"); return; }

  // Deselect all
  state.fragments.forEach((f) => (f.selected = false));

  // Select next N that are not done (status !== "success")
  let count = 0;
  for (const f of state.fragments) {
    if (count >= n) break;
    if (f.status !== "success") {
      f.selected = true;
      count++;
    }
  }

  renderFragments();
  toast(`Selected ${count} pending fragments (skipped done).`, "success");
}

// ─── Split Selected ─────────────────────────────────────────────────────────
async function splitSelected() {
  const TARGET_MAX = 450; // chars
  const selectedIdx = state.fragments
    .map((f, i) => (f.selected ? i : -1))
    .filter((x) => x >= 0);

  if (selectedIdx.length === 0) {
    toast("No fragments selected.", "error");
    return;
  }

  const toLong = selectedIdx.filter(i => (state.fragments[i].text || "").length > TARGET_MAX);
  if (toLong.length === 0) {
    toast(`All selected fragments are ≤${TARGET_MAX} chars — nothing to split.`, "info");
    return;
  }

  toast(`Splitting ${toLong.length} long fragments…`, "info");
  let totalAdded = 0;

  // Process from the end so indices do not shift
  for (const origIdx of [...toLong].reverse()) {
    const frag = state.fragments[origIdx];
    try {
      const res = await window.api.py("split_text", { text: frag.text, target_chars: TARGET_MAX });
      const parts = res?.fragments || [];
      if (parts.length <= 1) continue;

      // Keep metadata (wavPath, status) only on the first chunk
      const baseEstimate = frag.estimatedSeconds / parts.length;
      const newFrags = parts.map((text, j) => ({
        text,
        selected: true,
        status: "pending",
        wavPath: null,
        audioSeconds: null,
        estimatedSeconds: baseEstimate,
        error: null,
        chapterTitle: frag.chapterTitle,
      }));

      // Replace original fragment with list of new chunks
      state.fragments.splice(origIdx, 1, ...newFrags);
      totalAdded += parts.length - 1;
    } catch (e) {
      toast(`Split error for fragment #${origIdx + 1}: ${e.message}`, "error");
    }
  }

  if (totalAdded > 0) {
    toast(`Split — added ${totalAdded} new fragments.`, "success");
    renderFragments();
  }
}

async function mergeSelection(onlySelected) {
  const targets = state.fragments
    .map((f, i) => ({ ...f, idx: i + 1 }))
    .filter((f) => (onlySelected ? f.selected : true));

  if (targets.length === 0) {
    toast("No fragments to merge.", "error");
    return;
  }

  const paths = [];
  for (const frag of targets) {
    if (frag.wavPath) {
      paths.push(frag.wavPath);
      continue;
    }
    try {
      const probe = await window.api.py("wav_path_for", {
        idx: frag.idx,
        workdir: state.workdir,
        subdir: state.subdir,
      });
      if (probe.exists) {
        paths.push(probe.path);
      }
    } catch (_) {}
  }

  if (paths.length === 0) {
    toast("No WAV files found.", "error");
    return;
  }

  const outPath = await window.api.saveFile({
    defaultPath: "audiobook_final.wav",
    filters: [{ name: "WAV", extensions: ["wav"] }],
  });
  if (!outPath) return;

  try {
    await window.api.py("merge_wavs", { paths, out_path: outPath });
    toast("WAV files merged.", "success");
    await window.api.openWavFile(outPath);
  } catch (err) {
    toast(`Merge error: ${err.message}`, "error");
  }
}

function attachEvents() {
  els.btnPickBook.addEventListener("click", pickBook);
  els.btnPrepareBook.addEventListener("click", openPrepareModal);

  if (els.btnAiVoiceover) els.btnAiVoiceover.addEventListener("click", openAiVoiceoverModal);
  if (els.aiVoiceoverClose) els.aiVoiceoverClose.addEventListener("click", closeAiVoiceoverModal);
  if (els.aiVoiceoverModal) {
    els.aiVoiceoverModal.addEventListener("click", (evt) => {
      if (evt.target.classList.contains("modal-backdrop")) closeAiVoiceoverModal();
    });
  }
  const wireVoiceoverDrop = (dropEl, inputEl, setter) => {
    if (!dropEl || !inputEl) return;
    dropEl.addEventListener("click", () => inputEl.click());
    dropEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropEl.classList.add("drag-over");
    });
    dropEl.addEventListener("dragleave", () => dropEl.classList.remove("drag-over"));
    dropEl.addEventListener("drop", (e) => {
      e.preventDefault();
      dropEl.classList.remove("drag-over");
      const file = e.dataTransfer?.files?.[0];
      if (file?.path) setter(file.path);
    });
    inputEl.addEventListener("change", () => {
      const file = inputEl.files?.[0];
      if (file?.path) setter(file.path);
    });
  };
  wireVoiceoverDrop(els.voiceoverVideoDrop, els.voiceoverVideoInput, (p) => {
    state.voiceover.videoPath = p;
    if (els.voiceoverVideoLabel) els.voiceoverVideoLabel.textContent = p.split(/[\\/]/).pop();
    if (els.voiceoverVideo) els.voiceoverVideo.src = toFileUrl(p);
    ensureVoiceoverSourceAudio(p);
    updateVoiceoverButtons();
  });
  wireVoiceoverDrop(els.voiceoverSubDrop, els.voiceoverSubInput, (p) => {
    state.voiceover.subtitlePath = p;
    if (els.voiceoverSubLabel) els.voiceoverSubLabel.textContent = p.split(/[\\/]/).pop();
    updateVoiceoverButtons();
  });
  if (els.voiceoverParse) els.voiceoverParse.addEventListener("click", parseVoiceoverSubtitles);
  if (els.voiceoverExtractSubtitles) els.voiceoverExtractSubtitles.addEventListener("click", extractVoiceoverSubtitlesFromVideo);
  if (els.voiceoverGenerate) els.voiceoverGenerate.addEventListener("click", generateVoiceoverQueue);
  if (els.voiceoverPreview) els.voiceoverPreview.addEventListener("click", generateVoiceoverPreview);
  if (els.voiceoverRender) els.voiceoverRender.addEventListener("click", fullRenderVoiceover);
  if (els.voiceoverToggleAudio) els.voiceoverToggleAudio.addEventListener("click", toggleVoiceoverSourceAudio);
  if (els.voiceoverSaveProject) els.voiceoverSaveProject.addEventListener("click", saveVoiceoverProject);
  if (els.voiceoverLoadProject) els.voiceoverLoadProject.addEventListener("click", loadVoiceoverProject);
  if (els.voiceoverTimelineBody) {
    els.voiceoverTimelineBody.addEventListener("click", (e) => {
      const row = e.target.closest('[data-action="voiceover-row"]');
      if (!row) return;
      const idx = Number(row.dataset.idx);
      if (!Number.isFinite(idx)) return;
      state.voiceover.selectedIdx = idx;
      renderVoiceoverTimeline();
      const cue = state.voiceover.cues[idx];
      if (cue && els.voiceoverVideo) {
        const t = Math.max(0, Number(cue.start_ms || 0) + Number(cue.offset_ms || 0));
        els.voiceoverVideo.currentTime = t / 1000;
      }
    });
    els.voiceoverTimelineBody.addEventListener("input", (e) => {
      const inp = e.target.closest('[data-action="voiceover-offset"]');
      if (!inp) return;
      const idx = Number(inp.dataset.idx);
      if (!Number.isFinite(idx)) return;
      const cue = state.voiceover.cues[idx];
      if (!cue) return;
      cue.offset_ms = Number(inp.value || 0);
    });
  }
  if (els.voiceoverVideo) {
    els.voiceoverVideo.addEventListener("loadedmetadata", () => {
      els.voiceoverVideo.muted = true;
      voiceoverSourceAudio.volume = els.voiceoverVideo.volume;
      voiceoverSourceAudio.muted = state.voiceover.sourceAudioMuted;
      voiceoverSourceAudio.playbackRate = els.voiceoverVideo.playbackRate || 1;
      refreshVoiceoverAudioToggle();
    });
    els.voiceoverVideo.addEventListener("play", async () => {
      if (!state.voiceover.sourceAudioPath) return;
      voiceoverSourceAudio.currentTime = els.voiceoverVideo.currentTime || 0;
      try {
        await voiceoverSourceAudio.play();
      } catch (_) {}
    });
    els.voiceoverVideo.addEventListener("pause", () => {
      voiceoverSourceAudio.pause();
    });
    els.voiceoverVideo.addEventListener("seeking", () => {
      if (!state.voiceover.sourceAudioPath) return;
      voiceoverSourceAudio.currentTime = els.voiceoverVideo.currentTime || 0;
    });
    els.voiceoverVideo.addEventListener("ratechange", () => {
      voiceoverSourceAudio.playbackRate = els.voiceoverVideo.playbackRate || 1;
    });
    els.voiceoverVideo.addEventListener("volumechange", () => {
      voiceoverSourceAudio.volume = els.voiceoverVideo.volume;
    });
    els.voiceoverVideo.addEventListener("timeupdate", () => {
      const cur = Number.isFinite(els.voiceoverVideo.currentTime) ? els.voiceoverVideo.currentTime : 0;
      const dur = Number.isFinite(els.voiceoverVideo.duration) ? els.voiceoverVideo.duration : 0;
      if (state.voiceover.sourceAudioPath && Math.abs((voiceoverSourceAudio.currentTime || 0) - cur) > 0.35) {
        voiceoverSourceAudio.currentTime = cur;
      }
      if (els.voiceoverVideoSeek && !els.voiceoverVideoSeek.matches(":active")) {
        const v = dur > 0 ? Math.round((cur / dur) * 1000) : 0;
        els.voiceoverVideoSeek.value = String(v);
      }
      if (els.voiceoverVideoTime) {
        els.voiceoverVideoTime.textContent = `${formatDuration(cur)} / ${formatDuration(dur)}`;
      }
    });
  }
  if (els.voiceoverVideoSeek && els.voiceoverVideo) {
    els.voiceoverVideoSeek.addEventListener("input", () => {
      const dur = Number.isFinite(els.voiceoverVideo.duration) ? els.voiceoverVideo.duration : 0;
      if (dur <= 0) return;
      els.voiceoverVideo.currentTime = (Number(els.voiceoverVideoSeek.value || 0) / 1000) * dur;
    });
  }

  if (els.btnPlayer) els.btnPlayer.addEventListener("click", openPlayerModal);
  if (els.playerClose) els.playerClose.addEventListener("click", closePlayerModal);
  if (els.playerRefresh) els.playerRefresh.addEventListener("click", loadPlayerLibrary);
  if (els.playerSearch) {
    els.playerSearch.addEventListener("input", () => {
      state.player.search = els.playerSearch.value || "";
      renderPlayerLibrary();
      savePlayerState();
    });
  }
  if (els.playerModal) {
    els.playerModal.addEventListener("click", (evt) => {
      if (evt.target.classList.contains("modal-backdrop")) closePlayerModal();
    });
  }
  if (els.playerLibrary) {
    els.playerLibrary.addEventListener("click", async (evt) => {
      const sectionBtn = evt.target.closest('[data-action="player-section"]');
      if (sectionBtn) {
        const b = Number(sectionBtn.dataset.book);
        const s = Number(sectionBtn.dataset.section);
        selectPlayerSection(b, s);
        await playCurrentPlayerTrack();
        return;
      }
      const bookHead = evt.target.closest('[data-action="player-book"]');
      if (bookHead) {
        const b = Number(bookHead.dataset.book);
        state.player.bookIndex = (state.player.bookIndex === b) ? -1 : b;
        renderPlayerLibrary();
      }
    });
  }
  if (els.playerPlay) {
    els.playerPlay.addEventListener("click", async () => {
      if (playerAudio.paused) await playCurrentPlayerTrack();
      else pausePlayerTrack();
    });
  }
  if (els.playerPrev) els.playerPrev.addEventListener("click", () => stepPlayerTrack(-1));
  if (els.playerNext) els.playerNext.addEventListener("click", () => stepPlayerTrack(1));
  if (els.playerBack15) {
    els.playerBack15.addEventListener("click", () => {
      playerAudio.currentTime = Math.max(0, (playerAudio.currentTime || 0) - 15);
      updatePlayerProgress();
    });
  }
  if (els.playerFwd15) {
    els.playerFwd15.addEventListener("click", () => {
      const max = Number.isFinite(playerAudio.duration) ? playerAudio.duration : (playerAudio.currentTime + 15);
      playerAudio.currentTime = Math.min(max, (playerAudio.currentTime || 0) + 15);
      updatePlayerProgress();
    });
  }
  if (els.playerSeek) {
    els.playerSeek.addEventListener("input", () => {
      const dur = Number.isFinite(playerAudio.duration) ? playerAudio.duration : 0;
      if (dur <= 0) return;
      playerAudio.currentTime = (Number(els.playerSeek.value) / 1000) * dur;
      updatePlayerProgress();
    });
  }
  if (els.playerVolume) {
    els.playerVolume.addEventListener("input", () => {
      playerAudio.volume = Number(els.playerVolume.value);
      savePlayerState();
    });
  }
  if (els.playerSpeed) {
    els.playerSpeed.addEventListener("change", () => {
      playerAudio.playbackRate = Number(els.playerSpeed.value);
      savePlayerState();
    });
  }
  if (els.playerShuffle) {
    els.playerShuffle.addEventListener("click", () => {
      state.player.shuffle = !state.player.shuffle;
      els.playerShuffle.textContent = `🔀 Shuffle: ${state.player.shuffle ? "On" : "Off"}`;
      savePlayerState();
    });
  }
  if (els.playerRepeat) {
    els.playerRepeat.addEventListener("change", () => {
      state.player.repeatMode = els.playerRepeat.value || "none";
      savePlayerState();
    });
  }
  if (els.playerSleepToggle && els.playerSleepMinutes) {
    els.playerSleepToggle.addEventListener("click", () => {
      if (state.player.sleepUntil && state.player.sleepUntil > Date.now()) {
        clearSleepTimer(true);
      } else {
        startSleepTimer(Number(els.playerSleepMinutes.value || 0));
      }
    });
  }

  playerAudio.addEventListener("timeupdate", () => {
    updatePlayerProgress();
    savePlayerState();
  });
  playerAudio.addEventListener("loadedmetadata", async () => {
    if (Number.isFinite(state.player.pendingResumeTime) && state.player.pendingResumeTime > 0) {
      const max = Number.isFinite(playerAudio.duration) ? playerAudio.duration : state.player.pendingResumeTime;
      playerAudio.currentTime = Math.min(max, state.player.pendingResumeTime);
      state.player.pendingResumeTime = null;
      updatePlayerProgress();
    } else {
      updatePlayerProgress();
    }
    if (state.player.autoResumePlayback) {
      state.player.autoResumePlayback = false;
      try { await playerAudio.play(); } catch (_) {}
    }
  });
  playerAudio.addEventListener("ended", () => stepPlayerTrack(1));
  playerAudio.addEventListener("pause", () => {
    if (els.playerPlay) els.playerPlay.textContent = "▶ Play";
    savePlayerState();
  });
  playerAudio.addEventListener("play", () => {
    if (els.playerPlay) els.playerPlay.textContent = "⏸ Pause";
    savePlayerState();
  });

  // ── Voice Creation modal ──────────────────────────────────────────────────
  if (els.btnVoiceCreation) els.btnVoiceCreation.addEventListener("click", openVoiceModal);
  if (els.voiceClose) els.voiceClose.addEventListener("click", closeVoiceModal);

  if (els.voiceSegDur) {
    els.voiceSegDur.addEventListener("input", () => {
      if (els.voiceSegVal) els.voiceSegVal.textContent = els.voiceSegDur.value;
      updateVoiceStartLabels();
    });
  }

  // voice-set-seg preset buttons (10s / 30s / 60s)
  document.querySelectorAll("[data-action='voice-set-seg']").forEach(btn => {
    btn.addEventListener("click", () => {
      const seg = btn.dataset.seg;
      if (els.voiceSegDur) { els.voiceSegDur.value = seg; }
      if (els.voiceSegVal) els.voiceSegVal.textContent = seg;
      updateVoiceStartLabels();
    });
  });

  // Start slider ↔ number input sync
  if (els.voiceStartSec) {
    els.voiceStartSec.addEventListener("input", () => {
      if (els.voiceStartInput) els.voiceStartInput.value = parseFloat(els.voiceStartSec.value).toFixed(1);
      updateVoiceStartLabels();
    });
  }
  if (els.voiceStartInput) {
    els.voiceStartInput.addEventListener("input", () => {
      const v = parseFloat(els.voiceStartInput.value) || 0;
      if (els.voiceStartSec) els.voiceStartSec.value = v;
      updateVoiceStartLabels();
    });
  }

  // "Ustaw start z odtwarzacza" button
  if (els.btnVoiceSetStart) {
    els.btnVoiceSetStart.addEventListener("click", () => {
      const t = els.voiceSourcePlayer?.currentTime || 0;
      if (els.voiceStartSec) els.voiceStartSec.value = t;
      if (els.voiceStartInput) els.voiceStartInput.value = t.toFixed(1);
      updateVoiceStartLabels();
    });
  }

  // YouTube download
  if (els.btnVoiceDownload) {
    els.btnVoiceDownload.addEventListener("click", async () => {
      const url = (els.voiceYoutubeUrl?.value || "").trim();
      if (!url) { toast("Paste YouTube link.", "error"); return; }
      els.btnVoiceDownload.disabled = true;
      els.voiceLog.innerHTML = "";
      els.voiceLog.style.display = "flex";
      voiceLogAppend(`⏬ Downloading: ${url}`);
      try {
        const result = await window.api.py("download_youtube_audio", {
          url,
          voices_dir: voicesDir(),
        });
        if (result.ok === false) throw new Error(result.error || "Download error");
        voiceLogAppend(`✅ Downloaded: ${result.audio_path}`);
        setVoiceSource(result.audio_path);
        toast(`Downloaded: ${result.title}`, "success");
      } catch (err) {
        voiceLogAppend(`❌ ${err.message}`);
        toast(`Error: ${err.message}`, "error");
      } finally {
        els.btnVoiceDownload.disabled = false;
      }
    });
  }

    if (els.btnReloadApp) {
    els.btnReloadApp.addEventListener("click", () => {
      if (window.api && window.api.reloadApp) {
        window.api.reloadApp();
      } else {
        location.reload();
      }
    });
  }

  // About modal — opens on btn-about click, auto-closes after 5 s, also closes on backdrop click.
  let _aboutTimer = null;

  function openAboutModal() {
    const m = document.getElementById('about-modal');
    if (!m) return;
    m.style.display = 'flex';
    clearTimeout(_aboutTimer);
    _aboutTimer = setTimeout(closeAboutModal, 5000);
  }

  function closeAboutModal() {
    const m = document.getElementById('about-modal');
    if (!m) return;
    clearTimeout(_aboutTimer);
    _aboutTimer = null;
    m.style.display = 'none';
  }

  document.getElementById('btn-about')?.addEventListener('click', openAboutModal);
  document.getElementById('about-close')?.addEventListener('click', closeAboutModal);
  document.getElementById('about-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAboutModal();
  });

  if (els.voiceSplitBtn) els.voiceSplitBtn.addEventListener("click", splitVoice);

  // Delegated handler for voice sample preview play buttons (replaces CSP-blocked onclick=)
  if (els.voiceSamplesPreview) {
    els.voiceSamplesPreview.addEventListener("click", (e) => {
      const btn = e.target.closest('[data-action="preview-play"]');
      if (btn) playVoiceSample(btn.dataset.path, btn);
    });
  }

  // Event delegation for narrator card buttons (CSP blocks inline onclick=)
  if (els.voiceList) {
    els.voiceList.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const name   = btn.dataset.voice || btn.closest("[data-voice]")?.dataset.voice || "";
      const sample = btn.dataset.sample || btn.closest("[data-sample]")?.dataset.sample || "";
      if (action === "voice-play")     { playVoiceSample(sample, btn); return; }
      if (action === "voice-activate") { await activateVoice(name, sample); return; }
      if (action === "voice-rename")   { await renameVoicePrompt(name); return; }
      if (action === "voice-delete")   { await deleteVoice(name); return; }
    });
  }

  // Drag & drop
  if (els.voiceDropzone) {
    els.voiceDropzone.addEventListener("click", () => els.voiceFileInput?.click());
    els.voiceBrowseLink?.addEventListener("click", (e) => { e.stopPropagation(); els.voiceFileInput?.click(); });
    els.voiceDropzone.addEventListener("dragover", (e) => { e.preventDefault(); els.voiceDropzone.classList.add("drag-over"); });
    els.voiceDropzone.addEventListener("dragleave", () => els.voiceDropzone.classList.remove("drag-over"));
    els.voiceDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      els.voiceDropzone.classList.remove("drag-over");
      const file = e.dataTransfer?.files?.[0];
      if (file?.path) setVoiceSource(file.path);
    });
  }
  if (els.voiceFileInput) {
    els.voiceFileInput.addEventListener("change", () => {
      const file = els.voiceFileInput.files?.[0];
      if (file?.path) setVoiceSource(file.path);
    });
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (els.btnPickWorkdir) {
    els.btnPickWorkdir.addEventListener("click", async () => {
      const folder = state.workdir || els.workdir.value.trim();
      if (folder) await window.api.openInExplorer(folder);
    });
  }

  els.workdir.addEventListener("input", () => {
    state.workdir = els.workdir.value.trim();
  });

  els.subdir.addEventListener("input", () => {
    state.subdir = els.subdir.value.trim() || "Silos";
    autoLoadBookForSubdir(state.subdir);
  });
  // "change" obsługuje wybór myszą z dropdownu
  els.subdir.addEventListener("change", () => {
    state.subdir = els.subdir.value.trim() || "Silos";
    autoLoadBookForSubdir(state.subdir);
  });

  els.btnLoadSplit.addEventListener("click", loadAndSplit);

  // Zaznaczenie "Całość" odznacza poszczególne sekcje i odwrotnie
  els.chapterSelect.addEventListener("change", function () {
    const opts = Array.from(this.options);
    const allOpt = opts.find(o => o.value === "all");
    if (!allOpt) return;
    if (allOpt.selected) {
      // "Całość" zaznaczona → odznacz pojedyncze sekcje
      opts.forEach(o => { if (o.value !== "all") o.selected = false; });
    } else if (opts.some(o => o.value !== "all" && o.selected)) {
      // Jakaś sekcja zaznaczona → odznacz "Całość"
      allOpt.selected = false;
    }
  });

  els.chkPhonetic.addEventListener("change", () => {
    state.phoneticEnabled = Boolean(els.chkPhonetic.checked);
    toast(`Phonetic hard-fix: ${state.phoneticEnabled ? "on" : "off"}`, "info");
  });

  els.chkTags.addEventListener("change", () => {
    state.tagsEnabled = Boolean(els.chkTags.checked);
    toast(`[pause] tags: ${state.tagsEnabled ? "on" : "off"}`, "info");
  });

  els.chkDebugTts.addEventListener("change", () => {
    state.debugTtsInput = Boolean(els.chkDebugTts.checked);
  });

  els.btnSelectAll.addEventListener("click", () => {
    state.fragments.forEach((f) => (f.selected = true));
    renderFragments();
  });

  els.btnDeselectAll.addEventListener("click", () => {
    state.fragments.forEach((f) => (f.selected = false));
    renderFragments();
  });

  els.headerCheckbox.addEventListener("change", () => {
    const v = els.headerCheckbox.checked;
    state.fragments.forEach((f) => (f.selected = v));
    renderFragments();
  });

  els.btnRun.addEventListener("click", runSelected);
  els.btnStop.addEventListener("click", stopRun);
  if (els.btnTestServer) els.btnTestServer.addEventListener("click", testServer);
  if (els.fragSlider) {
    const fmtFragLabel = (sec) => {
      if (sec < 60) return sec + "s";
      const m = Math.floor(sec / 60);
      const s2 = sec % 60;
      return m + ":" + (s2 < 10 ? "0" + s2 : s2) + " min";
    };
    const updateFragLabel = (syncMinutes) => {
      const sec = parseInt(els.fragSlider.value, 10) || 25;
      if (els.fragSecLabel) els.fragSecLabel.textContent = fmtFragLabel(sec);
      if (els.fragCharsLabel) els.fragCharsLabel.textContent = "(~" + (sec * 15) + " zn)";
      if (syncMinutes !== false && els.fragMinutes) {
        const mins = Math.round((sec / 60) * 100) / 100;
        if (Math.abs(parseFloat(els.fragMinutes.value || "0") - mins) > 0.005) {
          els.fragMinutes.value = mins;
        }
      }
    };
    els.fragSlider.addEventListener("input", () => updateFragLabel(true));
    if (els.fragMinutes) {
      const onMinutesChange = () => {
        const mins = parseFloat(els.fragMinutes.value);
        if (isNaN(mins)) return;
        let sec = Math.round(mins * 60);
        const min_s = parseInt(els.fragSlider.min || "15", 10);
        const max_s = parseInt(els.fragSlider.max || "900", 10);
        sec = Math.max(min_s, Math.min(max_s, sec));
        if (parseInt(els.fragSlider.value, 10) !== sec) {
          els.fragSlider.value = sec;
        }
        updateFragLabel(false);
      };
      els.fragMinutes.addEventListener("change", onMinutesChange);
      els.fragMinutes.addEventListener("input", onMinutesChange);
    }
    updateFragLabel(true);
  }

  // ─── TTS Server section toggle ─────────────────────────────────────────
  const ttsServerToggle = document.getElementById("tts-server-toggle");
  const ttsServerBody = document.getElementById("tts-server-body");
  let ttsServerExpanded = false;
  if (ttsServerToggle && ttsServerBody) {
    ttsServerToggle.addEventListener("click", () => {
      ttsServerExpanded = !ttsServerExpanded;
      ttsServerBody.style.display = ttsServerExpanded ? "block" : "none";
      const arrow = ttsServerExpanded ? "▼" : "▶";
      const sp = ttsServerToggle.querySelector('[data-i18n="tts_mode_label"]');
      if (sp) sp.textContent = arrow + ' ' + ((typeof t === 'function') ? t('tts_mode_label').replace(/^[▶▼]\s*/, '') : 'Tryb TTS');
      else ttsServerToggle.childNodes[0].textContent = arrow + " Tryb TTS";
    });
  }

  // ─── Advanced TTS sliders ───────────────────────────────────────────────
  const ttsToggle = document.getElementById("tts-advanced-toggle");
  const ttsBody = document.getElementById("tts-advanced-body");
  let ttsExpanded = false;
  if (ttsToggle && ttsBody) {
    ttsToggle.addEventListener("click", () => {
      ttsExpanded = !ttsExpanded;
      ttsBody.style.display = ttsExpanded ? "block" : "none";
      ttsToggle.firstChild.textContent = (ttsExpanded ? "▼" : "▶") + " Advanced TTS Settings";
    });
    const sliderDefs = [
      { el: els.ttsTemperature, lbl: els.ttsTemperatureVal, fmt: v => parseFloat(v).toFixed(2) },
      { el: els.ttsTopP,        lbl: els.ttsTopPVal,        fmt: v => parseFloat(v).toFixed(2) },
      { el: els.ttsRepPenalty,  lbl: els.ttsRepPenaltyVal,  fmt: v => parseFloat(v).toFixed(2) },
      { el: els.ttsChunkLength, lbl: els.ttsChunkLengthVal, fmt: v => parseInt(v) },
      { el: els.ttsMaxTokens,   lbl: els.ttsMaxTokensVal,   fmt: v => parseInt(v) === 0 ? "0 (auto)" : parseInt(v) },
    ];
    sliderDefs.forEach(({ el, lbl, fmt }) => {
      if (el && lbl) {
        lbl.textContent = fmt(el.value);
        el.addEventListener("input", () => { lbl.textContent = fmt(el.value); });
      }
    });
  }
  els.btnMergeSelected.addEventListener("click", () => mergeSelection(true));
  if (els.btnSelectN) els.btnSelectN.addEventListener("click", selectNPending);
  if (els.selectNInput) els.selectNInput.addEventListener("keydown", (e) => { if (e.key === "Enter") selectNPending(); });
  els.btnMergeAll.addEventListener("click", () => mergeSelection(false));

  // Odznacz gotowe
  if (els.btnDeselectDone) {
    els.btnDeselectDone.addEventListener("click", () => {
      state.fragments.forEach((f) => { if (f.status === "success") f.selected = false; });
      renderFragments();
    });
  }

  // Wybierz plik książki na podstawie aktywnej pozycji w dropdownie
  if (els.btnPickSubdir) {
    els.btnPickSubdir.addEventListener("click", async () => {
      const subdir = (els.subdir?.value || state.subdir || "").trim();
      if (!subdir) { toast("Select a book from the list first.", "error"); return; }
      await autoLoadBookForSubdir(subdir);
    });
  }

  // 📁 Otwórz folder wygenerowanej książki w eksploratorze
  if (els.btnOpenAudiobooks) {
    els.btnOpenAudiobooks.addEventListener("click", () => {
      const folder = `${abRoot()}\\${state.subdir || ""}`;
      window.api.openInExplorer(folder);
    });
  }

  // 📂 Otwórz folder pliku źródłowego książki
  if (els.btnOpenFilesbooks) {
    els.btnOpenFilesbooks.addEventListener("click", () => {
      window.api.openInExplorer(fbRoot());
    });
  }

  // ⚙️ Ustawienia książki
  if (els.btnBookSettings) {
    els.btnBookSettings.addEventListener("click", () => openBookSettingsModal());
  }

  // Skocz do fragmentu
  if (els.btnGotoFrag && els.gotoFragInput) {
    const gotoFrag = () => {
      const n = parseInt(els.gotoFragInput.value, 10);
      if (!n || n < 1) return;
      const row = els.tbody.querySelector(`tr[data-idx="${n - 1}"]`);
      if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
      else toast(`Fragment #${n} does not exist.`, "error");
    };
    els.btnGotoFrag.addEventListener("click", gotoFrag);
    els.gotoFragInput.addEventListener("keydown", (e) => { if (e.key === "Enter") gotoFrag(); });
  }

  // Main dropzone — przeciągnij plik TXT/EPUB/PDF
  if (els.mainDropzone) {
    els.mainDropzone.addEventListener("click", () => els.mainFileInput?.click());
    els.mainDropzone.addEventListener("dragover", (e) => { e.preventDefault(); els.mainDropzone.classList.add("drag-over"); });
    els.mainDropzone.addEventListener("dragleave", () => els.mainDropzone.classList.remove("drag-over"));
    els.mainDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      els.mainDropzone.classList.remove("drag-over");
      const file = e.dataTransfer?.files?.[0];
      if (file?.path) pickBookFromPath(file.path);
    });
  }
  if (els.mainFileInput) {
    els.mainFileInput.addEventListener("change", () => {
      const file = els.mainFileInput.files?.[0];
      if (file?.path) pickBookFromPath(file.path);
    });
  }

  els.btnFirst.addEventListener("click", () => {
    const first = els.tbody.querySelector("tr[data-idx]");
    if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  els.btnLast.addEventListener("click", () => {
    const rows = els.tbody.querySelectorAll("tr[data-idx]");
    if (rows.length) rows[rows.length - 1].scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // Nawigacja prev/next fragment (▲/▼)
  const scrollToRelative = (delta) => {
    const rows = [...els.tbody.querySelectorAll("tr[data-idx]")];
    if (!rows.length) return;
    const wrapper = document.querySelector(".fragment-list-wrapper");
    const wrapRect = wrapper.getBoundingClientRect();
    // find the first row whose center is at or below the middle of the viewport
    let curIdx = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      const center = r.top + r.height / 2;
      if (center >= wrapRect.top + wrapRect.height / 2) { curIdx = i; break; }
      curIdx = i;
    }
    const next = rows[Math.max(0, Math.min(rows.length - 1, curIdx + delta))];
    if (next) next.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (els.btnPrev) els.btnPrev.addEventListener("click", () => scrollToRelative(-1));
  if (els.btnNext) els.btnNext.addEventListener("click", () => scrollToRelative(1));

  els.btnOpenFolder.addEventListener("click", async () => {
    const folder = `${state.workdir || els.workdir.value}\\${state.subdir || els.subdir.value}`;
    await window.api.openInExplorer(folder);
  });

  els.tbody.addEventListener("click", async (evt) => {
    const target = evt.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;

    // toggle-chapter nie potrzebuje idx fragmentu
    if (action === "toggle-chapter") {
      const ci = Number(target.closest("tr").dataset.chapter);
      if (state.collapsedChapters.has(ci)) {
        state.collapsedChapters.delete(ci);
      } else {
        state.collapsedChapters.add(ci);
      }
      renderFragments();
      return;
    }

    if (action === "toggle-chapter-select") {
      const ci = Number(target.dataset.chapter);
      const indices = state.fragments
        .map((f, i) => ({ f, i }))
        .filter(({ f }) => f.chapterIdx === ci)
        .map(({ i }) => i);
      const allSel = indices.every(i => state.fragments[i].selected);
      indices.forEach(i => { state.fragments[i].selected = !allSel; });
      // fix indeterminate state
      target.indeterminate = false;
      renderFragments();
      return;
    }

    const idx = Number(target.dataset.idx);
    if (!Number.isFinite(idx)) return;

    if (action === "toggle") {
      state.fragments[idx].selected = target.checked;
      renderFragments();
      return;
    }

    if (action === "edit") {
      openEditModal(idx);
      return;
    }

    if (action === "show-error") {
      showErrorModal(idx);
      return;
    }

    if (action === "play") {
      const f = state.fragments[idx];
      const path = wavForIndex(idx);
      if (!path) return;

      if (state.activeAudioIdx === idx) {
        els.audioPlayer.pause();
        els.audioPlayer.currentTime = 0;
        state.activeAudioIdx = null;
        renderFragments();
        return;
      }

      state.activeAudioIdx = idx;
      els.audioPlayer.src = toFileUrl(path);
      try {
        await els.audioPlayer.play();
      } catch (err) {
        toast(`Cannot play: ${err.message}`, "error");
        state.activeAudioIdx = null;
      }
      renderFragments();
    }
  });

  els.audioPlayer.addEventListener("ended", () => {
    state.activeAudioIdx = null;
    renderFragments();
  });

  els.editClose.addEventListener("click", closeEditModal);
  els.editCancel.addEventListener("click", closeEditModal);
  els.editSave.addEventListener("click", () => {
    if (editingIdx === null) return;
    const value = els.editText.value.trim();
    if (!value) {
      toast("Fragment text cannot be empty.", "error");
      return;
    }
    state.fragments[editingIdx].text = value;
    state.fragments[editingIdx].estimatedSeconds = estimateSecondsFromText(value);
    state.fragments[editingIdx].status = "pending";
    state.fragments[editingIdx].wavPath = null;
    state.fragments[editingIdx].audioSeconds = 0;
    closeEditModal();
    renderFragments();
  });

  els.editModal.addEventListener("click", (evt) => {
    if (evt.target.classList.contains("modal-backdrop")) {
      closeEditModal();
    }
  });

  els.prepareClose.addEventListener("click", closePrepareModal);
  els.prepareCancel.addEventListener("click", closePrepareModal);
  els.prepareRun.addEventListener("click", runPrepareBook);
  els.prepareModal.addEventListener("click", (evt) => {
    if (evt.target.classList.contains("modal-backdrop")) {
      closePrepareModal();
    }
  });

  // Reset prompt
  if (els.prepareResetPrompt) {
    els.prepareResetPrompt.addEventListener("click", () => {
      els.preparePrompt.value = DEFAULT_PREP_PROMPT;
    });
  }

  // Browse link → hidden file input
  if (els.prepareBrowseLink && els.prepareFileInput) {
    els.prepareBrowseLink.addEventListener("click", (e) => {
      e.stopPropagation();
      els.prepareFileInput.click();
    });
    els.prepareFileInput.addEventListener("change", () => {
      const f = els.prepareFileInput.files[0];
      if (f && f.path) setPrepareInputFile(f.path);
    });
  }

  // Dropzone click → browse
  if (els.prepareDropzone) {
    els.prepareDropzone.addEventListener("click", () => {
      if (els.prepareFileInput) els.prepareFileInput.click();
    });
    els.prepareDropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      els.prepareDropzone.classList.add("drag-over");
    });
    els.prepareDropzone.addEventListener("dragleave", () => {
      els.prepareDropzone.classList.remove("drag-over");
    });
    els.prepareDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      els.prepareDropzone.classList.remove("drag-over");
      const file = e.dataTransfer?.files[0];
      if (file && file.path) setPrepareInputFile(file.path);
    });
  }

  // "Zapisz jako…" dialog
  if (els.prepareSaveAsBtn) {
    els.prepareSaveAsBtn.addEventListener("click", async () => {
      const suggested = els.prepareOutputName.value.trim() || "ksiazka_tagged.txt";
      const p = await window.api.saveFileDialog({
        defaultPath: suggested,
        filters: [{ name: "Tekst TTS", extensions: ["txt"] }],
      });
      if (p) {
        prepareOutputPath = p;
        els.prepareOutputName.value = p.split(/[\\/]/).pop();
        if (els.prepareStatusLine) els.prepareStatusLine.textContent = `Zapis → ${p}`;
      }
    });
  }

  els.errorClose.addEventListener("click", closeErrorModal);
  els.errorOk.addEventListener("click", closeErrorModal);
  els.errorModal.addEventListener("click", (evt) => {
    if (evt.target.classList.contains("modal-backdrop")) {
      closeErrorModal();
    }
  });
}

// ── Backend Log Panel ─────────────────────────────────────────
(function initLogPanel() {
  const panel    = document.getElementById('log-panel');
  const body     = document.getElementById('log-body');
  const badge    = document.getElementById('log-count');
  const chevron  = document.getElementById('log-chevron');
  const toggle   = document.getElementById('log-toggle');
  const clearBtn = document.getElementById('log-clear');
  const scrollUp = document.getElementById('log-scroll-up');
  const scrollDn = document.getElementById('log-scroll-down');
  const expandBtn= document.getElementById('log-expand');
  if (!panel || !toggle) return;

  // start collapsed
  panel.classList.add('log-panel--collapsed');

  toggle.addEventListener('click', (e) => {
    if (e.target.closest('#log-clear,#log-scroll-up,#log-scroll-down,#log-expand')) return;
    const collapsed = panel.classList.toggle('log-panel--collapsed');
    chevron.textContent = collapsed ? '▲' : '▼';
    if (!collapsed && body) body.scrollTop = body.scrollHeight;
  });

  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (body) body.innerHTML = '';
    _logCount = 0;
    badge.textContent = '0';
  });

  // Scroll arrows
  scrollUp.addEventListener('click', (e) => {
    e.stopPropagation();
    if (body) body.scrollBy({ top: -100, behavior: 'smooth' });
  });
  scrollDn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (body) body.scrollBy({ top: 100, behavior: 'smooth' });
  });

  // Double-click on log body: toggle scroll to top / bottom
  let _logDblClickAtTop = false;
  body.addEventListener('dblclick', () => {
    if (_logDblClickAtTop) {
      body.scrollTop = body.scrollHeight;
      _logDblClickAtTop = false;
    } else {
      body.scrollTop = 0;
      _logDblClickAtTop = true;
    }
  });

  // Fullscreen expand button
  expandBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    _openLogFullscreen();
  });
})();

function _openLogFullscreen() {
  const modal   = document.getElementById('log-fs-modal');
  const fsBody  = document.getElementById('log-fs-body');
  const closeBtn= document.getElementById('log-fs-close');
  const srcBody = document.getElementById('log-body');
  if (!modal || !fsBody) return;
  // Clone all log lines into fullscreen view
  fsBody.innerHTML = srcBody ? srcBody.innerHTML : '';
  modal.hidden = false;
  // Scroll to bottom
  fsBody.scrollTop = fsBody.scrollHeight;
  // Double-click in fullscreen: toggle top/bottom
  let _fsDblAtTop = false;
  fsBody.ondblclick = () => {
    if (_fsDblAtTop) { fsBody.scrollTop = fsBody.scrollHeight; _fsDblAtTop = false; }
    else             { fsBody.scrollTop = 0; _fsDblAtTop = true; }
  };
  closeBtn.onclick = () => { modal.hidden = true; };
  modal.querySelector('.modal-backdrop').onclick = () => { modal.hidden = true; };
}

let _logCount = 0;

function addLogLine(text, type) {
  const body  = document.getElementById('log-body');
  const badge = document.getElementById('log-count');
  if (!body) return;
  const MAX = 300;
  const now = new Date();
  const ts  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  const line = document.createElement('div');
  line.className = `log-line log-line--${type || 'info'}`;
  line.innerHTML  = `<span class="log-ts">${ts}</span>${escapeHtml(String(text))}`;
  body.appendChild(line);
  _logCount++;
  if (body.children.length > MAX) body.removeChild(body.firstChild);
  if (badge) badge.textContent = String(Math.min(_logCount, MAX));
  // auto-scroll only if already at bottom
  if (body.scrollHeight - body.scrollTop - body.clientHeight < 50) {
    body.scrollTop = body.scrollHeight;
  }
}
// ─────────────────────────────────────────────────────────────

function attachBackendEvents() {
  window.api.onEvent((msg) => {
    if (msg.event === "ready") {
      setBackendStatus("backend gotowy", "ready");
      addLogLine("Backend ready", "success");
      return;
    }
    if (msg.event === "fragment:progress") {
      // Hand mode - route to hand mode handler if active
      if (state.handMode) {
        handleHandModeEvent(msg);
        return;
      }
      const idx = Number(msg.idx) - 1;
      if (idx >= 0 && idx < state.fragments.length) {
        const st = msg.status || state.fragments[idx].status;
        state.fragments[idx].status = st;
        // backend wysyła "wav" lub "wav_path"
        const wavPath = msg.wav_path || msg.wav;
        if (wavPath) state.fragments[idx].wavPath = wavPath;
        if (msg.audio_seconds) state.fragments[idx].audioSeconds = Number(msg.audio_seconds);
        if (msg.duration) state.fragments[idx].audioSeconds = Number(msg.duration);
        const label = st === "success" ? "success" : st === "error" ? "error" : "progress";
        addLogLine(`Fragment ${idx + 1}: ${st}`, label);
        renderFragments();
      }
      return;
    }
    if (msg.event === "queue:done") {
      if (state.handMode) {
        handleHandModeEvent(msg);
        return;
      }
      addLogLine("Queue done", "success");
    }
    if (msg.event === "log") {
      const line = String(msg.line || "");
      if (line.startsWith("[TTS Input]:")) {
        addLogLine(line, "tts");
        if (state.debugTtsInput) {
          toast(line.slice(0, 180), "info");
        }
      } else if (line) {
        addLogLine(line, "info");
      }
      return;
    }
    if (msg.event === "voiceover:progress") {
      const idx = Number(msg.idx);
      const cue = state.voiceover.cues.find(c => Number(c.idx) === idx);
      if (!cue) return;
      if (msg.status === "processing") {
        cue.status = "processing";
      } else if (msg.status === "success") {
        cue.status = msg.warning ? "warn" : "done";
        cue.audio_path = msg.audio_path || cue.audio_path;
        cue.audio_ms = msg.audio_ms || cue.audio_ms;
        cue.playback_rate = msg.playback_rate || cue.playback_rate || 1;
        cue.warning = msg.warning || "";
      } else if (msg.status === "error") {
        cue.status = "error";
        cue.error = msg.message || "error";
      }
      renderVoiceoverTimeline();
    }
  });

  window.api.onLog((line) => {
    const s = String(line || "");
    if (!s) return;
    const isErr = s.toLowerCase().includes("blad") || s.toLowerCase().includes("error");
    addLogLine(s, isErr ? "error" : "warn");
    if (isErr) toast(s, "error");
  });
}

// Helper: po zmianie w lektorach (add/delete/rename) odswiez dropdowny w mapie speaker->voice
async function refreshVoicesAndMap() {
  await loadAvailableVoices();
  // Przebuduj UI z aktualnymi opcjami dropdownow, zachowujac dotychczasowe mapowanie
  buildSpeakerVoiceMapUI();
}


async function bootstrap() {
  setBackendStatus("ladowanie backendu...");
  attachEvents();
  attachBookSettingsModalEvents();
  attachBackendEvents();
  updateButtonsState();

  // Inicjalizacja workdir — pobierz domyslny katalog z main procesu jesli pusty
  if (!els.workdir.value.trim()) {
    try {
      const defaultWd = await window.api.getDefaultWorkdir();
      if (defaultWd) els.workdir.value = defaultWd;
    } catch (_) {}
  }
  state.workdir = els.workdir.value.trim() || state.workdir;

  // KRYTYCZNE: wczytaj liste dostepnych lektorow PRZED zbudowaniem speaker->voice UI,
  // inaczej dropdowny mialyby tylko "Maciej" jako opcje.
  await loadAvailableVoices();

  buildSpeakerVoiceMapUI();
  attachSpeakerVoiceMapEvents();

  state.workdir = els.workdir.value.trim() || state.workdir;
  state.subdir = els.subdir.value.trim() || "Silos";
  state.phoneticEnabled = Boolean(els.chkPhonetic.checked);
  state.tagsEnabled = Boolean(els.chkTags.checked);
  state.debugTtsInput = Boolean(els.chkDebugTts.checked);
  els.preparePrompt.value = DEFAULT_PREP_PROMPT;
  if (els.playerVolume) playerAudio.volume = Number(els.playerVolume.value || 1);
  if (els.playerSpeed) playerAudio.playbackRate = Number(els.playerSpeed.value || 1);

  try {
    await window.api.py("ping", {});
    setBackendStatus("backend gotowy", "ready");
  } catch (err) {
    setBackendStatus("blad backendu", "error");
    toast(`Backend nie odpowiada: ${err.message}`, "error");
  }

  // Skanuj podfoldery Audiobooks/ i wypełnij listę książek
  await scanAudiobooksSubdirs();
}

// ====== Multi-voice speaker support ======

const DEFAULT_SPEAKER_VOICE_MAP = ``;
let state_availableVoices = [];

async function scanAudiobooksSubdirs() {
  // Pobierz listę podfolderów Audiobooks/ przez backend
  const wd = state.workdir;
  const audiobooksDir = abRoot();
  try {
    const res = await window.api.py("list_subdirs", { path: audiobooksDir });
    const dirs = res?.dirs || res?.subdirs || [];
    if (dirs.length === 0) return;
    // Zachowaj aktualną wartość
    const current = state.subdir || els.subdir?.value || "";
    // Wyczyść i dodaj znalezione foldery (value = nazwa folderu)
    els.subdir.innerHTML = "";
    dirs.forEach(name => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      els.subdir.appendChild(opt);
    });
    // Przywróć poprzednią selekcję lub wybierz pierwszą
    const match = dirs.find(d => d === current);
    els.subdir.value = match || dirs[0];
    state.subdir = els.subdir.value;
  } catch (_) {
    // Backend nie obsługuje list_subdirs — brak zmian
  }
}

async function loadAvailableVoices() {
  try {
    const result = await window.api.py("list_voices", { voices_dir: `${state.workdir}\\Lectors` });
    state_availableVoices = result.voices || [];
  } catch (_) {
    state_availableVoices = [];
  }
}

function parseCurrentSpeakerVoiceMap() {
  const text = els.speakerVoiceMap?.value || "";
  const pairs = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const speaker = trimmed.slice(0, eqIdx).trim();
    const voice = trimmed.slice(eqIdx + 1).trim();
    if (speaker && voice) pairs.push({ speaker, voice });
  }
  return pairs;
}

function speakerCardColor(name) {
  const n = (name || "").trim();
  if (!n) return "#de7a28";
  if (n.toLowerCase() === "narrator") return "#de7a28";
  let hash = 0;
  for (let i = 0; i < n.length; i += 1) {
    hash = ((hash << 5) - hash) + n.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 65% 52%)`;
}

function resolveVoiceForFragment(frag) {
  if (!frag) return {};
  const speakerMap = parseCurrentSpeakerVoiceMap();
  const speakerTag = frag.speaker || "";
  let matchedVoice = null;
  if (speakerTag) {
    const entry = speakerMap.find(p => p.speaker.toLowerCase() === speakerTag.toLowerCase());
    if (entry) matchedVoice = entry.voice;
  }
  if (!matchedVoice) {
    const narratorEntry = speakerMap.find(p => p.speaker.toLowerCase() === "narrator");
    if (narratorEntry) matchedVoice = narratorEntry.voice;
  }
  if (!matchedVoice) return {};

  const lectorDir = `${state.workdir}\\Lectors`;
  return {
    refAudio: `${lectorDir}\\${matchedVoice}.wav`,
    refText: `${lectorDir}\\${matchedVoice}.txt`,
    label: matchedVoice,
  };
}

function speakerVoiceOptions(selectedVoice) {
  const names = [...new Set([...state_availableVoices.map(v => v.name)])];
  return names.map((name) => {
    const selected = name === selectedVoice ? " selected" : "";
    return `<option value="${escapeHtml(name)}"${selected}>${escapeHtml(name)}</option>`;
  }).join("");
}

function normalizeSpeakerVoicePairs(inputPairs) {
  const seen = new Set();
  const pairs = [];
  for (const p of inputPairs) {
    const speaker = (p.speaker || "").trim();
    if (!speaker) continue;
    const key = speaker.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ speaker, voice: (p.voice || state_availableVoices[0]?.name || '').trim() });
  }
  const narratorIdx = pairs.findIndex(p => p.speaker.toLowerCase() === "narrator");
  if (narratorIdx >= 0) {
    pairs[narratorIdx].speaker = "Narrator";
    if (narratorIdx !== 0) {
      const [n] = pairs.splice(narratorIdx, 1);
      pairs.unshift(n);
    }
  } else {
    pairs.unshift({ speaker: "Narrator", voice: state_availableVoices[0]?.name || '' });
  }
  return pairs;
}

function updateMapTextarea() {
  if (!els.speakerVoiceMapUI || !els.speakerVoiceMap) return;
  const cards = els.speakerVoiceMapUI.querySelectorAll(".speaker-voice-card");
  const pairs = [];
  cards.forEach((card) => {
    const speaker = card.querySelector(".speaker-name-input")?.value?.trim() || "";
    const voice = card.querySelector(".speaker-voice-select")?.value?.trim() || "";
    if (speaker && voice) pairs.push({ speaker, voice });
  });
  els.speakerVoiceMap.value = normalizeSpeakerVoicePairs(pairs).map(p => `${p.speaker}=${p.voice}`).join("\n");
}

function renderSpeakerVoiceCards(pairs) {
  if (!els.speakerVoiceMapUI) return;
  els.speakerVoiceMapUI.innerHTML = pairs.map((p, idx) => {
    const isNarrator = p.speaker.toLowerCase() === "narrator";
    const color = speakerCardColor(p.speaker);
    return `<div class="speaker-voice-card" data-idx="${idx}" style="--speaker-accent:${color};">
      ${isNarrator ? "" : `<button class="speaker-remove-btn" data-remove="${idx}">x</button>`}
      <input type="text" class="speaker-name-input" value="${escapeHtml(p.speaker)}" placeholder="Postać" ${isNarrator ? "readonly" : ""}>
      <select class="speaker-voice-select">${speakerVoiceOptions(p.voice)}</select>
    </div>`;
  }).join("");
  if (els.speakerVoiceMap) {
    els.speakerVoiceMap.value = pairs.map(p => `${p.speaker}=${p.voice}`).join("\n");
  }
}

function buildSpeakerVoiceMapUI() {
  if (!els.speakerVoiceMapUI) return;
  renderSpeakerVoiceCards(normalizeSpeakerVoicePairs(parseCurrentSpeakerVoiceMap()));
}

function addSpeakerVoiceRow() {
  const pairs = normalizeSpeakerVoicePairs(parseCurrentSpeakerVoiceMap());
  pairs.push({ speaker: "Nowa postac", voice: state_availableVoices[0]?.name || '' });
  renderSpeakerVoiceCards(normalizeSpeakerVoicePairs(pairs));
}

function removeSpeakerVoiceRow(idx) {
  const pairs = normalizeSpeakerVoicePairs(parseCurrentSpeakerVoiceMap()).filter((_, i) => i !== idx);
  renderSpeakerVoiceCards(normalizeSpeakerVoicePairs(pairs));
}

function attachSpeakerVoiceMapEvents() {
  if (!els.speakerVoiceMapUI) return;
  const btnAdd = document.getElementById("btn-add-speaker");
  if (btnAdd) btnAdd.addEventListener("click", () => addSpeakerVoiceRow());
  els.speakerVoiceMapUI.addEventListener("click", (evt) => {
    const btn = evt.target.closest("[data-remove]");
    if (!btn) return;
    const idx = parseInt(btn.getAttribute("data-remove"), 10);
    if (Number.isInteger(idx)) removeSpeakerVoiceRow(idx);
  });
  els.speakerVoiceMapUI.addEventListener("input", updateMapTextarea);
  els.speakerVoiceMapUI.addEventListener("change", updateMapTextarea);
}

bootstrap();

// ═══════════════════════════════════════════════════════════════════════════════
// MODELS MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

let _modelsRemoteFiles  = [];
let _modelsLocalStatus  = { installed: false, files: [] };
let _modelsDownloading  = false;
let _modelsProgressUnsub = null;

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '?';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576)    return (bytes / 1048576).toFixed(0) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

// ─── BnB model (groxaxo/s2-pro-BnB-4Bits) ──────────────────────────────────

async function refreshBnBLocalStatus() {
  const el = document.getElementById('bnb-local-status');
  if (!el) return;
  try {
    const { files, dir, hasModel } = await window.api.getModelsStatus('bnb');
    if (!files || files.length === 0) {
      el.innerHTML = `<span style="color:#f59e0b;">⚠ Brak plików — kliknij Pobierz</span>
        <div style="font-size:11px;color:#5b6070;word-break:break-all;margin-top:2px;">${escapeHtml(dir)}</div>`;
    } else {
      let serverBadge = '';
      if (hasModel) {
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 2000);
          const res = await fetch('http://127.0.0.1:8080/', { signal: ctrl.signal });
          clearTimeout(tid);
          if (res.ok) {
            serverBadge = `<div class="model-alive-badge">🟢 Model loaded · running</div>`;
          }
        } catch (_) { /* serwer nieaktywny — nie pokazuj dodatkowego statusu */ }
      }
      const badge = hasModel
        ? `<span style="color:#10b981;">✅ Downloaded (${files.length} files)</span>`
        : `<span style="color:#f59e0b;">⚠ Incomplete — ${files.length} file(s)</span>`;
      el.innerHTML = badge + serverBadge +
        `<div style="font-size:11px;color:#5b6070;word-break:break-all;margin-top:2px;">${escapeHtml(dir)}</div>`;
    }
  } catch (e) {
    el.innerHTML = `<span style="color:#ef4444;">Error: ${escapeHtml(e.message)}</span>`;
  }
}

async function downloadBnBModel() {
  const btn = document.getElementById('btn-download-bnb');
  const progressArea = document.getElementById('models-download-progress');
  const dlFilename   = document.getElementById('models-dl-filename');
  const dlPercent    = document.getElementById('models-dl-percent');
  const dlBar        = document.getElementById('models-dl-bar');
  const dlSize       = document.getElementById('models-dl-size');

  if (_modelsDownloading) { toast('Another download in progress — cancel it first.', 'error'); return; }

  if (btn) btn.disabled = true;
  dlFilename.textContent = 'Fetching file list from HuggingFace…';
  progressArea.style.display = 'block';
  dlPercent.textContent = '';
  dlBar.style.width = '0%';
  dlSize.textContent = '';

  let files;
  try {
    files = await window.api.listRemoteModels('bnb');
  } catch (e) {
    toast(`BnB file list error: ${e.message}`, 'error');
    progressArea.style.display = 'none';
    if (btn) btn.disabled = false;
    return;
  }

  // Filter only model files (skip README, .gitattributes, etc.)
  const modelFiles = files.filter(f => !/^(README|\.git|\.lfs)/i.test(f.name));
  if (!modelFiles.length) {
    toast('Repository contains no model files.', 'error');
    progressArea.style.display = 'none';
    if (btn) btn.disabled = false;
    return;
  }

  _modelsDownloading = true;
  try {
    for (let i = 0; i < modelFiles.length; i++) {
      const f = modelFiles[i];
      dlFilename.textContent = `[${i + 1}/${modelFiles.length}] ${f.name}`;
      dlPercent.textContent = '0%';
      dlBar.style.width = '0%';
      dlSize.textContent = 'Connecting…';
      await window.api.downloadModelFile({ filename: f.name, modelKey: 'bnb' });
    }
    toast('Model s2-pro-BnB-4Bits downloaded! Restart the app to use it.', 'success');
    await refreshBnBLocalStatus();
  } catch (e) {
    if (e.message !== 'Cancelled') toast(`BnB download error: ${e.message}`, 'error');
  } finally {
    _modelsDownloading = false;
    progressArea.style.display = 'none';
    if (btn) btn.disabled = false;
  }
}

async function openModelsModal() {
  document.getElementById('models-modal').hidden = false;
  checkModelServerStatus();
  await refreshModelsLocal();
  await refreshBnBLocalStatus();
  loadModelsRemote();
  if (_modelsProgressUnsub) _modelsProgressUnsub();
  _modelsProgressUnsub = window.api.onModelProgress(onModelDownloadProgress);
}

async function checkModelServerStatus() {
  const dot   = document.getElementById('model-server-dot');
  const label = document.getElementById('model-server-label');
  if (!dot || !label) return;
  const serverUrl = els.serverUrl?.value?.trim() || 'http://127.0.0.1:8080';
  dot.className = 'server-dot server-dot--checking';
  label.textContent = 'Checking TTS engine…';
  try {
    const r = await fetch(serverUrl + '/', { signal: AbortSignal.timeout(4000) });
    const data = await r.json();
    if (data.status === 'ok') {
      dot.className = 'server-dot server-dot--ok';
      const mode = data.bnb_mode ? 'BnB-NF4' : 'fp16';
      const dev  = (data.device || '').replace('cuda', 'CUDA').replace('cpu', 'CPU');
      label.innerHTML = `✅ Model loaded and running &nbsp;<span style="color:#8a8f99;font-size:11px;">${escapeHtml(data.engine || '')} · ${mode} · ${escapeHtml(dev)}</span>`;
    } else {
      dot.className = 'server-dot server-dot--loading';
      label.innerHTML = `⏳ Server loading model… <span style="color:#8a8f99;font-size:11px;">(status: ${escapeHtml(data.status || '')})</span>`;
    }
  } catch (_) {
    dot.className = 'server-dot server-dot--off';
    label.innerHTML = '🔴 TTS server not running &nbsp;<span style="color:#8a8f99;font-size:11px;">(launch the app and wait for the model to load)</span>';
  }
}

function closeModelsModal() {
  document.getElementById('models-modal').hidden = true;
  if (_modelsProgressUnsub) { _modelsProgressUnsub(); _modelsProgressUnsub = null; }
}

async function refreshModelsLocal() {
  const listEl = document.getElementById('models-local-list');
  listEl.innerHTML = '<span style="color:#8a8f99;">Checking…</span>';
  try {
    _modelsLocalStatus = await window.api.getModelsStatus();
    const { files, dir, installed, hasModel, hasCodec } = _modelsLocalStatus;
    if (!files || files.length === 0) {
      listEl.innerHTML = `<div style="color:#ef4444;">⚠ No model files in folder:</div>
        <div style="font-size:11px;color:#5b6070;word-break:break-all;margin-top:4px;">${escapeHtml(dir)}</div>`;
    } else {
      const badge = installed
        ? '<div style="color:#10b981;font-weight:600;margin-bottom:6px;">✅ Model ready</div>'
        : `<div style="color:#f59e0b;font-weight:600;margin-bottom:6px;">⚠ Incomplete &mdash; missing ${!hasModel ? 'model (.pth)' : 'codec (codec.pth)'}</div>`;
      const rows = files.map(f =>
        `<div style="font-size:12px;color:#aab0bc;margin-top:3px;">📄 ${escapeHtml(f.name)}
          <span style="color:#5b6070;margin-left:6px;">${formatFileSize(f.size)}</span></div>`
      ).join('');
      listEl.innerHTML = badge + rows;
    }
    if (_modelsRemoteFiles.length > 0) renderModelsRemoteList();
  } catch (e) {
    listEl.innerHTML = `<span style="color:#ef4444;">Error: ${escapeHtml(e.message)}</span>`;
  }
}

async function loadModelsRemote() {
  const remoteEl = document.getElementById('models-remote-list');
  remoteEl.innerHTML = '<div style="color:#8a8f99;font-size:13px;">Fetching list from HuggingFace…</div>';
  try {
    _modelsRemoteFiles = await window.api.listRemoteModels();
    renderModelsRemoteList();
  } catch (e) {
    remoteEl.innerHTML = `<div style="color:#ef4444;font-size:13px;">Error: ${escapeHtml(e.message)}</div>
      <div style="font-size:12px;color:#8a8f99;margin-top:6px;">Download manually from: huggingface.co/fishaudio/fish-speech-1.5</div>`;
  }
}

function renderModelsRemoteList() {
  const remoteEl = document.getElementById('models-remote-list');
  if (!_modelsRemoteFiles.length) {
    remoteEl.innerHTML = '<div style="color:#8a8f99;">No files in repository.</div>';
    return;
  }
  const localNames = new Set((_modelsLocalStatus.files || []).map(f => f.name));
  const rows = _modelsRemoteFiles.map(f => {
    const isLocal  = localNames.has(f.name);
    const sizeStr  = f.size > 0 ? formatFileSize(f.size) : '';
    const dlBtn    = isLocal
      ? `<span style="color:#10b981;font-size:14px;">✅</span>`
      : `<button class="btn btn-primary btn-xs" style="min-width:86px;"
           data-action="model-download" data-filename="${escapeHtml(f.name)}">⬇ Pobierz</button>`;
    return `<div class="models-file-row" id="models-row-${CSS.escape(f.name)}">
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:500;word-break:break-all;color:#c5d0e8;">${escapeHtml(f.name)}</div>
        ${sizeStr ? `<div style="font-size:11px;color:#8a8f99;">${sizeStr}</div>` : ''}
      </div>
      <div style="flex-shrink:0;">${dlBtn}</div>
    </div>`;
  }).join('');
  remoteEl.innerHTML = rows;
}

async function startModelDownload(filename) {
  if (_modelsDownloading) { toast('Another download in progress — cancel it first.', 'error'); return; }
  _modelsDownloading = true;
  const progressArea = document.getElementById('models-download-progress');
  const dlFilename   = document.getElementById('models-dl-filename');
  const dlPercent    = document.getElementById('models-dl-percent');
  const dlBar        = document.getElementById('models-dl-bar');
  const dlSize       = document.getElementById('models-dl-size');
  progressArea.style.display = 'block';
  dlFilename.textContent = filename;
  dlPercent.textContent  = '0%';
  dlBar.style.width      = '0%';
  dlSize.textContent     = 'Połączenie z serwerem…';
  document.querySelectorAll('.models-file-row [data-action="model-download"]').forEach(b => { b.disabled = true; });
  try {
    await window.api.downloadModelFile({ filename });
    toast(`Downloaded: ${filename}`, 'success');
    await refreshModelsLocal();
  } catch (e) {
    if (e.message !== 'Anulowano') toast(`Download error ${filename}: ${e.message}`, 'error');
  } finally {
    _modelsDownloading = false;
    progressArea.style.display = 'none';
    document.querySelectorAll('.models-file-row [data-action="model-download"]').forEach(b => { b.disabled = false; });
    renderModelsRemoteList();
  }
}

function onModelDownloadProgress(data) {
  const dlPercent = document.getElementById('models-dl-percent');
  const dlBar     = document.getElementById('models-dl-bar');
  const dlSize    = document.getElementById('models-dl-size');
  if (!dlPercent) return;
  const pct = Math.round((data.progress || 0) * 100);
  dlPercent.textContent = pct + '%';
  dlBar.style.width     = pct + '%';
  if (data.total > 0) dlSize.textContent = `${formatFileSize(data.downloaded)} / ${formatFileSize(data.total)}`;
}

// Podpinamy zdarzenia modalu modeli
(function attachModelsEvents() {
  const btnModels       = document.getElementById('btn-models');
  const modalsModal     = document.getElementById('models-modal');
  const btnClose        = document.getElementById('models-close');
  const btnCloseFooter  = document.getElementById('models-close-footer');
  const btnOpenDir      = document.getElementById('btn-models-open-dir');
  const btnCancel       = document.getElementById('btn-models-cancel');
  const remoteList      = document.getElementById('models-remote-list');
  const btnDownloadBnB  = document.getElementById('btn-download-bnb');
  const btnOpenBnBDir   = document.getElementById('btn-open-bnb-dir');

  if (btnModels)      btnModels.addEventListener('click', openModelsModal);
  if (btnClose)       btnClose.addEventListener('click', closeModelsModal);
  if (btnCloseFooter) btnCloseFooter.addEventListener('click', closeModelsModal);
  if (btnOpenDir)     btnOpenDir.addEventListener('click', () => window.api.openModelsDir());
  if (btnDownloadBnB) btnDownloadBnB.addEventListener('click', downloadBnBModel);
  if (btnOpenBnBDir)  btnOpenBnBDir.addEventListener('click', () => window.api.openModelsDir('bnb'));
  if (btnCancel)      btnCancel.addEventListener('click', async () => {
    await window.api.cancelDownload();
    toast('Download cancelled.', 'info');
  });
  if (modalsModal) {
    modalsModal.querySelector('.modal-backdrop')?.addEventListener('click', closeModelsModal);
  }
  // Delegacja: przyciski pobierania w liście plików
  if (remoteList) {
    remoteList.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action="model-download"]');
      if (!btn || btn.disabled) return;
      const filename = btn.dataset.filename;
      if (filename) await startModelDownload(filename);
    });
  }
}());

// ─── Hand Mode ───────────────────────────────────────────────────────────────

function openHandModal() {
  document.getElementById('hand-modal').removeAttribute('hidden');
  loadHandVoices();
  refreshHandFileList();
}

function closeHandModal() {
  document.getElementById('hand-modal').setAttribute('hidden', '');
}

async function loadHandVoices() {
  const select = document.getElementById('hand-voice-select');
  if (!select) return;
  select.innerHTML = '<option value="">— wczytywanie lektorów —</option>';
  try {
    const result = await window.api.py('list_voices', { voices_dir: voicesDir() });
    const voices = result.voices || [];
    if (!voices.length) {
      select.innerHTML = '<option value="">— brak lektorów —</option>';
      return;
    }
    select.innerHTML = voices.map(v =>
      `<option value="${escapeHtml(v.name)}">${escapeHtml(v.name)}</option>`
    ).join('');
  } catch (_) {
    select.innerHTML = '<option value="">— błąd wczytywania —</option>';
  }
}

async function handleHandModeEvent(msg) {
  const hm = state.handMode;
  if (!hm) return;
  const statusText = document.getElementById('hand-status-text');
  const progressFill = document.getElementById('hand-progress-fill');
  const outputInfo = document.getElementById('hand-output-info');

  if (msg.event === 'fragment:progress') {
    if (msg.status === 'processing') {
      if (statusText) statusText.innerHTML = `<span class="hand-spinner"></span>Generuję fragment ${msg.idx} / ${hm.total}…`;
    } else if (msg.status === 'success') {
      hm.done++;
      const pct = Math.round((hm.done / hm.total) * 100);
      if (progressFill) progressFill.style.width = pct + '%';
      if (statusText) statusText.innerHTML = `<span class="hand-spinner"></span>Gotowe: ${hm.done} / ${hm.total}`;
      const wavPath = msg.wav || msg.wav_path || '';
      if (outputInfo && wavPath) outputInfo.textContent = 'Ostatni plik: ' + wavPath;
    } else if (msg.status === 'error') {
      if (statusText) statusText.innerHTML = `⚠ Błąd fragment ${msg.idx}: ${msg.message || ''}`;
    }
  }

  if (msg.event === 'queue:done') {
    const doneCount = hm.done;
    const doneTs    = hm.ts;
    const doneVoice = hm.voice;
    if (progressFill) progressFill.style.width = '100%';
    const btn = document.getElementById('hand-generate');
    const stopBtn = document.getElementById('hand-stop');
    if (btn) btn.disabled = false;
    if (stopBtn) stopBtn.style.display = 'none';
    state.handMode = null;
    refreshHandFileList();

    // Scalanie fragmentów w jeden plik _full
    if (statusText) statusText.innerHTML = `<span class="hand-spinner"></span>Scalanie ${doneCount} fragmentów…`;
    if (outputInfo) outputInfo.textContent = '';
    try {
      const sanitize = s => (s || '').trim().replace(/ /g, '_').replace(/[\\/:\*?"<>|]/g, '');
      const prefix = `${sanitize(doneVoice)}_hand_${doneTs}`;
      const mres = await window.api.py('merge_audio', {
        dir: handDir(), prefix, output_format: 'mp3',
      });
      if (mres.ok) {
        const fname = mres.path.split(/[\\/]/).pop();
        if (statusText) statusText.innerHTML = `✅ Scalono ${mres.count} fragmentów &rarr; <b>${escapeHtml(fname)}</b>`;
        if (outputInfo) outputInfo.textContent = mres.path;
      } else {
        if (statusText) statusText.innerHTML = `✅ Wygenerowano ${doneCount} fragmentów (scalanie: ${escapeHtml(mres.error || '')})`.replace(/\(scalanie: \)/, '');
      }
    } catch (e) {
      if (statusText) statusText.innerHTML = `✅ Wygenerowano ${doneCount} fragmentów`;
    }
    refreshHandFileList();
  }
}

async function generateHandMode() {
  const voiceName = document.getElementById('hand-voice-select')?.value;
  const text = document.getElementById('hand-text')?.value.trim();

  if (!voiceName) { toast('Select a narrator.', 'error'); return; }
  if (!text)      { toast('Enter text to generate.', 'error'); return; }
  if (!state.workdir) { toast('Set working directory in the main window.', 'error'); return; }

  // Podziel tekst na fragmenty
  const now = new Date();
  const sessionTs = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;

  const chunkSec   = Math.max(5, Math.min(120, parseInt(document.getElementById('hand-chunk-seconds')?.value, 10) || 20));
  const targetChars = chunkSec * 13;

  let fragments;
  try {
    const res = await window.api.py('split_text', { text, target_chars: targetChars });
    fragments = (res.fragments || [text]).map((t, i) => ({
      idx: i + 1,
      text: t,
      frag_subdir: `Audiobooks\\hand`,
    }));
  } catch (_) {
    fragments = [{ idx: 1, text, frag_subdir: `Audiobooks\\hand` }];
  }

  // Pokaż progress
  const statusSection = document.getElementById('hand-status-section');
  const statusText = document.getElementById('hand-status-text');
  const progressFill = document.getElementById('hand-progress-fill');
  const outputInfo = document.getElementById('hand-output-info');
  if (statusSection) statusSection.style.display = '';
  if (statusText) statusText.innerHTML = `<span class="hand-spinner"></span>Przygotowuję ${fragments.length} fragment(ów)…`;
  if (progressFill) progressFill.style.width = '0%';
  if (outputInfo) outputInfo.textContent = '';

  const btn = document.getElementById('hand-generate');
  const stopBtn = document.getElementById('hand-stop');
  if (btn) btn.disabled = true;
  if (stopBtn) stopBtn.style.display = '';

  state.handMode = { total: fragments.length, done: 0, ts: sessionTs, voice: voiceName };

  const lectors = voicesDir();
  const serverUrl = els.serverUrl?.value?.trim() || 'http://127.0.0.1:8080';
  const endpoint  = els.serverEndpoint?.value?.trim() || '/generate';

  try {
    const res = await window.api.py('server_run_queue', {
      url:      serverUrl,
      endpoint: endpoint,
      workdir:  state.workdir,
      subdir:   'hand',
      voice_label: voiceName,
      session_ts:  sessionTs,
      ref_audio_path: `${lectors}\\${voiceName}.wav`,
      ref_text_file:  `${lectors}\\${voiceName}.txt`,
      fragments,
      gpu_workers:        1,
      timeout:            1800,
      max_retries:        2,
      temperature:        parseFloat(els.ttsTemperature?.value) || 0.8,
      top_p:              parseFloat(els.ttsTopP?.value) || 0.8,
      repetition_penalty: parseFloat(els.ttsRepPenalty?.value) || 1.1,
      chunk_length:       parseInt(els.ttsChunkLength?.value, 10) || 200,
      max_new_tokens:     parseInt(els.ttsMaxTokens?.value, 10) || 0,
      output_format: 'mp3',
    });
    if (res && (res.error || res.ok === false)) {
      toast('Generation error: ' + (res.error || res.reason || 'unknown error'), 'error');
    }
    // Odśwież listę plików po zakończeniu
    refreshHandFileList();
  } catch (e) {
    toast('Generation error: ' + e.message, 'error');
  } finally {
    if (state.handMode) {
      // queue:done nie przyszedł — odblokuj przycisk
      state.handMode = null;
      if (btn) btn.disabled = false;
      const stopBtn2 = document.getElementById('hand-stop');
      if (stopBtn2) stopBtn2.style.display = 'none';
    }
  }
}

(function attachHandModeEvents() {
  const btnOpen = document.getElementById('btn-hand-mode');
  const modal   = document.getElementById('hand-modal');
  if (!modal) return;

  if (btnOpen)   btnOpen.addEventListener('click', openHandModal);
  document.getElementById('hand-close')?.addEventListener('click', closeHandModal);
  document.getElementById('hand-close-footer')?.addEventListener('click', closeHandModal);
  document.getElementById('hand-generate')?.addEventListener('click', generateHandMode);
  document.getElementById('hand-stop')?.addEventListener('click', async () => {
    const serverUrl = els.serverUrl?.value?.trim() || 'http://127.0.0.1:8080';
    try { await fetch(serverUrl + '/abort', { method: 'POST' }); } catch (_) {}
    state.handMode = null;
    const btn = document.getElementById('hand-generate');
    const stopBtn = document.getElementById('hand-stop');
    const statusText = document.getElementById('hand-status-text');
    if (btn) btn.disabled = false;
    if (stopBtn) stopBtn.style.display = 'none';
    if (statusText) statusText.innerHTML = '⛔ Generacja przerwana.';
  });
  document.getElementById('hand-open-folder')?.addEventListener('click', () => {
    const dir = handDir();
    window.api.openInExplorer(dir);
  });
  modal.querySelector('.modal-backdrop')?.addEventListener('click', closeHandModal);

  // Slider <-> number input sync + hint
  const slider  = document.getElementById('hand-chunk-slider');
  const numInput = document.getElementById('hand-chunk-seconds');
  const hint    = document.getElementById('hand-chunk-hint');
  function updateChunkHint(sec) {
    const chars = Math.round(sec * 13);
    if (hint) hint.textContent = `≈ ${chars} znaków`;
  }
  if (slider && numInput) {
    slider.addEventListener('input', () => {
      numInput.value = slider.value;
      updateChunkHint(parseInt(slider.value, 10));
    });
    numInput.addEventListener('input', () => {
      let v = Math.max(5, Math.min(120, parseInt(numInput.value, 10) || 20));
      slider.value = v;
      numInput.value = v;
      updateChunkHint(v);
    });
    updateChunkHint(parseInt(slider.value, 10));
  }

  // delegacja: play/stop i otwieranie pliku na liście plików
  document.getElementById('hand-file-list')?.addEventListener('click', (e) => {
    const playBtn = e.target.closest('.hand-play-btn');
    if (playBtn) {
      const path = playBtn.dataset.path;
      if (path) playHandFile(path, playBtn);
      return;
    }
    const openBtn = e.target.closest('[data-action="hand-open-file"]');
    if (openBtn) {
      const file = openBtn.dataset.file;
      if (file) window.api.openWavFile(file);
    }
  });
}());

function handDir() {
  return `${state.workdir}\\Audiobooks\\hand`;
}

let _handAudio = null;
let _handPlayingBtn = null;

function playHandFile(path, btn) {
  // Stop previous if same file playing
  if (_handAudio) {
    _handAudio.pause();
    _handAudio.currentTime = 0;
    if (_handPlayingBtn) { _handPlayingBtn.textContent = '▶'; _handPlayingBtn = null; }
    if (_handAudio.dataset.path === path) {
      _handAudio = null;
      return;
    }
  }
  const audio = new Audio(toFileUrl(path));
  audio.dataset = { path };
  _handAudio = audio;
  _handPlayingBtn = btn;
  btn.textContent = '⏹';
  audio.play().catch(() => { btn.textContent = '▶'; _handAudio = null; });
  audio.addEventListener('ended', () => {
    btn.textContent = '▶';
    _handAudio = null;
    _handPlayingBtn = null;
  }, { once: true });
}

async function refreshHandFileList() {
  const container = document.getElementById('hand-file-list');
  if (!container) return;
  if (!state.workdir) {
    container.textContent = 'Ustaw katalog roboczy w głównym oknie.';
    return;
  }
  try {
    const res = await window.api.py('list_files', { path: handDir(), extensions: ['mp3', 'wav'] });
    const files = (res?.files || []).sort();
    if (!files.length) {
      container.innerHTML = '<span style="color:#8a8f99;">Brak plików. Wygeneruj coś!</span>';
      return;
    }
    container.innerHTML = files.map(f => {
      const name = f.split(/[\\/]/).pop();
      const fullPath = f.includes(':') ? f : `${handDir()}\\${f}`;
      return `<div class="hand-file-row">
        <button class="hand-play-btn" data-path="${escapeHtml(fullPath)}" title="Odtwórz / Zatrzymaj">▶</button>
        <span class="hand-file-name" title="${escapeHtml(fullPath)}">${escapeHtml(name)}</span>
        <button class="btn btn-ghost" style="font-size:11px;padding:2px 8px;flex-shrink:0;"
          data-action="hand-open-file" data-file="${escapeHtml(fullPath)}">📂</button>
      </div>`;
    }).join('');
  } catch (e) {
    container.textContent = 'Błąd odczytu folderu: ' + e.message;
  }
}

// ─── Language switcher ────────────────────────────────────────────────────────
(function initLangSwitcher() {
  window.addEventListener('langchange', () => {
    if (els.playerShuffle) {
      els.playerShuffle.textContent = (typeof t === "function")
        ? t(state.player.shuffle ? "player_shuffle_on" : "player_shuffle_off")
        : `🔀 Shuffle: ${state.player.shuffle ? "On" : "Off"}`;
    }
    refreshSleepTimerUi();
    updatePlayerMeta();
    renderFragments();
  });
})();
