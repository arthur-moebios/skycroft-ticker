/* ===== Skycroft Ticker — servidor do dispositivo =====
 * - Coleta NFL/NBA da ESPN (cache + cadência ao vivo 30s / senão 120s)
 * - Empurra atualizações ao vivo p/ a TV e o controle via SSE (sem libs)
 * - Guarda o estado de controle (favoritos, mostrador fixo, ligas) em disco
 * - Serve o display (TV) em /  e o controle remoto PWA em /remote
 *
 * Node >= 18 (fetch nativo). Zero dependências externas.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { fetchLeagues, hasLive, catalogMeta, BY_ID } = require("./espn");
const net = require("./net");

// Presets de tema e opções de UI aceitas (validação do /api/control).
const THEME_IDS = ["midnight", "gridiron", "hardwood", "arena", "broadcast", "stars"];
const DENSITIES = ["compact", "comfortable", "spacious"];
const FONTS = ["system", "condensed", "sport"];
const DETAILS = ["score", "rich"];
const SIDES = ["left", "right"];

const PORT = process.env.PORT || 8099;
const ROOT = path.join(__dirname, "..");
const DISPLAY_DIR = path.join(ROOT, "display");
const REMOTE_DIR = path.join(ROOT, "remote");
const SETUP_DIR = path.join(ROOT, "setup");
const STATE_FILE = path.join(__dirname, "control-state.json");

const LIVE_MS = 30_000;   // há jogo ao vivo
const IDLE_MS = 120_000;  // nenhum jogo ao vivo

/* ---------- estado ---------- */
const defaultUi = {
  theme: "midnight",        // preset de cor/modo (ver THEME_IDS)
  density: "comfortable",   // compact | comfortable | spacious (tamanho dos cards)
  font: "system",           // system | condensed | sport
  fontScale: 1,             // 0.8 .. 1.4 (escala global do texto)
  detail: "rich",           // score (só placar) | rich (mais detalhes)
  listCount: 4,             // quantos jogos na lista lateral (0..6)
  showTicker: true,         // mostra a faixa rolante
  showClock: true,          // mostra o relógio
  sidePos: "right",         // lado da lista: right | left
};
const defaultControl = {
  favorites: ["NE", "BOS"], // Patriots + Celtics
  mode: "auto",             // "auto" (ao vivo tem prioridade) | "fixed" (evento fixado)
  fixedEventId: null,
  enabledLeagues: ["NFL", "NBA"],
  ui: { ...defaultUi },
};

let control = loadControl();
let leagues = [];      // dados ESPN mais recentes
let updatedAt = 0;
let lastError = null;

function loadControl() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return { ...defaultControl, ...raw, ui: { ...defaultUi, ...(raw.ui || {}) } };
  } catch {
    return { ...defaultControl, ui: { ...defaultUi } };
  }
}
function saveControl() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(control, null, 2));
  } catch (e) {
    console.error("[state] não salvou:", e.message);
  }
}

function snapshot() {
  return { updatedAt, favorites: control.favorites, control, leagues, catalog: catalogMeta(), error: lastError, net: net.readNet() };
}

