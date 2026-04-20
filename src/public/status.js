// Live status page — polls /health + /api/health/sources every 30s.
(function () {
  const $ = (id) => document.getElementById(id);
  const REFRESH_MS = 30 * 1000;
  let timer = null;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function renderRow(name, description, state, meta) {
    const row = el('div', 'row');
    row.setAttribute('role', 'listitem');
    const left = el('div', 'row-left');
    const dotClass = state === 'ok' ? 'ok' : state === 'warn' ? 'warn' : state === 'err' ? 'err' : 'unknown';
    left.appendChild(el('span', 'dot ' + dotClass));
    const grid = el('div', 'row-grid');
    grid.appendChild(el('div', 'row-name', name));
    if (description) grid.appendChild(el('div', 'row-desc', description));
    left.appendChild(grid);
    row.appendChild(left);

    if (meta) {
      const metaEl = el('div', 'row-meta');
      metaEl.textContent = meta;
      row.appendChild(metaEl);
    }
    const statusText = state === 'ok' ? 'Operational' : state === 'warn' ? 'Degraded' : state === 'err' ? 'Down' : 'Unknown';
    const statusClass = state === 'ok' ? 'status-ok' : state === 'warn' ? 'status-warn' : 'status-err';
    row.appendChild(el('span', 'row-status ' + statusClass, statusText));
    return row;
  }

  function setBanner(overall, title, sub) {
    const banner = $('banner');
    banner.classList.remove('degraded', 'down');
    if (overall === 'warn')     banner.classList.add('degraded');
    else if (overall === 'err') banner.classList.add('down');
    $('banner-title').textContent = title;
    $('banner-sub').textContent   = sub;
  }

  async function fetchAll() {
    const refreshBtn = $('refresh');
    if (refreshBtn) {
      refreshBtn.disabled = true;
      clear(refreshBtn);
      refreshBtn.appendChild(el('span', 'spin'));
      refreshBtn.appendChild(document.createTextNode(' Refreshing…'));
    }
    try {
      const [healthR, sourcesR] = await Promise.all([
        fetch('/health',               { cache: 'no-store' }),
        fetch('/api/health/sources',   { cache: 'no-store' })
      ]);
      const healthData  = healthR.ok  ? await healthR.json()  : null;
      const sourcesData = sourcesR.ok ? await sourcesR.json() : null;

      const rows = $('rows');
      clear(rows);

      // API row
      const apiOk = healthR.ok && healthData?.status === 'ok';
      rows.appendChild(renderRow(
        'RentVolt API',
        'HTTP endpoint at rentvolt.io',
        apiOk ? 'ok' : (healthR.status >= 500 ? 'err' : 'warn'),
        healthData?.version ? 'v' + healthData.version : null
      ));

      // Database row
      const dbState = healthData?.checks?.db === 'ok' ? 'ok' : healthData?.checks?.db ? 'err' : 'unknown';
      rows.appendChild(renderRow(
        'Database',
        'PostgreSQL (API keys, sessions, usage)',
        dbState, null
      ));

      // Upstream sources
      const mapSource = (name, human, sub) => {
        const s = sourcesData?.sources?.[name];
        if (!s) return renderRow(human, sub, 'unknown', null);
        const state = s.ok ? (s.status >= 400 ? 'warn' : 'ok') : 'err';
        return renderRow(human, sub, state, s.latencyMs != null ? s.latencyMs + ' ms' : null);
      };
      rows.appendChild(mapSource('rentcast', 'RentCast', 'Live rental listings'));
      rows.appendChild(mapSource('hud',      'HUD FMR',  'Fair Market Rent data'));
      rows.appendChild(mapSource('census',   'Census ACS', 'Demographic context'));

      // Overall banner
      const allUp = apiOk && dbState === 'ok' &&
        ['rentcast', 'hud', 'census'].every((s) => sourcesData?.sources?.[s]?.ok);
      const anyDown = !apiOk || dbState === 'err';
      if (allUp) {
        setBanner('ok', 'All systems operational', 'Every service is responding normally.');
      } else if (anyDown) {
        setBanner('err', 'Service disruption', 'One or more critical systems are down.');
      } else {
        setBanner('warn', 'Partial degradation', 'An upstream data source is reporting issues. Requests may fail for some queries.');
      }

      $('last-check').textContent = new Date().toLocaleTimeString();
    } catch (err) {
      setBanner('err', 'Cannot reach status endpoint', 'Network or DNS error. Retry in a moment.');
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        clear(refreshBtn);
        refreshBtn.textContent = 'Refresh now';
      }
    }
  }

  $('refresh').addEventListener('click', () => {
    if (timer) clearInterval(timer);
    fetchAll().then(() => {
      timer = setInterval(fetchAll, REFRESH_MS);
    });
  });

  fetchAll();
  timer = setInterval(fetchAll, REFRESH_MS);
})();
