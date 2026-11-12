/* ===== Skycroft Ticker — portal de configuração WiFi (lógica) ===== */
const $ = (s) => document.querySelector(s);
let selected = null; // { ssid, secure }

/* ---- scan ---- */
async function scan() {
  const box = $("#nets");
  box.innerHTML = `<div class="empty">Procurando redes…</div>`;
  try {
    const r = await fetch("/api/wifi/scan", { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "falha no scan");
    renderNets(j.networks || []);
  } catch (e) {
    box.innerHTML = `<div class="empty">Não consegui procurar redes (${e.message}). Use “Minha rede não aparece”.</div>`;
  }
}
function bars(signal) {
  const n = signal >= 75 ? 4 : signal >= 50 ? 3 : signal >= 25 ? 2 : 1;
  let h = "";
  for (let i = 1; i <= 4; i++) h += `<i class="${i <= n ? "on" : ""}"></i>`;
  return `<span class="bars">${h}</span>`;
}
function renderNets(list) {
  const box = $("#nets");
  if (!list.length) { box.innerHTML = `<div class="empty">Nenhuma rede encontrada.</div>`; return; }
  box.innerHTML = "";
  list.forEach((n) => {
    const b = document.createElement("button");
    b.className = "net";
    b.innerHTML = `<span class="nm">${esc(n.ssid)}</span>${n.secure ? '<span class="lock">🔒</span>' : ""}${bars(n.signal)}`;
    b.onclick = () => choose({ ssid: n.ssid, secure: n.secure });
    box.appendChild(b);
  });
}
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

/* ---- escolher rede ---- */
function choose(net) {
  selected = net;
  $("#sel-ssid").textContent = net.ssid;
  const pwLabel = $("#pw-label");
  pwLabel.hidden = !net.secure;
  $("#psk").value = "";
  $("#err").hidden = true;
  $("#pick").hidden = true;
  $("#connect").hidden = false;
  if (net.secure) setTimeout(() => $("#psk").focus(), 100);
}

/* ---- conectar ---- */
async function connect(e) {
  e.preventDefault();
  if (!selected) return;
  const psk = $("#psk").value;
  if (selected.secure && psk.length < 8) { showErr("A senha do WiFi tem pelo menos 8 caracteres."); return; }
  $("#connect").hidden = true;
  $("#done").hidden = false;
  setDone("Conectando…", "Aguarde — o aparelho está entrando na sua rede.");
  try {
    const r = await fetch("/api/wifi/connect", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ssid: selected.ssid, psk }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "não deu pra conectar");
    waitOnline();
  } catch (e) {
    $("#done").hidden = true;
    $("#connect").hidden = false;
    showErr(e.message + ". Confira a senha e tente de novo.");
  }
}
function showErr(msg) { const el = $("#err"); el.textContent = msg; el.hidden = false; }
function setDone(title, msg) { $("#done-title").textContent = title; $("#done-msg").textContent = msg; }

// Depois de mandar conectar, o hotspot cai; tentamos confirmar online por um tempo.
function waitOnline() {
  let tries = 0;
  const tick = async () => {
    tries++;
    try {
      const r = await fetch("/api/net", { cache: "no-store" });
      const j = await r.json();
      if (j.mode === "online") {
        $("#done").classList.add("ok");
        $("#spin").style.display = "none";
        setDone("Conectado! ✓", "Pronto. A TV já voltou ao placar — pode fechar esta página.");
        return;
      }
    } catch { /* hotspot caiu: esperado durante a troca de rede */ }
    if (tries < 20) setTimeout(tick, 2500);
    else {
      $("#spin").style.display = "none";
      setDone("Quase lá", "Se a TV voltou ao placar, deu certo. Senão, reconecte ao Skycroft-Setup e tente outra rede.");
    }
  };
  setTimeout(tick, 3000);
}

/* ---- UI ---- */
$("#rescan").onclick = scan;
$("#back").onclick = () => { $("#connect").hidden = true; $("#pick").hidden = false; };
$("#pw-form").addEventListener("submit", connect);
$("#show-pw").onchange = (e) => { $("#psk").type = e.target.checked ? "text" : "password"; };
$("#manual-toggle").onclick = () => { const m = $("#manual"); m.hidden = !m.hidden; };
$("#manual").addEventListener("submit", (e) => {
  e.preventDefault();
  const ssid = $("#manual-ssid").value.trim();
  if (ssid) choose({ ssid, secure: true });
});

scan();
