# ZMon

Dashboard de monitoramento de Access Points UniFi, tema black + verde.

## Como rodar

1. `npm install`
2. Copie `.env.example` para `.env` e preencha:
   - `UNIFI_HOST`, `UNIFI_PORT` (443 para UniFi OS/UDM, 8443 para controladora clássica)
   - `UNIFI_IS_UDM=true` se for UDM/UDM Pro/UDM SE/Cloud Gateway
   - `UNIFI_API_TOKEN` — gere em **Settings > Administrators > API Keys** na UniFi. É o único método de autenticação suportado hoje (veja nota abaixo).
3. `npm start`
4. Abra `http://localhost:3001` (porta definida em `PORT` no `.env` deste projeto; o padrão do `.env.example` é 3000, mas foi trocado para 3001 para não conflitar com o Grafana na VM de produção)

## Autenticação: use API Key, não usuário/senha

O `.env.example` ainda lista `UNIFI_USERNAME`/`UNIFI_PASSWORD`, mas esse caminho está **quebrado/não implementado** no código atual — `server.js` só envia o header de autenticação quando `UNIFI_API_TOKEN` está preenchido. Sem o token, nenhuma credencial é enviada e a API responde 401.

Além disso, contas UniFi com SSO/MFA habilitado falham no login por senha com `HTTP 499 MFA_AUTH_REQUIRED`, então mesmo reimplementando esse fluxo ele não serviria para essas contas.

**O que funciona:** gerar uma API Key na UniFi e enviá-la no header `X-API-KEY` (não `X-API-Token`, não `Authorization: Bearer` — ambos testados contra um UDM real e rejeitados com 401). Esse é o mesmo header usado pela integração UniFi → Grafana via plugin Infinity.

## Implantação

### Produção (Linux, systemd)

O deploy real acontece em uma VM Linux (testado em Ubuntu 24.04), não via Windows. Passos:

```bash
sudo mkdir -p /opt/zmon && sudo chown $USER:$USER /opt/zmon
# copie package.json, server.js, public/ e .env para /opt/zmon (via scp)
cd /opt/zmon && npm install
```

Crie o serviço systemd:

```bash
sudo tee /etc/systemd/system/zmon.service > /dev/null <<'EOF'
[Unit]
Description=ZMon - Dashboard de monitoramento de Access Points UniFi
After=network.target

[Service]
Type=simple
User=SEU_USUARIO
WorkingDirectory=/opt/zmon
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable zmon
sudo systemctl start zmon
```

Verificar status e logs:

```bash
sudo systemctl status zmon
sudo journalctl -u zmon -f
```

**Atenção à porta:** se a VM já roda outro serviço na porta 3000 (ex: Grafana), defina `PORT` no `.env` para outra porta livre (ex: 3001) antes de iniciar o serviço.

Para atualizar depois de alterar o código: copie os arquivos alterados via `scp` para `/opt/zmon` e rode `sudo systemctl restart zmon`. Não há CI/CD configurado — é um processo manual.

### Windows (alternativa local/dev)

Para rodar em segundo plano numa máquina Windows, iniciando com o boot:

1. Configure o `.env` e confirme que `npm start` funciona manualmente antes de instalar o serviço.
2. Abra o PowerShell **como Administrador** (obrigatório — `node-windows` precisa de privilégio elevado para registrar o serviço).
3. Rode `npm run service:install`.
4. O serviço "ZMon" passa a aparecer em `services.msc`, inicia automaticamente com o Windows e reinicia sozinho se cair.
5. Para remover: PowerShell como Administrador, `npm run service:uninstall`.

Logs do serviço ficam em `daemon/` (criado pelo `node-windows` na raiz do projeto).

## Por que existe um backend?

A API da controladora UniFi bloqueia chamadas diretas do navegador (CORS + certificado autoassinado normalmente autoassinado) e a autenticação (API Key) precisa ficar no servidor, não exposta no frontend. O `server.js` guarda a API Key e repassa (proxy) os dados já normalizados para o dashboard estático em `public/`.

## Dados exibidos

Por AP: nome, IP, MAC, modelo, status online/offline, uptime, clientes conectados, CPU/memória, taxa de download/upload estimada (Mbps), canais/potência de rádio e ESSIDs.

- CPU/memória vêm do campo `system-stats` (com hífen) no retorno de `stat/device` — não há endpoint separado para isso no UniFi OS.
- Download/upload **não vêm prontos da API** — são calculados no backend comparando os contadores acumulados `rx_bytes`/`tx_bytes` entre duas consultas consecutivas. Por isso, logo após reiniciar o servidor, esses campos aparecem como `-` até a segunda atualização.
