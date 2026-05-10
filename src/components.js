import { createVariableTypeIcon, createPropertyIcon, createLayerTypeIcon } from './ui.js';

/**
 * Creates a variable pill element displaying the variable's type icon and name.
 *
 * @param {object} item - A FullUsageEntry with origin, type, and name fields.
 * @returns {HTMLElement} The pill span element.
 */
export function createVariablePill(item) {
  const pill = document.createElement('span');
  pill.className = `variable-pill ${item.origin}-variable`;

  const typeIcon = createVariableTypeIcon(item.type);
  if (typeIcon) {
    pill.appendChild(typeIcon);
  }

  const nameSpan = document.createElement('span');
  nameSpan.textContent = item.name;
  pill.appendChild(nameSpan);

  return pill;
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
