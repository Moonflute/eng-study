const APP_VERSION = "1.0.0";
const STORAGE_KEY = "english-study-lab-progress-v1";
const SCRIPT_STORAGE_KEY = "english-study-lab-script-v1";
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
  if (group === "단어") return "word";
  if (group === "문법") return "grammar";
  return "other";
}

function groupLabel(group) {
  return { all: "전체", word: "단어", grammar: "문법", script: "문장" }[group] || group;
}

function currentTrack() {
  return state.tracks.find((track) => track.id === state.trackId) || state.tracks[0] || null;
}

function currentStage(track = currentTrack()) {
  if (!track) return null;
  return track.stages[state.stageIndex] || track.stages[0] || null;
}

function currentItems(track = currentTrack(), stage = currentStage(track)) {
  if (!track) return [];
  if (!stage) return track.items;
  return track.items.slice(stage.start, stage.end);
}

function currentItem() {
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

function renderShell(content) {
  app.innerHTML = `
    <header class="topbar">
      <div class="brand" role="button" tabindex="0" data-action="home">
        <div class="brand-mark">E</div>
        <div class="brand-text">
          <h1 class="brand-title">English Study Lab</h1>
          <div class="brand-subtitle">단어, 문법, 문장 학습 통합판 v${APP_VERSION}</div>
        </div>
      </div>
      <nav class="top-actions" aria-label="주요 메뉴">
        <button class="btn ghost" type="button" data-route="home">홈</button>
        <button class="btn ghost" type="button" data-route="library">라이브러리</button>
        <button class="btn ghost" type="button" data-route="script">문장</button>
        <button class="btn ghost" type="button" data-route="search">검색</button>
      </nav>
    </header>
    <main class="page">${content}</main>
  `;
}

function renderHome() {
  const stats = appStats();
  renderShell(`
    <section class="dashboard">
      <div class="hero">
        <div>
          <h2>영어 전용 학습 허브</h2>
          <p>단어 전용 앱의 반복 카드와, 문장 단위 학습 앱의 읽기·듣기 흐름을 하나로 합쳤습니다. TOEIC, TOEFL, 문법 트랙을 바로 고르고, 직접 넣은 영어 대본도 같은 방식으로 복습할 수 있습니다.</p>
        </div>
      </div>
      <aside class="quick-panel" aria-label="학습 현황">
        <div class="stats-grid">
          <div class="stat"><span>Tracks</span><strong>${stats.tracks}</strong></div>
          <div class="stat"><span>Cards</span><strong>${stats.cards.toLocaleString()}</strong></div>
          <div class="stat"><span>Saved</span><strong>${stats.saved.toLocaleString()}</strong></div>
          <div class="stat"><span>Checked</span><strong>${stats.checked.toLocaleString()}</strong></div>
        </div>
        <div class="card-actions">
          <button class="btn primary" type="button" data-route="library">학습 시작</button>
          <button class="btn" type="button" data-route="script">문장 붙여넣기</button>
        </div>
      </aside>
    </section>
    ${renderLibrarySection("all", 6)}
  `);
}

function renderTabs() {
  return `
    <div class="tabs" role="tablist" aria-label="학습 종류">
      ${["all", "word", "grammar"].map((group) => `
        <button class="tab" type="button" aria-selected="${state.group === group}" data-group="${group}">
          ${groupLabel(group)}
        </button>
      `).join("")}
      <button class="tab" type="button" aria-selected="${state.route === "script"}" data-route="script">문장</button>
    </div>
  `;
}

function renderLibrarySection(group = state.group, limit = Infinity) {
  const tracks = state.tracks
    .filter((track) => group === "all" || normalizeGroup(track.group) === group)
    .slice(0, limit);

  return `
    <section class="section">
      <div class="section-head">
        <div>
          <div class="eyebrow">${groupLabel(group)}</div>
          <h3>학습 트랙</h3>
        </div>
        <button class="btn ghost" type="button" data-route="library">전체 보기</button>
      </div>
      ${tracks.length ? `
        <div class="track-grid">
          ${tracks.map(renderTrackCard).join("")}
        </div>
      ` : `<div class="empty">표시할 영어 트랙이 없습니다.</div>`}
    </section>
  `;
}

function renderTrackCard(track) {
  const percent = getTrackCompletion(track);
  const stages = track.stages?.length || Math.ceil(track.items.length / 25);
  return `
    <button class="track-card" type="button" data-track-id="${escapeHtml(track.id)}">
      <div>
        <div class="eyebrow">${escapeHtml(track.group)} · ${stages} stages</div>
        <h4>${escapeHtml(track.title)}</h4>
      </div>
      <p>${track.total.toLocaleString()}개 카드 · ${track.mode === "meaning_check" ? "뜻 확인" : escapeHtml(track.mode || "study")}</p>
      <div>
        <div class="meter" aria-label="완료율 ${percent}%"><span style="width:${percent}%"></span></div>
        <p>${percent}% 완료</p>
      </div>
    </button>
  `;
}

function renderLibrary() {
  renderShell(`
    ${renderTabs()}
    ${renderLibrarySection(state.group)}
  `);
}

function renderStudy() {
  const track = currentTrack();
  if (!track) {
    renderShell(`<div class="empty">선택된 트랙이 없습니다.</div>`);
    return;
  }
  const stage = currentStage(track);
  const items = currentItems(track, stage);
  const item = currentItem();
  const progress = ensureTrackProgress(track.id);
  const itemNumber = Math.min(state.cardIndex + 1, items.length);
  const saved = item ? progress.saved.includes(item.id) : false;
  const checked = item ? progress.checked.includes(item.id) : false;

  renderShell(`
    <div class="study-layout">
      <aside class="sidebar" aria-label="스테이지">
        ${track.stages.map((entry, index) => `
          <button class="stage-chip ${index === state.stageIndex ? "active" : ""}" type="button" data-stage-index="${index}">
            ${escapeHtml(entry.label || `Stage ${index + 1}`)}
            <br><span>${escapeHtml(entry.range || `${entry.end - entry.start}개`)}</span>
          </button>
        `).join("")}
      </aside>
      <section class="study-panel">
        <div class="study-top">
          <div>
            <div class="eyebrow">${escapeHtml(track.group)} · ${escapeHtml(stage?.label || "All")}</div>
            <h2 class="study-title">${escapeHtml(track.title)}</h2>
          </div>
          <div class="toolbar">
            <button class="icon-btn" type="button" data-action="prev" aria-label="이전">‹</button>
            <button class="icon-btn" type="button" data-action="next" aria-label="다음">›</button>
          </div>
        </div>
        ${item ? renderStudyCard(item, itemNumber, items.length, saved, checked) : `<div class="empty">이 스테이지에 카드가 없습니다.</div>`}
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
        ` : `<button class="btn primary" type="button" data-action="reveal">뜻 보기</button>`}
      </div>
      <div class="card-actions">
        <button class="btn" type="button" data-action="speak">발음</button>
        <button class="btn ${saved ? "accent" : ""}" type="button" data-action="save">${saved ? "저장됨" : "저장"}</button>
        <button class="btn ${checked ? "primary" : ""}" type="button" data-action="check">${checked ? "체크됨" : "체크"}</button>
        <button class="btn" type="button" data-action="again">다시</button>
        <button class="btn primary" type="button" data-action="known">알았음</button>
      </div>
    </article>
  `;
}

function renderSearch() {
  const results = searchResults();
  renderShell(`
    <section class="section">
      <div class="section-head">
        <div>
          <div class="eyebrow">Lookup</div>
          <h3>영어 트랙 검색</h3>
        </div>
      </div>
      <div class="search-row">
        <input class="input" id="search-input" value="${escapeHtml(state.query)}" placeholder="단어, 뜻, 예문, 동의어 검색" autocomplete="off" />
        <button class="btn primary" type="button" data-action="search-focus">검색</button>
      </div>
      <div class="result-list">
        ${state.query.trim() ? results.map(({ track, item }) => `
          <div class="result">
            <div>
              <strong>${escapeHtml(item.primary)} <span class="eyebrow">${escapeHtml(track.title)}</span></strong>
              <div>${escapeHtml(item.meaning || "")}</div>
              ${item.exampleJa ? `<p>${escapeHtml(item.exampleJa)}</p>` : ""}
            </div>
            <button class="btn" type="button" data-speak-text="${escapeHtml(item.primary)}">발음</button>
          </div>
        `).join("") || `<div class="empty">검색 결과가 없습니다.</div>` : `<div class="empty">검색어를 입력하면 모든 영어 단어·문법 트랙에서 찾아줍니다.</div>`}
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
    <section class="section">
      <div class="section-head">
        <div>
          <div class="eyebrow">Script Study</div>
          <h3>문장 단위 학습</h3>
        </div>
        <div class="toolbar">
          <button class="btn" type="button" data-action="script-save">저장</button>
          <button class="btn primary" type="button" data-action="script-speak">현재 문장 듣기</button>
        </div>
      </div>
      <div class="script-grid">
        <div>
          <textarea class="textarea" id="script-text" spellcheck="false">${escapeHtml(state.scriptText)}</textarea>
          <div class="card-actions">
            <button class="btn" type="button" data-action="script-prev">이전</button>
            <button class="btn" type="button" data-action="script-next">다음</button>
            <button class="btn accent" type="button" data-action="script-reset">예문으로 초기화</button>
          </div>
        </div>
        <div class="study-panel">
          <div class="card-main">
            <div class="eyebrow">${Math.min(state.scriptIndex + 1, sentences.length || 1)} / ${sentences.length || 0}</div>
            ${current ? `
              <div class="prompt">${state.scriptRevealed ? escapeHtml(current) : "Listen first"}</div>
              ${state.scriptRevealed ? `<p class="example">${escapeHtml(current)}</p>` : `<button class="btn primary" type="button" data-action="script-reveal">문장 보기</button>`}
            ` : `<div class="empty">영어 문장을 붙여넣으면 자동으로 문장 카드가 만들어집니다.</div>`}
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

function renderLoading() {
  renderShell(`<div class="empty">영어 데이터를 불러오는 중입니다.</div>`);
}

function renderError() {
  renderShell(`<div class="error">${escapeHtml(state.error || "데이터를 불러오지 못했습니다.")}</div>`);
}

function render() {
  if (state.error) return renderError();
  if (!state.data) return renderLoading();
  if (state.route === "library") return renderLibrary();
  if (state.route === "study") return renderStudy();
  if (state.route === "search") return renderSearch();
  if (state.route === "script") return renderScript();
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
    state.error = `영어 데이터 로드 실패: ${error.message}`;
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
