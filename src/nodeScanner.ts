/// <reference types="@figma/plugin-typings" />

import { VariableUsage } from './types';
import { PROPERTY_NAMES, PROPERTY_MAPPING } from './constants';
import { processedFontSizeNodeIds } from './dedup';
import { logger } from './utils/logger';
import { getLayerDisplayName } from './utils/displayName';
import {
  scanDimensionConstraints,
  scanLayoutGridColors,
  scanVisibility,
  scanTextDecoration,
} from './propertyScanner';
import { scanComponentProperties } from './componentProps';

// Re-exported so existing imports from './nodeScanner' keep working.
export { getLayerDisplayName };

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
  const effects = node.effects as EffectWithBindings[];
  const counts: Record<string, number> = {};
  for (const e of effects) counts[e.type] = (counts[e.type] ?? 0) + 1;
  const seenIdx: Record<string, number> = {};

  for (const effect of effects) {
    if (!effect.boundVariables) continue;
    const total = counts[effect.type];
    seenIdx[effect.type] = (seenIdx[effect.type] ?? 0) + 1;
    const idx = seenIdx[effect.type];
    const baseLabel = formatEffectType(effect.type);
    const friendlyType = total > 1 ? `${baseLabel} ${idx}` : baseLabel;
    for (const [prop, bind] of Object.entries(effect.boundVariables)) {
      if ((bind as { id?: string }).id) {
        usages.push({
          layer: getLayerDisplayName(node),
          property: `${friendlyType} ${prop}`,
          id: (bind as { id: string }).id,
        });
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
  scanDimensionConstraints(node, usages);
  scanLayoutGridColors(node, usages);
  scanVisibility(node, usages);

  if (node.type === 'TEXT') {
    getTextNodeVariables(node as TextNode, usages);
    scanTextDecoration(node as TextNode, usages);
  }

  if (node.type === 'INSTANCE') {
    scanComponentProperties(node as InstanceNode, usages);
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
