/// <reference types="@figma/plugin-typings" />

import { VariableUsage } from './types';
import { PROPERTY_NAMES, PROPERTY_MAPPING } from './constants';
import { processedFontSizeNodeIds } from './dedup';
import { logger } from './utils/logger';

// Figma Paint typings do not expose boundVariables — augment locally.
type PaintWithBindings = Paint & { boundVariables?: { color?: { id: string } } };

// Figma Effect typings do not expose boundVariables — augment locally.
interface EffectWithBindings {
  type: string;
  radius?: number;
  spread?: number;
  offset?: { x: number; y: number };
  color?: RGB;
  boundVariables?: Record<string, { id: string }>;
}

// SceneNode typings do not always expose boundVariables — augment locally.
type NodeWithBindings = SceneNode & {
  boundVariables?: Record<string, { id: string } | Array<{ id: string }>>;
};

// Some nodes have a `backgrounds` property not in the official typings.
type NodeWithBackgrounds = SceneNode & { backgrounds?: Paint[] };

/**
 * Collects fill and background color variable usages from a node.
 *
 * @param node - The scene node to inspect.
 * @param usages - Array to append found usages to.
 */
function getColorUsages(node: SceneNode, usages: VariableUsage[]): void {
  const colourPaints: Paint[] = [];
  if ('fills' in node && Array.isArray(node.fills)) {
    colourPaints.push(...(node.fills as Paint[]));
  }
  const nodeWithBg = node as NodeWithBackgrounds;
  if (Array.isArray(nodeWithBg.backgrounds)) {
    colourPaints.push(...nodeWithBg.backgrounds);
  }

  const seenColorIds = new Set<string>();
  const fillVariableIds = new Set<string>();

  for (const paint of colourPaints) {
    const p = paint as PaintWithBindings;
    const binding = p.boundVariables?.color;
    if (binding?.id && !seenColorIds.has(binding.id)) {
      fillVariableIds.add(binding.id);
      seenColorIds.add(binding.id);
    }
  }

  if (fillVariableIds.size > 0) {
    const firstId = Array.from(fillVariableIds)[0];
    usages.push({ layer: getLayerDisplayName(node), property: PROPERTY_NAMES.FILL, id: firstId });
    if (fillVariableIds.size > 1) {
      logger.log(`${node.name} has ${fillVariableIds.size} fill variables, only the first is shown`);
    }
  }
}

/**
 * Collects stroke color variable usages from a node.
 *
 * @param node - The scene node to inspect.
 * @param usages - Array to append found usages to.
 */
function getStrokeUsages(node: SceneNode, usages: VariableUsage[]): void {
  if (!('strokes' in node) || !Array.isArray(node.strokes)) return;
  for (const stroke of node.strokes as Paint[]) {
    const paint = stroke as PaintWithBindings;
    const binding = paint.boundVariables?.color;
    if (binding?.id) {
      usages.push({ layer: getLayerDisplayName(node), property: PROPERTY_NAMES.STROKE_COLOR, id: binding.id });
    }
  }
}

/**
 * Returns a human-readable display name for a node.
 * Detects Figma internal ID-like names (e.g. "I120:11083;62:3910;56:3286")
 * and falls back to the component name or a formatted type label.
 *
 * @param node - The scene node to get a display name for.
 * @returns Human-readable layer name.
 */
const IS_FIGMA_ID = /^I?\d+:\d+(;\d+:\d+)*$/;
// Matches "I120:11085;62:3213" — captures the embedded instance node ID "120:11085"
const INSTANCE_SUBLAYER_ID = /^I(\d+:\d+)/;

/**
 * Attempts to get the best human-readable name from an INSTANCE node
 * by resolving through its mainComponent and COMPONENT_SET hierarchy.
 */
function resolveInstanceName(node: InstanceNode): string | null {
  const comp = node.mainComponent;
  if (!comp) return null;
  if (comp.parent?.type === 'COMPONENT_SET' && !IS_FIGMA_ID.test(comp.parent.name)) {
    return comp.parent.name;
  }
  if (!IS_FIGMA_ID.test(comp.name)) return comp.name;
  return null;
}

