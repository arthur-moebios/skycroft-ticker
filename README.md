# Skycroft Ticker — "Chromecast esportivo"

Aparelho baseado em **Orange Pi Zero 2W + Armbian (Debian 13 trixie)** que se pluga no
HDMI, é configurado pelo celular via QR code e exibe um ticker/scoreboard esportivo ao
vivo (NFL + NBA), reutilizando a API pública da ESPN. Controlado por um **PWA de controle
remoto** no celular.

## Arquitetura

Tudo é **web** (fácil de estilizar, responsivo, configurável pelo celular sem APK).

No Orange Pi rodam 3 componentes:

1. **Chromium em modo kiosk** → renderiza em tela cheia a página de `display/` (a "TV view").
2. **Servidor Node.js** (`server/`, **zero dependências**) que:
   - serve o `display/` (TV) em `/` e o controle remoto `remote/` (PWA) em `/remote`;
   - coleta + faz cache da **API da ESPN** (NFL/NBA), com cadência **30s ao vivo / 120s ocioso**;
   - guarda o estado de controle (favoritos, mostrador fixo, ligas) em `server/control-state.json`;
   - empurra atualizações ao vivo via **SSE** (`/api/stream`) → TV e controle em tempo real.
3. **Onboarding tipo Chromecast** (`scripts/`): no 1º boot sem WiFi, sobe um hotspot,
   mostra um **QR na TV**, o celular entra no captive portal e cadastra o WiFi de casa.

### Comportamento do mostrador principal

- **Automático** (padrão): **jogos ao vivo têm prioridade** (favoritos ao vivo → outros ao
  vivo → próximo jogo dos favoritos → geral).
- **Fixo**: o controle remoto fixa um jogo específico no exibidor principal.
- **Favoritos** (★): Patriots (NE) e Celtics (BOS) por padrão; editáveis pelo controle.

### Customização pelo controle (opcional — já vem pronto)

O PWA tem uma aba **Aparência** que reconfigura a TV ao vivo (via SSE), sem mexer em
nada no aparelho:

- **Temas**: Meia-noite (padrão), Gridiron, Hardwood, Arena (âmbar retrô), Broadcast
  (claro) e Stars — inspirados em placares clássicos e dashboards.
- **Fonte**: Sistema, Condensada (Oswald) ou Esportiva (Rajdhani) — embarcadas, offline.
- **Densidade** dos cards, **tamanho do texto**, **nível de detalhe** (completo / só placar),
  **quantos jogos** na lista, mostrar/ocultar **faixa** e **relógio**, lado da lista.
- **Ligas**: NFL, NBA, MLB, NHL, Premier League, Champions e Brasileirão (liga nova
  entra só adicionando uma linha em `server/espn.js`).

Tudo é opcional: de fábrica o ticker já funciona sem o usuário tocar em nada.

## Como rodar (PC, para desenvolver)

```
cd server
node index.js          # Node >= 18, sem npm install
```

- TV / display:   http://localhost:8099/
- Controle (PWA): http://localhost:8099/remote

No celular, abra `http://<ip-do-aparelho>:8099/remote` e "Adicionar à tela de início"
para instalar o PWA.

## Instalar no aparelho (Orange Pi)

Num Armbian trixie Minimal recém-instalado:

```
git clone https://github.com/arthur-moebios/skycroft-ticker.git
cd skycroft-ticker
sudo ./scripts/install.sh
sudo reboot
```

O `install.sh` configura: servidor + **kiosk Chromium** (autostart via systemd),
**onboarding WiFi** (hotspot + QR na TV + portal no celular), **Tailscale** (com
Tailscale SSH) e **SSH** habilitado.

**Imagem pronta (mais fácil):** em **Actions → "Build image" → Run workflow**, o
GitHub assa o `.img` na nuvem e você baixa — sem Docker/WSL local. Passo a passo e
alternativas em [`BUILD-IMAGE.md`](BUILD-IMAGE.md).

## API do servidor

| Rota             | Método | O que faz                                            |
|------------------|--------|------------------------------------------------------|
| `/`              | GET    | Display (TV view)                                    |
| `/remote`        | GET    | Controle remoto (PWA)                                |
| `/api/state`     | GET    | Snapshot atual (dados ESPN + estado de controle)     |
| `/api/stream`    | GET    | SSE: empurra o snapshot a cada atualização           |
| `/api/control`   | POST   | Patch de controle `{mode, fixedEventId, favorites, enabledLeagues}` |
| `/api/refresh`   | POST   | Força recoleta imediata da ESPN                      |

## Plano em fases

- [x] **Fase 1** — Chromium kiosk + autostart (systemd) no Pi.
- [x] **Fase 2** — Onboarding WiFi (NetworkManager AP + QR na TV + portal).
- [x] **Fase 3** — Camada de dados ESPN (coleta + cache + push ao vivo via SSE).
- [x] **Fase 4** — Visual do ticker (scoreboard + faixa rolando, logos reais).
- [x] **Fase 5** — Controle remoto PWA (mostrador fixo, lista de jogos, favoritos, ligas).
- [x] **Fase 6** — `install.sh` (+ Tailscale/SSH) e guia de geração do `.img`.

## Estrutura

```
sports-ticker/
  display/      TV view (HDMI) — inclui a tela de setup com QR
    index.html  app.js  style.css
    mock-data.js            fallback offline (preview sem servidor)
    assets/skycroft-logo.svg  assets/qrcode.js (MIT, offline)
  server/       servidor Node (zero deps): ESPN + SSE + controle + rede
    index.js  espn.js  net.js  package.json
  remote/       controle remoto PWA (celular)
    index.html  app.js  style.css  manifest.webmanifest  sw.js
  setup/        portal de configuração WiFi (celular no hotspot)
    index.html  app.js  style.css
  scripts/      provisionamento do Pi
    install.sh                 instalador (pacotes, kiosk, WiFi, Tailscale, SSH)
    skycroft-netcheck.sh       vigia de rede (sobe/derruba o hotspot)
    skycroft-wifi-connect.sh   conecta o aparelho ao WiFi (via sudo)
    kiosk-session.sh           sessão Chromium fullscreen
    skycroft-tailscale-up.sh   Tailscale + SSH
    systemd/                   units + Xwrapper + sudoers
  BUILD-IMAGE.md  como gerar o .img flasheável
```

## Acesso remoto

- **Tailscale** (com Tailscale SSH) + **SSH** vêm habilitados pelo `install.sh`.
- `ssh skycroft@<ip-da-lan>` ou, pela Tailscale, `ssh skycroft@skycroft-ticker`.

## Hardware alvo

- Orange Pi Zero 2W (Allwinner H618, 1 GB RAM)
- Armbian Debian 13 trixie Minimal (kernel 6.18)
- Saída HDMI 1080p
