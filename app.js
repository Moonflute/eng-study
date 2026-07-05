const APP_VERSION = "0.0.7";
const STORAGE_KEY = "english-study-lab-progress-v0";
const SCRIPT_STORAGE_KEY = "english-study-lab-script-v0";
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
  revealed: false,
  query: "",
  scriptText: localStorage.getItem(SCRIPT_STORAGE_KEY) || defaultScriptText(),
  scriptMode: "reading",
  scriptIndex: 0,
  scriptRevealed: false,
  progress: loadProgress(),
  error: "",
  gamepadButtons: {},
};

function defaultScriptText() {
  return [
    "Learning English gets easier when every sentence becomes something you can revisit.",
    "Read it once for meaning, listen once for rhythm, and then speak it back in your own voice.",
    "Small daily repetitions build a vocabulary that stays available when you need it.",
  ].join("\n");
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

function speak(text, rate = 0.86) {
  if (!text || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = rate;
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
    query: state.query,
    scriptMode: state.scriptMode,
    scriptIndex: state.scriptIndex,
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
  state.query = next.query || "";
  state.scriptMode = next.scriptMode || state.scriptMode || "reading";
  state.scriptIndex = Number(next.scriptIndex || 0);
  state.revealed = false;
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
  state.revealed = false;
  state.scriptRevealed = false;
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
  state.revealed = false;
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

function stageLabel(stage, index) {
  const label = stage?.label || "";
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
function moveCard(delta) {
  if (Array.isArray(state.studyQueue)) {
    state.queueIndex = Math.min(Math.max(0, state.queueIndex + delta), Math.max(0, state.studyQueue.length - 1));
    state.revealed = false;
    render();
    return;
  }
  const items = currentItems();
  state.cardIndex = Math.min(Math.max(0, state.cardIndex + delta), Math.max(0, items.length - 1));
  state.revealed = false;
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

function moveScript(delta) {
  const sentences = scriptSentences();
  state.scriptIndex = Math.min(Math.max(0, state.scriptIndex + delta), Math.max(0, sentences.length - 1));
  state.scriptRevealed = false;
  render();
}

function searchResults() {
  const query = state.query.trim().toLowerCase();
  if (!query) return [];
  const results = [];
  for (const track of state.tracks) {
    for (const item of track.items) {
      const haystack = [item.primary, item.reading, item.meaning, item.exampleJa, item.exampleKo, item.note, item.hint]
        .join(" ")
        .toLowerCase();
      if (haystack.includes(query)) results.push({ track, item });
      if (results.length >= 80) return results;
    }
  }
  return results;
}

function wordTracks() {
  return state.tracks.filter((track) => normalizeGroup(track.group) === "word");
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
  state.revealed = false;
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
  startQueue(queueFromStageOptions(options), "\uC120\uD0DD");
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
    <div class="topbar topbar--home">
      <button class="back-button back-button--ghost" type="button" data-route="home">\uD648</button>
      <button class="home-icon-button" type="button" data-route="custom" aria-label="\uD559\uC2B5 \uD604\uD669">\uD83D\uDCCA</button>
    </div>
    <div class="title-block title-block--home">
      <h1>\uB2E8\uC5B4</h1>
    </div>
    <div class="home-actions">
      <div class="home-actions-stack">
        <div class="section-card japanese-lookup-card">
          <div>
            <div class="lookup-title">\uB2E8\uC5B4 \uAC80\uC0C9</div>
            <div class="page-subtitle">\uC601\uC5B4\uB098 \uB73B\uC73C\uB85C \uCC3E\uC544\uBCF4\uACE0 \uBC14\uB85C \uBD81\uB9C8\uD06C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</div>
          </div>
          <div class="lookup-search-row">
            <input class="lookup-search-input" id="home-search-input" type="search" value="${escapeHtml(state.query)}" placeholder="ex. improve / \uAC1C\uC120\uD558\uB2E4" autocomplete="off" />
            <button class="home-utility-button lookup-search-submit" type="button" data-route="search">\uAC80\uC0C9</button>
          </div>
        </div>
        <div class="grid-2 grid-2--word-home" aria-label="\uB2E8\uC5B4 \uC139\uC158">
          <button class="big-button" type="button" data-vocab-kind="toeic" data-route="library">
            <div class="big-button__title">\uD1A0\uC775</div>
            <div class="big-button__desc">${toeic.length}\uAC1C \uD2B8\uB799 \u00B7 ${toeicCards.toLocaleString()}\uAC1C</div>
          </button>
          <button class="big-button" type="button" data-vocab-kind="toefl" data-route="library">
            <div class="big-button__title">\uD1A0\uD50C</div>
            <div class="big-button__desc">${toefl.length}\uAC1C \uD2B8\uB799 \u00B7 ${toeflCards.toLocaleString()}\uAC1C</div>
          </button>
          <button class="big-button" type="button" data-group="grammar" data-route="library">
            <div class="big-button__title">\uBB38\uBC95</div>
            <div class="big-button__desc">${grammar.tracks.length}\uAC1C \uD2B8\uB799</div>
          </button>
          <button class="big-button big-button--accent" type="button" data-route="custom">
            <div class="big-button__title">\uB9DE\uCDA4</div>
            <div class="big-button__desc">\uC9C4\uD589 \u00B7 \uC120\uD0DD \u00B7 \uC800\uC7A5 ${savedCount.toLocaleString()}\uAC1C</div>
          </button>
        </div>
      </div>
    </div>
    <div class="home-version">v ${APP_VERSION}</div>
  `, { home: true });
}

function renderSentenceMode(mode) {
  const isListening = mode === "listening";
  const sentences = scriptSentences();
  const title = isListening ? "\uB4E3\uAE30" : "\uC77D\uAE30";
  const desc = isListening
    ? "\uC74C\uC131 \uAD6C\uAC04\uC744 \uBC18\uBCF5\uD558\uACE0 \uD544\uC694\uD560 \uB54C \uBB38\uC7A5\uC744 \uD655\uC778\uD569\uB2C8\uB2E4."
    : "\uBB38\uC7A5\uC744 \uD558\uB098\uC529 \uB118\uAE30\uBA70 \uC758\uBBF8\uB97C \uD655\uC778\uD569\uB2C8\uB2E4.";
  const primary = isListening ? "\uB4E3\uAE30 \uC2DC\uC791" : "\uC77D\uAE30 \uC2DC\uC791";
  const secondary = isListening ? "\uB300\uBCF8 \uBD99\uC5EC\uB123\uAE30" : "\uAE00 \uBD99\uC5EC\uB123\uAE30";

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
            <button class="show-item show-item--tile show-item--study" type="button" data-route="script" data-script-mode="${mode}">
              <span class="show-title">${primary}</span>
              <span class="show-meta">${sentences.length}\uAC1C \uBB38\uC7A5</span>
            </button>
            <button class="show-item show-item--tile show-item--study" type="button" data-route="script" data-script-mode="${mode}">
              <span class="show-title">${secondary}</span>
              <span class="show-meta">\uC800\uC7A5\uB41C \uB300\uBCF8 \uC218\uC815</span>
            </button>
          </div>
        </section>
      </div>
    </section>
  `, { home: true });
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
  return `
    <button class="type-button word-type-card${active ? " is-active" : ""}" type="button" data-track-id="${escapeHtml(track.id)}">
      <div class="type-button__title">${escapeHtml(track.title)}</div>
      <div class="type-button__meta">${track.total.toLocaleString()}\uAC1C \u00B7 \uC54C\uACE0\uC788\uC74C ${(progress.known || []).length.toLocaleString()} \u00B7 \uACF5\uBD80\uD558\uACA0\uC74C ${(progress.again || []).length.toLocaleString()}</div>
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
          <button class="stage-preview-button stage-preview-button--title" type="button" aria-label="\uC804\uCCB4 \uBAA9\uB85D \uBCF4\uAE30">&#9776;</button>
        </div>
      </section>
      <section class="section-card word-stage-panel">
        <div class="stage-list word-stage-list">
          ${stages.map((stage, index) => {
            const complete = isStageComplete(track, stage);
            const reviewCount = stageReviewCount(track, stage);
            return `
              <div class="stage-row stage-row--day">
                <div class="stage-button stage-button--day${index === progress.lastStage ? " is-active" : ""}${complete ? " is-complete" : ""}" data-stage-row-index="${index}">
                  <div class="stage-button__main">
                    <div class="stage-button__head">
                      <div class="stage-button__title">${escapeHtml(stageLabel(stage, index))}</div>
                      <button class="stage-preview-button stage-preview-button--compact" type="button" aria-label="\uBAA9\uB85D \uBCF4\uAE30">&#9776;</button>
                    </div>
                    <div class="stage-button__meta">\uD559\uC2B5 \uBC94\uC704 ${escapeHtml(stageRangeLabel(stage))}</div>
                    <div class="stage-button__submeta">\uBCF5\uC2B5 \uD6C4\uBCF4 ${reviewCount}\uAC1C${complete ? " \u00B7 \uC644\uB8CC" : ""}</div>
                  </div>
                  <div class="stage-button__sidebar">
                    <button class="stage-action-button stage-action-button--compact" type="button" data-stage-day="${index}">\uB2E8\uC77C</button>
                    ${complete ? `<span class="stage-badge">\uC644\uB8CC</span>` : ""}
                  </div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </section>
    </div>
  `, { home: true });
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
  const eyebrow = isQueue ? `\uB9DE\uCDA4 \uD559\uC2B5 \u00B7 ${items.length}\uAC1C` : `${escapeHtml(track.group)} \u00B7 ${escapeHtml(stage?.label || "All")}`;

  renderShell(`
    <div class="study-layout ${isQueue ? "study-layout--queue" : ""}">
      ${isQueue ? "" : `
        <aside class="sidebar" aria-label="\uC2A4\uD14C\uC774\uC9C0">
          ${track.stages.map((entry, index) => `
            <button class="stage-chip ${index === state.stageIndex ? "active" : ""}" type="button" data-stage-index="${index}">
              ${escapeHtml(entry.label || `Stage ${index + 1}`)}
              <br><span>${escapeHtml(entry.range || `${entry.end - entry.start}\uAC1C`)}</span>
            </button>
          `).join("")}
        </aside>
      `}
      <section class="study-panel">
        <div class="study-top">
          <div>
            <div class="eyebrow">${eyebrow}</div>
            <h2 class="study-title">${title}</h2>
          </div>
          <div class="toolbar">
            <button class="icon-btn" type="button" data-action="prev" aria-label="\uC774\uC804">\u2039</button>
            <button class="icon-btn" type="button" data-action="next" aria-label="\uB2E4\uC74C">\u203A</button>
          </div>
        </div>
        ${item ? renderStudyCard(item, itemNumber, items.length, saved, checked) : `<div class="empty">\uD559\uC2B5\uD560 \uCE74\uB4DC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</div>`}
      </section>
    </div>
  `);
}
function renderStudyCard(item, current, total, saved, checked) {
  return `
    <article>
      <div class="card-main">
        <div class="eyebrow">${current} / ${total}</div>
        <div class="prompt">${escapeHtml(item.primary)}</div>
        ${state.revealed ? `
          <div class="meaning">${escapeHtml(item.meaning || "")}</div>
          ${item.exampleJa ? `<p class="example">${escapeHtml(item.exampleJa)}</p>` : ""}
          ${item.exampleKo ? `<p class="example">${escapeHtml(item.exampleKo)}</p>` : ""}
          ${item.note || item.hint ? `<div class="note">${escapeHtml([item.note, item.hint].filter(Boolean).join(" / "))}</div>` : ""}
        ` : `<button class="btn primary" type="button" data-action="reveal">\uB73B \uBCF4\uAE30</button>`}
      </div>
      <div class="card-actions">
        <button class="btn" type="button" data-action="speak">\uBC1C\uC74C</button>
        <button class="btn ${saved ? "accent" : ""}" type="button" data-action="save">${saved ? "\uC800\uC7A5\uB428" : "\uC800\uC7A5"}</button>
        <button class="btn ${checked ? "primary" : ""}" type="button" data-action="check">${checked ? "\uCCB4\uD06C\uB428" : "\uCCB4\uD06C"}</button>
        <button class="btn" type="button" data-action="again">\uB2E4\uC2DC</button>
        <button class="btn primary" type="button" data-action="known">\uC54C\uC558\uC74C</button>
      </div>
    </article>
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
        <input class="input" id="search-input" value="${escapeHtml(state.query)}" placeholder="\uB2E8\uC5B4, \uB73B, \uC608\uBB38, \uB3D9\uC758\uC5B4 \uAC80\uC0C9" autocomplete="off" />
        <button class="btn primary" type="button" data-action="search-focus">\uAC80\uC0C9</button>
      </div>
      <div class="result-list">
        ${state.query.trim() ? results.map(({ track, item }) => `
          <div class="result">
            <div>
              <strong>${escapeHtml(item.primary)} <span class="eyebrow">${escapeHtml(track.title)}</span></strong>
              <div>${escapeHtml(item.meaning || "")}</div>
              ${item.exampleJa ? `<p>${escapeHtml(item.exampleJa)}</p>` : ""}
            </div>
            <button class="btn" type="button" data-speak-text="${escapeHtml(item.primary)}">\uBC1C\uC74C</button>
          </div>
        `).join("") || `<div class="empty">\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</div>` : `<div class="empty">\uAC80\uC0C9\uC5B4\uB97C \uC785\uB825\uD558\uBA74 \uBAA8\uB4E0 \uC601\uC5B4 \uB2E8\uC5B4\u00B7\uBB38\uBC95 \uD2B8\uB799\uC5D0\uC11C \uCC3E\uC544\uC90D\uB2C8\uB2E4.</div>`}
      </div>
    </section>
  `);
  const input = document.querySelector("#search-input");
  input?.focus();
  input?.setSelectionRange(input.value.length, input.value.length);
}

function renderScript() {
  const sentences = scriptSentences();
  const current = sentences[state.scriptIndex] || "";
  const isListening = state.scriptMode === "listening";
  const title = isListening ? "\uB4E3\uAE30" : "\uC77D\uAE30";
  const visibleSentence = !isListening || state.scriptRevealed;
  renderShell(`
    <section class="screen-library ${isListening ? "listening-stage" : "reading-stage"}">
      <div class="library-list-header">
        <button class="back-button back-button--ghost" type="button" data-route="${isListening ? "listening" : "reading"}">\u2190 ${title}</button>
        <h2 class="library-list-title">${title}</h2>
        <button class="home-utility-button" type="button" data-action="script-save">\uC800\uC7A5</button>
      </div>
      <div class="library-list library-list--script-study">
        <section class="section-card script-editor-card">
          <textarea class="textarea" id="script-text" spellcheck="false">${escapeHtml(state.scriptText)}</textarea>
          <div class="card-actions">
            <button class="btn accent" type="button" data-action="script-reset">\uC608\uBB38\uC73C\uB85C \uCD08\uAE30\uD654</button>
          </div>
        </section>
        <section class="section-card ${isListening ? "listening-panel" : "reading-panel"} ${visibleSentence ? "is-revealed" : ""}">
          <div class="card-main">
            <div class="eyebrow">${Math.min(state.scriptIndex + 1, sentences.length || 1)} / ${sentences.length || 0}</div>
            ${current ? `
              <div class="prompt ${isListening ? "listening-sentence" : "reading-sentence"}">${visibleSentence ? escapeHtml(current) : "Listen first"}</div>
              ${visibleSentence ? `<p class="example reading-extra">${escapeHtml(current)}</p>` : `<button class="btn primary" type="button" data-action="script-reveal">\uBB38\uC7A5 \uBCF4\uAE30</button>`}
            ` : `<div class="empty">\uC601\uC5B4 \uBB38\uC7A5\uC744 \uBD99\uC5EC\uB123\uC73C\uBA74 \uC790\uB3D9\uC73C\uB85C \uBB38\uC7A5 \uCE74\uB4DC\uAC00 \uB9CC\uB4E4\uC5B4\uC9D1\uB2C8\uB2E4.</div>`}
          </div>
          <div class="card-actions reading-actions">
            <button class="btn" type="button" data-action="script-prev">\uC774\uC804</button>
            <button class="btn primary" type="button" data-action="script-speak">${isListening ? "\uD604\uC7AC \uBB38\uC7A5 \uB4E3\uAE30" : "\uBC1C\uC74C"}</button>
            <button class="btn" type="button" data-action="script-next">\uB2E4\uC74C</button>
          </div>
        </section>
        <section class="sentence-list sentence-list--legacy">
          ${sentences.map((sentence, index) => `
            <button class="sentence-row ${index === state.scriptIndex ? "active" : ""}" type="button" data-script-index="${index}">
              ${escapeHtml(sentence)}
            </button>
          `).join("")}
        </section>
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
            <button class="home-utility-button" type="button" data-route="search">[\uBAA9\uB85D]</button>
            <button class="home-utility-button" type="button" data-action="clear-saved" ${savedCount ? "" : "disabled"}>[\uBAA8\uB450\uD574\uC81C]</button>
          </div>
        </div>
      </section>
    </div>
  `, { home: true });
}

function renderCustomSelect() {
  const options = allStageOptions();
  const selected = new Set(state.customStageKeys);
  renderShell(`
    <div class="legacy-screen">
      <div class="home-nav-row">
        <button class="home-pill" type="button" data-route="custom">\u2190 \uB9DE\uCDA4</button>
      </div>
      <section class="legacy-title-card">
        <h2>\uC120\uD0DD</h2>
        <p>\uD559\uC2B5\uD560 \uB2E8\uC5B4 \uBB49\uCE58\uB97C \uACE0\uB985\uB2C8\uB2E4.</p>
      </section>
      <section class="section-card custom-select-panel">
        ${options.map((option) => `
          <button class="stage-button stage-button--day ${selected.has(option.key) ? "is-active" : ""}" type="button" data-custom-stage="${escapeHtml(option.key)}">
            <div class="stage-button__main">
              <div class="stage-button__title">${escapeHtml(option.track.title)} \u00B7 ${escapeHtml(option.stage.label || `Stage ${option.index + 1}`)}</div>
              <div class="stage-button__meta">${option.total}\uAC1C \u00B7 ${option.percent}% \uC644\uB8CC</div>
            </div>
          </button>
        `).join("")}
      </section>
      <button class="big-button big-button--accent big-button--single custom-start-button" type="button" data-action="custom-selected" ${selected.size ? "" : "disabled"}>
        <div class="big-button__title">\uC2DC\uC791</div>
        <div class="big-button__desc">${selected.size}\uAC1C \uBB49\uCE58 \uD559\uC2B5</div>
      </button>
    </div>
  `, { home: true });
}
function renderLoading() {
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
    state.revealed = true;
    render();
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
    const target = event.target.closest("button, [data-action='home']");
    if (!target) return;
    if (target.dataset.vocabKind) state.group = target.dataset.vocabKind;
    if (target.dataset.group) state.group = target.dataset.group;
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
    if (target.dataset.stageIndex) selectStage(Number(target.dataset.stageIndex));
    if (target.dataset.scriptIndex) {
      state.scriptIndex = Number(target.dataset.scriptIndex);
      state.scriptRevealed = false;
      render();
    }
    if (target.dataset.speakText) speak(target.dataset.speakText);

    const action = target.dataset.action;
    if (action === "custom-progress") startProgressStudy();
    if (action === "custom-saved") startSavedStudy();
    if (action === "custom-selected") startSelectedStudy();
    if (action === "clear-saved") clearSavedItems();
    if (target.dataset.customStage) toggleCustomStage(target.dataset.customStage);
    if (action === "reveal") {
      state.revealed = true;
      render();
    }
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
    if (action === "script-speak") speak(scriptSentences()[state.scriptIndex] || "");
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
      if (state.route === "study") state.revealed ? speak(currentItem()?.primary || "") : (state.revealed = true, render());
      if (state.route === "script") state.scriptRevealed ? speak(scriptSentences()[state.scriptIndex] || "") : (state.scriptRevealed = true, render());
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