export function getLayerDisplayName(node: SceneNode): string {
  if (!IS_FIGMA_ID.test(node.name)) return node.name;

  // INSTANCE: resolve through component hierarchy
  if (node.type === 'INSTANCE') {
    const name = resolveInstanceName(node as InstanceNode);
    if (name) return name;
  }

  // COMPONENT: check for a named COMPONENT_SET parent
  if (node.type === 'COMPONENT') {
    const parent = node.parent;
    if (parent?.type === 'COMPONENT_SET' && !IS_FIGMA_ID.test(parent.name)) {
      return parent.name;
    }
  }

  // Walk up the parent chain (max 10 levels) for the nearest real ancestor name
  let ancestor: BaseNode | null = node.parent;
  let depth = 0;
  while (ancestor && depth < 10) {
    if (
      typeof (ancestor as { name?: string }).name === 'string' &&
      !IS_FIGMA_ID.test((ancestor as { name: string }).name) &&
      ancestor.type !== 'PAGE' &&
      ancestor.type !== 'DOCUMENT'
    ) {
      return (ancestor as { name: string }).name;
    }
    ancestor = (ancestor as { parent?: BaseNode | null }).parent ?? null;
    depth++;
  }

  // For I-prefixed sublayer names (e.g. "I120:11085;62:3213"), resolve the
  // containing instance node by its embedded ID and use its display name.
  const sublayerMatch = INSTANCE_SUBLAYER_ID.exec(node.name);
  if (sublayerMatch) {
    const container = figma.getNodeById(sublayerMatch[1]) as SceneNode | null;
    if (container) {
      if (!IS_FIGMA_ID.test(container.name)) return container.name;
      if (container.type === 'INSTANCE') {
        const name = resolveInstanceName(container as InstanceNode);
        if (name) return name;
      }
      // Walk the container's parent chain
      let a: BaseNode | null = container.parent;
      let d = 0;
      while (a && d < 5) {
        if (
          typeof (a as { name?: string }).name === 'string' &&
          !IS_FIGMA_ID.test((a as { name: string }).name) &&
          a.type !== 'PAGE' &&
          a.type !== 'DOCUMENT'
        ) {
          return (a as { name: string }).name;
        }
        a = (a as { parent?: BaseNode | null }).parent ?? null;
        d++;
      }
    }
  }

  // Final fallback: human-readable type label
  return node.type.charAt(0).toUpperCase() + node.type.slice(1).toLowerCase().replace(/_/g, ' ');
}

/**
 * Formats a Figma effect type string into a human-readable label.
 * E.g. "DROP_SHADOW" → "Drop Shadow".
 *
 * @param effectType - Raw effect type string from Figma API.
 * @returns Title-cased, space-separated string.
 */
