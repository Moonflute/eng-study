const APP_VERSION = "0.0.0";
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
  scriptIndex: 0,
  scriptRevealed: false,
  progress: loadProgress(),
  error: "",
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
  return { all: "\uC804\uCCB4", word: "\uB2E8\uC5B4", grammar: "\uBB38\uBC95", script: "\uBB38\uC7A5" }[group] || group;
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

function setRoute(route) {
  state.route = route;
  state.revealed = false;
  state.scriptRevealed = false;
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
  setRoute("study");
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
  const homeClass = options.home ? " topbar--home" : "";
  app.innerHTML = `
    <header class="topbar${homeClass}">
      <div class="brand" role="button" tabindex="0" data-action="home">
        <div class="brand-mark">E</div>
        <div class="brand-text">
          <h1 class="brand-title">English Study Lab</h1>
          <div class="brand-subtitle">\uB2E8\uC5B4 \u00B7 \uBB38\uBC95 \u00B7 \uBB38\uC7A5 \uD1B5\uD569 \uD559\uC2B5 v${APP_VERSION}</div>
        </div>
      </div>
      <nav class="top-actions" aria-label="\uC8FC\uC694 \uBA54\uB274">
        <button class="btn ghost" type="button" data-route="home">\uD648</button>
        <button class="btn ghost" type="button" data-route="library">\uB2E8\uC5B4</button>
        <button class="btn ghost" type="button" data-route="script">\uBB38\uC7A5</button>
        <button class="btn ghost" type="button" data-route="search">\uAC80\uC0C9</button>
      </nav>
    </header>
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
  const word = trackSummary("word");
  const grammar = trackSummary("grammar");
  const scriptCount = scriptSentences().length;
  const savedCount = savedQueueEntries().length;

  renderShell(`
    <div class="study-home-shell">
      <div class="home-nav-row">
        <button class="home-pill" type="button" data-action="home">\uD648</button>
        <button class="home-icon" type="button" data-route="custom" aria-label="\uD559\uC2B5 \uD604\uD669">\uD83D\uDCCA</button>
      </div>

      <div class="title-block title-block--home title-block--home-root">
        <h2>\uC601\uC5B4</h2>
      </div>

      <section class="lookup-home-card">
        <h3>\uB2E8\uC5B4 \uAC80\uC0C9</h3>
        <p>\uC601\uC5B4\uB098 \uB73B\uC73C\uB85C \uCC3E\uC544\uBCF4\uACE0 \uBC14\uB85C \uBD81\uB9C8\uD06C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p>
        <div class="lookup-inline-row">
          <input class="input" id="home-search-input" value="${escapeHtml(state.query)}" placeholder="ex. improve / \uAC1C\uC120\uD558\uB2E4" autocomplete="off" />
          <button class="home-utility-button" type="button" data-route="search">\uAC80\uC0C9</button>
        </div>
      </section>

      <section class="home-category-grid" aria-label="\uD559\uC2B5 \uC720\uD615">
        <button class="home-category-card" type="button" data-group="word" data-route="library">
          <span>\uB2E8\uC5B4</span>
          <small>${word.tracks.length}\uAC1C \uD2B8\uB799 鸚?${word.cards.toLocaleString()}\uAC1C</small>
        </button>
        <button class="home-category-card" type="button" data-group="grammar" data-route="library">
          <span>\uBB38\uBC95</span>
          <small>${grammar.tracks.length}\uAC1C \uD2B8\uB799</small>
        </button>
        <button class="home-category-card" type="button" data-route="script">
          <span>\uBB38\uC7A5</span>
          <small>${scriptCount}\uBB38\uC7A5 \uBC18\uBCF5</small>
        </button>
        <button class="home-category-card" type="button" data-route="script">
          <span>\uB4E3\uAE30</span>
          <small>TTS \uBB38\uC7A5 \uC7AC\uC0DD</small>
        </button>
        <button class="home-category-card" type="button" data-route="script">
          <span>\uB300\uBCF8</span>
          <small>\uC601\uC5B4 \uD14D\uC2A4\uD2B8 \uBD99\uC5EC\uB123\uAE30</small>
        </button>
        <button class="home-category-card home-category-card--accent" type="button" data-route="custom">
          <span>\uB9DE\uCDA4</span>
          <small>\uC9C4\uD589 鸚?\uC120\uD0DD 鸚?\uC800\uC7A5 ${savedCount.toLocaleString()}\uAC1C</small>
        </button>
      </section>

      <section class="script-home-block" aria-label="\uBB38\uC7A5 \uD559\uC2B5">
        <header class="library-header library-header--inline">
          <h3 class="library-title">Sentence study</h3>
        </header>
        <div class="legacy-home-menu">
          <button class="legacy-home-card" type="button" data-route="script">
            <span class="home-card__title">\uBB38\uC7A5</span>
            <span class="home-card__meta">\uBB38\uC7A5 \uB2E8\uC704 \uD559\uC2B5</span>
          </button>
          <button class="legacy-home-card" type="button" data-route="script">
            <span class="home-card__title">\uB4E3\uAE30</span>
            <span class="home-card__meta">\uC74C\uC131 \uAD6C\uAC04 \uBC18\uBCF5 \uD559\uC2B5</span>
          </button>
          <button class="legacy-home-card" type="button" data-route="script">
            <span class="home-card__title">\uC77D\uAE30</span>
            <span class="home-card__meta">\uBB38\uC7A5\uBCC4 \uC77D\uAE30 \uD559\uC2B5</span>
          </button>
          <button class="legacy-home-card" type="button" data-route="script">
            <span class="home-card__title">\uB300\uBCF8</span>
            <span class="home-card__meta">\uC601\uC0C1/\uC2A4\uD06C\uB9BD\uD2B8 \uBB38\uC7A5 \uD559\uC2B5</span>
          </button>
        </div>
      </section>
    </div>
  `, { home: true });
}
function renderTabs() {
  return `
    <div class="tabs" role="tablist" aria-label="\uD559\uC2B5 \uC885\uB958">
      ${["all", "word", "grammar"].map((group) => `
        <button class="tab" type="button" aria-selected="${state.group === group}" data-group="${group}">
          ${groupLabel(group)}
        </button>
      `).join("")}
      <button class="tab" type="button" aria-selected="${state.route === "script"}" data-route="script">\uBB38\uC7A5</button>
    </div>
  `;
}

function renderLibrarySection(group = state.group, limit = Infinity) {
  const tracks = state.tracks
    .filter((track) => group === "all" || normalizeGroup(track.group) === group)
    .slice(0, limit);

  return `
    <section class="section-card section-card--tracks">
      <div class="section-head">
        <div>
          <div class="eyebrow">${groupLabel(group)}</div>
          <h3>\uD559\uC2B5 \uD2B8\uB799</h3>
        </div>
        <button class="home-utility-button" type="button" data-route="library">\uC804\uCCB4 \uBCF4\uAE30</button>
      </div>
      ${tracks.length ? `
        <div class="track-grid">
          ${tracks.map(renderTrackCard).join("")}
        </div>
      ` : `<div class="empty">\uD45C\uC2DC\uD560 \uC601\uC5B4 \uD2B8\uB799\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>`}
    </section>
  `;
}

function renderTrackCard(track) {
  const percent = getTrackCompletion(track);
  const stages = track.stages?.length || Math.ceil(track.items.length / 25);
  return `
    <button class="type-button track-card" type="button" data-track-id="${escapeHtml(track.id)}">
      <div>
        <div class="type-button__title">${escapeHtml(track.title)}</div>
        <div class="type-button__meta">${escapeHtml(track.group)} \u00B7 ${track.total.toLocaleString()}\uAC1C \u00B7 ${stages} stages</div>
      </div>
      <div class="meter" aria-label="\uC644\uB8CC\uC728 ${percent}%"><span style="width:${percent}%"></span></div>
      <div class="type-button__meta">${percent}% \uC644\uB8CC</div>
    </button>
  `;
}

function renderLibrary() {
  renderShell(`
    <div class="title-block">
      <button class="back-button back-button--ghost" type="button" data-route="home">\uD648</button>
      <h2>${groupLabel(state.group)} \uD559\uC2B5</h2>
    </div>
    ${renderTabs()}
    ${renderLibrarySection(state.group)}
  `);
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
  const title = isQueue ? `${state.studyTitle || "Custom"} · ${escapeHtml(track.title)}` : escapeHtml(track.title);
  const eyebrow = isQueue ? `\uB9DE\uCDA4 \uD559\uC2B5 · ${items.length}\uAC1C` : `${escapeHtml(track.group)} \u00B7 ${escapeHtml(stage?.label || "All")}`;

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
  renderShell(`
    <section class="section-card">
      <div class="section-head">
        <div>
          <div class="eyebrow">Script Study</div>
          <h3>\uBB38\uC7A5 \uB2E8\uC704 \uD559\uC2B5</h3>
        </div>
        <div class="toolbar">
          <button class="btn" type="button" data-action="script-save">\uC800\uC7A5</button>
          <button class="btn primary" type="button" data-action="script-speak">\uD604\uC7AC \uBB38\uC7A5 \uB4E3\uAE30</button>
        </div>
      </div>
      <div class="script-grid">
        <div>
          <textarea class="textarea" id="script-text" spellcheck="false">${escapeHtml(state.scriptText)}</textarea>
          <div class="card-actions">
            <button class="btn" type="button" data-action="script-prev">\uC774\uC804</button>
            <button class="btn" type="button" data-action="script-next">\uB2E4\uC74C</button>
            <button class="btn accent" type="button" data-action="script-reset">\uC608\uBB38\uC73C\uB85C \uCD08\uAE30\uD654</button>
          </div>
        </div>
        <div class="study-panel">
          <div class="card-main">
            <div class="eyebrow">${Math.min(state.scriptIndex + 1, sentences.length || 1)} / ${sentences.length || 0}</div>
            ${current ? `
              <div class="prompt">${state.scriptRevealed ? escapeHtml(current) : "Listen first"}</div>
              ${state.scriptRevealed ? `<p class="example">${escapeHtml(current)}</p>` : `<button class="btn primary" type="button" data-action="script-reveal">\uBB38\uC7A5 \uBCF4\uAE30</button>`}
            ` : `<div class="empty">\uC601\uC5B4 \uBB38\uC7A5\uC744 \uBD99\uC5EC\uB123\uC73C\uBA74 \uC790\uB3D9\uC73C\uB85C \uBB38\uC7A5 \uCE74\uB4DC\uAC00 \uB9CC\uB4E4\uC5B4\uC9D1\uB2C8\uB2E4.</div>`}
          </div>
          <div class="sentence-list">
            ${sentences.map((sentence, index) => `
              <button class="sentence-row ${index === state.scriptIndex ? "active" : ""}" type="button" data-script-index="${index}">
                ${escapeHtml(sentence)}
              </button>
            `).join("")}
          </div>
        </div>
      </div>
    </section>
  `);
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
  `);
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
              <div class="stage-button__title">${escapeHtml(option.track.title)} 夷?${escapeHtml(option.stage.label || `Stage ${option.index + 1}`)}</div>
              <div class="stage-button__meta">${option.total}\uAC1C 夷?${option.percent}% \uC644\uB8CC</div>
            </div>
          </button>
        `).join("")}
      </section>
      <button class="big-button big-button--accent big-button--single custom-start-button" type="button" data-action="custom-selected" ${selected.size ? "" : "disabled"}>
        <div class="big-button__title">\uC2DC\uC791</div>
        <div class="big-button__desc">${selected.size}\uAC1C \uBB49\uCE58 \uD559\uC2B5</div>
      </button>
    </div>
  `);
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
  if (state.route === "library") return renderLibrary();
  if (state.route === "study") return renderStudy();
  if (state.route === "search") return renderSearch();
  if (state.route === "script") return renderScript();
  if (state.route === "custom") return renderCustomMenu();
  if (state.route === "custom-select") return renderCustomSelect();
  return renderHome();
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("button, [data-action='home']");
    if (!target) return;

    if (target.dataset.route) setRoute(target.dataset.route);
    if (target.dataset.action === "home") setRoute("home");
    if (target.dataset.group) {
      state.group = target.dataset.group;
      render();
    }
    if (target.dataset.trackId) selectTrack(target.dataset.trackId);
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
render();
loadData();
registerServiceWorker();
