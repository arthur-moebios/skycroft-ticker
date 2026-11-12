#!/usr/bin/env bash
# =====================================================================
# Skycroft Ticker — provisionador do aparelho (Orange Pi Zero 2W / Armbian)
# Deixa a imagem/sistema pronta: servidor + kiosk Chromium + onboarding WiFi
# (sem WiFi conhecido -> hotspot + QR + página de config) + Tailscale + SSH.
#
# Dois modos:
#   1) Direto no Pi:        sudo ./scripts/install.sh      (instala e já liga tudo)
#   2) No build da imagem:  SKYCROFT_IMAGE_BUILD=1 ./scripts/install.sh
#        roda DENTRO do chroot do Armbian build; só habilita os serviços
#        (não inicia nada, não fala com o NetworkManager ao vivo).
#
# Variáveis opcionais:
#   SKYCROFT_AP_SSID=Skycroft-Setup   nome do hotspot de configuração
#   SKYCROFT_AP_PASS=                 senha do hotspot (vazio = rede aberta)
#   TAILSCALE_HOSTNAME=skycroft-ticker
#   TS_AUTHKEY=tskey-...              autentica o Tailscale (NÃO use ao gerar
#                                     imagem p/ clonar: todos ficariam iguais)
# =====================================================================
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Rode como root:  sudo $0"; exit 1; }

IMAGE_BUILD="${SKYCROFT_IMAGE_BUILD:-0}"   # 1 = rodando no chroot do build
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR=/opt/skycroft
SVC_USER=skycroft
AP_SSID="${SKYCROFT_AP_SSID:-Skycroft-Setup}"
AP_PASS="${SKYCROFT_AP_PASS:-}"
TS_HOST="${TAILSCALE_HOSTNAME:-skycroft-ticker}"
export DEBIAN_FRONTEND=noninteractive

# Inicia um serviço só quando NÃO estamos no chroot do build.
start_if_live() { [ "$IMAGE_BUILD" = 1 ] || systemctl start "$@" || true; }

echo "==> [1/9] Pacotes"
apt-get update
apt-get install -y --no-install-recommends \
  nodejs ca-certificates curl gnupg sudo \
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
systemctl enable NetworkManager
start_if_live NetworkManager
# Cria o hotspot como keyfile do NM (funciona no chroot e no sistema vivo).
# modo AP + ipv4 shared => DHCP + gateway 10.42.0.1 automático.
mkdir -p /etc/NetworkManager/system-connections
AP_FILE="/etc/NetworkManager/system-connections/${AP_SSID}.nmconnection"
{
  echo "[connection]"
  echo "id=${AP_SSID}"
  echo "type=wifi"
  echo "autoconnect=false"
  echo
  echo "[wifi]"
  echo "mode=ap"
  echo "ssid=${AP_SSID}"
  echo "band=bg"
  if [ -n "$AP_PASS" ]; then
    echo
    echo "[wifi-security]"
    echo "key-mgmt=wpa-psk"
    echo "psk=${AP_PASS}"
  fi
  echo
  echo "[ipv4]"
  echo "method=shared"
  echo
  echo "[ipv6]"
  echo "method=ignore"
} > "$AP_FILE"
chmod 600 "$AP_FILE"
[ "$IMAGE_BUILD" = 1 ] || nmcli connection reload >/dev/null 2>&1 || true

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
systemctl enable ssh
start_if_live ssh

echo "==> [8/9] Tailscale (+ Tailscale SSH)"
if ! command -v tailscale >/dev/null; then
  if [ "$IMAGE_BUILD" = 1 ]; then
    # no chroot: instala pelo repositório, sem iniciar o serviço
    curl -fsSL https://pkgs.tailscale.com/stable/debian/trixie.noarmor.gpg -o /usr/share/keyrings/tailscale-archive-keyring.gpg
    curl -fsSL https://pkgs.tailscale.com/stable/debian/trixie.tailscale-keyring.list -o /etc/apt/sources.list.d/tailscale.list
    apt-get update && apt-get install -y tailscale
  else
    curl -fsSL https://tailscale.com/install.sh | sh
  fi
fi
systemctl enable tailscaled
if [ "$IMAGE_BUILD" != 1 ]; then
  start_if_live tailscaled
  TAILSCALE_HOSTNAME="$TS_HOST" TS_AUTHKEY="${TS_AUTHKEY:-}" "$APP_DIR/scripts/skycroft-tailscale-up.sh" || true
fi

echo "==> [9/9] Habilitando serviços do Skycroft"
systemctl daemon-reload || true
systemctl enable skycroft-server skycroft-netcheck skycroft-kiosk
if [ "$IMAGE_BUILD" != 1 ]; then
  systemctl restart skycroft-server skycroft-netcheck || true
fi

if [ "$IMAGE_BUILD" = 1 ]; then
  echo "[skycroft] imagem provisionada (serviços habilitados; iniciam no 1º boot)."
  exit 0
fi

cat <<EOF

================  Skycroft Ticker instalado  ================
Reinicie para validar o boot completo:   sudo reboot

Depois do boot:
 - TV (HDMI):  mostra o placar; se não houver WiFi, mostra a tela de setup
               com o QR do hotspot "$AP_SSID".
 - Celular:    conecte-se ao "$AP_SSID" e abra http://10.42.0.1:8099/setup
 - Controle:   http://<ip-do-aparelho>:8099/remote
 - SSH:        ssh $SVC_USER@<ip>   ou   ssh $SVC_USER@$TS_HOST  (via Tailscale)
 - Tailscale:  autentique uma vez -> sudo tailscale up --ssh --hostname $TS_HOST
=============================================================
EOF
