import { createVariableTypeIcon, createPropertyIcon, createLayerTypeIcon, formatRGBA } from './ui.js';

let openPathPill = null; // singleton open pill for auto-close

/**
 * Creates a variable pill element displaying the variable's type icon and name.
 * If the item has a path, clicking the pill toggles a breadcrumb expansion.
 * Only one pill can be expanded at a time (single-open semantics).
 *
 * @param {object} item - A FullUsageEntry with origin, type, name, and optional path fields.
 * @returns {HTMLElement} The pill wrapper div element.
 */
export function createVariablePill(item) {
  const wrapper = document.createElement('div');
  wrapper.className = 'pill-wrapper';

  const pill = document.createElement('span');
  pill.className = `variable-pill ${item.origin}-variable`;
  pill.style.cursor = item.path ? 'pointer' : 'default';

  // Inject color swatch before type icon for COLOR variables
  if (item.type === 'COLOR' && item.colorValue) {
    const swatch = document.createElement('span');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = formatRGBA(item.colorValue);
    pill.appendChild(swatch);
  }

  const typeIcon = createVariableTypeIcon(item.type);
  if (typeIcon) {
    pill.appendChild(typeIcon);
  }

  const nameSpan = document.createElement('span');
  nameSpan.textContent = item.name;
  pill.appendChild(nameSpan);

  wrapper.appendChild(pill);

  if (item.path) {
    const pathBox = document.createElement('div');
    pathBox.className = 'variable-path';
    pathBox.style.display = 'none';
    pathBox.appendChild(buildPathBreadcrumb(item.path));
    wrapper.appendChild(pathBox);

    pill.addEventListener('click', () => {
      const isOpen = pathBox.style.display === 'block';
      if (openPathPill && openPathPill !== pathBox) {
        openPathPill.style.display = 'none';
      }
      pathBox.style.display = isOpen ? 'none' : 'block';
      openPathPill = isOpen ? null : pathBox;
    });
  }

  return wrapper;
}

/**
 * Builds a breadcrumb display for a variable path.
 *
 * @param {object} path - The variable path with library, collection, groups, name, and isAlias fields.
 * @returns {HTMLElement} The breadcrumb content div.
 */
function buildPathBreadcrumb(path) {
  const root = document.createElement('div');
  root.className = 'path-content';
  const parts = [];
  if (path.library) {
    parts.push(path.library);
  }
  parts.push(path.collection);
  for (const g of path.groups) {
    parts.push(g);
  }
  parts.push(path.name);
  root.textContent = '└─ ' + parts.join(' / ');
  if (path.isAlias) {
    const aliasTag = document.createElement('span');
    aliasTag.className = 'alias-tag';
    aliasTag.textContent = ' (alias)';
    root.appendChild(aliasTag);
  }
  return root;
}

/**
 * Creates a property label element with an icon and display name.
 *
 * @param {string} property - Human-readable property name (e.g. "Fill", "Padding Left").
 * @returns {HTMLElement} The container div element.
 */
export function createPropertyElement(property) {
  const container = document.createElement('div');
  container.className = 'title-property-container';

  const propertyIcon = createPropertyIcon(property);
  if (propertyIcon) {
    container.appendChild(propertyIcon);
  }

  const nameSpan = document.createElement('span');
  nameSpan.className = 'property-name';
  nameSpan.textContent = property;
  container.appendChild(nameSpan);

  return container;
}

/**
 * Creates a grouped list of properties under a titled section.
 *
 * @param {string} title - Group heading text.
 * @param {string[]} properties - Array of property display names.
 * @returns {HTMLElement} The group div element.
 */
export function createPropertyGroup(title, properties) {
  const group = document.createElement('div');
  group.className = 'property-group';

  const titleElement = document.createElement('div');
  titleElement.className = 'property-group-title';
  titleElement.textContent = title;
  group.appendChild(titleElement);

  const list = document.createElement('ul');
  list.className = 'property-sub-list';

  properties.forEach(prop => {
    const li = document.createElement('li');
    li.appendChild(createPropertyElement(prop));
    list.appendChild(li);
  });

  group.appendChild(list);
  return group;
}

/**
 * Creates a collapsible layer section displaying its bound variables.
 * Includes a "select" button that focuses the layer in the Figma canvas.
 *
 * @param {object} layerInfo - LayerInfo object with id, name, and type fields.
 * @param {object[]} variables - Array of FullUsageEntry objects for this layer.
 * @returns {HTMLElement} The section div element.
 */
export function createLayerSection(layerInfo, variables) {
  const section = document.createElement('div');
  section.className = 'layer-section';

  const header = document.createElement('div');
  header.className = 'layer-header';

  const headerContent = document.createElement('div');
  headerContent.className = 'layer-header-content';

  const layerIcon = createLayerTypeIcon(layerInfo.type);
  if (layerIcon) {
    headerContent.appendChild(layerIcon);
  }

  const layerName = document.createElement('h2');
  layerName.textContent = layerInfo.name;
  headerContent.appendChild(layerName);

  if (layerInfo.count && layerInfo.count > 1) {
    const badge = document.createElement('span');
    badge.className = 'merge-badge';
    badge.textContent = `× ${layerInfo.count}`;
    badge.title = 'Click to cycle through merged instances';
    badge.dataset.cycleIndex = '0';
    badge.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const ids = layerInfo.mergedNodeIds || [];
      if (ids.length === 0) return;
      let idx = parseInt(badge.dataset.cycleIndex, 10) || 0;
      parent.postMessage({ pluginMessage: { type: 'select-node', nodeId: ids[idx] } }, '*');
      idx = (idx + 1) % ids.length;
      badge.dataset.cycleIndex = String(idx);
    });
    headerContent.appendChild(badge);
  }

  header.appendChild(headerContent);

  const selectIcon = document.createElement('div');
  selectIcon.className = 'select-icon';
  selectIcon.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M15.5 12L12 15.5L8.5 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  selectIcon.addEventListener('click', () => {
    parent.postMessage({ pluginMessage: { type: 'select-node', nodeId: layerInfo.id } }, '*');
  });
  header.appendChild(selectIcon);

  section.appendChild(header);

  if (variables && variables.length > 0) {
    const varList = document.createElement('div');
    varList.className = 'variable-list';
    variables.forEach(variable => {
      varList.appendChild(createVariablePill(variable));
    });
    section.appendChild(varList);
  }

  return section;
}
