#!/usr/bin/env bash
# =====================================================================
# Skycroft Ticker — provisionador do aparelho (Orange Pi Zero 2W / Armbian)
# Transforma um Armbian Debian 13 (trixie) Minimal recém-instalado no
# aparelho Skycroft: servidor + kiosk Chromium + onboarding WiFi + Tailscale + SSH.
#
#   sudo ./scripts/install.sh
#
# Variáveis opcionais:
#   SKYCROFT_AP_SSID=Skycroft-Setup   nome do hotspot de configuração
#   SKYCROFT_AP_PASS=                 senha do hotspot (vazio = rede aberta)
#   TAILSCALE_HOSTNAME=skycroft-ticker
#   TS_AUTHKEY=tskey-...              autentica o Tailscale sem interação
# =====================================================================
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Rode como root:  sudo $0"; exit 1; }

SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR=/opt/skycroft
SVC_USER=skycroft
AP_SSID="${SKYCROFT_AP_SSID:-Skycroft-Setup}"
AP_PASS="${SKYCROFT_AP_PASS:-}"
TS_HOST="${TAILSCALE_HOSTNAME:-skycroft-ticker}"
export DEBIAN_FRONTEND=noninteractive

echo "==> [1/9] Pacotes"
apt-get update
apt-get install -y --no-install-recommends \
  nodejs ca-certificates curl \
  network-manager openssh-server \
  xserver-xorg xinit x11-xserver-utils openbox unclutter \
  qrencode
# Chromium: nome varia entre 'chromium' e 'chromium-browser'
apt-get install -y --no-install-recommends chromium \
  || apt-get install -y --no-install-recommends chromium-browser
node --version || { echo "Node ausente/baixo — Debian trixie traz Node 20"; exit 1; }

echo "==> [2/9] Usuário de serviço ($SVC_USER)"
id "$SVC_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$SVC_USER"
for g in netdev video audio tty input render; do getent group "$g" >/dev/null && usermod -aG "$g" "$SVC_USER" || true; done

echo "==> [3/9] Copiando app p/ $APP_DIR"
mkdir -p "$APP_DIR"
cp -a "$SRC/." "$APP_DIR/"
rm -rf "$APP_DIR/.git" "$APP_DIR/node_modules" "$APP_DIR/server/control-state.json" 2>/dev/null || true
chmod +x "$APP_DIR"/scripts/*.sh
chown -R "$SVC_USER":"$SVC_USER" "$APP_DIR"

echo "==> [4/9] NetworkManager + hotspot de configuração"
systemctl enable --now NetworkManager
WIFI_DEV="$(nmcli -t -f DEVICE,TYPE device 2>/dev/null | awk -F: '$2=="wifi"{print $1; exit}')"
WIFI_DEV="${WIFI_DEV:-wlan0}"
nmcli connection delete "$AP_SSID" >/dev/null 2>&1 || true
nmcli connection add type wifi ifname "$WIFI_DEV" con-name "$AP_SSID" autoconnect no ssid "$AP_SSID"
nmcli connection modify "$AP_SSID" \
  802-11-wireless.mode ap 802-11-wireless.band bg \
  ipv4.method shared ipv6.method ignore
if [ -n "$AP_PASS" ]; then
  nmcli connection modify "$AP_SSID" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$AP_PASS"
fi

echo "==> [5/9] Xorg wrapper + sudoers"
install -m 0644 "$APP_DIR/scripts/systemd/Xwrapper.config" /etc/X11/Xwrapper.config
install -m 0440 "$APP_DIR/scripts/systemd/skycroft.sudoers" /etc/sudoers.d/skycroft
visudo -cf /etc/sudoers.d/skycroft

echo "==> [6/9] Serviços systemd"
for u in skycroft-server skycroft-netcheck skycroft-kiosk; do
  install -m 0644 "$APP_DIR/scripts/systemd/$u.service" "/etc/systemd/system/$u.service"
done
mkdir -p /etc/systemd/system/skycroft-netcheck.service.d
cat > /etc/systemd/system/skycroft-netcheck.service.d/env.conf <<EOF
[Service]
Environment=SKYCROFT_AP_SSID=$AP_SSID
Environment=SKYCROFT_AP_PASS=$AP_PASS
EOF

echo "==> [7/9] SSH"
systemctl enable --now ssh

echo "==> [8/9] Tailscale (+ Tailscale SSH)"
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh
systemctl enable --now tailscaled
TAILSCALE_HOSTNAME="$TS_HOST" TS_AUTHKEY="${TS_AUTHKEY:-}" "$APP_DIR/scripts/skycroft-tailscale-up.sh" || true

echo "==> [9/9] Habilitando serviços do Skycroft"
systemctl daemon-reload
systemctl enable skycroft-server skycroft-netcheck skycroft-kiosk
systemctl restart skycroft-server skycroft-netcheck

cat <<EOF

================  Skycroft Ticker instalado  ================
Reinicie para validar o boot completo:   sudo reboot

Depois do boot:
 - TV (HDMI):  mostra o placar; se não houver WiFi, mostra a tela de setup
               com o QR do hotspot "$AP_SSID".
 - Celular:    conecte-se ao "$AP_SSID" e abra http://10.42.0.1:8099/setup
 - Controle:   http://<ip-do-aparelho>:8099/remote
 - SSH:        ssh $SVC_USER@<ip>   ou   ssh $SVC_USER@$TS_HOST  (via Tailscale)
=============================================================
EOF
