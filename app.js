const APP_VERSION = "0.0.33";
const STORAGE_KEY = "english-study-lab-progress-v0";
const SCRIPT_STORAGE_KEY = "english-study-lab-script-v0";
const MODE_PROGRESS_STORAGE_KEY = "english-study-lab-mode-progress-v0";
const SOURCE_URL = "./data/english-source.json";

const app = document.querySelector("#app");

const state = {
  route: "home",
  data: null,
  tracks: [],
  group: "all",
  trackId: "",
  stageIndex: 0,
  cardIndex: 0,
  studyQueue: null,
  queueIndex: 0,
  studyTitle: "",
  customStageKeys: [],
  customBatchSize: 20,
  customCollapsedGroups: {},
  customCollapsedTracks: {},
  revealed: false,
  cardReveal: { meaning: false, synonym: false, example: false, exampleKo: false, note: false },
  query: "",
  scriptText: localStorage.getItem(SCRIPT_STORAGE_KEY) || defaultScriptText(),
  scriptMode: "reading",
  scriptIndex: 0,
  scriptRevealed: false,
  readingFull: false,
  listeningLoop: false,
  listeningContinuous: false,
  scriptBookmarkMode: false,
  modeProgress: loadModeProgress(),
  progress: loadProgress(),
  error: "",
  gamepadButtons: {},
  progressOpen: false,
  savedListOpen: false,
  stagePreviewIndex: null,
};

function defaultScriptText() {
  return [
    "Learning English gets easier when every sentence becomes something you can revisit.",
    "Read it once for meaning, listen once for rhythm, and then speak it back in your own voice.",
    "Small daily repetitions build a vocabulary that stays available when you need it.",
  ].join("\n");
}

function loadModeProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(MODE_PROGRESS_STORAGE_KEY) || "{}");
    return {
      readingBookmarks: Array.isArray(saved.readingBookmarks) ? saved.readingBookmarks : [],
      readingSeen: Array.isArray(saved.readingSeen) ? saved.readingSeen : [],
      listeningBookmarks: Array.isArray(saved.listeningBookmarks) ? saved.listeningBookmarks : [],
      listeningSeen: Array.isArray(saved.listeningSeen) ? saved.listeningSeen : [],
    };
  } catch {
    return { readingBookmarks: [], readingSeen: [], listeningBookmarks: [], listeningSeen: [] };
  }
}

function saveModeProgress() {
  localStorage.setItem(MODE_PROGRESS_STORAGE_KEY, JSON.stringify(state.modeProgress));
}
function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function saveScript() {
  localStorage.setItem(SCRIPT_STORAGE_KEY, state.scriptText);
}

function ensureTrackProgress(trackId) {
  if (!state.progress.tracks) state.progress.tracks = {};
  if (!state.progress.tracks[trackId]) {
    state.progress.tracks[trackId] = { known: [], again: [], saved: [], checked: [], lastStage: 0 };
  }
  return state.progress.tracks[trackId];
}

function uniquePush(list, value) {
  if (!list.includes(value)) list.push(value);
}

