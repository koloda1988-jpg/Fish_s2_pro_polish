const state = {
  bookPath: "",
  workdir: "K:\\FishS2PRo\\s2.cpp\\build\\bin\\Release",
  subdir: "Silos",
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
};

const DEFAULT_PREP_PROMPT = `Rola: Jesteś profesjonalnym reżyserem audiobooków i specjalistą od fonetyki modelu Fish Speech S2 Pro. Twoim zadaniem jest przygotowanie tekstu książki do syntezy mowy.

Zadanie:

Podział na rozdziały: Zachowaj strukturę książki.

Podział na fragmenty: Każdy rozdział podziel na mniejsze bloki tekstowe. Jeden blok musi trwać maksymalnie 30 sekund (przyjmij średnie tempo czytania: ok. 13-15 znaków na sekundę, czyli ok. 400-450 znaków na fragment).

Wstrzykiwanie Tagów Emocjonalnych: Przeanalizuj kontekst narracji i dialogów. Wstaw odpowiednie tagi w nawiasach kwadratowych [tag], aby nadać głosowi życie. Używaj tagów takich jak: [whisper], [angry], [sad], [excited tone], [sigh], [inhale], [pause]. Tagi wstawiaj przed zdaniem lub wewnątrz, jeśli następuje zmiana emocji.

Korekta Fonetyczna (Hard-Fix): Model ma problem z polskim "si", "zi", "ci", czytając je zbyt miękko (np. "śilos"). Przeskanuj tekst i zmień zapis problematycznych słów na twardy/fonetyczny:

Wszystkie "Silos" zamień na Sy-los.

Słowa zapożyczone z twardym "si" zapisuj z myślnikiem (np. s-inus, s-ingiel).

Jeśli zauważysz inne ryzykowne zbitki (np. "Dzieciaki"), zmień na D-zieciaki.`;

