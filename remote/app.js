/* ===== Skycroft Ticker — Controle remoto (lógica) =====
 * Reflete o estado do servidor via SSE e envia comandos por POST /api/control. */

let SNAP = null; // último snapshot do servidor

const $ = (s) => document.querySelector(s);
const leagueLogo = (ab) => `https://a.espncdn.com/i/teamlogos/leagues/500/${ab.toLowerCase()}.png`;
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

/* ---- envio de comandos ---- */
async function sendControl(patch) {
  try {
    const r = await fetch("/api/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (r.ok) SNAP = await r.json(), render();
  } catch { toast("Sem conexão com o dispositivo"); }
}
async function refresh() {
  toast("Atualizando…");
  try { await fetch("/api/refresh", { method: "POST" }); } catch { toast("Sem conexão"); }
}

/* ---- aparência ---- */
const DEFAULT_UI = { theme: "midnight", density: "comfortable", font: "system", fontScale: 1, detail: "rich", listCount: 4, showTicker: true, showClock: true, sidePos: "right" };
const THEMES = [
  { id: "midnight", name: "Meia-noite", c: ["#0a1430", "#35d07f", "#4aa3ff"] },
  { id: "gridiron", name: "Gridiron", c: ["#0a1430", "#edc256", "#ff4b4b"] },
  { id: "hardwood", name: "Hardwood", c: ["#231708", "#ff8a1e", "#fff2df"] },
  { id: "arena", name: "Arena", c: ["#000000", "#ffb000", "#ff5a2a"] },
  { id: "broadcast", name: "Broadcast", c: ["#e9eef6", "#17935c", "#0d1830"] },
  { id: "stars", name: "Stars", c: ["#0e2150", "#e23b53", "#4aa3ff"] },
];
const LEAGUE_LOGO_MAP = {
  NFL: "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png",
  NBA: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
  MLB: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
  NHL: "https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png",
};
function ui() { return { ...DEFAULT_UI, ...((control() && control().ui) || {}) }; }
function sendUi(patch) { sendControl({ ui: patch }); }

/* ---- helpers de dados ---- */
function control() { return (SNAP && SNAP.control) || { mode: "auto", fixedEventId: null, enabledLeagues: ["NFL", "NBA"], favorites: [], ui: { ...DEFAULT_UI } }; }
function catalog() { return (SNAP && SNAP.catalog) || [{ id: "NFL", name: "NFL" }, { id: "NBA", name: "NBA" }]; }
function favList() { const c = control(); return c.favorites && c.favorites.length ? c.favorites : (SNAP && SNAP.favorites) || []; }
function isFav(ab) { return favList().includes(ab); }
function teamByAbbr(ab) {
  for (const lg of (SNAP && SNAP.leagues) || [])
    for (const e of lg.events)
      for (const t of [e.home, e.away]) if (t.abbr === ab) return { ...t, league: lg.abbrev };
  return null;
}
function allGames() {
  const out = [];
  for (const lg of (SNAP && SNAP.leagues) || [])
    for (const e of lg.events) out.push({ ...e, league: lg.abbrev, leagueName: lg.name });
  return out;
}

/* ---- render ---- */
function render() {
  if (!SNAP) return;
  const c = control();

  // modo
  document.querySelectorAll("#mode-seg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === c.mode));
  const pinned = c.mode === "fixed" && c.fixedEventId ? allGames().find((g) => g.id === c.fixedEventId) : null;
  $("#mode-hint").textContent = c.mode === "fixed" ? "fixo" : "ao vivo tem prioridade";
  $("#mode-note").textContent = pinned
    ? `Fixado: ${pinned.away.abbr} × ${pinned.home.abbr} (${pinned.league}).`
    : c.mode === "fixed"
    ? "Fixo, mas nenhum jogo selecionado — escolha abaixo."
    : "No automático, jogos ao vivo têm prioridade no exibidor.";

  // ligas (dinâmicas, do catálogo do servidor)
  renderLeagues(c);
  // aparência
  renderThemes();
  renderAppearance();

  // favoritos
  const favs = $("#favs");
  favs.innerHTML = "";
  favList().forEach((ab) => {
    const t = teamByAbbr(ab);
    const d = document.createElement("div");
    d.className = "fav";
    d.innerHTML =
      `<span class="star">★</span>` +
      (t && t.logo ? `<img src="${t.logo}" alt="" onerror="this.remove()">` : "") +
      `<span>${ab}</span><button class="rm" aria-label="Remover ${ab}">×</button>`;
    d.querySelector(".rm").onclick = () => sendControl({ favorites: favList().filter((x) => x !== ab) });
    favs.appendChild(d);
  });

  // jogos agrupados por liga
  const box = $("#games");
  const games = allGames();
  if (!games.length) { box.innerHTML = `<div class="empty">Nenhum jogo encontrado.</div>`; }
  else {
    box.innerHTML = "";
    for (const lg of (SNAP.leagues || [])) {
      if (!lg.events.length) continue;
      const head = document.createElement("div");
      head.className = "lg-head";
      head.innerHTML = `<img src="${leagueLogo(lg.abbrev)}" alt="" onerror="this.remove()">${lg.name}`;
      box.appendChild(head);
      // ao vivo primeiro, depois agendado, depois encerrado
      const rank = (e) => (e.state === "in" ? 0 : e.state === "pre" ? 1 : 2);
      [...lg.events].sort((a, b) => rank(a) - rank(b)).forEach((e) => box.appendChild(gameEl(e, lg)));
    }
  }

  // rodapé
  const ts = SNAP.updatedAt ? new Date(SNAP.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
  $("#foot").textContent = "Atualizado " + ts + (SNAP.error ? " · erro ESPN" : "");
}

function teamRow(t) {
  const crest = t.logo ? `<img src="${t.logo}" alt="" onerror="this.remove()">` : "";
  const star = isFav(t.abbr) ? ` <span class="st">★</span>` : "";
  return `<div class="row">${crest}<span class="nm">${t.abbr}${star}</span><span class="sc">${t.score}</span></div>`;
}
function gameEl(e, lg) {
  const c = control();
  const fixed = c.mode === "fixed" && c.fixedEventId === e.id;
  const badge = e.state === "in" ? `<span class="badge in">● ${e.status || "AO VIVO"}</span>`
    : e.state === "post" ? `<span class="badge post">${e.status || "Final"}</span>`
    : `<span class="badge pre">${shortWhen(e.starts) || e.status || "Agendado"}</span>`;
  const b = document.createElement("button");
  b.className = "game" + (fixed ? " fixed" : "");
  b.innerHTML = `<div class="rows">${teamRow(e.away)}${teamRow(e.home)}</div>
    <div class="meta">${badge}${fixed ? '<span class="pin">no mostrador</span>' : ""}</div>`;
  b.onclick = () => {
    if (fixed) { sendControl({ mode: "auto" }); toast("Voltou ao automático"); }
    else { sendControl({ fixedEventId: e.id }); toast(`Fixado: ${e.away.abbr} × ${e.home.abbr}`); }
  };
  return b;
}
function shortWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso); if (isNaN(d)) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const t = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? t : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + t;
}

/* ---- ligas (dinâmicas) ---- */
function renderLeagues(c) {
  const box = $("#league-chips");
  const enabled = new Set(c.enabledLeagues || []);
  box.innerHTML = "";
  catalog().forEach((lg) => {
    const b = document.createElement("button");
    b.className = "chip" + (enabled.has(lg.id) ? " on" : "");
    const logo = LEAGUE_LOGO_MAP[lg.id];
    b.innerHTML = (logo ? `<img src="${logo}" alt="" onerror="this.remove()">` : "") + esc(lg.name);
    b.onclick = () => toggleLeague(lg.id);
    box.appendChild(b);
  });
}
function toggleLeague(id) {
  const cur = new Set(control().enabledLeagues || []);
  cur.has(id) ? cur.delete(id) : cur.add(id);
  const next = [...cur];
  if (!next.length) return toast("Mantenha ao menos uma liga");
  sendControl({ enabledLeagues: next });
}

/* ---- temas ---- */
function renderThemes() {
  const box = $("#themes");
  const cur = ui().theme;
  if (box.childElementCount !== THEMES.length) {
    box.innerHTML = "";
    THEMES.forEach((t) => {
      const b = document.createElement("button");
      b.className = "sw"; b.dataset.theme = t.id;
      b.innerHTML = `<span class="prev" style="background:${t.c[0]}"><i style="background:${t.c[0]}"></i><i style="background:${t.c[1]}"></i><i style="background:${t.c[2]}"></i></span><span class="nm">${t.name}</span>`;
      b.onclick = () => sendUi({ theme: t.id });
      box.appendChild(b);
    });
  }
  box.querySelectorAll(".sw").forEach((b) => b.classList.toggle("on", b.dataset.theme === cur));
}

/* ---- reflete estado dos controles de aparência ---- */
function renderAppearance() {
  const u = ui();
  segOn("#font-seg", "font", u.font);
  segOn("#density-seg", "density", u.density);
  segOn("#detail-seg", "detail", u.detail);
  const scale = $("#scale"); if (document.activeElement !== scale) scale.value = u.fontScale;
  $("#scale-val").textContent = Math.round(u.fontScale * 100) + "%";
  const count = $("#count"); if (document.activeElement !== count) count.value = u.listCount;
  $("#count-val").textContent = u.listCount;
  $("#sw-ticker").checked = u.showTicker !== false;
  $("#sw-clock").checked = u.showClock !== false;
  $("#sw-side").checked = u.sidePos === "left";
}
function segOn(sel, key, val) {
  document.querySelectorAll(`${sel} button`).forEach((b) => b.classList.toggle("on", b.dataset[key] === val));
}

/* ---- toast ---- */
let toastT = null;
function toast(msg) {
  let el = $("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), 1900);
}

/* ---- conexão ---- */
function setConn(state) {
  const c = $("#conn"); c.className = "conn " + state;
  $("#conn-text").textContent = state === "live" ? "ao vivo" : state === "off" ? "offline" : "conectando…";
}
function connect() {
  const es = new EventSource("/api/stream");
  es.addEventListener("state", (ev) => {
    try { SNAP = JSON.parse(ev.data); setConn("live"); render(); } catch {}
  });
  es.onopen = () => setConn("live");
  es.onerror = () => setConn("off"); // EventSource reconecta sozinho
}

/* ---- eventos de UI ---- */
document.querySelectorAll("#mode-seg button").forEach((b) => {
  b.onclick = () => {
    if (b.dataset.mode === "auto") sendControl({ mode: "auto" });
    else sendControl({ mode: "fixed" }); // fixo sem evento: pede escolher na lista
  };
});
// aparência: segmentados
$("#font-seg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) sendUi({ font: b.dataset.font }); });
$("#density-seg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) sendUi({ density: b.dataset.density }); });
$("#detail-seg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) sendUi({ detail: b.dataset.detail }); });
// sliders: atualiza o rótulo ao arrastar, envia ao soltar
$("#scale").addEventListener("input", (e) => { $("#scale-val").textContent = Math.round(e.target.value * 100) + "%"; });
$("#scale").addEventListener("change", (e) => sendUi({ fontScale: parseFloat(e.target.value) }));
$("#count").addEventListener("input", (e) => { $("#count-val").textContent = e.target.value; });
$("#count").addEventListener("change", (e) => sendUi({ listCount: parseInt(e.target.value, 10) }));
// switches
$("#sw-ticker").addEventListener("change", (e) => sendUi({ showTicker: e.target.checked }));
$("#sw-clock").addEventListener("change", (e) => sendUi({ showClock: e.target.checked }));
$("#sw-side").addEventListener("change", (e) => sendUi({ sidePos: e.target.checked ? "left" : "right" }));
$("#fav-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const v = $("#fav-input").value.toUpperCase().trim();
  if (!v) return;
  if (isFav(v)) { toast(v + " já é favorito"); $("#fav-input").value = ""; return; }
  sendControl({ favorites: [...favList(), v] });
  $("#fav-input").value = "";
});
$("#refresh").onclick = refresh;

/* ---- boot ---- */
fetch("/api/state", { cache: "no-store" })
  .then((r) => r.json())
  .then((s) => { SNAP = s; setConn("live"); render(); })
  .catch(() => setConn("off"));
connect();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/remote/sw.js").catch(() => {});
}
