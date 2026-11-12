/* ===== Skycroft Ticker — coletor ESPN (NFL + NBA) =====
 * Reaproveita exatamente os endpoints públicos da ESPN usados no app Laravel.
 * Sem dependências externas: usa o fetch nativo do Node (>=18).
 */

const LEAGUES = [
  { id: "nfl", abbrev: "NFL", name: "NFL", path: "football/nfl" },
  { id: "nba", abbrev: "NBA", name: "NBA", path: "basketball/nba" },
];

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
  return { id: lg.id, abbrev: lg.abbrev, name: lg.name, path: lg.path, events };
}

// Retorna [{id,abbrev,name,path,events}], uma entrada por liga (vazia em caso de erro).
async function fetchAll() {
  const out = [];
  for (const lg of LEAGUES) {
    try {
      out.push(await fetchLeague(lg));
    } catch (e) {
      console.error(`[espn] ${lg.id} falhou: ${e.message}`);
      out.push({ id: lg.id, abbrev: lg.abbrev, name: lg.name, path: lg.path, events: [] });
    }
  }
  return out;
}

// true se qualquer jogo está ao vivo (define cadência de atualização)
function hasLive(leagues) {
  return leagues.some((lg) => lg.events.some((e) => e.state === "in"));
}

module.exports = { LEAGUES, fetchAll, hasLive };