const els = {
  backendStatus: document.getElementById("backend-status"),
  btnPrepareBook: document.getElementById("btn-prepare-book"),
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
  btnSplitSelected: document.getElementById("btn-split-selected"),
  btnSelectN: document.getElementById("btn-select-n"),
  selectNInput: document.getElementById("select-n-input"),
    btnFirst: document.getElementById("btn-first"),
    btnLast: document.getElementById("btn-last"),
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
  // Multi-voice speaker map
  speakerVoiceMap: document.getElementById("speaker-voice-map"),
  speakerVoiceMapUI: document.getElementById("speaker-voice-map-ui"),
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
  return d.toLocaleTimeString("pl-PL", {
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
  if (status === "processing") return "Przetwarzam";
  if (status === "success") return "Gotowe";
  if (status === "error") return "Blad";
  return "Oczekuje";
}

function wavForIndex(idx) {
  const f = state.fragments[idx];
  return f?.wavPath || null;
}

function toFileUrl(filePath) {
  return `file:///${encodeURI(filePath.replace(/\\/g, "/"))}`;
}

function renderFragments() {
  const data = state.fragments;
  els.fragCount.textContent = `${data.length} fragmentow`;

  if (data.length === 0) {
    els.tbody.innerHTML = `
      <tr class="empty-state">
        <td colspan="8">
          <div class="empty-state-content">
            <p>Brak fragmentow. Wczytaj ksiazke i uruchom podzial.</p>
          </div>
        </td>
      </tr>
    `;
    updateProgress();
    updateHeaderCheckbox();
    updateButtonsState();
    return;
  }

  const rows = data
    .map((f, i) => {
      const status = f.status || "pending";
      const playLabel = state.activeAudioIdx === i ? "||" : ">";
      const canPlay = Boolean(f.wavPath);
      const dur = f.audioSeconds ? formatDuration(f.audioSeconds) : `~${formatDuration(f.estimatedSeconds)}`;
      const charCount = f.text ? f.text.length : 0;
      const charCls = charCount > 700 ? "chars-danger" : charCount > 500 ? "chars-warn" : "chars-ok";
      return `
        <tr data-idx="${i}" data-status="${status}">
          <td class="col-chk"><input type="checkbox" data-action="toggle" data-idx="${i}" ${f.selected ? "checked" : ""}></td>
          <td class="col-nr">${i + 1}</td>
          <td class="col-status">
            <span class="status-pill" data-status="${status}"${status === 'error' ? ` data-action="show-error" data-idx="${i}" title="Kliknij, aby zobaczyc blad"` : ''}>
              <span class="dot"></span>${statusLabel(status)}
            </span>
          </td>
          <td class="col-play">
            <button class="play-btn ${state.activeAudioIdx === i ? "playing" : ""}" data-action="play" data-idx="${i}" ${canPlay ? "" : "disabled"}>${playLabel}</button>
          </td>
          <td class="col-dur">${dur}</td>
          <td class="col-chars ${charCls}" title="${charCount} znaków">${charCount > 700 ? "⚠ " : ""}${charCount}</td>
          ${renderTagsCell(f.text)}
          <td class="col-text" data-action="edit" data-idx="${i}" title="Kliknij, aby edytowac">${renderTextWithBoldTags(f.text)}</td>
        </tr>
      `;
    })
    .join("");

  els.tbody.innerHTML = rows;
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

function showErrorModal(idx) {
  const frag = state.fragments[idx];
  if (!frag) return;
  els.errorModalIdx.textContent = `#${idx + 1}`;
  els.errorDetail.textContent = frag.errorMsg || "(brak szczegolów błędu)";
  els.errorModal.hidden = false;
}

function closeErrorModal() {
  els.errorModal.hidden = true;
}

// ─── Prepare modal state ────────────────────────────────────────────────────
let prepareInputPath = "";   // ścieżka wybranego pliku wejściowego
let prepareOutputPath = "";  // opcjonalna pełna ścieżka zapisu (dialog "Zapisz jako")

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
  return `${state.workdir}\\voices`;
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
  if (els.voiceSplitBtn) els.voiceSplitBtn.disabled = false;
}

async function splitVoice() {
  const name = (els.voiceName?.value || "").trim();
  if (!name) { toast("Podaj nazwę lektora.", "error"); return; }
  if (!voiceSourcePath) { toast("Wybierz plik audio.", "error"); return; }

  els.voiceSplitBtn.disabled = true;
  els.voiceLog.innerHTML = "";
  els.voiceLog.style.display = "flex";
  els.voiceSamplesPreview.style.display = "none";
  voiceLogAppend(`▶ Dzielę: ${voiceSourcePath}`);
  voiceLogAppend(`  Lektor: ${name}  |  Długość próbki: ${els.voiceSegDur.value}s`);

  try {
    const result = await window.api.py("split_audio", {
      path: voiceSourcePath,
      duration_sec: parseInt(els.voiceSegDur.value, 10),
      voice_name: name,
      voices_dir: voicesDir(),
    });
    voiceLogAppend(`✅ Gotowe! Zapisano ${result.count} próbek w: ${result.out_dir}`);
    renderVoiceSamplesPreview(result.samples);
    await refreshVoiceList();
    toast(`Lektor "${name}" — ${result.count} próbek.`, "success");
  } catch (err) {
    voiceLogAppend(`❌ Błąd: ${err.message}`);
    toast(`Błąd: ${err.message}`, "error");
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
      <button class="btn btn-ghost" onclick="playVoiceSample('${p.replace(/\\/g, "\\\\")}')">▶</button>
      <span>${i + 1}. ${name}</span>
    </div>`;
  }).join("");
}

function playVoiceSample(path) {
  if (!els.audioPlayer) return;
  els.audioPlayer.src = toFileUrl(path);
  els.audioPlayer.play().catch(() => {});
}

async function refreshVoiceList() {
  try {
    const result = await window.api.py("list_voices", { voices_dir: voicesDir() });
    renderVoiceList(result.voices || []);
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
    const isActive = activeVoice.includes(v.name);
    return `<div class="voice-card">
      <div class="voice-card-name">${escapeHtml(v.name)} ${isActive ? '<span class="voice-active-badge">aktywny</span>' : ""}</div>
      <div class="voice-card-meta">${v.sample_count} próbek · ${escapeHtml(v.source || "")}</div>
      <div class="voice-card-actions">
        <button class="btn btn-secondary" style="font-size:11px;padding:3px 10px;"
          onclick="activateVoice('${escapeHtml(v.name)}', '${escapeHtml(v.first_sample || "")}')">
          ${isActive ? "✓ Aktywny" : "Wybierz"}
        </button>
        <button class="btn btn-ghost" style="font-size:11px;padding:3px 10px;color:var(--error);"
          onclick="deleteVoice('${escapeHtml(v.name)}')">Usuń</button>
      </div>
    </div>`;
  }).join("");
}

async function activateVoice(name, firstSample) {
  // Ustaw ref_audio na pierwszą próbkę danego lektora
  if (els.serverRefAudio && firstSample) {
    els.serverRefAudio.value = firstSample;
  }
  toast(`Lektor "${name}" ustawiony jako aktywny.`, "success");
  renderVoiceList(await (async () => {
    try { const r = await window.api.py("list_voices", { voices_dir: voicesDir() }); return r.voices || []; } catch (_) { return []; }
  })());
}

async function deleteVoice(name) {
  if (!confirm(`Usunąć lektora "${name}" i wszystkie jego próbki?`)) return;
  try {
    await window.api.py("delete_voice", { voice_name: name, voices_dir: voicesDir() });
    toast(`Lektor "${name}" usunięty.`, "success");
    refreshVoiceList();
  } catch (err) {
    toast(`Błąd usuwania: ${err.message}`, "error");
  }
}

function openPrepareModal() {
  // Pozwala otworzyć modal nawet bez załadowanej książki
  if (!els.preparePrompt.value.trim()) {
    els.preparePrompt.value = DEFAULT_PREP_PROMPT;
  }
  // Jeżeli mamy bookPath z głównego widoku — pre-fill
  if (state.bookPath && !prepareInputPath) {
    setPrepareInputFile(state.bookPath);
  }
  els.prepareChatLog.style.display = "none";
  els.prepareChatLog.innerHTML = "";
  if (els.prepareStatusLine) els.prepareStatusLine.textContent = "Gotowy.";
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
    toast("Wybierz plik wejściowy (PDF/EPUB/TXT).", "error");
    return;
  }
  if (!apiKey) { toast("Podaj klucz API Gemini.", "error"); return; }
  if (!prompt) { toast("Podaj prompt przygotowania książki.", "error"); return; }

  els.prepareRun.disabled = true;
  if (els.prepareStatusLine) els.prepareStatusLine.textContent = "Wysyłam do Gemini…";
  els.prepareChatLog.style.display = "flex";
  els.prepareChatLog.innerHTML = "";
  prepareChatAppend(`📄 Plik: ${bookPath.split(/[\\/]/).pop()}`, "");
  prepareChatAppend(`🤖 Model: ${model}`, "");
  prepareChatAppend(`📤 Wysyłam tekst do Gemini…`, "");

  try {
    const result = await window.api.prepareBookWithGemini({
      apiKey, prompt, bookPath, outputFileName,
      model, outputPath: prepareOutputPath || "",
    });

    const sizeKb = result?.size ? Math.round(result.size / 1024) : "?";
    prepareChatAppend(`✅ Gotowe! Model: ${result?.model || model}. Plik: ${sizeKb} KB.`, "");
    prepareChatAppend(`💾 Zapisano: ${result?.outputPath || "?"}`, "");
    if (els.prepareStatusLine) els.prepareStatusLine.textContent = "Gotowe!";

    closePrepareModal();
    toast(`Gemini otagowało książkę (${sizeKb} KB) — ${result?.model || model}.`, "success");

    if (result?.outputPath) {
      state.bookPath = result.outputPath;
      els.bookPath.value = result.outputPath;
      prepareInputPath = result.outputPath;
      await pickBookFromPath(result.outputPath);
    }
  } catch (err) {
    prepareChatAppend(`❌ Błąd: ${err.message}`, "");
    if (els.prepareStatusLine) els.prepareStatusLine.textContent = "Błąd.";
    toast(`Błąd przygotowania: ${err.message}`, "error");
  } finally {
    els.prepareRun.disabled = false;
  }
}

async function pickBookFromPath(path) {
  if (!path) return;

  state.bookPath = path;
  els.bookPath.value = path;
  els.chapterSelect.disabled = true;
  els.chapterSelect.innerHTML = "<option>Ladowanie...</option>";

  try {
    const data = await window.api.py("load_book", { path });
    state.chapters = data.chapters || [];
    if (state.chapters.length === 0) {
      els.chapterSelect.innerHTML = "<option>Brak sekcji</option>";
      toast("Nie znaleziono tresci w pliku.", "error");
    } else {
      const totalFragments = state.chapters.reduce((sum, c) => sum + (c.fragment_count || 0), 0);
      const allOption = `<option value="all">0. Całość (${totalFragments} fragmentów)</option>`;
      const items = state.chapters
        .map((c, i) => {
          const count = c.fragment_count || 0;
          const label = `${i + 1}. ${escapeHtml(c.title || "Sekcja")} (${count} fragmentów)`;
          return `<option value="${i}">${label}</option>`;
        })
        .join("");

      els.chapterSelect.innerHTML = allOption + items;
      els.chapterSelect.disabled = false;
      // Domyślnie zaznacz "Całość"
      els.chapterSelect.options[0].selected = true;
      toast(`Wczytano ${state.chapters.length} sekcji (${totalFragments} fragmentów).`, "success");
    }
  } catch (err) {
    toast(`Błąd wczytywania: ${err.message}`, "error");
    els.chapterSelect.innerHTML = "<option>Błąd</option>";
  }

  updateButtonsState();
}

async function pickBook() {
  const path = await window.api.openFile({
    filters: [
      { name: "Ksiazki", extensions: ["epub", "pdf", "txt"] },
      { name: "Wszystkie", extensions: ["*"] },
    ],
  });
  await pickBookFromPath(path);
}

async function loadAndSplit() {
  if (!state.bookPath) {
    toast("Najpierw wybierz plik.", "error");
    return;
  }
  const selected = getChapterIndex();
  let textToSplit = "";
  let selectedLabel = "";

  if (selected.length === 0) {
    toast("Zaznacz przynajmniej jedną sekcję.", "error");
    return;
  }

  if (selected.includes("all")) {
    textToSplit = state.chapters
      .map((c) => `## ${(c && c.title) ? c.title : "Sekcja"}\n${(c && c.text) ? c.text : ""}`)
      .join("\n\n");
    selectedLabel = "Całość";
  } else {
    const indices = selected.map(Number).filter(n => Number.isFinite(n));
    const picked = indices.map(i => state.chapters[i]).filter(Boolean);
    if (picked.length === 0) {
      toast("Wybierz sekcję.", "error");
      return;
    }
    selectedLabel = picked.map(c => c.title || "Sekcja").join(" + ");
    textToSplit = picked
      .map((c) => `## ${c.title || "Sekcja"}\n${c.text || ""}`)
      .join("\n\n");
  }

  if (!textToSplit.trim()) {
    toast("Brak tekstu do podziału.", "error");
    return;
  }

  try {
    const fragSec = parseInt(els.fragSlider && els.fragSlider.value, 10) || 25;
    const targetChars = fragSec * 15;   // CHARS_PER_SECOND ~= 15 dla polskiego TTS
    const split = await window.api.py("split_text", {
      text: textToSplit,
      target_chars: targetChars,
    });
    const fragments = split.fragments || [];
    state.fragments = fragments.map((text) => ({
      text,
      selected: true,
      status: "pending",
      wavPath: null,
      audioSeconds: 0,
      estimatedSeconds: estimateSecondsFromText(text),
    }));
    state.startedAt = null;
    els.statStart.textContent = "-";
    els.statEnd.textContent = "-";
    els.statEta.textContent = "-";

    // Sprawdź które fragmenty mają już wygenerowane pliki audio
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
      if (foundCount > 0) {
        toast(`Znaleziono ${foundCount} gotowych fragmentów — odznaczono.`, "success");
      }
    } catch (_) { /* skan nieudany — ignoruj, nie blokuj */ }

    renderFragments();
    toast(`Podzielono ${selectedLabel} na ${state.fragments.length} fragmentow.`, "success");
  } catch (err) {
    toast(`Blad dzielenia: ${err.message}`, "error");
  }
}

async function testServer() {
  const url = els.serverUrl.value.trim() || "http://127.0.0.1:8080";
  els.serverStatusBadge.textContent = "(testuje...)";
  try {
    const res = await window.api.py("server_ping", { url });
    if (res && res.ok) {
      els.serverStatusBadge.textContent = "(ONLINE)";
      els.serverStatusBadge.style.color = "#10b981";
      toast("Serwer s2.cpp odpowiada (" + url + ")", "success");
    } else {
      els.serverStatusBadge.textContent = "(OFFLINE)";
      els.serverStatusBadge.style.color = "#ef4444";
      toast("Serwer NIE odpowiada. Uruchom start_server.bat", "error");
    }
  } catch (e) {
    els.serverStatusBadge.textContent = "(BLAD)";
    els.serverStatusBadge.style.color = "#ef4444";
    toast("Test serwera: " + e.message, "error");
  }
}

async function runSelectedServer(selectedIdx, wd, subdir) {
  // Server-pipeline z multi-voice: grupuje fragmenty wg lektora
  const url = els.serverUrl.value.trim();
  const endpoint = els.serverEndpoint.value.trim() || "/v1/audio/speech";
  const gpuWorkers = parseInt(els.serverGpuWorkers.value, 10) || 2;
  const timeout = parseInt(els.serverTimeout.value, 10) || 1800;
  const temperature = parseFloat(els.ttsTemperature.value);
  const topP = parseFloat(els.ttsTopP.value);
  const repPenalty = parseFloat(els.ttsRepPenalty.value);
  const chunkLength = parseInt(els.ttsChunkLength.value, 10);
  const maxTokens = parseInt(els.ttsMaxTokens.value, 10);

  // Domyślny głos z pól UI
  const defaultRefAudio = els.serverRefAudio.value.trim();
  const defaultRefText = els.serverRefText.value.trim();
  const defaultRefAudioPath = defaultRefAudio.includes(":") ? defaultRefAudio : `${wd}\\${defaultRefAudio}`;
  const defaultRefTextPath = defaultRefText.includes(":") ? defaultRefText : `${wd}\\${defaultRefText}`;

  // Grupuj fragmenty wg lektora
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
    groups.get(key).fragments.push({ idx: idx + 1, text: frag.text });
  }

  // Mapa fileIdx → fragArrayIdx dla progress eventów
  state.serverIdxMap = {};
  for (const idx of selectedIdx) {
    state.serverIdxMap[idx + 1] = idx;
  }

  toast(`Server pipeline: ${selectedIdx.length} fragmentow, ${groups.size} lektor(ów), GPU: ${gpuWorkers}`, "info");

  for (const [, group] of groups) {
    if (state.stopRequested) break;
    toast(`Lektor: ${group.label} (${group.fragments.length} fragm.)`, "info");
    try {
      const res = await window.api.py("server_run_queue", {
        url, endpoint, workdir: wd, subdir,
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
      if (res && res.error) {
        toast("Pipeline blad: " + res.error, "error");
      }
    } catch (e) {
      toast("Pipeline wyjatek: " + e.message, "error");
    }
  }
}

async function runSelected() {
  if (state.running) return;
  const selectedIdx = state.fragments
    .map((f, i) => (f.selected ? i : -1))
    .filter((x) => x >= 0);

  if (selectedIdx.length === 0) {
    toast("Brak zaznaczonych fragmentow.", "error");
    return;
  }

  // ─ Ostrzeżenie przed za długimi fragmentami ──────────────────────────────
  const CHAR_WARN = 600;
  const tooLong = selectedIdx.filter(i => (state.fragments[i].text || "").length > CHAR_WARN);
  if (tooLong.length > 0) {
    const lines = tooLong.map(i => `#${i + 1}: ${state.fragments[i].text.length} znaków`).join("\n");
    const ok = confirm(
      `⚠ Uwaga: ${tooLong.length} zaznaczony fragment(y) jest zbyt długi dla Fish Speech:\n\n${lines}\n\n` +
      `Fragment >600 znaków może generować się kilka godzin zamiast kilku minut.\n` +
      `Zalecane: użyj "✂ Podziel zaznaczone" przed generacją.\n\n` +
      `Czy mimo to kontynuować?`
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
  toast("Przetwarzanie zakonczone.", "success");
}

function stopRun() {
  if (!state.running) return;
  state.stopRequested = true;
  toast("Zatrzymam kolejke po biezacym fragmencie.", "info");
}

// ─── Zaznacz N niegotowych ───────────────────────────────────────────────────
function selectNPending() {
  const n = parseInt(els.selectNInput?.value, 10);
  if (!n || n < 1) { toast("Wpisz liczbę fragmentów do zaznaczenia.", "error"); return; }

  // Odznacz wszystko
  state.fragments.forEach((f) => (f.selected = false));

  // Zaznacz kolejne N które nie są gotowe (status !== "success")
  let count = 0;
  for (const f of state.fragments) {
    if (count >= n) break;
    if (f.status !== "success") {
      f.selected = true;
      count++;
    }
  }

  renderFragments();
  toast(`Zaznaczono ${count} niegotowych fragmentów (pominięto gotowe).`, "success");
}

// ─── Podziel zaznaczone ──────────────────────────────────────────────────────
async function splitSelected() {
  const TARGET_MAX = 450; // znaków
  const selectedIdx = state.fragments
    .map((f, i) => (f.selected ? i : -1))
    .filter((x) => x >= 0);

  if (selectedIdx.length === 0) {
    toast("Brak zaznaczonych fragmentow.", "error");
    return;
  }

  const toLong = selectedIdx.filter(i => (state.fragments[i].text || "").length > TARGET_MAX);
  if (toLong.length === 0) {
    toast(`Wszystkie zaznaczone fragmenty są ≤${TARGET_MAX} znaków — nic do podziału.`, "info");
    return;
  }

  toast(`Dzielę ${toLong.length} za długich fragmentów…`, "info");
  let totalAdded = 0;

  // Przetwarzamy od końca żeby indeksy się nie przesunęły
  for (const origIdx of [...toLong].reverse()) {
    const frag = state.fragments[origIdx];
    try {
      const res = await window.api.py("split_text", { text: frag.text, target_chars: TARGET_MAX });
      const parts = res?.fragments || [];
      if (parts.length <= 1) continue;

      // Zachowaj metadane (wavPath, status) tylko na pierwszym kawałku
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

      // Podmień oryginalny fragment na listę nowych
      state.fragments.splice(origIdx, 1, ...newFrags);
      totalAdded += parts.length - 1;
    } catch (e) {
      toast(`Błąd podziału fragmentu #${origIdx + 1}: ${e.message}`, "error");
    }
  }

  if (totalAdded > 0) {
    toast(`Podzielono — dodano ${totalAdded} nowych fragmentów.`, "success");
    renderFragments();
  }
}

async function mergeSelection(onlySelected) {
  const targets = state.fragments
    .map((f, i) => ({ ...f, idx: i + 1 }))
    .filter((f) => (onlySelected ? f.selected : true));

  if (targets.length === 0) {
    toast("Brak fragmentow do scalenia.", "error");
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
    toast("Nie znaleziono zadnych WAV-ow.", "error");
    return;
  }

  const outPath = await window.api.saveFile({
    defaultPath: "audiobook_final.wav",
    filters: [{ name: "WAV", extensions: ["wav"] }],
  });
  if (!outPath) return;

  try {
    await window.api.py("merge_wavs", { paths, out_path: outPath });
    toast("Scalono pliki WAV.", "success");
    await window.api.openWavFile(outPath);
  } catch (err) {
    toast(`Blad scalania: ${err.message}`, "error");
  }
}

function attachEvents() {
  els.btnPickBook.addEventListener("click", pickBook);
  els.btnPrepareBook.addEventListener("click", openPrepareModal);

  // ── Voice Creation modal ──────────────────────────────────────────────────
  if (els.btnVoiceCreation) els.btnVoiceCreation.addEventListener("click", openVoiceModal);
  if (els.voiceClose) els.voiceClose.addEventListener("click", closeVoiceModal);

  if (els.voiceSegDur) {
    els.voiceSegDur.addEventListener("input", () => {
      if (els.voiceSegVal) els.voiceSegVal.textContent = els.voiceSegDur.value;
    });
  }

  if (els.voiceSplitBtn) els.voiceSplitBtn.addEventListener("click", splitVoice);

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
    toast(`Hard-Fix fonetyki: ${state.phoneticEnabled ? "włączony" : "wyłączony"}`, "info");
  });

  els.chkTags.addEventListener("change", () => {
    state.tagsEnabled = Boolean(els.chkTags.checked);
    toast(`Tagi [pause]: ${state.tagsEnabled ? "włączone" : "wyłączone"}`, "info");
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
  if (els.btnSplitSelected) els.btnSplitSelected.addEventListener("click", splitSelected);
  if (els.btnSelectN) els.btnSelectN.addEventListener("click", selectNPending);
  if (els.selectNInput) els.selectNInput.addEventListener("keydown", (e) => { if (e.key === "Enter") selectNPending(); });
  els.btnMergeAll.addEventListener("click", () => mergeSelection(false));

  els.btnFirst.addEventListener("click", () => {
    if (els.tbody.firstElementChild) {
      els.tbody.firstElementChild.scrollIntoView({ behavior: "smooth" });
    }
  });

  els.btnLast.addEventListener("click", () => {
    if (els.tbody.lastElementChild) {
      els.tbody.lastElementChild.scrollIntoView({ behavior: "smooth" });
    }
  });

  els.btnOpenFolder.addEventListener("click", async () => {
    const folder = `${state.workdir || els.workdir.value}\\${state.subdir || els.subdir.value}`;
    await window.api.openInExplorer(folder);
  });

  els.tbody.addEventListener("click", async (evt) => {
    const target = evt.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
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
        toast(`Nie mozna odtworzyc: ${err.message}`, "error");
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
      toast("Tekst fragmentu nie moze byc pusty.", "error");
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

function attachBackendEvents() {
  window.api.onEvent((msg) => {
    if (msg.event === "ready") {
      setBackendStatus("backend gotowy", "ready");
      return;
    }
    if (msg.event === "fragment:progress") {
      const idx = Number(msg.idx) - 1;
      if (idx >= 0 && idx < state.fragments.length) {
        state.fragments[idx].status = msg.status || state.fragments[idx].status;
        if (msg.wav_path) state.fragments[idx].wavPath = msg.wav_path;
        if (msg.audio_seconds) state.fragments[idx].audioSeconds = Number(msg.audio_seconds);
        renderFragments();
      }
      return;
    }
    if (msg.event === "log") {
      const line = String(msg.line || "");
      if (line.startsWith("[TTS Input]:")) {
        console.info(line);
        if (state.debugTtsInput) {
          toast(line.slice(0, 180), "info");
        }
      }
    }
  });

  window.api.onLog((line) => {
    if (line && String(line).toLowerCase().includes("blad")) {
      toast(String(line), "error");
    }
  });
}

async function bootstrap() {
  setBackendStatus("ladowanie backendu...");
  attachEvents();
  attachBackendEvents();
  updateButtonsState();
  buildSpeakerVoiceMapUI();
  attachSpeakerVoiceMapEvents();

  state.workdir = els.workdir.value.trim();
  state.subdir = els.subdir.value.trim() || "Silos";
  state.phoneticEnabled = Boolean(els.chkPhonetic.checked);
  state.tagsEnabled = Boolean(els.chkTags.checked);
  state.debugTtsInput = Boolean(els.chkDebugTts.checked);
  els.preparePrompt.value = DEFAULT_PREP_PROMPT;

  try {
    await window.api.py("ping", {});
    setBackendStatus("backend gotowy", "ready");
  } catch (err) {
    setBackendStatus("blad backendu", "error");
    toast(`Backend nie odpowiada: ${err.message}`, "error");
  }

  // Załaduj dostępne głosy
  await loadAvailableVoices();
}

// ====== Multi-voice speaker support ======

const DEFAULT_SPEAKER_VOICE_MAP = `Narrator=Maciej`;
let state_availableVoices = [];

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

  const isMaciej = matchedVoice.toLowerCase() === "maciej";
  if (isMaciej) {
    return {
      refAudio: "sample_glos_macieja_10s.wav",
      refText: "sample_glos_macieja_10s.txt",
      label: "Maciej",
    };
  }

  const lectorDir = `${state.workdir}\\Lectors`;
  return {
    refAudio: `${lectorDir}\\${matchedVoice}.wav`,
    refText: `${lectorDir}\\${matchedVoice}.txt`,
    label: matchedVoice,
  };
}

function speakerVoiceOptions(selectedVoice) {
  const names = [...new Set(["Maciej", ...state_availableVoices.map(v => v.name)])];
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
    pairs.push({ speaker, voice: (p.voice || "Maciej").trim() });
  }
  const narratorIdx = pairs.findIndex(p => p.speaker.toLowerCase() === "narrator");
  if (narratorIdx >= 0) {
    pairs[narratorIdx].speaker = "Narrator";
    if (narratorIdx !== 0) {
      const [n] = pairs.splice(narratorIdx, 1);
      pairs.unshift(n);
    }
  } else {
    pairs.unshift({ speaker: "Narrator", voice: "Maciej" });
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
  pairs.push({ speaker: "Nowa postac", voice: state_availableVoices[0]?.name || "Maciej" });
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