function removeValue(list, value) {
  const index = list.indexOf(value);
  if (index >= 0) list.splice(index, 1);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeGroup(group) {
  if (group === "\uB2E8\uC5B4") return "word";
  if (group === "\uBB38\uBC95") return "grammar";
  return "other";
}

function groupLabel(group) {
  return { all: "\uC804\uCCB4", word: "\uB2E8\uC5B4", toeic: "\uD1A0\uC775", toefl: "\uD1A0\uD50C", grammar: "\uBB38\uBC95", script: "\uBB38\uC7A5" }[group] || group;
}

function findTrack(trackId) {
  return state.tracks.find((track) => track.id === trackId) || null;
}

function findItem(trackId, itemId) {
  const track = findTrack(trackId);
  if (!track) return null;
  return track.items.find((item) => item.id === itemId) || null;
}

function currentQueueEntry() {
  return Array.isArray(state.studyQueue) ? state.studyQueue[state.queueIndex] || null : null;
}


function vocabKind(track) {
  const text = `${track.id} ${track.title}`.toLowerCase();
  if (text.includes("toeic") || text.includes("yellow")) return "toeic";
  if (text.includes("toef") || text.includes("green")) return "toefl";
  return "word";
}
function currentTrack() {
  const entry = currentQueueEntry();
  if (entry) return findTrack(entry.trackId) || state.tracks[0] || null;
  return state.tracks.find((track) => track.id === state.trackId) || state.tracks[0] || null;
}

function currentStage(track = currentTrack()) {
  if (!track) return null;
  return track.stages[state.stageIndex] || track.stages[0] || null;
}

function currentItems(track = currentTrack(), stage = currentStage(track)) {
  if (Array.isArray(state.studyQueue)) {
    return state.studyQueue.map((entry) => findItem(entry.trackId, entry.itemId)).filter(Boolean);
  }
  if (!track) return [];
  if (!stage) return track.items;
  return track.items.slice(stage.start, stage.end);
}

function currentItem() {
  const entry = currentQueueEntry();
  if (entry) return findItem(entry.trackId, entry.itemId);
  const items = currentItems();
  return items[state.cardIndex] || null;
}

function getTrackCompletion(track) {
  const progress = ensureTrackProgress(track.id);
  const checked = new Set(progress.checked);
  const known = new Set(progress.known);
  let done = 0;
  for (const item of track.items) {
    if (checked.has(item.id) || known.has(item.id)) done += 1;
  }
  return Math.round((done / Math.max(1, track.items.length)) * 100);
}

function appStats() {
  const allItems = state.tracks.flatMap((track) => track.items.map((item) => [track, item]));
  let saved = 0;
  let checked = 0;
  let known = 0;
  for (const track of state.tracks) {
    const progress = ensureTrackProgress(track.id);
    saved += progress.saved.length;
    checked += progress.checked.length;
    known += progress.known.length;
  }
  return { tracks: state.tracks.length, cards: allItems.length, saved, checked, known };
}

function speak(text, rate = 0.86, onend = null) {
  if (!text || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = rate;
  if (typeof onend === "function") utterance.onend = onend;
  window.speechSynthesis.speak(utterance);
}

function routeSnapshot() {
  return {
    app: "english-study-lab",
    route: state.route,
    group: state.group,
    trackId: state.trackId,
    stageIndex: state.stageIndex,
    cardIndex: state.cardIndex,
    studyQueue: state.studyQueue,
    queueIndex: state.queueIndex,
    studyTitle: state.studyTitle,
    customStageKeys: state.customStageKeys,
    customBatchSize: state.customBatchSize,
    customCollapsedGroups: state.customCollapsedGroups,
    customCollapsedTracks: state.customCollapsedTracks,
    query: state.query,
    scriptMode: state.scriptMode,
    scriptIndex: state.scriptIndex,
    readingFull: state.readingFull,
    listeningLoop: state.listeningLoop,
    listeningContinuous: state.listeningContinuous,
    progressOpen: state.progressOpen,
    savedListOpen: state.savedListOpen,
    stagePreviewIndex: state.stagePreviewIndex,
  };
}

function routeHash(route = state.route) {
  return `#${route || "home"}`;
}

function syncHistory(replace = false) {
  if (!("history" in window)) return;
  const method = replace ? "replaceState" : "pushState";
  window.history[method](routeSnapshot(), "", routeHash());
}

function applyRouteSnapshot(snapshot) {
  const next = snapshot?.app === "english-study-lab" ? snapshot : { route: "home" };
  state.route = next.route || "home";
  state.group = next.group || "all";
  state.trackId = next.trackId || state.trackId;
  state.stageIndex = Number(next.stageIndex || 0);
  state.cardIndex = Number(next.cardIndex || 0);
  state.studyQueue = Array.isArray(next.studyQueue) ? next.studyQueue : null;
  state.queueIndex = Number(next.queueIndex || 0);
  state.studyTitle = next.studyTitle || "";
  state.customStageKeys = Array.isArray(next.customStageKeys) ? next.customStageKeys : [];
  state.customBatchSize = Number(next.customBatchSize || state.customBatchSize || 20);
  state.customCollapsedGroups = next.customCollapsedGroups && typeof next.customCollapsedGroups === "object" ? next.customCollapsedGroups : {};
  state.customCollapsedTracks = next.customCollapsedTracks && typeof next.customCollapsedTracks === "object" ? next.customCollapsedTracks : {};
  state.query = next.query || "";
  state.scriptMode = next.scriptMode || state.scriptMode || "reading";
  state.scriptIndex = Number(next.scriptIndex || 0);
  state.readingFull = Boolean(next.readingFull);
  state.listeningLoop = Boolean(next.listeningLoop);
  state.listeningContinuous = Boolean(next.listeningContinuous);
  state.progressOpen = Boolean(next.progressOpen);
  state.savedListOpen = Boolean(next.savedListOpen);
  state.stagePreviewIndex = Number.isFinite(Number(next.stagePreviewIndex)) ? Number(next.stagePreviewIndex) : null;
  resetCardReveal();
  state.scriptRevealed = false;
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function initHistory() {
  if (!("history" in window)) return;
  syncHistory(true);
  window.addEventListener("popstate", (event) => applyRouteSnapshot(event.state));
}

function setRoute(route, options = {}) {
  state.route = route;
  resetCardReveal();
  state.scriptRevealed = false;
  if (route !== "script") {
    state.readingFull = false;
    state.scriptBookmarkMode = false;
  }
  state.savedListOpen = false;
  state.stagePreviewIndex = null;
  if (!options.skipHistory) syncHistory(Boolean(options.replace));
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function selectTrack(trackId) {
  state.studyQueue = null;
  state.queueIndex = 0;
  state.studyTitle = "";
  state.trackId = trackId;
  const progress = ensureTrackProgress(trackId);
  state.stageIndex = progress.lastStage || 0;
  state.cardIndex = 0;
  setRoute("track");
}

function selectStage(index) {
  state.stageIndex = index;
  state.cardIndex = 0;
  resetCardReveal();
  const track = currentTrack();
  if (track) {
    ensureTrackProgress(track.id).lastStage = index;
    saveProgress();
  }
  render();
}

function startStage(index) {
  selectStage(index);
  setRoute("study");
}

function stageLabel(stage, index, track = null) {
  const label = stage?.label || "";
  if (track && vocabKind(track) === "toeic") return String(index + 1).padStart(2, "0");
  if (track && vocabKind(track) === "toefl") return `Day ${String(index + 1).padStart(2, "0")}`;
  if (/^Stage\s*\d+$/i.test(label) || /^Day\s*\d+$/i.test(label)) return `${index + 1}\uD68C\uB3C5`;
  return label || `${index + 1}\uD68C\uB3C5`;
}

function stageRangeLabel(stage) {
  if (stage?.range) return stage.range;
  const start = Number(stage?.start || 0) + 1;
  const end = Number(stage?.end || 0);
  return `${start}~${end}`;
}

function stageReviewCount(track, stage) {
  const progress = ensureTrackProgress(track.id);
  const known = new Set(progress.known || []);
  const again = new Set(progress.again || []);
  return track.items.slice(stage.start, stage.end).filter((item) => known.has(item.id) || again.has(item.id)).length;
}

function isStageComplete(track, stage) {
  const progress = ensureTrackProgress(track.id);
  const known = new Set(progress.known || []);
  const checked = new Set(progress.checked || []);
  const items = track.items.slice(stage.start, stage.end);
  return Boolean(items.length) && items.every((item) => known.has(item.id) || checked.has(item.id));
}
function resetCardReveal() {
  state.cardReveal = { meaning: false, synonym: false, example: false, exampleKo: false, note: false };
  state.revealed = false;
}

function toggleCardReveal(key) {
  state.cardReveal = { ...state.cardReveal, [key]: !state.cardReveal?.[key] };
  state.revealed = Object.values(state.cardReveal).some(Boolean);
  render();
}
function moveCard(delta) {
  if (Array.isArray(state.studyQueue)) {
    state.queueIndex = Math.min(Math.max(0, state.queueIndex + delta), Math.max(0, state.studyQueue.length - 1));
    resetCardReveal();
    render();
    return;
  }
  const items = currentItems();
  state.cardIndex = Math.min(Math.max(0, state.cardIndex + delta), Math.max(0, items.length - 1));
  resetCardReveal();
  render();
}

function markItem(kind) {
  const track = currentTrack();
  const item = currentItem();
  if (!track || !item) return;
  const progress = ensureTrackProgress(track.id);
  if (kind === "known") {
    uniquePush(progress.known, item.id);
    removeValue(progress.again, item.id);
  }
  if (kind === "again") {
    uniquePush(progress.again, item.id);
    removeValue(progress.known, item.id);
  }
  if (kind === "saved") {
    progress.saved.includes(item.id) ? removeValue(progress.saved, item.id) : uniquePush(progress.saved, item.id);
  }
  if (kind === "checked") {
    progress.checked.includes(item.id) ? removeValue(progress.checked, item.id) : uniquePush(progress.checked, item.id);
  }
  saveProgress();
  if (kind === "known" || kind === "again") moveCard(1);
  else render();
}

function toggleItemFlag(trackId, itemId, kind) {
  const progress = ensureTrackProgress(trackId);
  if (kind === "saved") {
    progress.saved.includes(itemId) ? removeValue(progress.saved, itemId) : uniquePush(progress.saved, itemId);
  }
  if (kind === "checked") {
    progress.checked.includes(itemId) ? removeValue(progress.checked, itemId) : uniquePush(progress.checked, itemId);
  }
  saveProgress();
}
function splitSentences(text) {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function scriptSentences() {
  return splitSentences(state.scriptText);
}

function activeScriptIndices(mode = state.scriptMode) {
  const entries = scriptEntries();
  if (!state.scriptBookmarkMode) return entries.map((_, index) => index);
  const keys = new Set(modeList(mode, "Bookmarks"));
  return entries.map((_, index) => index).filter((index) => keys.has(modeKey(mode, index)));
}
function moveScript(delta) {
  const entries = scriptEntries();
  const active = activeScriptIndices();
  if (!entries.length) return;
  if (state.scriptBookmarkMode && active.length) {
    const currentPosition = Math.max(0, active.indexOf(state.scriptIndex));
    const nextPosition = Math.min(Math.max(0, currentPosition + delta), active.length - 1);
    state.scriptIndex = active[nextPosition];
  } else {
    state.scriptIndex = Math.min(Math.max(0, state.scriptIndex + delta), Math.max(0, entries.length - 1));
  }
  state.scriptRevealed = state.scriptMode === "listening" ? true : false;
  render();
}

function normalizeWordSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function isVocabularyTrack(track) {
  return normalizeGroup(track.group) === "word" || vocabKind(track) === "toeic" || vocabKind(track) === "toefl";
}

function searchResults() {
  const query = normalizeWordSearch(state.query);
  if (!query) return [];
  const results = [];
  for (const track of state.tracks.filter(isVocabularyTrack)) {
    for (const item of track.items) {
      const primary = normalizeWordSearch(item.primary);
      const meaning = normalizeWordSearch(item.meaning);
      if (primary.includes(query) || meaning.includes(query)) results.push({ track, item });
      if (results.length >= 80) return results;
    }
  }
  return results;
}
function checkedVocabularyKeys() {
  const keys = new Set();
  for (const track of state.tracks.filter(isVocabularyTrack)) {
    const progress = ensureTrackProgress(track.id);
    for (const itemId of progress.checked || []) keys.add(`${track.id}::${itemId}`);
  }
  return keys;
}

function scriptFootnotesFor(text) {
  const source = String(text || "").toLowerCase();
  if (!source) return [];
  const checked = checkedVocabularyKeys();
  const seen = new Set();
  const notes = [];
  for (const track of state.tracks.filter(isVocabularyTrack)) {
    for (const item of track.items) {
      const term = String(item.primary || "").trim();
      if (term.length < 3) continue;
      const key = `${track.id}::${item.id}`;
      const normalized = term.toLowerCase();
      if (checked.has(key) || seen.has(normalized)) continue;
      if (source.includes(normalized)) {
        seen.add(normalized);
        notes.push({ term, meaning: item.meaning || "", track: track.title });
        if (notes.length >= 8) return notes;
      }
    }
  }
  return notes;
}

function renderScriptFootnotes(text) {
  const notes = scriptFootnotesFor(text);
  if (!notes.length) return "";
  return `
    <div class="script-footnotes">
      ${notes.map((note) => `
        <span class="script-footnote">
          <strong>${escapeHtml(note.term)}</strong>
          <span>${escapeHtml(note.meaning)}</span>
        </span>
      `).join("")}
    </div>
  `;
}
function wordTracks() {
  return state.tracks.filter((track) => ["word", "grammar"].includes(normalizeGroup(track.group)) || vocabKind(track) === "toeic" || vocabKind(track) === "toefl");
}

function stageKey(trackId, stageIndex) {
  return `${trackId}::${stageIndex}`;
}

function allStageOptions() {
  return wordTracks().flatMap((track) =>
    track.stages.map((stage, index) => {
      const items = track.items.slice(stage.start, stage.end);
      const progress = ensureTrackProgress(track.id);
      const known = new Set(progress.known);
      const checked = new Set(progress.checked);
      const done = items.filter((item) => known.has(item.id) || checked.has(item.id)).length;
      return {
        key: stageKey(track.id, index),
        track,
        stage,
        index,
        items,
        done,
        total: items.length,
        percent: Math.round((done / Math.max(1, items.length)) * 100),
      };
    }),
  );
}

function savedQueueEntries() {
  const entries = [];
  for (const track of state.tracks) {
    const progress = ensureTrackProgress(track.id);
    for (const itemId of progress.saved) entries.push({ trackId: track.id, itemId });
  }
  return entries.filter((entry) => findItem(entry.trackId, entry.itemId));
}

function queueFromStageOptions(options) {
  return options.flatMap((option) => option.items.map((item) => ({ trackId: option.track.id, itemId: item.id })));
}

function startQueue(entries, title) {
  if (!entries.length) return;
  state.studyQueue = entries;
  state.queueIndex = 0;
  state.cardIndex = 0;
  state.studyTitle = title;
  resetCardReveal();
  setRoute("study");
}

function startProgressStudy() {
  const options = allStageOptions()
    .filter((option) => option.total > 0)
    .sort((a, b) => a.percent - b.percent || b.total - a.total)
    .slice(0, 4);
  startQueue(queueFromStageOptions(options), "\uC9C4\uD589");
}

function startSavedStudy() {
  startQueue(savedQueueEntries(), "\uC800\uC7A5");
}

function toggleCustomStage(key) {
  const selected = new Set(state.customStageKeys);
  if (selected.has(key)) selected.delete(key);
  else selected.add(key);
  state.customStageKeys = [...selected];
  render();
}

function startSelectedStudy() {
  const selected = new Set(state.customStageKeys);
  const options = allStageOptions().filter((option) => selected.has(option.key));
  const entries = queueFromStageOptions(options).slice(0, Math.max(1, state.customBatchSize || 20));
  startQueue(entries, "\uC120\uD0DD");
}

function clearSavedItems() {
  for (const track of state.tracks) ensureTrackProgress(track.id).saved = [];
  saveProgress();
  render();
}
function renderShell(content, options = {}) {
  const header = options.home
    ? ""
    : `
    <header class="topbar">
      <div class="brand" role="button" tabindex="0" data-action="home">
        <div class="brand-mark">E</div>
        <div class="brand-text">
          <h1 class="brand-title">English Study Lab</h1>
          <div class="brand-subtitle">\uB2E8\uC5B4 \u00B7 \uBB38\uBC95 \u00B7 \uBB38\uC7A5 \uD1B5\uD569 \uD559\uC2B5 v${APP_VERSION}</div>
        </div>
      </div>
    </header>`;
  app.innerHTML = `
    ${header}
    <main class="page${options.home ? " page--home" : ""}">${content}</main>
  `;
}
function trackSummary(group) {
  const tracks = state.tracks.filter((track) => normalizeGroup(track.group) === group);
  const cards = tracks.reduce((sum, track) => sum + track.items.length, 0);
  const stages = tracks.reduce((sum, track) => sum + (track.stages?.length || 0), 0);
  return { tracks, cards, stages };
}

function renderHome() {
  renderShell(`
    <section class="screen-library screen-library--root">
      <header class="library-header">
        <h2 class="library-title">English study</h2>
      </header>
      <div class="home-menu home-menu--root" aria-label="\uD559\uC2B5 \uBAA9\uB85D">
        <button class="home-card" type="button" data-route="word">
          <span class="home-card__title">\uB2E8\uC5B4</span>
          <span class="home-card__meta">\uD1A0\uC775\u00B7\uD1A0\uD50C\u00B7\uBB38\uBC95\u00B7\uB9DE\uCDA4</span>
        </button>
        <button class="home-card" type="button" data-group="grammar" data-route="library">
          <span class="home-card__title">\uBB38\uBC95</span>
          <span class="home-card__meta">\uC601\uC5B4 \uBB38\uBC95 \uCE74\uB4DC \uD559\uC2B5</span>
        </button>
        <button class="home-card" type="button" data-route="reading">
          <span class="home-card__title">\uC77D\uAE30</span>
          <span class="home-card__meta">\uBB38\uC7A5 \uB2E8\uC704 \uC77D\uAE30 \uC5F0\uC2B5</span>
        </button>
        <button class="home-card" type="button" data-route="listening">
          <span class="home-card__title">\uB4E3\uAE30</span>
          <span class="home-card__meta">\uC74C\uC131 \uBC18\uBCF5\uACFC \uB300\uBCF8 \uD559\uC2B5</span>
        </button>
      </div>
      <div class="home-version">v ${APP_VERSION}</div>
    </section>
  `, { home: true });
}

function renderWordHome() {
  const toeic = state.tracks.filter((track) => vocabKind(track) === "toeic");
  const toefl = state.tracks.filter((track) => vocabKind(track) === "toefl");
  const grammar = trackSummary("grammar");
  const savedCount = savedQueueEntries().length;
  const toeicCards = toeic.reduce((sum, track) => sum + track.items.length, 0);
  const toeflCards = toefl.reduce((sum, track) => sum + track.items.length, 0);

  renderShell(`
    <div class="word-home-compact">
    <div class="topbar topbar--home">
      <button class="back-button back-button--ghost" type="button" data-route="home">\uD648</button>
      <button class="home-icon-button" type="button" data-action="progress-open" aria-label="\uC9C4\uD589\uB960 \uBCF4\uAE30">\uD83D\uDCCA</button>
    </div>
    <div class="title-block title-block--home">
      <h1>\uB2E8\uC5B4</h1>
    </div>
    <div class="home-actions">
      <div class="home-actions-stack">
        <div class="section-card japanese-lookup-card">
          <div>
            <div class="lookup-title">\uB2E8\uC5B4 \uAC80\uC0C9</div>
            <div class="page-subtitle">\uC601\uC5B4 \uB2E8\uC5B4\uBA85\uC73C\uB85C\uB9CC \uCC3E\uC544\uBCF4\uACE0 \uBC14\uB85C \uBD81\uB9C8\uD06C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</div>
          </div>
          <div class="lookup-search-row">
            <input class="lookup-search-input" id="home-search-input" type="search" value="${escapeHtml(state.query)}" placeholder="ex. improve" autocomplete="off" />
            <button class="home-utility-button lookup-search-submit" type="button" data-route="search">\uAC80\uC0C9</button>
          </div>
        </div>
        <div class="grid-2 grid-2--word-home" aria-label="\uB2E8\uC5B4 \uC139\uC158">
          <button class="big-button" type="button" data-vocab-kind="toeic" data-route="library">
            <div class="big-button__title">\uD1A0\uC775</div>
          </button>
          <button class="big-button" type="button" data-vocab-kind="toefl" data-route="library">
            <div class="big-button__title">\uD1A0\uD50C</div>
          </button>
          <button class="big-button" type="button" data-group="grammar" data-route="library">
            <div class="big-button__title">\uBB38\uBC95</div>
          </button>
          <button class="big-button big-button--accent" type="button" data-route="custom">
            <div class="big-button__title">\uB9DE\uCDA4</div>
          </button>
        </div>
      </div>
    </div>
    <div class="home-version">v ${APP_VERSION}</div>
      </div>
  `, { home: true });
}

function scriptEntries() {
  return splitSentences(state.scriptText).map((source, index) => {
    const parts = source.split(/\s*(?:\|\||::|=>)\s*/);
    return {
      id: `script-${index}`,
      text: parts[0]?.trim() || source,
      translation: parts.length > 1 ? parts.slice(1).join(" ").trim() : "",
    };
  });
}

function modeKey(mode, index = state.scriptIndex) {
  return `${mode}:${index}`;
}

function modeList(mode, kind) {
  const key = `${mode}${kind}`;
  if (!Array.isArray(state.modeProgress[key])) state.modeProgress[key] = [];
  return state.modeProgress[key];
}

function toggleModeFlag(mode, kind) {
  const list = modeList(mode, kind);
  const key = modeKey(mode);
  list.includes(key) ? removeValue(list, key) : uniquePush(list, key);
  saveModeProgress();
  render();
}

function modeFlag(mode, kind, index = state.scriptIndex) {
  return modeList(mode, kind).includes(modeKey(mode, index));
}

function startScriptMode(mode, bookmarkOnly = false) {
  state.scriptMode = mode;
  state.scriptBookmarkMode = Boolean(bookmarkOnly);
  state.readingFull = false;
  state.scriptRevealed = mode === "reading" ? false : true;
  if (bookmarkOnly) {
    const first = modeList(mode, "Bookmarks")[0];
    const index = Number(String(first || "").split(":")[1] || 0);
    state.scriptIndex = Number.isFinite(index) ? index : 0;
  } else {
    state.scriptIndex = 0;
  }
  setRoute("script");
}

function scriptModeEntries(mode) {
  const entries = scriptEntries();
  const bookmarkKeys = new Set(modeList(mode, "Bookmarks"));
  if (!state.scriptBookmarkMode) return entries.map((entry, index) => ({ ...entry, index }));
  return entries.map((entry, index) => ({ ...entry, index })).filter((entry) => bookmarkKeys.has(modeKey(mode, entry.index)));
}
function renderSentenceMode(mode) {
  const isListening = mode === "listening";
  const entries = scriptEntries();
  const title = isListening ? "\uB4E3\uAE30" : "\uC77D\uAE30";
  const desc = isListening
    ? "\uBB38\uC7A5 \uAD6C\uAC04\uC744 \uBC18\uBCF5\uD558\uACE0 \uC5F0\uC18D\uC73C\uB85C \uB4E3\uB294 \uD615\uD0DC\uB85C \uD559\uC2B5\uD569\uB2C8\uB2E4."
    : "\uBB38\uC7A5\uC744 \uC88C\uC6B0\uB85C \uB118\uAE30\uBA70 \uBCF4\uACE0, \uD574\uC11D\uACFC \uC804\uBB38\uC744 \uD1A0\uAE00\uD569\uB2C8\uB2E4.";
  const bookmarkCount = modeList(mode, "Bookmarks").length;
  const seenCount = modeList(mode, "Seen").length;

  renderShell(`
    <section class="screen-library legacy-mode-screen">
      <div class="library-list-header">
        <button class="back-button back-button--ghost" type="button" data-route="home">\uD648</button>
        <h2 class="library-list-title">${title}</h2>
        <span></span>
      </div>
      <div class="library-list">
        <section class="legacy-title-card legacy-title-card--mode">
          <h2>${title}</h2>
          <p>${desc}</p>
        </section>
        <section class="series-group">
          <h3 class="series-group__title">${title}</h3>
          <div class="series-group__items series-group__items--study legacy-mode-grid">
            <button class="show-item show-item--tile show-item--study" type="button" data-script-start="${mode}">
              <span class="show-title">01\uD68C</span>
              <span class="show-meta">${entries.length}\uAC1C \uBB38\uC7A5 \u00B7 \uBCF8 \uBB38\uC7A5 ${seenCount}\uAC1C</span>
            </button>
            <button class="show-item show-item--tile show-item--study" type="button" data-script-bookmarks="${mode}" ${bookmarkCount ? "" : "disabled"}>
              <span class="show-title">\uBD81\uB9C8\uD06C</span>
              <span class="show-meta">\uC800\uC7A5\uB41C \uBB38\uC7A5 ${bookmarkCount}\uAC1C</span>
            </button>
          </div>
        </section>
      </div>
    </section>
  `, { home: true });
}
function progressGroups() {
  const groups = new Map();
  for (const track of wordTracks()) {
    const kind = normalizeGroup(track.group) === "grammar" ? "grammar" : vocabKind(track);
    const title = groupLabel(kind === "word" ? "word" : kind);
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(track);
  }
  return [...groups.entries()].map(([title, tracks]) => ({ title, tracks }));
}

function completedStageCount(track) {
  return (track.stages || []).filter((stage) => isStageComplete(track, stage)).length;
}

function renderProgressCells(track) {
  return (track.stages || []).map((stage) => {
    const complete = isStageComplete(track, stage);
    const review = stageReviewCount(track, stage) > 0;
    return `<span class="progress-cell${complete ? " is-complete" : review ? " is-active" : ""}"></span>`;
  }).join("");
}

function renderProgressModal() {
  return `
    <div class="modal-backdrop progress-backdrop">
      <div class="modal-panel section-card progress-modal">
        <div class="progress-modal__head">
          <div>
            <div class="progress-modal__title">\uC9C4\uD589\uB960</div>
            <div class="progress-modal__subtitle">\uAC01 \uD30C\uD2B8\uBCC4 \uC54C\uACE0\uC788\uC74C \uAE30\uC900 \uC9C4\uD589\uB960</div>
          </div>
          <button class="stage-preview-close" type="button" data-action="progress-close" aria-label="\uC9C4\uD589\uB960 \uB2EB\uAE30">\u00D7</button>
        </div>
        <div class="progress-groups">
          ${progressGroups().map((group) => `
            <section class="progress-group">
              <h3>${escapeHtml(group.title)}</h3>
              ${group.tracks.map((track) => {
                const progress = ensureTrackProgress(track.id);
                return `
                  <div class="progress-track">
                    <div class="progress-track__head">
                      <strong>${escapeHtml(track.title)}</strong>
                      <span>${completedStageCount(track)}/${track.stages.length} \uBB49\uCE58 \uC644\uB8CC \u00B7 ${(progress.known || []).length}/${track.total}</span>
                    </div>
                    <div class="progress-cells">${renderProgressCells(track)}</div>
                  </div>
                `;
              }).join("")}
            </section>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function customSelectGroups() {
  const grouped = new Map();
  const order = { toeic: 0, toefl: 1, grammar: 2, word: 3 };
  for (const option of allStageOptions()) {
    const kind = normalizeGroup(option.track.group) === "grammar" ? "grammar" : vocabKind(option.track);
    const groupKey = kind === "word" ? "word" : kind;
    const groupTitle = groupLabel(groupKey);
    if (!grouped.has(groupKey)) grouped.set(groupKey, { groupKey, groupTitle, tracks: new Map() });
    const group = grouped.get(groupKey);
    const trackKey = option.track.id;
    const trackTitle = displayTrackTitle(option.track);
    if (!group.tracks.has(trackKey)) group.tracks.set(trackKey, { trackKey, trackTitle, options: [] });
    group.tracks.get(trackKey).options.push(option);
  }
  return [...grouped.values()]
    .sort((a, b) => (order[a.groupKey] ?? 99) - (order[b.groupKey] ?? 99))
    .map((group) => ({
      groupKey: group.groupKey,
      groupTitle: group.groupTitle,
      tracks: [...group.tracks.values()],
    }));
}

function toggleCustomCollapse(kind, key) {
  const store = kind === "group" ? state.customCollapsedGroups : state.customCollapsedTracks;
  store[key] = !store[key];
  render();
}
function renderTabs() {
  return `
    <div class="tabs" role="tablist" aria-label="\uD559\uC2B5 \uC885\uB958">
      ${["all", "toeic", "toefl", "grammar"].map((group) => `
        <button class="tab" type="button" aria-selected="${state.group === group}" data-group="${group}">
          ${groupLabel(group)}
        </button>
      `).join("")}
    </div>
  `;
}

function libraryTracks(group = state.group, limit = Infinity) {
  return state.tracks
    .filter((track) => group === "all" || (group === "toeic" ? vocabKind(track) === "toeic" : group === "toefl" ? vocabKind(track) === "toefl" : normalizeGroup(track.group) === group))
    .slice(0, limit);
}

function displayTrackTitle(track) {
  const kind = vocabKind(track);
  if (kind === "toeic") {
    return track.title
      .replace(/^TOEIC\s*/i, "")
      .replace(/^800$/, "800+")
      .replace(/^900$/, "900+");
  }
  if (kind === "toefl") {
    if (track.id === "eng-word-green-main") return "\uBA54\uC778\uB2E8\uC5B4";
    if (track.id === "eng-word-green-sub") return "\uC720\uC758\uC5B4";
  }
  return track.title;
}
function renderLibrarySection(group = state.group, limit = Infinity) {
  const tracks = libraryTracks(group, limit);

  return `
    <section class="section-card word-list-panel">
      <div class="type-list word-type-list">
        ${tracks.length ? tracks.map(renderTrackCard).join("") : `<div class="empty">\uD45C\uC2DC\uD560 \uC601\uC5B4 \uD2B8\uB799\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>`}
      </div>
    </section>
  `;
}

function renderTrackCard(track) {
  const progress = ensureTrackProgress(track.id);
  const active = track.id === state.trackId;
  const kind = vocabKind(track);
  const meta = ["toeic", "toefl"].includes(kind)
    ? `${track.total.toLocaleString()}\uAC1C`
    : `${track.total.toLocaleString()}\uAC1C \u00B7 \uC54C\uACE0\uC788\uC74C ${(progress.known || []).length.toLocaleString()} \u00B7 \uACF5\uBD80\uD558\uACA0\uC74C ${(progress.again || []).length.toLocaleString()}`;
  return `
    <button class="type-button word-type-card${active ? " is-active" : ""}" type="button" data-track-id="${escapeHtml(track.id)}">
      <div class="type-button__title">${escapeHtml(displayTrackTitle(track))}</div>
      <div class="type-button__meta">${meta}</div>
    </button>
  `;
}

function renderLibrary() {
  renderShell(`
    <div class="word-flow-screen">
      <div class="topbar topbar--home word-topbar">
        <button class="back-button back-button--ghost" type="button" data-route="word">\uD648</button>
      </div>
      <section class="legacy-title-card word-flow-title-card">
        <h2>${groupLabel(state.group)}</h2>
        <p>\uC720\uD615 \uBC84\uD2BC\uC744 \uB20C\uB7EC \uD68C\uB3C5 \uD654\uBA74\uC73C\uB85C \uC774\uB3D9\uD569\uB2C8\uB2E4.</p>
      </section>
      ${renderLibrarySection(state.group)}
    </div>
  `, { home: true });
}

function renderTrackDetail() {
  const track = currentTrack();
  if (!track) {
    renderShell(`<div class="empty">\uC120\uD0DD\uB41C \uD2B8\uB799\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>`);
    return;
  }
  const progress = ensureTrackProgress(track.id);
  const stages = track.stages || [];
  renderShell(`
    <div class="word-flow-screen">
      <div class="topbar topbar--home word-topbar">
        <button class="back-button back-button--ghost" type="button" data-route="library">\uD648</button>
      </div>
      <section class="legacy-title-card word-flow-title-card word-track-title-card">
        <div class="word-title-row">
          <div>
            <h2>${escapeHtml(track.title)}</h2>
            <p>${escapeHtml(track.description || "\uD68C\uB3C5\uBCC4\uB85C \uB098\uB204\uC5B4 \uB2E8\uC77C \uD559\uC2B5\uC744 \uC9C4\uD589\uD569\uB2C8\uB2E4.")}</p>
          </div>
        </div>
      </section>
      <section class="section-card word-stage-panel">
        <div class="stage-list word-stage-list">
          ${stages.map((stage, index) => {
            const complete = isStageComplete(track, stage);
            return `
              <div class="stage-row stage-row--day">
                <div class="stage-button stage-button--day" data-stage-row-index="${index}">
                  <div class="stage-button__main">
                    <div class="stage-button__head">
                      <div class="stage-button__title">${escapeHtml(stageLabel(stage, index, track))}</div>
                      <button class="stage-preview-button stage-preview-button--compact" type="button" data-stage-preview="${index}" aria-label="\uBAA9\uB85D \uBCF4\uAE30">&#9776;</button>
                    </div>
                    <div class="stage-button__meta">\uD559\uC2B5 \uBC94\uC704 ${escapeHtml(stageRangeLabel(stage))}</div>
                  </div>
                  <div class="stage-button__sidebar">
                    <button class="stage-action-button stage-action-button--compact stage-action-button--play" type="button" data-stage-day="${index}" aria-label="\uB2E8\uC77C \uD559\uC2B5 \uC2DC\uC791">&#9654;</button>
                    ${complete ? `<span class="stage-badge">\uC644\uB8CC</span>` : ""}
                  </div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </section>
      ${state.stagePreviewIndex !== null ? renderStagePreviewModal(track, stages[state.stagePreviewIndex], state.stagePreviewIndex) : ""}
    </div>
  `, { home: true });
}

function renderStagePreviewModal(track, stage, index) {
  if (!track || !stage) return "";
  const items = track.items.slice(stage.start, stage.end);
  return `
    <div class="modal-backdrop progress-backdrop stage-word-backdrop">
      <div class="modal-panel section-card stage-word-modal">
        <div class="progress-modal__head">
          <div>
            <div class="progress-modal__title">${escapeHtml(stageLabel(stage, index, track))}</div>
            <div class="progress-modal__subtitle">${escapeHtml(track.title)} \u00B7 ${items.length.toLocaleString()}\uAC1C</div>
          </div>
          <button class="stage-preview-close" type="button" data-action="stage-preview-close" aria-label="\uBAA9\uB85D \uB2EB\uAE30">&times;</button>
        </div>
        <div class="stage-word-table">
          <div class="stage-word-row stage-word-row--head"><span>\uB2E8\uC5B4</span><span>\uB73B</span></div>
          ${items.map((item) => `
            <div class="stage-word-row">
              <span class="stage-word-term">${escapeHtml(item.primary || "")}</span>
              <span class="stage-word-meaning">${escapeHtml(item.meaning || "")}</span>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}
function studyStatsForEntries(entries, fallbackTrack = null) {
  let known = 0;
  let again = 0;
  for (const entry of entries) {
    const trackId = entry.trackId || fallbackTrack?.id;
    if (!trackId) continue;
    const itemId = entry.itemId || entry.id;
    const progress = ensureTrackProgress(trackId);
    if (progress.known.includes(itemId)) known += 1;
    if (progress.again.includes(itemId)) again += 1;
  }
  return { known, again };
}

function studyRangeText(track, stage, isQueue) {
  if (isQueue) return `\uB9DE\uCDA4 \uBB49\uCE58 \u00B7 ${state.studyTitle || "Custom"}`;
  return `${escapeHtml(stageRangeLabel(stage))} \u00B7 ${escapeHtml(stageLabel(stage, state.stageIndex, track))}`;
}
function renderStudy() {
  const track = currentTrack();
  if (!track) {
    renderShell(`<div class="empty">\uC120\uD0DD\uB41C \uD2B8\uB799\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>`);
    return;
  }
  const isQueue = Array.isArray(state.studyQueue);
  const stage = currentStage(track);
  const items = currentItems(track, stage);
  const item = currentItem();
  const progress = ensureTrackProgress(track.id);
  const itemNumber = isQueue ? Math.min(state.queueIndex + 1, items.length) : Math.min(state.cardIndex + 1, items.length);
  const saved = item ? progress.saved.includes(item.id) : false;
  const checked = item ? progress.checked.includes(item.id) : false;
  const title = isQueue ? `${state.studyTitle || "Custom"} \u00B7 ${escapeHtml(track.title)}` : escapeHtml(track.title);
  const entriesForStats = isQueue ? state.studyQueue : items;
  const stats = studyStatsForEntries(entriesForStats, track);
  const progressText = `${itemNumber}/${items.length || 0}`;
  const rangeText = studyRangeText(track, stage, isQueue);

  renderShell(`
    <div class="legacy-screen study-screen">
      <div class="home-nav-row">
        <button class="home-pill" type="button" data-route="${isQueue ? "custom" : "track"}">\uD648</button>
      </div>
      <section class="section-card study-info-card">
        <div class="study-head">
          <div>
            <h1 class="page-title page-title--study">${title}</h1>
            <div class="study-inline-meta">
              <span class="page-subtitle">\uC601\uC5B4\uB97C \uBCF4\uACE0 \uB73B\uC744 \uB5A0\uC62C\uB9B0 \uB4A4 \uD655\uC778</span>
            </div>
          </div>
          <div class="study-progress">${progressText}</div>
        </div>
        <div class="study-summary-row">
          <div class="study-summary-left">
            <span class="page-subtitle">${rangeText}</span>
          </div>
          <div class="study-summary-stats">
            <span class="study-stat-chip">\uC54C\uACE0\uC788\uC74C <strong>${stats.known}</strong></span>
            <span class="study-stat-chip">\uACF5\uBD80\uD558\uACA0\uC74C <strong>${stats.again}</strong></span>
          </div>
        </div>
      </section>
      <section class="section-card card-frame">
        ${item ? renderStudyCard(item, itemNumber, items.length, saved, checked, track) : `<div class="empty">\uD559\uC2B5\uD560 \uCE74\uB4DC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</div>`}
      </section>
    </div>
  `, { home: true });
}
function synonymText(item) {
  if (Array.isArray(item.synonyms)) return item.synonyms.filter(Boolean).join(" / ");
  return [item.note, item.hint].filter(Boolean).join(" / ");
}

function renderStudyCard(item, current, total, saved, checked, track) {
  const reveal = state.cardReveal || {};
  const kind = vocabKind(track || currentTrack());
  const isToefl = kind === "toefl";
  const hasExampleEn = Boolean(item.exampleJa);
  const hasExampleKo = Boolean(item.exampleKo);
  const synonym = synonymText(item);
  const meaningVisible = Boolean(reveal.meaning);
  const synonymVisible = Boolean(reveal.synonym && isToefl && synonym);
  const exampleVisible = Boolean(reveal.example && hasExampleEn);
  const exampleKoVisible = Boolean(reveal.exampleKo && hasExampleKo);

  return `
    <div class="card-panel">
      <button class="card-speak-button" type="button" data-action="speak" aria-label="\uB2E8\uC5B4 \uBC1C\uC74C \uB4E3\uAE30">&#128266;</button>
      <button class="card-check-button${checked ? " is-active" : ""}" type="button" data-action="check" aria-label="${checked ? "\uCCB4\uD06C \uD574\uC81C" : "\uCCB4\uD06C \uC800\uC7A5"}">&#9989;</button>
      <button class="card-bookmark-button${saved ? " is-active" : ""}" type="button" data-action="save" aria-label="${saved ? "\uC800\uC7A5 \uD574\uC81C" : "\uC800\uC7A5"}">&#128278;</button>
      <div class="card-primary">${escapeHtml(item.primary)}</div>
      <div class="card-slot card-meaning${meaningVisible ? "" : " is-empty"}">${meaningVisible ? escapeHtml(item.meaning || "") : "&nbsp;"}</div>
      <div class="card-slot card-choice${synonymVisible ? "" : " is-empty"}">${synonymVisible ? escapeHtml(synonym) : "&nbsp;"}</div>
      <div class="card-example-shell">
        <div class="card-example${exampleVisible ? "" : " is-empty"}">${exampleVisible ? escapeHtml(item.exampleJa || "") : "&nbsp;"}</div>
        <div class="card-example card-example--ko${exampleKoVisible ? "" : " is-empty"}">${exampleKoVisible ? escapeHtml(item.exampleKo || "") : "&nbsp;"}</div>
      </div>
    </div>
    <div class="action-stack">
      <div class="action-row ${isToefl ? "action-row--two" : "action-row--primary"}">
        <button class="action-button${meaningVisible ? " is-active" : ""}" type="button" data-card-reveal="meaning">\uB73B \uBCF4\uAE30</button>
        ${isToefl ? `<button class="action-button action-button--secondary${synonymVisible ? " is-active" : ""}" type="button" data-card-reveal="synonym" ${synonym ? "" : "disabled"}>\uC720\uC758\uC5B4 \uBCF4\uAE30</button>` : ""}
      </div>
      <div class="action-row action-row--two action-row--examples">
        <button class="action-button action-button--secondary${exampleVisible ? " is-active" : ""}" type="button" data-card-reveal="example" ${hasExampleEn ? "" : "disabled"}>\uC608\uBB38</button>
        <button class="action-button action-button--secondary${exampleKoVisible ? " is-active" : ""}" type="button" data-card-reveal="exampleKo" ${hasExampleKo ? "" : "disabled"}>\uC608\uBB38 \uD574\uC11D</button>
      </div>
      <div class="decision-row">
        <button class="decision-button decision-button--again" type="button" data-action="again">\uACF5\uBD80\uD558\uACA0\uC74C</button>
        <button class="decision-button decision-button--known" type="button" data-action="known">\uC54C\uACE0\uC788\uC74C</button>
      </div>
    </div>
  `;
}
function renderSearch() {
  const results = searchResults();
  renderShell(`
    <section class="section-card">
      <div class="section-head">
        <div>
          <div class="eyebrow">Lookup</div>
          <h3>\uC601\uC5B4 \uD2B8\uB799 \uAC80\uC0C9</h3>
        </div>
      </div>
      <div class="search-row">
        <input class="input" id="search-input" value="${escapeHtml(state.query)}" placeholder="\uC601\uC5B4 \uB2E8\uC5B4\uB098 \uB73B \uAC80\uC0C9" autocomplete="off" />
        <button class="btn primary" type="button" data-action="search-focus">\uAC80\uC0C9</button>
      </div>
      <div class="result-list">
        ${state.query.trim() ? results.map(({ track, item }) => {
          const progress = ensureTrackProgress(track.id);
          const saved = progress.saved.includes(item.id);
          const checked = progress.checked.includes(item.id);
          const key = `${escapeHtml(track.id)}::${escapeHtml(item.id)}`;
          return `
            <div class="result">
              <div>
                <strong>${escapeHtml(item.primary)} <span class="eyebrow">${escapeHtml(track.title)}</span></strong>
                <div>${escapeHtml(item.meaning || "")}</div>
              </div>
              <div class="result-actions">
                <button class="btn ${saved ? "accent" : ""}" type="button" data-lookup-save="${key}">${saved ? "\uC800\uC7A5\uB428" : "\uC800\uC7A5"}</button>
                <button class="btn ${checked ? "primary" : ""}" type="button" data-lookup-check="${key}">${checked ? "\uCCB4\uD06C\uB428" : "\uCCB4\uD06C"}</button>
              </div>
            </div>
          `;
        }).join("") || `<div class="empty">\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</div>` : `<div class="empty">\uB2E8\uC5B4 \uD2B8\uB799\uC758 \uC601\uC5B4\uC640 \uB73B\uC5D0\uC11C\uB9CC \uCC3E\uC544\uC90D\uB2C8\uB2E4.</div>`}
      </div>
    </section>
  `);
  const input = document.querySelector("#search-input");
  input?.focus();
  input?.setSelectionRange(input.value.length, input.value.length);
}

function speakCurrentScript() {
  const entry = scriptEntries()[state.scriptIndex];
  if (!entry) return;
  speak(entry.text, 0.86, () => {
    if (state.route !== "script" || state.scriptMode !== "listening") return;
    if (state.listeningLoop) {
      speakCurrentScript();
      return;
    }
    if (state.listeningContinuous && state.scriptIndex < scriptEntries().length - 1) {
      moveScript(1);
      setTimeout(speakCurrentScript, 120);
    }
  });
}
function renderScript() {
  const mode = state.scriptMode;
  const entries = scriptEntries();
  const activeIndices = activeScriptIndices(mode);
  const activePosition = Math.max(0, activeIndices.indexOf(state.scriptIndex));
  const current = entries[state.scriptIndex] || null;
  const isListening = mode === "listening";
  const title = isListening ? "\uB4E3\uAE30" : "\uC77D\uAE30";
  const revealed = isListening || state.scriptRevealed || state.readingFull;
  const bookmarked = modeFlag(mode, "Bookmarks");
  const seen = modeFlag(mode, "Seen");
  const fullItems = entries.map((entry, index) => `
    <section class="reading-full__item">
      <p class="reading-full__sentence">${escapeHtml(entry.text)}</p>
      ${entry.translation ? `<p class="reading-full__translation">${escapeHtml(entry.translation)}</p>` : ""}
      ${renderScriptFootnotes(entry.text)}
    </section>
  `).join("");

  renderShell(`
    <section class="screen-player ${isListening ? "listening-stage" : "reading-stage"}">
      <div class="player-stage ${isListening ? "listening-stage" : "reading-stage"}">
        <div class="player-topbar">
          <button class="icon-button text-button" type="button" data-route="${mode}">\uD648</button>
          <div class="player-meta">
            <div class="player-title">${title}</div>
            <div class="player-time">${entries.length ? `${(state.scriptBookmarkMode ? activePosition : state.scriptIndex) + 1} / ${state.scriptBookmarkMode ? activeIndices.length : entries.length}` : "0 / 0"}</div>
          </div>
          <div class="player-actions">
            <button class="seen-toggle${seen ? " is-active" : ""}" type="button" data-action="script-seen" aria-label="\uBD24\uC74C \uCCB4\uD06C">\u2713</button>
            <button class="bookmark-toggle${bookmarked ? " is-active" : ""}" type="button" data-action="script-bookmark" aria-label="\uBD81\uB9C8\uD06C"></button>
          </div>
        </div>
        ${isListening ? `
          <section class="listening-panel">
            <button class="sentence-nav sentence-nav--prev listening-nav" type="button" data-action="script-prev" aria-label="\uC774\uC804 \uBB38\uC7A5"><span class="sentence-nav__icon">&lt;</span></button>
            <button class="sentence-nav sentence-nav--next listening-nav" type="button" data-action="script-next" aria-label="\uB2E4\uC74C \uBB38\uC7A5"><span class="sentence-nav__icon">&gt;</span></button>
            <div class="listening-card">
              <div class="listening-track-title">${escapeHtml(current?.text || "")}</div>
              <div class="player-time">${entries.length ? `${(state.scriptBookmarkMode ? activePosition : state.scriptIndex) + 1} / ${state.scriptBookmarkMode ? activeIndices.length : entries.length}` : "0 / 0"}</div>
              <div class="current-sentence listening-sentence">${escapeHtml(current?.text || "")}</div>
              <div class="current-translation listening-translation">${escapeHtml(current?.translation || "")}</div>
              ${renderScriptFootnotes(current?.text || "")}
              <button class="home-utility-button listening-speak-button" type="button" data-action="script-speak">\uD604\uC7AC \uBB38\uC7A5 \uB4E3\uAE30</button>
            </div>
          </section>
          <div class="floating-actions listening-actions">
            <button class="reveal-toggle continuous-toggle${state.listeningContinuous ? " is-active" : ""}" type="button" data-action="listening-continuous" aria-pressed="${state.listeningContinuous ? "true" : "false"}">\uC5F0\uC18D</button>
            <button class="reveal-toggle loop-toggle${state.listeningLoop ? " is-active" : ""}" type="button" data-action="listening-loop" aria-pressed="${state.listeningLoop ? "true" : "false"}">\uBC18\uBCF5</button>
          </div>
        ` : `
          <section class="reading-panel${revealed ? " is-revealed" : ""}${state.readingFull ? " is-full-view" : ""}">
            <button class="sentence-nav sentence-nav--prev reading-nav${state.readingFull ? " is-hidden" : ""}" type="button" data-action="script-prev" aria-label="\uC774\uC804 \uBB38\uC7A5"><span class="sentence-nav__icon">&lt;</span></button>
            <button class="sentence-nav sentence-nav--next reading-nav${state.readingFull ? " is-hidden" : ""}" type="button" data-action="script-next" aria-label="\uB2E4\uC74C \uBB38\uC7A5"><span class="sentence-nav__icon">&gt;</span></button>
            <div class="current-sentence reading-sentence">${state.readingFull ? `<article class="reading-full"><h3 class="reading-full__title">${title}</h3>${fullItems}</article>` : escapeHtml(current?.text || "")}</div>
            <div class="current-translation reading-extra">${revealed && !state.readingFull ? escapeHtml(current?.translation || current?.text || "") : ""}</div>
            ${!state.readingFull ? renderScriptFootnotes(current?.text || "") : ""}
          </section>
          <div class="floating-actions reading-actions">
            <label class="reveal-toggle"><input type="checkbox" data-action="reading-reveal" ${state.scriptRevealed ? "checked" : ""}> \uD574\uC11D</label>
            <label class="reveal-toggle"><input type="checkbox" data-action="reading-full" ${state.readingFull ? "checked" : ""}> \uC804\uBB38</label>
          </div>
        `}
      </div>
    </section>
  `, { home: true });
}
function renderCustomMenu() {
  const savedCount = savedQueueEntries().length;
  renderShell(`
    <div class="legacy-screen">
      <div class="home-nav-row">
        <button class="home-pill" type="button" data-route="home">\uD648</button>
      </div>
      <section class="legacy-title-card">
        <h2>\uB9DE\uCDA4</h2>
        <p>\uC9C4\uD589 \uCD94\uCC9C \uB610\uB294 \uC120\uD0DD \uD559\uC2B5\uC744 \uC9C4\uD589\uD569\uB2C8\uB2E4.</p>
      </section>
      <section class="section-card custom-menu-panel">
        <button class="custom-option-card" type="button" data-action="custom-progress">
          <strong>\uC9C4\uD589</strong>
          <span>\uAC00\uC7A5 \uB35C \uC9C4\uD589\uB41C \uBB49\uCE58\uBD80\uD130 \uCC28\uB840\uB300\uB85C \uD559\uC2B5\uD569\uB2C8\uB2E4.</span>
        </button>
        <button class="custom-option-card" type="button" data-route="custom-select">
          <strong>\uC120\uD0DD</strong>
          <span>\uC5EC\uB7EC \uBB49\uCE58\uB97C \uACE0\uB974\uACE0 \uBB36\uC5B4\uC11C \uD559\uC2B5</span>
        </button>
        <div class="custom-saved-row">
          <button class="custom-option-card" type="button" data-action="custom-saved" ${savedCount ? "" : "disabled"}>
            <strong>\uC800\uC7A5</strong>
            <span>\uC800\uC7A5\uB41C \uB2E8\uC5B4 ${savedCount.toLocaleString()}\uAC1C\uB97C \uD559\uC2B5\uD569\uB2C8\uB2E4.</span>
          </button>
          <div class="saved-side-actions">
            <button class="home-utility-button" type="button" data-action="saved-list-open">[\uBAA9\uB85D]</button>
            <button class="home-utility-button" type="button" data-action="clear-saved" ${savedCount ? "" : "disabled"}>[\uBAA8\uB450\uD574\uC81C]</button>
          </div>
        </div>
      </section>
      ${state.savedListOpen ? renderSavedListModal() : ""}
    </div>
  `, { home: true });
}


function renderSavedListModal() {
  const entries = savedQueueEntries();
  return `
    <div class="saved-list-backdrop" role="dialog" aria-modal="true" aria-label="\uC800\uC7A5\uB41C \uB2E8\uC5B4 \uBAA9\uB85D">
      <div class="saved-list-modal">
        <div class="saved-list-head">
          <div>
            <div class="saved-list-title">\uC800\uC7A5\uB41C \uB2E8\uC5B4</div>
            <div class="saved-list-subtitle">${entries.length.toLocaleString()}\uAC1C</div>
          </div>
          <button class="home-utility-button" type="button" data-action="saved-list-close">\uB2EB\uAE30</button>
        </div>
        <div class="saved-list-body">
          ${entries.length ? entries.map((entry) => {
            const track = findTrack(entry.trackId);
            const item = findItem(entry.trackId, entry.itemId);
            if (!track || !item) return "";
            const key = `${escapeHtml(entry.trackId)}::${escapeHtml(entry.itemId)}`;
            return `
              <div class="saved-list-row">
                <div class="saved-list-word">
                  <strong>${escapeHtml(item.primary)}</strong>
                  <span>${escapeHtml(item.meaning || "")}</span>
                  <em>${escapeHtml(displayTrackTitle(track))}</em>
                </div>
                <div class="saved-list-actions">
                  <button class="home-utility-button" type="button" data-unsave-item="${key}">\uD574\uC81C</button>
                </div>
              </div>
            `;
          }).join("") : `<div class="empty">\uC800\uC7A5\uB41C \uB2E8\uC5B4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</div>`}
        </div>
      </div>
    </div>
  `;
}
function renderCustomSelect() {
  const groups = customSelectGroups();
  const selected = new Set(state.customStageKeys);
  const selectedOptions = allStageOptions().filter((option) => selected.has(option.key));
  const selectedCards = selectedOptions.reduce((sum, option) => sum + option.total, 0);
  renderShell(`
    <div class="legacy-screen custom-select-screen">
      <div class="home-nav-row custom-select-nav">
        <button class="home-pill" type="button" data-route="custom">\uD648</button>
      </div>
      <section class="legacy-title-card custom-select-title-card">
        <h2>\uC120\uD0DD</h2>
        <p>\uB2E8\uC77C\uC744 \uACE0\uB974\uACE0 \uD55C \uBC88\uC5D0 \uD559\uC2B5\uC744 \uC2DC\uC791\uD569\uB2C8\uB2E4.</p>
      </section>
      <section class="section-card custom-select-board">
        ${groups.map((group) => {
          const groupCollapsed = Boolean(state.customCollapsedGroups[group.groupKey]);
          const groupSelected = group.tracks.reduce((sum, track) => sum + track.options.filter((option) => selected.has(option.key)).length, 0);
          const groupTotal = group.tracks.reduce((sum, track) => sum + track.options.length, 0);
          return `
            <section class="custom-select-group${groupCollapsed ? " is-collapsed" : ""}">
              <button class="custom-select-group__title" type="button" data-custom-collapse="group:${escapeHtml(group.groupKey)}" aria-expanded="${groupCollapsed ? "false" : "true"}">
                <span>${escapeHtml(group.groupTitle)}</span>
                <span>${groupSelected}/${groupTotal}</span>
              </button>
              ${groupCollapsed ? "" : group.tracks.map((track) => {
                const selectedCount = track.options.filter((option) => selected.has(option.key)).length;
                const trackCollapsed = Boolean(state.customCollapsedTracks[track.trackKey]);
                return `
                  <div class="custom-select-track${trackCollapsed ? " is-collapsed" : ""}">
                    <button class="custom-select-track__head" type="button" data-custom-collapse="track:${escapeHtml(track.trackKey)}" aria-expanded="${trackCollapsed ? "false" : "true"}">
                      <h4>${escapeHtml(track.trackTitle)}</h4>
                      <span>${selectedCount}/${track.options.length}</span>
                    </button>
                    ${trackCollapsed ? "" : `<div class="custom-stage-chip-grid">
                      ${track.options.map((option, index) => `
                        <button class="custom-stage-chip${selected.has(option.key) ? " is-active" : ""}${option.percent >= 100 ? " is-complete" : ""}" type="button" data-custom-stage="${escapeHtml(option.key)}">
                          ${String(index + 1).padStart(2, "0")}
                        </button>
                      `).join("")}
                    </div>`}
                  </div>
                `;
              }).join("")}
            </section>
          `;
        }).join("")}
      </section>
      <section class="section-card custom-select-footer">
        <div class="custom-select-summary">
          <span>\uC120\uD0DD\uD55C \uBB49\uCE58 ${selected.size}\uAC1C</span>
          <span>\uC120\uD0DD\uD55C \uCE74\uB4DC ${selectedCards}\uAC1C</span>
        </div>
        <div class="custom-select-controls">
          <button class="stage-preview-filter" type="button" data-action="custom-clear" ${selected.size ? "" : "disabled"}>\uD574\uC81C</button>
          <button class="stage-preview-filter${state.customBatchSize === 7 ? " is-active" : ""}" type="button" data-custom-batch="7">7\uAC1C</button>
          <button class="stage-preview-filter${state.customBatchSize === 20 ? " is-active" : ""}" type="button" data-custom-batch="20">20\uAC1C</button>
          <button class="stage-preview-filter" type="button">v \uD3EC\uD568</button>
          <button class="big-button big-button--accent custom-select-start" type="button" data-action="custom-selected" ${selected.size ? "" : "disabled"}>
            <div class="big-button__title">\uC2DC\uC791</div>
          </button>
        </div>
      </section>
    </div>
  `, { home: true });
}function renderLoading() {
  renderShell(`<div class="empty">\uC601\uC5B4 \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</div>`);
}

function renderError() {
  renderShell(`<div class="error">${escapeHtml(state.error || "\uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.")}</div>`);
}
function render() {
  if (state.error) return renderError();
  if (!state.data) return renderLoading();
  if (state.route === "word") return renderWordHome();
  if (state.route === "library") return renderLibrary();
  if (state.route === "track") return renderTrackDetail();
  if (state.route === "study") return renderStudy();
  if (state.route === "search") return renderSearch();
  if (state.route === "reading") return renderSentenceMode("reading");
  if (state.route === "listening") return renderSentenceMode("listening");
  if (state.route === "script") return renderScript();
  if (state.route === "custom") return renderCustomMenu();
  if (state.route === "custom-select") return renderCustomSelect();
  return renderHome();
}

function getPrimaryGamepad() {
  if (!("getGamepads" in navigator)) return null;
  return [...(navigator.getGamepads?.() || [])].find(Boolean) || null;
}

function isGamepadButtonPressed(button) {
  if (!button) return false;
  if (typeof button === "number") return button > 0.5;
  return Boolean(button.pressed) || button.value > 0.5;
}

function handleGamepadStudyAction(action) {
  if (state.route !== "study") return;
  if (action === "known") {
    markItem("known");
    return;
  }
  if (action === "again") {
    markItem("again");
    return;
  }
  if (action === "meaning") {
    toggleCardReveal("meaning");
    return;
  }
  if (action === "speak") {
    speak(currentItem()?.primary || "");
    return;
  }
  if (action === "bookmark") {
    markItem("saved");
    return;
  }
  if (action === "check") {
    markItem("checked");
    return;
  }
  if (action === "prev") {
    moveCard(-1);
    return;
  }
  if (action === "next") {
    moveCard(1);
  }
}

function pollGamepad() {
  const pad = getPrimaryGamepad();
  const nextStates = {};
  if (pad && state.route === "study") {
    const mapping = [
      [0, "known"],
      [1, "meaning"],
      [2, "again"],
      [3, "speak"],
      [4, "prev"],
      [5, "bookmark"],
      [6, "next"],
      [7, "check"],
    ];
    for (const [index, action] of mapping) {
      const pressed = isGamepadButtonPressed(pad.buttons?.[index]);
      nextStates[index] = pressed;
      if (pressed && !state.gamepadButtons[index]) handleGamepadStudyAction(action);
    }
  }
  state.gamepadButtons = nextStates;
  window.requestAnimationFrame(pollGamepad);
}
function bindEvents() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("button, input, [data-action='home']");
    if (!target) return;
    if (target.dataset.vocabKind) state.group = target.dataset.vocabKind;
    if (target.dataset.group) state.group = target.dataset.group;
    if (target.dataset.scriptStart) {
      startScriptMode(target.dataset.scriptStart, false);
      return;
    }
    if (target.dataset.scriptBookmarks) {
      startScriptMode(target.dataset.scriptBookmarks, true);
      return;
    }
    if (target.dataset.route) {
      if (target.dataset.scriptMode) state.scriptMode = target.dataset.scriptMode;
      setRoute(target.dataset.route);
      return;
    }
    if (target.dataset.action === "home") {
      setRoute("home");
      return;
    }
    if (target.dataset.trackId) selectTrack(target.dataset.trackId);
    if (target.dataset.stageDay) startStage(Number(target.dataset.stageDay));
    if (target.dataset.stagePreview) {
      state.stagePreviewIndex = Number(target.dataset.stagePreview);
      render();
      return;
    }
    if (target.dataset.stageIndex) selectStage(Number(target.dataset.stageIndex));
    if (target.dataset.scriptIndex) {
      state.scriptIndex = Number(target.dataset.scriptIndex);
      state.scriptRevealed = false;
      render();
    }
    if (target.dataset.speakText) speak(target.dataset.speakText);
    if (target.dataset.lookupSave) {
      const [trackId, itemId] = target.dataset.lookupSave.split("::");
      toggleItemFlag(trackId, itemId, "saved");
      renderSearch();
      return;
    }
    if (target.dataset.lookupCheck) {
      const [trackId, itemId] = target.dataset.lookupCheck.split("::");
      toggleItemFlag(trackId, itemId, "checked");
      renderSearch();
      return;
    }
    if (target.dataset.cardReveal) {
      toggleCardReveal(target.dataset.cardReveal);
      return;
    }
    if (target.dataset.unsaveItem) {
      const [trackId, itemId] = target.dataset.unsaveItem.split("::");
      const progress = ensureTrackProgress(trackId);
      removeValue(progress.saved, itemId);
      saveProgress();
      render();
      return;
    }

    const action = target.dataset.action;
    if (action === "progress-open") {
      state.progressOpen = true;
      render();
    }
    if (action === "progress-close") {
      state.progressOpen = false;
      render();
    }
    if (action === "stage-preview-close") {
      state.stagePreviewIndex = null;
      render();
    }
    if (action === "saved-list-open") {
      state.savedListOpen = true;
      render();
      return;
    }
    if (action === "saved-list-close") {
      state.savedListOpen = false;
      render();
      return;
    }
    if (action === "custom-clear") {
      state.customStageKeys = [];
      render();
    }
    if (target.dataset.customBatch) {
      state.customBatchSize = Number(target.dataset.customBatch) || 20;
      render();
    }
    if (action === "custom-progress") startProgressStudy();
    if (action === "custom-saved") startSavedStudy();
    if (action === "custom-selected") startSelectedStudy();
    if (action === "clear-saved") {
      if (window.confirm("\uC800\uC7A5\uB41C \uB2E8\uC5B4\uB97C \uBAA8\uB450 \uD574\uC81C\uD560\uAE4C\uC694?")) clearSavedItems();
      return;
    }
    if (target.dataset.customCollapse) {
      const [kind, key] = target.dataset.customCollapse.split(":");
      toggleCustomCollapse(kind, key);
      return;
    }
    if (target.dataset.customStage) toggleCustomStage(target.dataset.customStage);
    if (action === "reveal") toggleCardReveal("meaning");
    if (action === "prev") moveCard(-1);
    if (action === "next") moveCard(1);
    if (action === "speak") speak(currentItem()?.primary || "");
    if (action === "save") markItem("saved");
    if (action === "check") markItem("checked");
    if (action === "again") markItem("again");
    if (action === "known") markItem("known");
    if (action === "script-save") {
      const textarea = document.querySelector("#script-text");
      state.scriptText = textarea?.value || "";
      state.scriptIndex = 0;
      saveScript();
      render();
    }
    if (action === "script-speak") speakCurrentScript();
    if (action === "script-bookmark") toggleModeFlag(state.scriptMode, "Bookmarks");
    if (action === "script-seen") toggleModeFlag(state.scriptMode, "Seen");
    if (action === "reading-reveal") {
      state.scriptRevealed = Boolean(target.checked);
      render();
    }
    if (action === "reading-full") {
      state.readingFull = Boolean(target.checked);
      render();
    }
    if (action === "listening-loop") {
      state.listeningLoop = !state.listeningLoop;
      if (state.listeningLoop) state.listeningContinuous = false;
      render();
    }
    if (action === "listening-continuous") {
      state.listeningContinuous = !state.listeningContinuous;
      if (state.listeningContinuous) state.listeningLoop = false;
      render();
    }
    if (action === "script-reveal") {
      state.scriptRevealed = true;
      render();
    }
    if (action === "script-prev") moveScript(-1);
    if (action === "script-next") moveScript(1);
    if (action === "script-reset") {
      state.scriptText = defaultScriptText();
      state.scriptIndex = 0;
      saveScript();
      render();
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "search-input") {
      state.query = event.target.value;
      renderSearch();
    }
    if (event.target.id === "home-search-input") {
      state.query = event.target.value;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("textarea, input")) return;
    if (event.key === " ") {
      event.preventDefault();
      if (state.route === "study") state.revealed ? speak(currentItem()?.primary || "") : toggleCardReveal("meaning");
      if (state.route === "script") state.scriptRevealed ? speak(scriptEntries()[state.scriptIndex]?.text || "") : (state.scriptRevealed = true, render());
    }
    if (event.key === "ArrowLeft") state.route === "script" ? moveScript(-1) : moveCard(-1);
    if (event.key === "ArrowRight") state.route === "script" ? moveScript(1) : moveCard(1);
  });
}

async function loadData() {
  try {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.data = payload;
    state.tracks = payload.tracks
      .filter((track) => track.language === "en")
      .map((track) => ({ ...track, groupKey: normalizeGroup(track.group) }));
    state.trackId = state.tracks[0]?.id || "";
  } catch (error) {
    state.error = `\uC601\uC5B4 \uB370\uC774\uD130 \uB85C\uB4DC \uC2E4\uD328: ${error.message}`;
  }
  render();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

bindEvents();
initHistory();
window.requestAnimationFrame(pollGamepad);
render();
loadData();
registerServiceWorker();
