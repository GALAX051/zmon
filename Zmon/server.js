require('dotenv').config();

const express = require('express');
const https = require('https');
const fetch = require('node-fetch');
const path = require('path');

const {
  UNIFI_HOST,
  UNIFI_PORT = '8443',
  UNIFI_IS_UDM = 'false',
  UNIFI_API_TOKEN,
  UNIFI_USERNAME,
  UNIFI_PASSWORD,
  UNIFI_SITE = 'default',
  UNIFI_ALLOW_SELF_SIGNED = 'true',
  PORT = '3000',
  REFRESH_INTERVAL_MS = '15000',
} = process.env;

const isUdm = UNIFI_IS_UDM === 'true';
const useApiToken = !!UNIFI_API_TOKEN;

if (!UNIFI_HOST) {
  throw new Error('Configuração ausente: defina UNIFI_HOST no .env');
}

if (!useApiToken && (!UNIFI_USERNAME || !UNIFI_PASSWORD)) {
  throw new Error('Configuração ausente: defina UNIFI_API_TOKEN ou (UNIFI_USERNAME e UNIFI_PASSWORD) no .env');
}

const baseUrl = `https://${UNIFI_HOST}:${UNIFI_PORT}`;
const apiPrefix = isUdm ? '/proxy/network' : '';

const agent = new https.Agent({
  rejectUnauthorized: UNIFI_ALLOW_SELF_SIGNED === 'true' ? false : true,
});

async function unifiRequest(apiPath) {
  const headers = {};

  if (useApiToken) {
    headers['X-API-KEY'] = UNIFI_API_TOKEN;
  }

  const url = `${baseUrl}${apiPrefix}${apiPath}`;
  console.log(`[API] GET ${url}`);

  const res = await fetch(url, { agent, headers });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API UniFi (HTTP ${res.status}): ${body.substring(0, 100)}`);
  }

  return res.json();
}

// Guarda a última leitura de bytes de cada AP para calcular a taxa (Mbps) entre polls.
const bandwidthCache = new Map();

// Janela mínima entre leituras para considerar o cálculo confiável. Abaixo disso,
// pequenas variações de latência entre polls distorcem muito a taxa calculada.
const MIN_SAMPLE_SECONDS = 5;

function calcMbps(mac, rxBytes, txBytes) {
  const now = Date.now();
  const prev = bandwidthCache.get(mac);

  if (!prev || rxBytes < prev.rxBytes || txBytes < prev.txBytes) {
    // Primeira leitura, ou o AP reiniciou/zerou os contadores.
    bandwidthCache.set(mac, { rxBytes, txBytes, time: now });
    return { downMbps: null, upMbps: null };
  }

  const deltaSeconds = (now - prev.time) / 1000;

  // A UniFi só atualiza rx_bytes/tx_bytes quando o AP reporta pra controladora
  // (não necessariamente a cada poll nosso). Se os contadores não mudaram desde
  // a última leitura, ainda não há dado novo — não force uma taxa (ficaria 0
  // artificialmente). Mantém a leitura anterior no cache para não perder o
  // ponto de referência, e devolve a última taxa válida calculada (se houver).
  if (rxBytes === prev.rxBytes && txBytes === prev.txBytes) {
    return { downMbps: prev.downMbps ?? null, upMbps: prev.upMbps ?? null };
  }

  // Janela curta demais entre leituras (ex: cliques rápidos no botão "Atualizar")
  // amplifica ruído — mantém a leitura anterior sem recalcular ainda.
  if (deltaSeconds < MIN_SAMPLE_SECONDS) {
    return { downMbps: prev.downMbps ?? null, upMbps: prev.upMbps ?? null };
  }

  // tx_bytes do AP = dados enviados aos clientes = download do ponto de vista do cliente
  const downMbps = ((txBytes - prev.txBytes) * 8) / deltaSeconds / 1_000_000;
  // rx_bytes do AP = dados recebidos dos clientes = upload do ponto de vista do cliente
  const upMbps = ((rxBytes - prev.rxBytes) * 8) / deltaSeconds / 1_000_000;

  const result = {
    downMbps: Number(downMbps.toFixed(1)),
    upMbps: Number(upMbps.toFixed(1)),
  };

  bandwidthCache.set(mac, { rxBytes, txBytes, time: now, ...result });
  return result;
}

function normalizeAp(device) {
  const clients = device.num_sta ?? device['user-num_sta'] ?? 0;
  const rxBytes = device['rx_bytes'] ?? 0;
  const txBytes = device['tx_bytes'] ?? 0;
  const { downMbps, upMbps } = calcMbps(device.mac, rxBytes, txBytes);

  return {
    id: device._id,
    mac: device.mac,
    name: device.name || device.model || device.mac,
    model: device.model,
    ip: device.ip,
    version: device.version,
    state: device.state, // 1 = connected na maioria das versões
    online: device.state === 1,
    uptimeSeconds: device.uptime || 0,
    clients,
    cpuPct: device['system-stats'] ? Number(device['system-stats'].cpu) : null,
    memPct: device['system-stats'] ? Number(device['system-stats'].mem) : null,
    downMbps,
    upMbps,
    essids: Array.from(
      new Set((device.radio_table_stats || []).flatMap((r) => (r.essids || []).map((e) => e))).values()
    ).flat(),
    radios: (device.radio_table_stats || []).map((r) => ({
      radio: r.radio,
      channel: r.channel,
      txPower: r.tx_power,
      numSta: r.num_sta,
      satisfaction: r.satisfaction,
    })),
  };
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => {
  res.json({ refreshIntervalMs: Number(REFRESH_INTERVAL_MS), site: UNIFI_SITE });
});

app.get('/api/aps', async (req, res) => {
  try {
    const path = `/api/s/${UNIFI_SITE}/stat/device`;
    console.log(`[API] Buscando devices em ${path}`);
    const data = await unifiRequest(path);
    console.log(`[API] Resposta recebida, ${(data.data || []).length} devices no total`);
    const aps = (data.data || [])
      .filter((d) => d.type === 'uap')
      .map(normalizeAp);
    console.log(`[API] ${aps.length} APs filtrados`);
    res.json({ aps });
  } catch (err) {
    console.error(`[API] Erro: ${err.message}`);
    res.status(502).json({ error: err.message });
  }
});

app.listen(Number(PORT), () => {
  console.log(`ZMon rodando em http://localhost:${PORT}`);
});
