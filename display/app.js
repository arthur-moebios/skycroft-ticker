/* ===== Skycroft Ticker — TV view (lógica) =====
 * Modo AO VIVO: conecta no servidor do dispositivo (/api/state + SSE /api/stream)
 *   e obedece o controle remoto (favoritos, mostrador fixo, ligas).
 * Modo STANDALONE: sem servidor (preview por arquivo), usa window.MOCK_DATA e
 *   simula placares. */

let DATA = window.MOCK_DATA || { updatedAt: 0, favorites: ["NE", "BOS"], leagues: [] };
let CONTROL = {
  favorites: DATA.favorites || ["NE", "BOS"],
  mode: "auto",
  fixedEventId: null,
  enabledLeagues: ["NFL", "NBA"],
  ui: {
    theme: "midnight", density: "comfortable", font: "system", fontScale: 1,
    detail: "rich", listCount: 4, showTicker: true, showClock: true, sidePos: "right",
  },
};
let LIVE = false; // true quando conectado ao servidor do dispositivo
let NET = { mode: "online" }; // estado de rede (setup/online)

const LEAGUE_LOGO = {
  NFL: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png",
  NBA: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
  MLB: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
  NHL: "https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png",
};
function leagueLogo(abbrev) {
  const u = LEAGUE_LOGO[abbrev];
  return u ? `<img class="llogo" src="${u}" alt="${abbrev}" onerror="this.remove()">` : "";
}

function favSet() {
  return new Set((CONTROL.favorites && CONTROL.favorites.length ? CONTROL.favorites : DATA.favorites) || []);
}
const isFavTeam = (abbr) => favSet().has(abbr);
const isFavEvent = (e) => isFavTeam(e.home.abbr) || isFavTeam(e.away.abbr);

// Achata os eventos com a info da liga, respeitando as ligas habilitadas no controle.
function allEvents() {
  const enabled = new Set(CONTROL.enabledLeagues || ["NFL", "NBA"]);
  const out = [];
  for (const lg of DATA.leagues || []) {
    if (!enabled.has(lg.abbrev)) continue;
    for (const ev of lg.events) out.push({ ...ev, league: lg.abbrev, leagueName: lg.name });
  }
  return out;
}

// Ordena: ao vivo > agendado > encerrado; dentro de cada grupo, favoritos primeiro.
function prioritized() {
  const rank = (e) => (e.state === "in" ? 0 : e.state === "pre" ? 1 : 2);
  return allEvents().sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (isFavEvent(a) ? 0 : 1) - (isFavEvent(b) ? 0 : 1);
  });
}
const liveEvents = () => allEvents().filter((e) => e.state === "in");

/* ---- Escala o palco 1920x1080 para caber na janela (kiosk em qualquer tela) ---- */
function scaleStage() {
  const s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  document.getElementById("stage").style.transform = `translate(-50%, -50%) scale(${s})`;
}
window.addEventListener("resize", scaleStage);

