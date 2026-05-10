import { createLayerSection, createVariablePill } from './components.js';

const SORT_KEY = 'vi.sortMode';
const FILTER_TYPES_KEY = 'vi.filter.types';
const FILTER_ORIGINS_KEY = 'vi.filter.origins';
const SEARCH_KEY = 'vi.search';

/**
 * Retrieves the current sort mode from localStorage.
 * Defaults to 'byLayer' if not set.
 */
function getSortMode() {
  return localStorage.getItem(SORT_KEY) === 'byProperty' ? 'byProperty' : 'byLayer';
}

/**
 * Persists the sort mode to localStorage.
 */
function setSortMode(mode) {
  localStorage.setItem(SORT_KEY, mode);
}

/**
 * Retrieves the current filter state from localStorage.
 */
function getFilterState() {
  let types = [];
  let origins = [];
  try { types = JSON.parse(localStorage.getItem(FILTER_TYPES_KEY) || '[]'); } catch {}
  try { origins = JSON.parse(localStorage.getItem(FILTER_ORIGINS_KEY) || '[]'); } catch {}
  return {
    search: localStorage.getItem(SEARCH_KEY) || '',
    types: Array.isArray(types) ? types : [],
    origins: Array.isArray(origins) ? origins : [],
  };
}

/**
 * Persists the filter state to localStorage.
 */
function setFilterState(filter) {
  localStorage.setItem(SEARCH_KEY, filter.search);
  localStorage.setItem(FILTER_TYPES_KEY, JSON.stringify(filter.types));
  localStorage.setItem(FILTER_ORIGINS_KEY, JSON.stringify(filter.origins));
}

/**
 * Escapes HTML special characters to prevent XSS.
 */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

/**
 * Creates and returns the toolbar element with search, filter chips, sort toggle, and rescan button.
 *
 * @param {Function} onChange - Callback invoked when any control changes.
 * @returns {HTMLElement} The toolbar div element.
 */
function renderToolbar(onChange) {
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  const filter = getFilterState();
  toolbar.innerHTML = `
    <div class="toolbar-row">
      <input class="search-input" type="text" placeholder="🔍 Rechercher..." value="${escapeHtml(filter.search)}" />
      <button class="rescan-btn" title="Re-scan selection">⟳</button>
    </div>
    <div class="toolbar-row">
      <div class="sort-toggle">
        <button data-mode="byLayer">Par calque</button>
        <button data-mode="byProperty">Par propriété</button>
      </div>
    </div>
    <div class="filter-row">
      <span class="filter-label">Type:</span>
      <button class="chip" data-filter="type" data-value="COLOR">Color</button>
      <button class="chip" data-filter="type" data-value="FLOAT">Float</button>
      <button class="chip" data-filter="type" data-value="STRING">String</button>
      <button class="chip" data-filter="type" data-value="BOOLEAN">Bool</button>
    </div>
    <div class="filter-row">
      <span class="filter-label">Origine:</span>
      <button class="chip" data-filter="origin" data-value="local">Local</button>
      <button class="chip" data-filter="origin" data-value="external">External</button>
    </div>
  `;

  const sortMode = getSortMode();
  toolbar.querySelectorAll('button[data-mode]').forEach(btn => {
    if (btn.dataset.mode === sortMode) btn.classList.add('active');
    btn.addEventListener('click', () => {
      setSortMode(btn.dataset.mode);
      onChange();
    });
  });

  toolbar.querySelectorAll('.chip').forEach(chip => {
    const f = chip.dataset.filter;
    const v = chip.dataset.value;
    const arr = f === 'type' ? filter.types : filter.origins;
    if (arr.includes(v)) chip.classList.add('active');
    chip.addEventListener('click', () => {
      const cur = getFilterState();
      const target = f === 'type' ? cur.types : cur.origins;
      const idx = target.indexOf(v);
      if (idx >= 0) target.splice(idx, 1); else target.push(v);
      setFilterState(cur);
      onChange();
    });
  });

  let searchTimer = null;
  toolbar.querySelector('.search-input').addEventListener('input', (ev) => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const cur = getFilterState();
      cur.search = ev.target.value;
      setFilterState(cur);
      onChange();
    }, 150);
  });

  toolbar.querySelector('.rescan-btn').addEventListener('click', () => {
    parent.postMessage({ pluginMessage: { type: 'rescan' } }, '*');
  });

  return toolbar;
}

