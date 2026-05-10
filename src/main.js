import { createLayerSection } from './components.js';

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
 * Renders the scan result into the #app container.
 *
 * @param {object} message - RenderMessage from the plugin thread.
 */
function handleRenderMessage(message) {
  const app = document.getElementById('app');
  app.innerHTML = '';

  if (message.noVariablesFound) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No variables or unbound properties found in the selection.';
    app.appendChild(empty);
    return;
  }

  // Render bound-variable sections, sorted by insertion order
  const layerIds = Object.keys(message.byLayer).sort((a, b) => {
    const orderA = message.layerInfoMap[a]?.order ?? 0;
    const orderB = message.layerInfoMap[b]?.order ?? 0;
    return orderA - orderB;
  });

  layerIds.forEach(layerId => {
    const layerInfo = message.layerInfoMap[layerId];
    if (!layerInfo) return;
    const variables = message.byLayer[layerId];
    const section = createLayerSection(layerInfo, variables);
    app.appendChild(section);
  });

  // Render unbound properties section
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

    app.appendChild(dangerSection);
  }
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
