/// <reference types="@figma/plugin-typings" />

import type { VariableUsage } from './types';
import { PROPERTY_NAMES, PROPERTY_MAPPING, EXTRACT_BINDING_MAX_DEPTH } from './constants';
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
    if (firstId) {
      usages.push({ layer: getLayerDisplayName(node), property: PROPERTY_NAMES.FILL, id: firstId });
    }
    if (fillVariableIds.size > 1) {
      logger.log(
        `${node.name} has ${fillVariableIds.size} fill variables, only the first is shown`,
      );
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
      usages.push({
        layer: getLayerDisplayName(node),
        property: PROPERTY_NAMES.STROKE_COLOR,
        id: binding.id,
      });
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
/**
 * Maps a raw boundVariables key on an Effect to the canonical sub-property
 * name surfaced in the UI's effect group section.
 */
function canonicalEffectSubProp(prop: string, effectType: string): string {
  if (prop === 'radius') {
    return effectType.includes('BLUR') || effectType.includes('SHADOW') ? 'Blur' : 'Radius';
  }
  if (prop === 'color') return 'Color';
  if (prop === 'spread') return 'Spread';
  if (prop === 'offset') return 'Offset';
  return prop.charAt(0).toUpperCase() + prop.slice(1);
}

function getEffectUsages(node: SceneNode, usages: VariableUsage[]): void {
  if (!('effects' in node) || !Array.isArray(node.effects)) return;
  const effects = node.effects as EffectWithBindings[];
  const counts: Record<string, number> = {};
  for (const e of effects) counts[e.type] = (counts[e.type] ?? 0) + 1;
  const seenIdx: Record<string, number> = {};

  for (const effect of effects) {
    if (!effect.boundVariables) continue;
    const total = counts[effect.type] ?? 0;
    seenIdx[effect.type] = (seenIdx[effect.type] ?? 0) + 1;
    const idx = seenIdx[effect.type];
    const baseLabel = formatEffectType(effect.type);
    const effectGroup = total > 1 ? `${baseLabel} ${idx}` : baseLabel;
    for (const [prop, bind] of Object.entries(effect.boundVariables)) {
      const bindingId = extractIdFromBinding(bind);
      if (bindingId) {
        const subProp = canonicalEffectSubProp(prop, effect.type);
        usages.push({
          layer: getLayerDisplayName(node),
          property: `${effectGroup} ${prop}`,
          id: bindingId,
          effectGroup,
          subProp,
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
    const bindingId = extractIdFromBinding(bind);
    if (bindingId) {
      const displayName = PROPERTY_MAPPING[prop] ?? prop;
      usages.push({ layer: getLayerDisplayName(node), property: displayName, id: bindingId });
    }
  }

  // Explicit check for asymmetric corner/stroke properties that may not appear in boundVariables
  const asymmetricProps = [
    'topLeftRadius',
    'topRightRadius',
    'bottomLeftRadius',
    'bottomRightRadius',
    'strokeTopWeight',
    'strokeBottomWeight',
    'strokeLeftWeight',
    'strokeRightWeight',
  ] as const;
  const nodeRecord = node as unknown as Record<string, unknown>;
  for (const prop of asymmetricProps) {
    const bindingValue = (nodeBV as Record<string, unknown>)[prop];
    const bindingId = extractIdFromBinding(bindingValue);
    if (nodeRecord[prop] !== undefined && bindingId) {
      const displayName = PROPERTY_MAPPING[prop] ?? prop;
      usages.push({ layer: getLayerDisplayName(node), property: displayName, id: bindingId });
    }
  }
}

/**
 * Narrowly extracts a `string` id from an unknown binding shape. Returns
 * `undefined` for null / non-object / shapes without a string id.
 */
function extractIdFromBinding(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
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
    const bindingId = extractIdFromBinding((txtBV as Record<string, unknown>)[propName]);
    if (bindingId) {
      usages.push({ layer: getLayerDisplayName(node), property: displayName, id: bindingId });
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
 * Iteratively walks a `boundVariables` sub-object and collects all `{id}` bindings
 * indexed by their dot-separated property path. Skips fill-related paths.
 *
 * A depth cap (`EXTRACT_BINDING_MAX_DEPTH`) and a visited-object set guard
 * against pathological / cyclic structures so we never blow the call stack
 * on a malformed plugin payload.
 *
 * @param obj - Object subtree to traverse.
 * @param result - Map from property path to list of variable IDs.
 */
function extractBindingIds(obj: Record<string, unknown>, result: Record<string, string[]>): void {
  if (!obj || typeof obj !== 'object') return;

  interface Frame {
    value: unknown;
    path: string[];
  }
  const stack: Frame[] = [{ value: obj, path: [] }];
  const visited = new WeakSet<object>();

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) continue;
    const { value, path } = frame;
    if (value === null || typeof value !== 'object') continue;
    if (path.length > EXTRACT_BINDING_MAX_DEPTH) continue;
    if (visited.has(value as object)) continue;
    visited.add(value as object);

    const idCandidate = (value as { id?: unknown }).id;
    if (typeof idCandidate === 'string') {
      const propPath = path.join('.');
      if (!propPath.startsWith('fills.') && propPath !== 'fills') {
        const bucket = result[propPath] ?? [];
        bucket.push(idCandidate);
        result[propPath] = bucket;
      }
      continue;
    }

    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (key === 'fills' || (path.length > 0 && path[0] === 'fills')) continue;
      stack.push({
        value: (value as Record<string, unknown>)[key],
        path: [...path, key],
      });
    }
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
    const node = stack.pop();
    if (!node) continue;
    result.push(node);
    if ('children' in node && Array.isArray((node as FrameNode).children)) {
      stack.push(...(node as FrameNode).children);
    }
  }
  return result;
}
