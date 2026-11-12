#!/usr/bin/env bash
# =====================================================================
# Skycroft Ticker — gerar a imagem .img (um comando)
#
# Roda num LINUX x86-64 com Docker (ou Windows via WSL2 + Docker).
# Usa o Armbian build framework pra assar o Skycroft dentro de uma imagem
# Armbian Debian 13 (trixie) Minimal do Orange Pi Zero 2W.
#
#   ./image/build-image.sh
#
# Saída: <dir de build>/output/images/Armbian_*_Orangepizero2w_*.img
# Tempo: ~30–60 min na 1ª vez (baixa fontes e compila). Precisa de ~25 GB livres.
#
# Variáveis opcionais (passam pro build via customize-image.sh):
#   SKYCROFT_BUILD_DIR=~/armbian-skycroft   onde clonar o Armbian build
#   SKYCROFT_AP_SSID / SKYCROFT_AP_PASS / TAILSCALE_HOSTNAME
# =====================================================================
set -euo pipefail

command -v docker >/dev/null || { echo "Docker é necessário (Armbian build roda em Docker). Instale e tente de novo."; exit 1; }
command -v git >/dev/null    || { echo "git é necessário."; exit 1; }
command -v rsync >/dev/null  || { echo "rsync é necessário."; exit 1; }

HERE="$(cd "$(dirname "$0")/.." && pwd)"                 # raiz do repo skycroft
WORK="${SKYCROFT_BUILD_DIR:-$HOME/armbian-skycroft}"

# O diretório de build NÃO pode ficar dentro do repo, senão o rsync abaixo
# copiaria a si mesmo em loop. Se estiver, joga pra fora (ao lado do repo).
case "$WORK/" in
  "$HERE/"*) WORK="$(dirname "$HERE")/armbian-skycroft"
             echo "!! SKYCROFT_BUILD_DIR estava dentro do repo; usando $WORK"; ;;
esac

echo "==> Armbian build em: $WORK"
if [ -d "$WORK/.git" ]; then (cd "$WORK" && git pull --ff-only || true)
else git clone --depth=1 https://github.com/armbian/build "$WORK"; fi

echo "==> Copiando o projeto Skycroft p/ o overlay do build"
mkdir -p "$WORK/userpatches/overlay/skycroft"
rsync -a --delete \
  --exclude '.git' --exclude 'node_modules' --exclude 'server/control-state.json' \
  "$HERE/" "$WORK/userpatches/overlay/skycroft/"
install -m 0755 "$HERE/image/customize-image.sh" "$WORK/userpatches/customize-image.sh"

echo "==> Compilando a imagem (Orange Pi Zero 2W / trixie minimal)…"
cd "$WORK"
./compile.sh build \
  BOARD=orangepizero2w \
  BRANCH=current \
  RELEASE=trixie \
  BUILD_MINIMAL=yes \
  BUILD_DESKTOP=no \
  KERNEL_CONFIGURE=no \
  COMPRESS_OUTPUTIMAGE=sha,img

echo
echo "================================================================"
echo "Imagem gerada em:  $WORK/output/images/"
ls -1 "$WORK/output/images/" 2>/dev/null | sed 's/^/   /' || true
echo "Grave com o balenaEtcher. No 1º boot sem WiFi, a TV mostra o QR."
echo "================================================================"