/* ---- Relógio ---- */
function updateClock() {
  const now = new Date();
  document.querySelector(".clock .time").textContent =
    now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  document.querySelector(".clock .date").textContent =
    now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

/* ---- Rótulos de status ---- */
function favMark(abbr) { return isFavTeam(abbr) ? "★ " : ""; }
function statusText(ev) {
  if (ev.state === "in") return "AO VIVO · " + ev.status;
  if (ev.state === "post") return ev.status || "ENCERRADO";
  return ev.status || "EM BREVE";
}

/* ---- Card em destaque (rotaciona entre os jogos priorizados) ---- */
let featIdx = 0;

// Formata horário de início: "sáb 15/11 · 22:00"
function formatStart(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return (
    d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }) +
    " · " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

// Destaque FIXO nos favoritos: para cada favorito, pega jogo ao vivo > próximo > mais recente.
function favGames() {
  const evs = allEvents();
  const out = [];
  for (const ab of (CONTROL.favorites && CONTROL.favorites.length ? CONTROL.favorites : DATA.favorites) || []) {
    const mine = evs.filter((e) => e.home.abbr === ab || e.away.abbr === ab);
    if (!mine.length) continue;
    const live = mine.find((e) => e.state === "in");
    const nextUp = mine
      .filter((e) => e.state === "pre")
      .sort((a, b) => new Date(a.starts || 0) - new Date(b.starts || 0))[0];
    const recent = mine
      .filter((e) => e.state === "post")
      .sort((a, b) => new Date(b.starts || 0) - new Date(a.starts || 0))[0];
    out.push(live || nextUp || recent || mine[0]);
  }
  return out;
}

// Exibidor principal:
//  - Se o controle fixou um evento (mode=fixed), ele manda.
//  - Senão: AO VIVO tem prioridade (favoritos ao vivo > outros ao vivo),
//    depois o próximo jogo dos favoritos; por fim o geral priorizado.
function featPool() {
  if (CONTROL.mode === "fixed" && CONTROL.fixedEventId) {
    const pinned = allEvents().find((e) => e.id === CONTROL.fixedEventId);
    if (pinned) return [pinned];
  }
  const evs = allEvents();
  const favLive = evs.filter((e) => e.state === "in" && isFavEvent(e));
  const otherLive = evs.filter((e) => e.state === "in" && !isFavEvent(e));
  const favNext = favGames().filter((e) => e.state !== "in");
  const seen = new Set();
  const pool = [];
  for (const e of [...favLive, ...otherLive, ...favNext]) {
    if (!seen.has(e.id)) { seen.add(e.id); pool.push(e); }
  }
  return pool.length ? pool.slice(0, 6) : prioritized().slice(0, 6);
}
function renderFeatured() {
  const pool = featPool();
  const el = document.querySelector(".featured");
  if (!pool.length) { el.classList.add("empty"); return; }
  el.classList.remove("empty");
  featIdx = featIdx % pool.length;
  const ev = pool[featIdx];
  el.querySelector(".league-badge").innerHTML = leagueLogo(ev.league) + `<span>${ev.leagueName}</span>`;
  const pill = el.querySelector(".status-pill");
  pill.className = "status-pill " + ev.state;
  if (ev.state === "in") pill.innerHTML = '<span class="dot"></span>AO VIVO · ' + ev.status;
  else if (ev.state === "pre") pill.innerHTML = "PRÓXIMO JOGO · " + (formatStart(ev.starts) || ev.status);
  else pill.innerHTML = ev.status || "ENCERRADO";

  const rows = el.querySelectorAll(".team-row");
  fillTeamRow(rows[0], ev.away);
  fillTeamRow(rows[1], ev.home);
}
function fillTeamRow(row, team) {
  applyCrest(row.querySelector(".crest"), team);
  row.querySelector(".team-name").textContent = favMark(team.abbr) + team.name;
  row.querySelector(".team-sub").textContent = team.abbr;
  row.querySelector(".score").textContent = team.score;
}

/* Logo real do time (com fallback pra sigla + cor) */
function applyCrest(el, team) {
  const ab = team.abbr.slice(0, 3);
  if (team.logo) {
    el.classList.add("has-logo");
    el.style.background = "rgba(255,255,255,.05)";
    el.innerHTML = `<img class="logo" src="${team.logo}" alt="${ab}" onerror="logoFail(this,'${ab}','${team.color}')">`;
  } else {
    el.classList.remove("has-logo");
    el.style.background = team.color;
    el.textContent = ab;
  }
}
window.logoFail = function (img, ab, color) {
  const el = img.parentElement;
  el.classList.remove("has-logo");
  el.style.background = color;
  el.textContent = ab;
};

/* ---- Lista lateral: próximos / ao vivo ---- */
function renderSide() {
  const pool = featPool();
  const featured = pool[featIdx % pool.length];
  const n = CONTROL.ui && CONTROL.ui.listCount != null ? CONTROL.ui.listCount : 4;
  const rest = prioritized().filter((e) => !featured || e.id !== featured.id).slice(0, n);
  document.querySelector(".side-title").textContent =
    liveEvents().length ? "Ao vivo & a seguir" : "Próximos jogos";
  const list = document.querySelector(".mini-list");
  list.innerHTML = "";
  rest.forEach((ev) => {
    const d = document.createElement("div");
    d.className = "mini";
    const cls = ev.state === "in" ? "in" : ev.state === "post" ? "post" : "pre";
    d.innerHTML = `
      <div class="mini-top">
        <span class="mini-league">${leagueLogo(ev.league)}${ev.league}</span>
        <span class="mini-status ${cls}">${ev.state === "in" ? "● " : ""}${statusText(ev)}</span>
      </div>
      ${miniTeam(ev.away)}${miniTeam(ev.home)}`;
    list.appendChild(d);
  });
}
function miniTeam(t) {
  const ab = t.abbr.slice(0, 3);
  const crest = t.logo
    ? `<span class="mini-crest has-logo"><img class="logo" src="${t.logo}" alt="${ab}" onerror="logoFail(this,'${ab}','${t.color}')"></span>`
    : `<span class="mini-crest" style="background:${t.color}">${ab}</span>`;
  return `<div class="mini-team">
      ${crest}
      <span class="mini-name">${favMark(t.abbr)}${t.name}</span>
      <span class="mini-score">${t.score}</span>
    </div>`;
}

/* ---- Faixa rolando (ticker) — duplica o conteúdo p/ loop sem emenda ---- */
function renderTicker() {
  const items = prioritized().map(tkItem).join("");
  document.querySelector(".ticker-track").innerHTML = items + items;
}
function tkItem(ev) {
  const st = ev.state === "in" ? "in" : ev.state === "post" ? "post" : "pre";
  const shortStatus = ev.state === "in" ? ev.status : ev.state === "post" ? "Final" : ev.status;
  return `<span class="tk-item">
      <span class="tk-league">${leagueLogo(ev.league)}${ev.league}</span>
      ${tkLogo(ev.away)}
      <span class="tk-team">${favMark(ev.away.abbr)}${ev.away.abbr}</span>
      <span class="tk-score">${ev.away.score}</span>
      <span class="tk-status">×</span>
      <span class="tk-score">${ev.home.score}</span>
      <span class="tk-team">${ev.home.abbr}${isFavTeam(ev.home.abbr) ? " ★" : ""}</span>
      ${tkLogo(ev.home)}
      <span class="tk-status ${st}">${shortStatus}</span>
    </span>`;
}
function tkLogo(t) {
  return t.logo
    ? `<img class="tk-logo" src="${t.logo}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'tk-abbr-color',style:'background:${t.color}'}))">`
    : `<span class="tk-abbr-color" style="background:${t.color}"></span>`;
}

/* ---- Aplica a customização visual (tema, fonte, densidade, escala...) ---- */
function applyUi() {
  const u = CONTROL.ui || {};
  const st = document.getElementById("stage");
  if (!st) return;
  st.dataset.theme = u.theme || "midnight";
  st.dataset.density = u.density || "comfortable";
  st.dataset.font = u.font || "system";
  st.dataset.detail = u.detail || "rich";
  st.dataset.side = u.sidePos || "right";
  st.dataset.ticker = u.showTicker === false ? "off" : "on";
  st.dataset.clock = u.showClock === false ? "off" : "on";
  st.style.setProperty("--ui-scale", String(u.fontScale || 1));
}

function renderAll() {
  applyUi();
  renderFeatured();
  renderSide();
  renderTicker();
}

/* ---- Simula updates ao vivo (SÓ no modo standalone, sem servidor) ---- */
function simulateLive() {
  if (LIVE) return;
  const live = liveEvents();
  if (!live.length) return;
  const ev = live[Math.floor(Math.random() * live.length)];
  const side = Math.random() < 0.5 ? "away" : "home";
  ev[side].score += ev.league === "NBA" ? 2 : ev.league === "NFL" ? 7 : 1;

  const pool = featPool();
  const feat = pool[featIdx % pool.length];
  if (feat && feat.id === ev.id) {
    renderFeatured();
    const row = document.querySelectorAll(".team-row")[side === "away" ? 0 : 1];
    const sc = row.querySelector(".score");
    sc.classList.remove("flash"); void sc.offsetWidth; sc.classList.add("flash");
  }
  renderSide();
  renderTicker();
}

/* ---- Conexão ao vivo com o servidor do dispositivo ---- */
function applySnapshot(snap) {
  if (!snap) return;
  DATA = { updatedAt: snap.updatedAt, favorites: snap.favorites, leagues: snap.leagues || [] };
  if (snap.control) CONTROL = { ...CONTROL, ...snap.control };
  if (snap.net) NET = snap.net;
  renderNet();
  renderAll();
}

/* ---- Tela de configuração (modo setup: aparelho sem WiFi) ---- */
let lastQrKey = "";
function renderNet() {
  const screen = document.getElementById("setup-screen");
  if (!screen) return;
  if (!NET || NET.mode !== "setup") { screen.hidden = true; lastQrKey = ""; return; }
  screen.hidden = false;
  const apSsid = NET.apSsid || "Skycroft-Setup";
  const apPass = NET.apPass || "";
  document.getElementById("setup-ssid").textContent = apSsid;
  document.getElementById("setup-url").textContent = NET.setupUrl || "http://10.42.0.1:8099/setup";
  // Payload WiFi padrão (iOS/Android entram na rede ao escanear)
  const payload = apPass
    ? `WIFI:T:WPA;S:${apSsid};P:${apPass};;`
    : `WIFI:T:nopass;S:${apSsid};;`;
  if (payload === lastQrKey) return; // evita recriar o QR a cada broadcast
  lastQrKey = payload;
  const box = document.getElementById("setup-qr");
  try {
    const qr = qrcode(0, "M");
    qr.addData(payload);
    qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, scalable: true });
  } catch (e) {
    box.textContent = apSsid;
  }
}
function connectLive() {
  return fetch("/api/state", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("sem servidor"))))
    .then((snap) => {
      LIVE = true;
      applySnapshot(snap);
      const es = new EventSource("/api/stream");
      es.addEventListener("state", (ev) => {
        try { applySnapshot(JSON.parse(ev.data)); } catch {}
      });
      es.onerror = () => { /* o próprio EventSource reconecta */ };
      return true;
    })
    .catch(() => false);
}

/* ---- Boot ---- */
async function boot() {
  scaleStage();
  updateClock();
  renderAll();
  setInterval(updateClock, 1000);
  // alterna o card em destaque; no modo fixo o pool tem 1 item, então não troca.
  setInterval(() => { featIdx++; renderFeatured(); renderSide(); }, 8000);

  const ok = await connectLive();
  if (!ok) {
    // standalone: anima placares localmente p/ a demo
    setInterval(simulateLive, 3500);
  }
}
document.addEventListener("DOMContentLoaded", boot);
