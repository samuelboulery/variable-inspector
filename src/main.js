import { createLayerSection, createVariablePill } from './components.js';

const SORT_KEY = 'vi.sortMode';

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
 * Creates and returns the toolbar element with sort toggle buttons.
 *
 * @param {Function} onSortChange - Callback invoked with the new sort mode when toggle is clicked.
 * @returns {HTMLElement} The toolbar div element.
 */
function renderToolbar(onSortChange) {
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `
    <div class="sort-toggle">
      <button data-mode="byLayer">Par calque</button>
      <button data-mode="byProperty">Par propriété</button>
    </div>
  `;
  const current = getSortMode();
  toolbar.querySelectorAll('button[data-mode]').forEach(btn => {
    if (btn.dataset.mode === current) btn.classList.add('active');
    btn.addEventListener('click', () => {
      const next = btn.dataset.mode;
      setSortMode(next);
      onSortChange(next);
    });
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

  const sortMode = getSortMode();

  if (sortMode === 'byLayer') {
    const layerIds = Object.keys(message.byLayer).sort((a, b) => {
      const orderA = message.layerInfoMap[a]?.order ?? 0;
      const orderB = message.layerInfoMap[b]?.order ?? 0;
      return orderA - orderB;
    });
    layerIds.forEach(layerId => {
      const layerInfo = message.layerInfoMap[layerId];
      if (!layerInfo) return;
      const variables = message.byLayer[layerId];
      body.appendChild(createLayerSection(layerInfo, variables));
    });
  } else {
    // byProperty mode — flat list grouped by property
    const all = Object.values(message.byLayer).flat();
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
    case 'render':
      handleRenderMessage(message);
      break;
    case 'error':
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
