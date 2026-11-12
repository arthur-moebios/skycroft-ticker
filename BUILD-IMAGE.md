# Gerar a imagem `.img` do Skycroft Ticker

> A imagem **tem que ser montada rodando no próprio Orange Pi** (instala pacotes
> ARM64, configura o NetworkManager e o kiosk no hardware). Não dá pra gerar o
> `.img` final a partir de um PC Windows — o que segue é o passo a passo pra
> construir um aparelho "modelo" e depois cloná-lo em `.img`.

## 1. Armbian base

1. Baixe o **Armbian Debian 13 (trixie) Minimal** do Orange Pi Zero 2W:
   <https://dl.armbian.com/orangepizero2w/Trixie_current_minimal>
2. Grave no SD com o **balenaEtcher**.
3. Boote no Orange Pi (HDMI + teclado só nesta etapa), faça o 1º login
   (`root` / `1234`), defina a senha e crie o usuário quando pedido.
4. Conecte à internet uma vez (cabo não existe aqui — use o WiFi do Armbian:
   `nmtui` ou `armbian-config`). Essa conexão é só pra instalar os pacotes.

## 2. Instalar o Skycroft

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/arthur-moebios/skycroft-ticker.git
cd skycroft-ticker
sudo ./scripts/install.sh
sudo reboot
```

Opcional, para personalizar o hotspot de configuração:

```bash
sudo SKYCROFT_AP_SSID="MinhaTV-Setup" SKYCROFT_AP_PASS="umasenha123" ./scripts/install.sh
```

> **Tailscale:** o `install.sh` instala o Tailscale mas **não autentica** se você
> não passar `TS_AUTHKEY`. Deixe assim ao criar a imagem — autenticar antes de
> clonar faria todos os aparelhos compartilharem a mesma identidade. Autentique
> **em cada aparelho depois do flash** (veja a seção 5).

## 3. Validar

Depois do `reboot`, sem WiFi de casa configurado, a TV deve mostrar a **tela de
setup com o QR**. Teste o fluxo:

1. No celular, escaneie o QR (ou entre na rede `Skycroft-Setup`).
2. Abra `http://10.42.0.1:8099/setup`, escolha seu WiFi e conecte.
3. A TV volta pro placar; o controle fica em `http://<ip>:8099/remote`.

Logs úteis:

```bash
systemctl status skycroft-server skycroft-netcheck skycroft-kiosk
journalctl -u skycroft-kiosk -b --no-pager | tail -40
```

## 4. Limpar antes de clonar (deixa a imagem "de fábrica")

```bash
sudo tailscale logout 2>/dev/null || true
sudo rm -f /etc/ssh/ssh_host_*            # regeram no 1º boot
sudo rm -f /var/lib/skycroft 2>/dev/null; sudo rm -f /run/skycroft/net.json
sudo rm -f /etc/NetworkManager/system-connections/*.nmconnection  # tira o WiFi de casa (mantém o AP)
# recria o AP caso tenha sido removido acima:
sudo SKYCROFT_AP_SSID="Skycroft-Setup" bash -c 'nmcli connection show Skycroft-Setup >/dev/null 2>&1 || /opt/skycroft/scripts/install.sh >/dev/null'
sudo rm -f /root/.bash_history /home/*/.bash_history
sudo poweroff
```

## 5. Clonar o SD em `.img`

**No Windows** (mais simples): use o **Win32 Disk Imager** → campo de arquivo
aponta pra `skycroft-ticker.img`, selecione o drive do SD e clique **Read**.
Depois, para encolher/zipar, abra o `.img` no WSL e rode o PiShrink (abaixo).

**No Linux / WSL:**

```bash
# descubra o device do SD (ex.: /dev/sdX) com: lsblk
sudo dd if=/dev/sdX of=skycroft-ticker.img bs=4M status=progress
# encolhe pro tamanho usado e habilita auto-expand no 1º boot:
curl -fsSL https://raw.githubusercontent.com/Drewsif/PiShrink/master/pishrink.sh -o pishrink.sh
sudo bash pishrink.sh -z skycroft-ticker.img   # gera skycroft-ticker.img.gz
```

Pronto: `skycroft-ticker.img(.gz)` é flasheável com o balenaEtcher em qualquer SD.

## 6. Em cada aparelho novo (depois do flash)

```bash
# WiFi: pelo próprio onboarding (QR na TV) — nada a fazer por SSH.
# Tailscale + SSH remoto:
sudo TS_AUTHKEY=tskey-xxxxx /opt/skycroft/scripts/skycroft-tailscale-up.sh
# ou interativo:
sudo tailscale up --ssh --hostname skycroft-ticker
```

SSH já vem habilitado: `ssh skycroft@<ip-da-lan>` ou, via Tailscale,
`ssh skycroft@skycroft-ticker`.