/**
 * Creates and returns the stats dashboard element.
 *
 * @param {object} stats - Statistics object with counts and coverage metrics.
 * @returns {HTMLElement} The stats dashboard div element.
 */
function renderStats(stats) {
  const dashboard = document.createElement('div');
  dashboard.className = 'stats-dashboard';
  const coveragePct = Math.round(stats.variableCoverage * 100);
  dashboard.innerHTML = `
    <div class="stats-line">
      <strong>${stats.totalVariables}</strong> variables
      • <strong>${stats.totalHardcoded}</strong> hardcoded (${100 - coveragePct}%)
    </div>
    <div class="stats-line">
      <strong>${stats.byOrigin.local}</strong> local • <strong>${stats.byOrigin.external}</strong> external
    </div>
    <div class="stats-bar">
      <div class="stats-bar-fill" style="width: ${coveragePct}%"></div>
      <span class="stats-bar-label">Coverage : ${coveragePct}%</span>
    </div>
  `;
  return dashboard;
}

let lastMessage = null;

/**
 * Renders the scan result into the #app container with toolbar and sort modes.
 *
 * @param {object} message - RenderMessage from the plugin thread.
 */
function handleRenderMessage(message) {
  lastMessage = message;
  const app = document.getElementById('app');
  app.innerHTML = '';

  if (message.stats) app.appendChild(renderStats(message.stats));

  app.appendChild(renderToolbar(() => renderBody(app, lastMessage)));

  renderBody(app, message);
}

/**
 * Renders the main body content (either byLayer or byProperty mode).
 * Applies filter state before rendering.
 *
 * @param {HTMLElement} app - The app container element.
 * @param {object} message - RenderMessage from the plugin thread.
 */