/* ---------- SSE (push p/ TV e controle) ---------- */
const clients = new Set();
function broadcast() {
  const payload = `event: state\ndata: ${JSON.stringify(snapshot())}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { /* ignora socket morto */ }
  }
}

/* ---------- coleta ESPN ---------- */
let pollTimer = null;
async function poll() {
  try {
    leagues = await fetchLeagues(control.enabledLeagues);
    updatedAt = Date.now();
    lastError = null;
  } catch (e) {
    lastError = e.message;
    console.error("[poll]", e.message);
  }
  broadcast();
  const next = hasLive(leagues) ? LIVE_MS : IDLE_MS;
  clearTimeout(pollTimer);
  pollTimer = setTimeout(poll, next);
}

/* ---------- estáticos ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("404"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(buf);
  });
}
// Impede path traversal e resolve dentro de um diretório base.
function safeJoin(base, rel) {
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base) ? p : null;
}

function sendJSON(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

/* ---------- control: aplica e valida um patch do PWA ---------- */
function applyControl(patch) {
  if (patch.mode === "auto" || patch.mode === "fixed") control.mode = patch.mode;
  if ("fixedEventId" in patch) control.fixedEventId = patch.fixedEventId || null;
  if (Array.isArray(patch.favorites)) {
    control.favorites = patch.favorites
      .map((s) => String(s).toUpperCase().trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  let leaguesChanged = false;
  if (Array.isArray(patch.enabledLeagues)) {
    const next = patch.enabledLeagues.map((s) => String(s).toUpperCase()).filter((s) => BY_ID[s]);
    const value = next.length ? [...new Set(next)] : ["NFL", "NBA"];
    if (value.join(",") !== (control.enabledLeagues || []).join(",")) leaguesChanged = true;
    control.enabledLeagues = value;
  }
  // Customização visual (tema, fonte, densidade, detalhe, etc.)
  if (patch.ui && typeof patch.ui === "object") {
    const u = patch.ui;
    const cur = control.ui || { ...defaultUi };
    if (THEME_IDS.includes(u.theme)) cur.theme = u.theme;
    if (DENSITIES.includes(u.density)) cur.density = u.density;
    if (FONTS.includes(u.font)) cur.font = u.font;
    if (DETAILS.includes(u.detail)) cur.detail = u.detail;
    if (SIDES.includes(u.sidePos)) cur.sidePos = u.sidePos;
    if (typeof u.fontScale === "number") cur.fontScale = Math.min(1.4, Math.max(0.8, u.fontScale));
    if (typeof u.listCount === "number") cur.listCount = Math.min(6, Math.max(0, Math.round(u.listCount)));
    if (typeof u.showTicker === "boolean") cur.showTicker = u.showTicker;
    if (typeof u.showClock === "boolean") cur.showClock = u.showClock;
    control.ui = cur;
  }
  // fixar um evento implica modo fixo; limpar volta pro automático
  if (patch.fixedEventId) control.mode = "fixed";
  if (patch.mode === "auto") control.fixedEventId = null;
  saveControl();
  broadcast();
  if (leaguesChanged) poll(); // recarrega a liga recém-ligada já já
}

/* ---------- servidor ---------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  // SSE
  if (pathname === "/api/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`retry: 3000\n`);
    res.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`);
    clients.add(res);
    const ka = setInterval(() => { try { res.write(": ka\n\n"); } catch {} }, 25_000);
    req.on("close", () => { clearInterval(ka); clients.delete(res); });
    return;
  }

  // estado atual (fetch único)
  if (pathname === "/api/state") return sendJSON(res, 200, snapshot());

  // comandos do controle remoto
  if (pathname === "/api/control" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on("end", () => {
      try { applyControl(JSON.parse(body || "{}")); sendJSON(res, 200, snapshot()); }
      catch { sendJSON(res, 400, { error: "json inválido" }); }
    });
    return;
  }

  // força recoleta (botão "atualizar agora" no controle)
  if (pathname === "/api/refresh" && req.method === "POST") {
    poll().then(() => sendJSON(res, 200, snapshot()));
    return;
  }

  // estado de rede (modo setup/online) — usado pela TV e pelo portal
  if (pathname === "/api/net") return sendJSON(res, 200, net.readNet());

  // scan de redes WiFi (só no modo setup)
  if (pathname === "/api/wifi/scan") {
    if (net.readNet().mode !== "setup") return sendJSON(res, 403, { error: "fora do modo setup" });
    net.scanWifi()
      .then((list) => sendJSON(res, 200, { networks: list }))
      .catch((e) => sendJSON(res, 500, { error: e.message }));
    return;
  }

  // conectar o aparelho a uma rede WiFi (só no modo setup)
  if (pathname === "/api/wifi/connect" && req.method === "POST") {
    if (net.readNet().mode !== "setup") return sendJSON(res, 403, { error: "fora do modo setup" });
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 1e4) req.destroy(); });
    req.on("end", () => {
      let p; try { p = JSON.parse(body || "{}"); } catch { return sendJSON(res, 400, { error: "json inválido" }); }
      net.connectWifi(p.ssid, p.psk)
        .then(() => sendJSON(res, 200, { ok: true }))
        .catch((e) => sendJSON(res, 400, { error: e.message }));
    });
    return;
  }

  // portal de configuração (celular no hotspot)
  if (pathname === "/setup" || pathname === "/setup/") return serveFile(res, path.join(SETUP_DIR, "index.html"));
  if (pathname.startsWith("/setup/")) {
    const f = safeJoin(SETUP_DIR, pathname.slice("/setup/".length));
    if (f) return serveFile(res, f);
  }

  // controle remoto PWA
  if (pathname === "/remote" || pathname === "/remote/") return serveFile(res, path.join(REMOTE_DIR, "index.html"));
  if (pathname.startsWith("/remote/")) {
    const f = safeJoin(REMOTE_DIR, pathname.slice("/remote/".length));
    if (f) return serveFile(res, f);
  }

  // display (TV) — raiz
  if (pathname === "/" || pathname === "/index.html") return serveFile(res, path.join(DISPLAY_DIR, "index.html"));
  const df = safeJoin(DISPLAY_DIR, pathname.slice(1));
  if (df) return serveFile(res, df);

  res.writeHead(404); res.end("404");
});

server.listen(PORT, () => {
  console.log(`[skycroft] display  http://localhost:${PORT}/`);
  console.log(`[skycroft] controle http://localhost:${PORT}/remote`);
  poll();
});
