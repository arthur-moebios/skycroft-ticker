#!/usr/bin/env bash
# ===== Skycroft Ticker — subir o Tailscale com SSH =====
# Se TS_AUTHKEY estiver no ambiente, autentica sozinho; senão, mostra o comando.
set -euo pipefail
HOSTNAME_TS="${TAILSCALE_HOSTNAME:-skycroft-ticker}"

if ! command -v tailscale >/dev/null; then
  echo "tailscale não instalado (rode o install.sh)"; exit 1
fi

if [ -n "${TS_AUTHKEY:-}" ]; then
  tailscale up --ssh --hostname "$HOSTNAME_TS" --authkey "$TS_AUTHKEY"
  echo "Tailscale no ar como '$HOSTNAME_TS' (Tailscale SSH ligado)."
else
  echo "Sem TS_AUTHKEY. Autentique uma vez (abre uma URL de login):"
  echo "  sudo tailscale up --ssh --hostname $HOSTNAME_TS"
fi
