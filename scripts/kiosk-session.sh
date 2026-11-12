#!/usr/bin/env bash
# ===== Skycroft Ticker — sessão do kiosk (Chromium fullscreen) =====
# Lançado pelo startx (serviço skycroft-kiosk). Abre o display em tela cheia.
set -u

PORT="${PORT:-8099}"
URL="http://localhost:${PORT}/"

# Sem screensaver, sem gerenciamento de energia, sem cursor parado.
xset -dpms      || true
xset s off      || true
xset s noblank  || true
command -v unclutter >/dev/null && unclutter -idle 0.5 -root &

# Gerenciador de janelas mínimo (dá foco/fullscreen ao Chromium).
command -v openbox >/dev/null && openbox &

# Descobre o binário do Chromium (varia entre distros).
CHROME="$(command -v chromium || command -v chromium-browser || true)"
if [ -z "$CHROME" ]; then echo "Chromium não encontrado"; sleep 5; exit 1; fi

# Espera o servidor subir antes de abrir.
for _ in $(seq 1 60); do
  curl -sf "http://localhost:${PORT}/api/net" >/dev/null 2>&1 && break
  sleep 1
done

exec "$CHROME" \
  --kiosk --app="$URL" \
  --noerrdialogs --disable-infobars --incognito \
  --disable-session-crashed-bubble --disable-features=TranslateUI \
  --check-for-update-interval=31536000 \
  --overscroll-history-navigation=0 \
  --autoplay-policy=no-user-gesture-required
