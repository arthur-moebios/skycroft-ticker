/* ===== Skycroft Ticker — camada de rede (onboarding WiFi) =====
 * Lê o estado de rede escrito por scripts/skycroft-netcheck.sh e fala com o
 * NetworkManager via nmcli. Tudo com execFile (array de args, SEM shell) para
 * não haver injeção de comando a partir de SSID/senha vindos do celular.
 */
const fs = require("fs");
const { execFile } = require("child_process");

const NET_FILE = process.env.SKYCROFT_NET_FILE || "/run/skycroft/net.json";
const WIFI_HELPER = process.env.SKYCROFT_WIFI_HELPER || "/opt/skycroft/scripts/skycroft-wifi-connect.sh";

// Estado atual de rede (modo setup/online, SSID, IP, dados do hotspot).
function readNet() {
  try {
    const j = JSON.parse(fs.readFileSync(NET_FILE, "utf8"));
    return {
      mode: j.mode === "setup" ? "setup" : "online",
      ssid: j.ssid || null,
      ip: j.ip || null,
      apSsid: j.apSsid || "Skycroft-Setup",
      apPass: j.apPass || null,
      setupUrl: j.setupUrl || null,
    };
  } catch {
    // Sem arquivo (ex.: rodando no PC em dev): assume online.
    return { mode: "online", ssid: null, ip: null, apSsid: "Skycroft-Setup", apPass: null, setupUrl: null };
  }
}

function run(cmd, args, timeout = 20000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message || "").trim()));
      resolve(stdout);
    });
  });
}

// Lista redes WiFi visíveis: [{ssid, signal, secure}]. Requer nmcli.
async function scanWifi() {
  const out = await run("nmcli", ["-t", "-f", "SSID,SIGNAL,SECURITY", "device", "wifi", "list", "--rescan", "yes"]);
  const seen = new Map();
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    // nmcli -t escapa ":" como "\:" — divide respeitando isso.
    const parts = line.split(/(?<!\\):/).map((s) => s.replace(/\\:/g, ":"));
    const ssid = (parts[0] || "").trim();
    if (!ssid) continue; // ignora SSID oculto
    const signal = parseInt(parts[1] || "0", 10) || 0;
    const secure = !!(parts[2] || "").replace(/--/g, "").trim();
    const prev = seen.get(ssid);
    if (!prev || signal > prev.signal) seen.set(ssid, { ssid, signal, secure });
  }
  return [...seen.values()].sort((a, b) => b.signal - a.signal).slice(0, 30);
}

// Conecta o APARELHO a uma rede WiFi. Chama o helper com sudo (args em array).
async function connectWifi(ssid, psk) {
  if (!ssid || typeof ssid !== "string" || ssid.length > 64) throw new Error("SSID inválido");
  if (psk != null && (typeof psk !== "string" || psk.length > 128)) throw new Error("Senha inválida");
  const args = ["-n", WIFI_HELPER, ssid, psk || ""];
  await run("sudo", args, 45000);
  return true;
}

module.exports = { readNet, scanWifi, connectWifi, NET_FILE };
