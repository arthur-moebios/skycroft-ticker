#!/usr/bin/env bash
# ===== Skycroft Ticker — vigia de rede =====
# Decide o modo do aparelho e gere o hotspot de configuração:
#   - ONLINE: WiFi de casa conectado  -> derruba o AP, escreve mode=online
#   - SETUP : sem WiFi                -> sobe o AP "Skycroft-Setup", mode=setup
# Escreve /run/skycroft/net.json, que o servidor Node lê e expõe pra TV/portal.
# Roda em laço (via systemd). Usa NetworkManager (nmcli).
set -u

AP_CON="${SKYCROFT_AP_CON:-Skycroft-Setup}"
AP_SSID="${SKYCROFT_AP_SSID:-Skycroft-Setup}"
AP_PASS="${SKYCROFT_AP_PASS:-}"                 # vazio = rede aberta (onboarding fácil)
PORT="${PORT:-8099}"
INTERVAL="${SKYCROFT_NETCHECK_INTERVAL:-15}"
NET_DIR="/run/skycroft"
NET_FILE="$NET_DIR/net.json"
AP_IP="10.42.0.1"                               # gateway do modo shared do NM

mkdir -p "$NET_DIR"

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

write_net() { # modo, ssid, ip
  local mode="$1" ssid="$2" ip="$3"
  cat > "$NET_FILE" <<EOF
{
  "mode": "$(json_escape "$mode")",
  "ssid": $( [ -n "$ssid" ] && printf '"%s"' "$(json_escape "$ssid")" || printf 'null' ),
  "ip": $( [ -n "$ip" ] && printf '"%s"' "$(json_escape "$ip")" || printf 'null' ),
  "apSsid": "$(json_escape "$AP_SSID")",
  "apPass": $( [ -n "$AP_PASS" ] && printf '"%s"' "$(json_escape "$AP_PASS")" || printf 'null' ),
  "setupUrl": "http://$AP_IP:$PORT/setup"
}
EOF
}

# SSID atual (conexão WiFi ativa que não seja o próprio AP), vazio se nenhuma.
active_wifi_ssid() {
  nmcli -t -f NAME,TYPE connection show --active 2>/dev/null \
    | awk -F: '$2=="802-11-wireless"{print $1}' \
    | grep -vx "$AP_CON" | head -n1
}

is_online() {
  local ssid; ssid="$(active_wifi_ssid)"
  [ -z "$ssid" ] && return 1
  ping -c1 -W2 1.1.1.1 >/dev/null 2>&1 || nmcli networking connectivity 2>/dev/null | grep -q full
}

ap_up()   { nmcli -t -f NAME connection show --active 2>/dev/null | grep -qx "$AP_CON" || nmcli connection up "$AP_CON" >/dev/null 2>&1; }
ap_down() { nmcli -t -f NAME connection show --active 2>/dev/null | grep -qx "$AP_CON" && nmcli connection down "$AP_CON" >/dev/null 2>&1; }

while true; do
  if is_online; then
    ap_down
    ssid="$(active_wifi_ssid)"
    ip="$(nmcli -t -f IP4.ADDRESS device show 2>/dev/null | awk -F'[:/]' '/IP4.ADDRESS/{print $2; exit}')"
    write_net "online" "$ssid" "$ip"
  else
    ap_up
    write_net "setup" "" "$AP_IP"
  fi
  sleep "$INTERVAL"
done