export function formatEffectType(effectType: string): string {
  return effectType
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

/**
 * Collects effect (shadow, blur) variable usages from a node.
 *
 * @param node - The scene node to inspect.
 * @param usages - Array to append found usages to.
 */
function getEffectUsages(node: SceneNode, usages: VariableUsage[]): void {
  if (!('effects' in node) || !Array.isArray(node.effects)) return;
  for (const effect of node.effects as EffectWithBindings[]) {
    if (!effect.boundVariables) continue;
    for (const [prop, bind] of Object.entries(effect.boundVariables)) {
      if (bind.id) {
        const displayName = `${formatEffectType(effect.type)} ${prop}`;
        usages.push({ layer: getLayerDisplayName(node), property: displayName, id: bind.id });
      }
    }
  }
}

/**
 * Collects non-fill, non-stroke bound variable usages from a node's `boundVariables` map,
 * including asymmetric radius and stroke weight properties.
 *
 * @param node - The scene node to inspect.
 * @param usages - Array to append found usages to.
 */
function getNodeBoundVariables(node: SceneNode, usages: VariableUsage[]): void {
  const nodeWithBindings = node as NodeWithBindings;
  const nodeBV = nodeWithBindings.boundVariables;
  if (!nodeBV) return;

  // Skip fill/color bindings — already handled by getColorUsages
  const skipProps = new Set(['color', 'fills', 'fills.0']);

  for (const [prop, bind] of Object.entries(nodeBV)) {
    if (skipProps.has(prop) || prop.startsWith('fills.')) continue;
    const b = bind as { id?: string };
    if (b.id) {
      const displayName = PROPERTY_MAPPING[prop] ?? prop;
      usages.push({ layer: getLayerDisplayName(node), property: displayName, id: b.id });
    }
  }

  // Explicit check for asymmetric corner/stroke properties that may not appear in boundVariables
  const asymmetricProps = [
    'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius',
    'strokeTopWeight', 'strokeBottomWeight', 'strokeLeftWeight', 'strokeRightWeight',
  ];
  for (const prop of asymmetricProps) {
    const nodeAny = node as unknown as Record<string, unknown>;
    const binding = (nodeBV as Record<string, { id?: string }>)[prop];
    if (nodeAny[prop] !== undefined && binding?.id) {
      const displayName = PROPERTY_MAPPING[prop] ?? prop;
      usages.push({ layer: getLayerDisplayName(node), property: displayName, id: binding.id });
    }
  }
}

/**
 * Collects text-specific variable usages (font size, weight, letter spacing, etc.)
 * from a TextNode using both direct property lookup and recursive path traversal.
 *
 * @param node - The TextNode to inspect.
 * @param usages - Array to append found usages to.
 */
function getTextNodeVariables(node: TextNode, usages: VariableUsage[]): void {
  const txtBV = (node as NodeWithBindings).boundVariables;
  if (!txtBV) return;

  const fontProperties: Record<string, string> = {
    fontSize: PROPERTY_NAMES.FONT_SIZE,
    fontWeight: PROPERTY_NAMES.FONT_WEIGHT,
    fontFamily: PROPERTY_NAMES.FONT_FAMILY,
    letterSpacing: PROPERTY_NAMES.LETTER_SPACING,
    lineHeight: PROPERTY_NAMES.LINE_HEIGHT,
    paragraphSpacing: PROPERTY_NAMES.PARAGRAPH_SPACING,
  };

  // Pass 1: check each known font property directly
  for (const [propName, displayName] of Object.entries(fontProperties)) {
    const binding = (txtBV as Record<string, { id?: string }>)[propName];
    if (binding?.id) {
      usages.push({ layer: getLayerDisplayName(node), property: displayName, id: binding.id });
      if (propName === 'fontSize') processedFontSizeNodeIds.add(node.id);
    }
  }

  // Pass 2: recursive walk for any nested bindings not in the known list
  const varIdsByProperty: Record<string, string[]> = {};
  extractBindingIds(txtBV as Record<string, unknown>, varIdsByProperty);

  for (const [propPath, ids] of Object.entries(varIdsByProperty)) {
    let propertyName = propPath;
    for (const [propKey, displayName] of Object.entries(fontProperties)) {
      if (propPath.includes(propKey)) {
        propertyName = displayName;
        if (propKey === 'fontSize') processedFontSizeNodeIds.add(node.id);
        break;
      }
    }
    if (propertyName === propPath) {
      propertyName = PROPERTY_MAPPING[propPath] ?? propPath;
    }
    for (const id of ids) {
      usages.push({ layer: getLayerDisplayName(node), property: propertyName, id });
    }
  }
}

/**
 * Recursively walks a `boundVariables` sub-object and collects all `{id}` bindings
 * indexed by their dot-separated property path. Skips fill-related paths.
 *
 * @param obj - Object subtree to traverse.
 * @param result - Map from property path to list of variable IDs.
 * @param path - Current traversal path (used for recursion).
 */
function extractBindingIds(
  obj: Record<string, unknown>,
  result: Record<string, string[]>,
  path: string[] = [],
): void {
  if (!obj || typeof obj !== 'object') return;

  if (typeof (obj as { id?: unknown }).id === 'string') {
    const propPath = path.join('.');
    if (!propPath.startsWith('fills.') && propPath !== 'fills') {
      if (!result[propPath]) result[propPath] = [];
      result[propPath].push((obj as { id: string }).id);
    }
    return;
  }

  for (const key of Object.keys(obj)) {
    if (key === 'fills' || (path.length > 0 && path[0] === 'fills')) continue;
    extractBindingIds(obj[key] as Record<string, unknown>, result, [...path, key]);
  }
}

/**
 * Inspects a single scene node and returns all bound variable usages found on it.
 *
 * @param node - The scene node to inspect.
 * @returns Array of variable usages for this node.
 */
export function inspectNode(node: SceneNode): VariableUsage[] {
  const usages: VariableUsage[] = [];

  getColorUsages(node, usages);
  getStrokeUsages(node, usages);
  getEffectUsages(node, usages);

  if (node.type === 'TEXT') {
    getTextNodeVariables(node as TextNode, usages);
  }

  getNodeBoundVariables(node, usages);
  return usages;
}

/**
 * Iteratively collects all scene nodes within the given selection,
 * including all descendants at every depth level.
 * Uses a stack (non-recursive) to avoid stack overflows on deep trees.
 *
 * @param nodes - Top-level selected nodes.
 * @returns Flat array of all nodes (selection + all descendants).
 */
export function collectAllNodes(nodes: readonly SceneNode[]): SceneNode[] {
  const result: SceneNode[] = [];
  const stack: SceneNode[] = [...nodes];
  while (stack.length > 0) {
    const node = stack.pop()!;
    result.push(node);
    if ('children' in node && Array.isArray((node as FrameNode).children)) {
      stack.push(...(node as FrameNode).children);
    }
  }
  return result;
}
