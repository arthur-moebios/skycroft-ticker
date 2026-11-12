# Gerar a imagem `.img` do Skycroft Ticker

A imagem leva **tudo embutido** e no **1º boot já funciona**, sem teclado:

- liga; se **não achar um WiFi conhecido**, sobe a **rede convidada `Skycroft-Setup`**;
- a **TV mostra um QR** que conecta o celular nessa rede;
- abre a **página de config** (`/setup`) que **busca os WiFis, você escolhe um,
  digita a senha e pronto** — o aparelho entra na sua rede e volta pro placar;
- **SSH** habilitado e **Tailscale com Tailscale SSH** (acesso remoto seguro).

> **Por que precisa "assar" a imagem (e não só copiar arquivos num SD):** instalar
> Chromium, NetworkManager, Tailscale etc. precisa de internet — mas no 1º boot o
> aparelho ainda não tem WiFi (é justamente o que o onboarding resolve). Então os
> pacotes têm que já vir **dentro da imagem**. É o que o builder abaixo faz.

---

## Caminho recomendado — assar a imagem (1 comando)

Usa o **Armbian build framework** pra montar uma imagem Armbian trixie Minimal do
Orange Pi Zero 2W com o Skycroft já provisionado.

**Onde rodar:** um **Linux x86-64 com Docker**. No Windows, use **WSL2 + Docker**
(uma distro Ubuntu no WSL2 resolve). Não dá pra gerar o `.img` direto do Windows
"puro" — o build é ARM e roda em container Linux.

```bash
# dentro do repositório skycroft-ticker, num Linux/WSL2 com Docker:
./image/build-image.sh
```

Isso clona o Armbian build, injeta este projeto e compila. Saída:

```
~/armbian-skycroft/output/images/Armbian_*_Orangepizero2w_trixie_*.img
```

Primeira vez: ~30–60 min e ~25 GB livres (baixa fontes e compila). Grave o `.img`
com o **balenaEtcher** e pronto.

Personalizar o hotspot antes de assar (opcional):

```bash
SKYCROFT_AP_SSID="MinhaTV-Setup" SKYCROFT_AP_PASS="umasenha123" ./image/build-image.sh
```

> **Tailscale na imagem:** o builder instala e **habilita** o Tailscale, mas **não
> autentica** — de propósito. Autenticar antes de clonar deixaria todos os aparelhos
> com a mesma identidade. Autentique **em cada aparelho** depois do flash (seção
> "Acesso remoto" abaixo).

---

## Caminho alternativo — instalar num Pi e clonar o SD

Se preferir não usar o build framework, dá pra provisionar um Pi "modelo" e tirar
uma imagem dele. Precisa de internet temporária nesse Pi (WiFi via `nmtui` só pra
instalar os pacotes).

```bash
# Armbian trixie Minimal já gravado e no 1º login feito:
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/arthur-moebios/skycroft-ticker.git
cd skycroft-ticker
sudo ./scripts/install.sh
sudo reboot
```

Depois de validar (ver abaixo), limpe e clone o SD:

```bash
sudo tailscale logout 2>/dev/null || true
sudo rm -f /etc/ssh/ssh_host_*                 # regeram no 1º boot
sudo rm -f /run/skycroft/net.json
# remove o WiFi de casa, mantém o hotspot de setup:
sudo find /etc/NetworkManager/system-connections -name '*.nmconnection' \
     ! -name 'Skycroft-Setup.nmconnection' -delete
sudo rm -f /root/.bash_history /home/*/.bash_history
sudo poweroff
```

E clone o SD em `.img`:

- **Windows:** Win32 Disk Imager → aponte pra `skycroft-ticker.img`, selecione o SD, **Read**.
- **Linux/WSL:** `sudo dd if=/dev/sdX of=skycroft-ticker.img bs=4M status=progress`
  (descubra o device com `lsblk`). Para encolher: PiShrink
  (`curl -fsSL https://raw.githubusercontent.com/Drewsif/PiShrink/master/pishrink.sh | sudo bash -s - -z skycroft-ticker.img`).

---

## Validar (depois do 1º boot, sem WiFi configurado)

A TV deve mostrar a **tela de setup com o QR** do hotspot. Teste o fluxo:

1. No celular, escaneie o QR (ou entre na rede `Skycroft-Setup`).
2. Abra `http://10.42.0.1:8099/setup`, escolha seu WiFi e conecte.
3. A TV volta pro placar; o controle fica em `http://<ip>:8099/remote`.

Logs:

```bash
systemctl status skycroft-server skycroft-netcheck skycroft-kiosk
journalctl -u skycroft-kiosk -b --no-pager | tail -40
```

## Acesso remoto (em cada aparelho, depois do flash)

```bash
# Tailscale + SSH aceito pela Tailscale:
sudo tailscale up --ssh --hostname skycroft-ticker          # abre uma URL de login
# ou sem interação, com uma authkey sua:
sudo TS_AUTHKEY=tskey-xxxxx /opt/skycroft/scripts/skycroft-tailscale-up.sh
```

- SSH local: `ssh skycroft@<ip-da-lan>`
- SSH pela Tailscale: `ssh skycroft@skycroft-ticker` (Tailscale SSH — sem abrir porta na internet)
