/* ===== Skycroft Ticker — coletor ESPN =====
 * Reaproveita os endpoints públicos da ESPN (mesmos do app Laravel).
 * Catálogo de ligas extensível — basta adicionar uma linha em CATALOG.
 * Sem dependências externas: usa o fetch nativo do Node (>=18).
 */

// id = chave interna/abbrev; path = caminho ESPN (esporte/liga).
const CATALOG = [
  { id: "NFL", name: "NFL", path: "football/nfl", sport: "football" },
  { id: "NBA", name: "NBA", path: "basketball/nba", sport: "basketball" },
  { id: "MLB", name: "MLB", path: "baseball/mlb", sport: "baseball" },
  { id: "NHL", name: "NHL", path: "hockey/nhl", sport: "hockey" },
  { id: "PL", name: "Premier League", path: "soccer/eng.1", sport: "soccer" },
  { id: "UCL", name: "Champions League", path: "soccer/uefa.champions", sport: "soccer" },
  { id: "BRA", name: "Brasileirão", path: "soccer/bra.1", sport: "soccer" },
];
const BY_ID = Object.fromEntries(CATALOG.map((l) => [l.id, l]));

const stateMap = { pre: "pre", in: "in", post: "post" };

function normTeam(c) {
  return {
    abbr: c.team?.abbreviation || "?",
    name: c.team?.shortDisplayName || c.team?.displayName || "?",
    score: c.score != null && c.score !== "" ? parseInt(c.score, 10) || 0 : 0,
    color: c.team?.color ? "#" + c.team.color : "#2a3350",
    logo: c.team?.logo || null,
  };
}

async function fetchLeague(lg) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/${lg.path}/scoreboard`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`${lg.id} HTTP ${r.status}`);
  const data = await r.json();
  const events = (data.events || []).map((ev) => {
    const comp = (ev.competitions || [])[0] || {};
    const cs = comp.competitors || [];
    const away = cs.find((c) => c.homeAway === "away") || {};
    const home = cs.find((c) => c.homeAway === "home") || {};
    return {
      id: String(ev.id),
      state: stateMap[ev.status?.type?.state] || "pre",
      status: ev.status?.type?.shortDetail || "",
      starts: ev.date || null,
      away: normTeam(away),
      home: normTeam(home),
    };
  });
  return { id: lg.id, abbrev: lg.id, name: lg.name, path: lg.path, sport: lg.sport, events };
}

// Busca só as ligas pedidas (por id). Entradas desconhecidas são ignoradas.
// Mantém a ordem de `ids`. Falha de uma liga não derruba as outras.
async function fetchLeagues(ids) {
  const wanted = (ids && ids.length ? ids : ["NFL", "NBA"]).map((s) => BY_ID[s]).filter(Boolean);
  const out = [];
  for (const lg of wanted) {
    try {
      out.push(await fetchLeague(lg));
    } catch (e) {
      console.error(`[espn] ${lg.id} falhou: ${e.message}`);
      out.push({ id: lg.id, abbrev: lg.id, name: lg.name, path: lg.path, sport: lg.sport, events: [] });
    }
  }
  return out;
}

function hasLive(leagues) {
  return leagues.some((lg) => lg.events.some((e) => e.state === "in"));
}

// Metadados pro controle remoto montar a lista de ligas.
function catalogMeta() {
  return CATALOG.map((l) => ({ id: l.id, name: l.name, sport: l.sport }));
}

module.exports = { CATALOG, BY_ID, fetchLeagues, hasLive, catalogMeta };
