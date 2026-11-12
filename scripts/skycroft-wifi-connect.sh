#!/usr/bin/env bash
# ===== Skycroft Ticker — conectar o aparelho a um WiFi =====
# Chamado pelo servidor Node via sudo:  skycroft-wifi-connect.sh "<SSID>" "<SENHA>"
# Recebe SSID/senha como ARGUMENTOS (nunca interpolados em shell) -> sem injeção.
# Derruba o hotspot de setup, tenta conectar e, se falhar, religa o hotspot.
set -euo pipefail

SSID="${1:?uso: skycroft-wifi-connect.sh SSID [SENHA]}"
PSK="${2:-}"
AP_CON="${SKYCROFT_AP_CON:-Skycroft-Setup}"

restore_ap() { nmcli connection up "$AP_CON" >/dev/null 2>&1 || true; }
trap 'restore_ap' ERR

# Libera o rádio derrubando o AP de configuração.
nmcli connection down "$AP_CON" >/dev/null 2>&1 || true
sleep 1

if [ -n "$PSK" ]; then
  nmcli device wifi connect "$SSID" password "$PSK"
else
  nmcli device wifi connect "$SSID"
fi

# Sucesso: a conexão fica salva com autoconnect; o vigia (netcheck) vê "online".
echo "conectado a $SSID"
