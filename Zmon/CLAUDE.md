# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

ZMon — dashboard com tema black/verde que monitora Access Points UniFi via API da UniFi Network Controller. Backend Node/Express + frontend estático HTML/CSS/JS puro (sem frameworks, sem build step).

## Comandos

- `npm install` — instala dependências
- `npm start` — roda o servidor (`server.js`) na porta `PORT` (padrão 3000)
- `npm run dev` — mesma coisa, com `node --watch` para reload automático ao editar arquivos
- `npm run service:install` / `npm run service:uninstall` — registra/remove o ZMon como serviço do **Windows** via `node-windows` (ver `scripts/install-service.js`). Precisa rodar em PowerShell elevado (Administrador). O deploy de produção real roda em Linux via systemd (ver Implantação abaixo) — esses scripts servem para cenário local de dev/host Windows.
- Não há suíte de testes, linter ou build step neste projeto.

## Configuração

A configuração de runtime vem inteiramente de variáveis de ambiente carregadas via `dotenv` (ver `.env.example`). Copie para `.env` antes de rodar. Variáveis principais:

- `UNIFI_HOST`, `UNIFI_PORT`, `UNIFI_SITE`
- `UNIFI_IS_UDM` — ativa o prefixo de path `/proxy/network` para controladoras UniFi OS (UDM/UDM Pro/UDM SE). Controladoras clássicas standalone não usam esse prefixo.
- `UNIFI_API_TOKEN` — **o único caminho de autenticação que de fato funciona hoje.** Enviado como header `X-API-KEY` (não `X-API-Token`, não `Authorization: Bearer` — ambos foram testados contra um UDM real e rejeitados com 401; `X-API-KEY` é o que a integração UniFi → Grafana via plugin "Infinity" usa com sucesso na mesma controladora).
- `UNIFI_USERNAME` / `UNIFI_PASSWORD` — **vestigial.** O `.env.example` ainda descreve um fallback por usuário/senha, mas o fluxo de `login()` por cookie de sessão foi removido de `server.js` quando o código migrou para autenticação por API key. Se `UNIFI_API_TOKEN` não estiver definido, `unifiRequest()` atualmente não envia nenhum header de autenticação, em vez de cair num login. Não assuma que autenticação por senha funciona sem reimplementar esse trecho — e, se reimplementar, saiba que contas UniFi com SSO/MFA habilitado falham no login por senha com HTTP 499 `MFA_AUTH_REQUIRED` de qualquer forma.
- `UNIFI_ALLOW_SELF_SIGNED` — a maioria das controladoras locais usa certificado autoassinado; `true` por padrão.
- `.env` está no `.gitignore`; nunca commitar credenciais reais da controladora ou API tokens.

## Arquitetura

**Backend (`server.js`)** é um proxy/normalizador simples, não uma API genérica:

- A API da UniFi Controller bloqueia chamadas diretas do navegador (CORS + certificado autoassinado), então o backend existe puramente para guardar a API key e repassar as requisições do lado do servidor.
- `unifiRequest()` monta a URL como `baseUrl + apiPrefix + apiPath` e sempre usa `https`. Em uma controladora UniFi OS (`UNIFI_IS_UDM=true`), a API real fica atrás de um reverse proxy em `/proxy/network` — omitir esse prefixo retorna 401, não 404, o que é um modo de falha confuso caso a lógica do prefixo seja refatorada.
- Porta importa mais que protocolo nessa controladora: HTTP na porta 80 devolve um redirect 301 do nginx para HTTPS em vez de servir texto puro — não trate a porta 80 como caso especial de `http://`, apenas use `https://` na porta que a interface web da controladora usa (443 neste deployment).
- `normalizeAp()` é o único lugar que mapeia o JSON bruto de device da UniFi (`stat/device`) para o formato que o frontend consome (`GET /api/aps`). Ao adicionar novos campos exibidos, estenda essa função em vez de passar campos brutos da UniFi direto pro cliente.
  - **O JSON da UniFi usa chaves com hífen** em alguns campos (principalmente `system-stats`, não `system_stats`) — exigem acesso via colchetes (`device['system-stats']`) por não serem identificadores JS válidos. Confirme o nome exato de um campo fazendo curl direto na controladora em vez de chutar snake_case/camelCase.
  - CPU/memória (`cpuPct`/`memPct`) vêm de `system-stats.cpu`/`system-stats.mem` no mesmo payload de `stat/device` — não existe endpoint separado `stat/system` ou `stat/ap` para isso no UniFi OS.
  - `downMbps`/`upMbps` **não vêm prontos da API** — são derivados. `stat/device` retorna contadores acumulados `rx_bytes`/`tx_bytes`. `calcMbps()` mantém um `bandwidthCache` em nível de módulo (Map indexado pelo MAC do AP) com a última leitura + timestamp de cada AP e calcula `(delta de bytes * 8) / delta de segundos / 1e6` entre polls. A primeira leitura após reiniciar o servidor sempre retorna `null` para os dois (não há leitura anterior para comparar) — isso é esperado, não é bug. Atenção à inversão semântica: `tx_bytes` do AP (bytes que ele *enviou para* os clientes) mapeia para **download** do ponto de vista do cliente, e `rx_bytes` mapeia para **upload**.
- `GET /api/config` expõe `REFRESH_INTERVAL_MS` e o nome do site para o frontend, então o ritmo de polling é configurado só no servidor.

**Frontend (`public/`)** é estático, servido direto pelo Express (`express.static`) — sem bundler:

- `js/app.js` faz polling em `GET /api/aps` num intervalo lido de `GET /api/config`, e re-renderiza a grade de APs inteira no client a partir de um `<template>` (`#ap-card-template` em `index.html`) — não há virtual DOM ou diffing, os cards são reconstruídos por completo a cada refresh.
- Busca/filtro em `app.js` opera sobre o array `allAps` já buscado, no client-side; não bate no backend de novo.
- O indicador de saúde da conexão (bolinha online/offline, banner de erro) reflete se o *último poll* em `/api/aps` teve sucesso, não a semântica de disponibilidade da própria controladora UniFi.
- O botão manual "Atualizar" limpa e rearma o intervalo de polling para que um refresh manual não duplique com o próximo tick agendado; ele se desabilita e mostra "Atualizando..." durante a requisição em andamento.

## Implantação

A produção roda em uma VM Linux (Ubuntu 24.04) via **systemd**, não pelos scripts de serviço do Windows em `scripts/`:

- A aplicação fica em `/opt/zmon` na VM; o deploy é feito copiando `server.js`, `public/`, `package.json` deste repositório via `scp` e rodando `npm install` remotamente (ainda sem CI/CD — atualizações são cópias manuais de arquivo + `sudo systemctl restart zmon`).
- Roda na porta **3001**, não na padrão 3000 — essa VM já roda o Grafana na 3000.
- A unit do systemd (`/etc/systemd/system/zmon.service` na VM) define `Restart=always` e loga no journal (`sudo journalctl -u zmon -f`) — verifique ali primeiro ao debugar uma instância implantada, já que `console.log`/`console.error` em `server.js` é o único mecanismo de log.
- Ao editar comportamento dependente de `.env`, lembre que o `.env` implantado existe só na VM (gitignored, nunca sincronizado automaticamente) — mudanças no `.env.example` deste repo não se propagam para lá.

## Tema

Os tokens de design black + verde são definidos como CSS custom properties no topo de `public/css/style.css` (`--bg`, `--green`, `--green-dim`, etc.) — altere a paleta ali em vez de fixar cores em outros lugares. O logo é `public/assets/logo.svg`, um "Z" com gradiente inline reconstruído a partir da imagem de marca fornecida; substitua esse arquivo (mantendo o nome) para usar a arte original.
