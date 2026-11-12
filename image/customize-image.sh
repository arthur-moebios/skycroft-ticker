#!/bin/bash
# =====================================================================
# Hook do Armbian build — roda DENTRO do chroot da imagem, como root,
# no fim da montagem do sistema de arquivos. É aqui que o Skycroft é
# assado na imagem (pacotes, serviços, hotspot, Tailscale, SSH).
#
# O Armbian monta userpatches/overlay/ em /tmp/overlay dentro do chroot.
# Args passados pelo build: $1=RELEASE $2=LINUXFAMILY $3=BOARD $4=BUILD_DESKTOP
# =====================================================================
set -e
RELEASE="${1:-trixie}"
BOARD="${3:-orangepizero2w}"

echo "[skycroft] provisionando a imagem ($RELEASE / $BOARD)…"

export SKYCROFT_IMAGE_BUILD=1
# Personalize aqui, se quiser, antes do build:
# export SKYCROFT_AP_SSID="Skycroft-Setup"
# export SKYCROFT_AP_PASS=""            # vazio = rede aberta (onboarding fácil)
# export TAILSCALE_HOSTNAME="skycroft-ticker"
# NÃO defina TS_AUTHKEY aqui: a imagem seria clonada com uma identidade só.

bash /tmp/overlay/skycroft/scripts/install.sh

echo "[skycroft] imagem pronta — o onboarding WiFi sobe no 1º boot."