function renderBody(app, message) {
  const old = app.querySelector('.app-body');
  if (old) old.remove();

  const body = document.createElement('div');
  body.className = 'app-body';

  if (message.noVariablesFound) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No variables or unbound properties found in the selection.';
    body.appendChild(empty);
    app.appendChild(body);
    return;
  }

  // Apply filter to byLayer entries
  const filter = getFilterState();
  const filteredByLayer = {};
  for (const [layerId, entries] of Object.entries(message.byLayer)) {
    const q = filter.search.trim().toLowerCase();
    const kept = entries.filter(e => {
      if (q && !(
        e.layer.toLowerCase().includes(q) ||
        e.property.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q)
      )) return false;
      if (filter.types.length > 0 && !filter.types.includes(e.type)) return false;
      if (filter.origins.length > 0 && !filter.origins.includes(e.origin)) return false;
      return true;
    });
    if (kept.length > 0) filteredByLayer[layerId] = kept;
  }

  const sortMode = getSortMode();

  if (sortMode === 'byLayer') {
    const layerIds = Object.keys(filteredByLayer).sort((a, b) => {
      const orderA = message.layerInfoMap[a]?.order ?? 0;
      const orderB = message.layerInfoMap[b]?.order ?? 0;
      return orderA - orderB;
    });
    if (layerIds.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No results match the current filters.';
      body.appendChild(empty);
    } else {
      layerIds.forEach(layerId => {
        const layerInfo = message.layerInfoMap[layerId];
        if (!layerInfo) return;
        const variables = filteredByLayer[layerId];
        body.appendChild(createLayerSection(layerInfo, variables));
      });
    }
  } else {
    // byProperty mode — flat list grouped by property
    const all = Object.values(filteredByLayer).flat();
    if (all.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No results match the current filters.';
      body.appendChild(empty);
    } else {
      const byProp = {};
      for (const e of all) {
        if (!byProp[e.property]) byProp[e.property] = [];
        byProp[e.property].push(e);
      }
      const props = Object.keys(byProp).sort();
      props.forEach(prop => {
        const section = document.createElement('div');
        section.className = 'property-section';
        const h = document.createElement('h2');
        h.textContent = `${prop} (${byProp[prop].length})`;
        section.appendChild(h);
        byProp[prop].forEach(entry => {
          const row = document.createElement('div');
          row.className = 'property-row';
          const layerLabel = document.createElement('span');
          layerLabel.className = 'property-row-layer';
          layerLabel.textContent = entry.layer;
          layerLabel.style.cursor = 'pointer';
          layerLabel.addEventListener('click', () => {
            parent.postMessage({ pluginMessage: { type: 'select-node', nodeId: entry.layerId } }, '*');
          });
          row.appendChild(layerLabel);
          row.appendChild(document.createTextNode(' → '));
          row.appendChild(createVariablePill(entry));
          section.appendChild(row);
        });
        body.appendChild(section);
      });
    }
  }

  if (message.unbound && message.unbound.length > 0) {
    const dangerSection = document.createElement('div');
    dangerSection.className = 'danger';
    const title = document.createElement('h3');
    title.textContent = 'Hardcoded properties (not bound to variables)';
    dangerSection.appendChild(title);
    const list = document.createElement('ul');
    message.unbound.forEach(usage => {
      const li = document.createElement('li');
      li.className = 'unbound-variable';
      li.textContent = `${usage.layer} — ${usage.property}: ${usage.value}`;
      list.appendChild(li);
    });
    dangerSection.appendChild(list);
    body.appendChild(dangerSection);
  }

  app.appendChild(body);
}

/**
 * Initializes the resize handle that lets the user drag the plugin panel larger.
 */
function initializeResizeHandler() {
  const resizeHandle = document.querySelector('.resize-handle');
  let isResizing = false;
  let startX, startY, startWidth, startHeight;

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startWidth = window.innerWidth;
    startHeight = window.innerHeight;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const width = Math.max(300, startWidth + (e.clientX - startX));
    const height = Math.max(200, startHeight + (e.clientY - startY));

    parent.postMessage({
      pluginMessage: { type: 'resize', width, height }
    }, '*');
  });

  document.addEventListener('mouseup', () => {
    isResizing = false;
  });

  document.addEventListener('selectstart', (e) => {
    if (isResizing) e.preventDefault();
  });
}

/**
 * Renders an error message into the #app container.
 *
 * @param {object} message - ErrorMessage from the plugin thread.
 */
function handleErrorMessage(message) {
  const app = document.getElementById('app');
  app.innerHTML = '';

  const errorEl = document.createElement('p');
  errorEl.className = 'error-state';
  errorEl.textContent = `Error: ${message.message}`;
  app.appendChild(errorEl);
}

/**
 * Routes incoming plugin thread messages to the appropriate handler.
 *
 * @param {MessageEvent} event - Browser message event wrapping the plugin message.
 */
function handlePluginMessage(event) {
  const message = event.data.pluginMessage;
  if (!message) return;

  switch (message.type) {
    case 'scan-start':
      document.querySelectorAll('.rescan-btn').forEach(b => b.classList.add('scanning'));
      break;
    case 'render':
      document.querySelectorAll('.rescan-btn').forEach(b => b.classList.remove('scanning'));
      handleRenderMessage(message);
      break;
    case 'error':
      document.querySelectorAll('.rescan-btn').forEach(b => b.classList.remove('scanning'));
      handleErrorMessage(message);
      break;
    default:
      break;
  }
}

/**
 * Bootstraps the UI: sets up resize handling and the message listener.
 */
function initialize() {
  initializeResizeHandler();
  window.onmessage = handlePluginMessage;
}

initialize();
