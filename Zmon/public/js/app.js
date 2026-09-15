const grid = document.getElementById('ap-grid');
const template = document.getElementById('ap-card-template');
const searchInput = document.getElementById('search');
const refreshBtn = document.getElementById('refresh-btn');
const errorBanner = document.getElementById('error-banner');
const connDot = document.getElementById('conn-dot');
const connLabel = document.getElementById('conn-label');
const lastUpdateEl = document.getElementById('last-update');

let allAps = [];
let refreshIntervalMs = 15000;
let timer = null;

function formatUptime(seconds) {
  if (!seconds) return '-';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function render(aps) {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = query
    ? aps.filter((ap) =>
        [ap.name, ap.ip, ap.mac, ap.model].filter(Boolean).some((v) => v.toLowerCase().includes(query))
      )
    : aps;

  grid.innerHTML = '';

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = aps.length === 0 ? 'Nenhum AP encontrado na controladora.' : 'Nenhum AP corresponde à busca.';
    grid.appendChild(empty);
  }

  for (const ap of filtered) {
    const node = template.content.cloneNode(true);
    const card = node.querySelector('.ap-card');
    card.classList.add(ap.online ? 'online' : 'offline');

    node.querySelector('.ap-name').textContent = ap.name;
    node.querySelector('.ap-ip').textContent = ap.ip || '-';
    node.querySelector('.ap-mac').textContent = ap.mac || '-';
    node.querySelector('.ap-model').textContent = ap.model || '-';
    node.querySelector('.ap-uptime').textContent = ap.online ? formatUptime(ap.uptimeSeconds) : '-';
    node.querySelector('.ap-clients').textContent = ap.clients ?? '-';
    node.querySelector('.ap-cpu').textContent = ap.cpuPct != null ? `${ap.cpuPct}%` : '-';
    node.querySelector('.ap-mem').textContent = ap.memPct != null ? `${ap.memPct}%` : '-';
    node.querySelector('.ap-down').textContent = ap.downMbps != null ? `${ap.downMbps} Mbps` : '-';
    node.querySelector('.ap-up').textContent = ap.upMbps != null ? `${ap.upMbps} Mbps` : '-';

    const essidsEl = node.querySelector('.ap-essids');
    const essids = [...new Set(ap.essids || [])];
    for (const essid of essids) {
      const span = document.createElement('span');
      span.textContent = essid;
      essidsEl.appendChild(span);
    }

    grid.appendChild(node);
  }

  document.getElementById('summary-total').textContent = aps.length;
  document.getElementById('summary-online').textContent = aps.filter((a) => a.online).length;
  document.getElementById('summary-offline').textContent = aps.filter((a) => !a.online).length;
  document.getElementById('summary-clients').textContent = aps.reduce((sum, a) => sum + (a.clients || 0), 0);
}

function setConnState(ok) {
  connDot.classList.remove('ok', 'error');
  connDot.classList.add(ok ? 'ok' : 'error');
  connLabel.textContent = ok ? 'conectado' : 'erro de conexão';
}

async function fetchAps() {
  try {
    const res = await fetch('/api/aps');
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);

    allAps = body.aps.slice().sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' })
    );
    render(allAps);
    setConnState(true);
    errorBanner.hidden = true;
    lastUpdateEl.textContent = `· atualizado ${new Date().toLocaleTimeString('pt-BR')}`;
  } catch (err) {
    setConnState(false);
    errorBanner.hidden = false;
    errorBanner.textContent = `Falha ao buscar dados da controladora: ${err.message}`;
  }
}

async function init() {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    refreshIntervalMs = cfg.refreshIntervalMs || refreshIntervalMs;
  } catch {
    // usa o padrão se /api/config falhar
  }

  await fetchAps();
  timer = setInterval(fetchAps, refreshIntervalMs);
}

searchInput.addEventListener('input', () => render(allAps));
refreshBtn.addEventListener('click', async () => {
  clearInterval(timer);
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Atualizando...';
  await fetchAps();
  refreshBtn.disabled = false;
  refreshBtn.textContent = 'Atualizar';
  timer = setInterval(fetchAps, refreshIntervalMs);
});

init();
