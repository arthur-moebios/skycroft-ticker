# Sports Ticker — "Chromecast esportivo" (Glance Zone clone)

Aparelho baseado em **Orange Pi Zero 2W + Armbian (Debian 13 trixie)** que se pluga no
HDMI, é configurado pelo celular via QR code e exibe um ticker/scoreboard esportivo ao
vivo, reutilizando a API da ESPN.

## Arquitetura

Tudo é **web** (fácil de estilizar, responsivo, configurável pelo celular sem APK).

No Orange Pi rodam 3 componentes:

1. **Chromium em modo kiosk** → renderiza em tela cheia a página de `display/` (a "TV view").
2. **Servidor Node.js** (`server/`) que:
   - serve o `display/` (TV) e o `config/` (painel do celular);
   - faz proxy + cache da **API da ESPN** (chave fica no aparelho, sem CORS);
   - guarda a configuração local (ligas, times, layout);
   - empurra placares ao vivo via **WebSocket** → updates em tempo real (responsivo).
3. **Onboarding tipo Chromecast** (`scripts/`): no 1º boot sem WiFi, sobe um hotspot,
   mostra um **QR na TV**, o celular entra no captive portal e cadastra o WiFi de casa.

## Plano em fases

- [ ] **Fase 1** — Servidor + Chromium kiosk + autostart (systemd). "Olá" na TV.
- [ ] **Fase 2** — Onboarding WiFi (hostapd/NetworkManager + QR + captive portal).
- [x] **Fase 3** — (em andamento) Camada de dados ESPN (proxy + cache + live WS).
- [x] **Fase 4** — (em andamento) Visual do ticker (scoreboard + faixa rolando).
- [ ] **Fase 5** — Painel do celular (escolher ligas/times/layout).

> Fases 3–5 dão pra desenvolver/visualizar no PC. Fases 1–2 dependem do hardware e viram
> scripts de instalação rodados no Pi.

## Estrutura

```
sports-ticker/
  display/      TV view (o que aparece no HDMI)
    index.html
    style.css
    app.js
    mock-data.js   dados de exemplo no formato ESPN (trocados pela API real na Fase 3)
  server/       (Fase 1+) servidor Node: estáticos + proxy ESPN + WebSocket
  config/       (Fase 5) painel de controle do celular
  scripts/      (Fase 1-2) instalação no Pi: kiosk, autostart, onboarding WiFi
```

## Hardware alvo

- Orange Pi Zero 2W (Allwinner H618, 1 GB RAM)
- Armbian Debian 13 trixie Minimal (kernel 6.18)
- Saída HDMI 1080p
