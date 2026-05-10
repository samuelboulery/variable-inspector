/// <reference types="@figma/plugin-typings" />

import { UnboundUsage } from './types';
import { PROPERTY_NAMES, PROPERTY_MAPPING } from './constants';
import { trackProperty } from './dedup';
import { processedFontSizeNodeIds } from './dedup';
import { formatEffectType, getLayerDisplayName } from './nodeScanner';
import { logger } from './utils/logger';

/** Formats a number to at most 2 decimal places, removing trailing zeros. */
function fmt(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** Converts an RGB struct to a CSS `rgb()` string. */
function rgbString(c: RGB): string {
  return `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
}

// Augment types that lack boundVariables in the official typings
type PaintWithBindings = Paint & { boundVariables?: { color?: { id: string } }; color?: RGB };

type NodeWithBindings = SceneNode & {
  boundVariables?: Record<string, { id?: string }>;
  [key: string]: unknown;
};

interface EffectWithBindings {
  type: string;
  radius?: number;
  spread?: number;
  offset?: { x: number; y: number };
  color?: RGB;
  boundVariables?: Record<string, { id?: string } | { x?: { id?: string }; y?: { id?: string } }>;
}

/**
 * Detects unbound fill and stroke colors on a node.
 *
 * @param node - The scene node to check.
 * @param unboundUsages - Array to append found unbound usages to.
 */
export function getUnboundColorUsages(node: SceneNode, unboundUsages: UnboundUsage[]): void {
  if ('fills' in node && Array.isArray(node.fills)) {
    for (const fill of node.fills as Paint[]) {
      const p = fill as PaintWithBindings;
      if (!p.boundVariables?.color?.id && p.color) {
        unboundUsages.push({
          layer: getLayerDisplayName(node),
          layerId: node.id,
          property: PROPERTY_NAMES.FILL,
          value: rgbString(p.color),
        });
      }
    }
  }

  if ('strokes' in node && Array.isArray(node.strokes)) {
    let firstUnbound: RGB | undefined;
    for (const stroke of node.strokes as Paint[]) {
      const p = stroke as PaintWithBindings;
      if (!p.boundVariables?.color?.id && p.color) {
        firstUnbound = p.color;
        break;
      }
    }
    if (firstUnbound && !trackProperty(node.id, PROPERTY_NAMES.STROKE)) {
      unboundUsages.push({
        layer: getLayerDisplayName(node),
        layerId: node.id,
        property: PROPERTY_NAMES.STROKE,
        value: rgbString(firstUnbound),
      });
      if (node.strokes.length > 1) {
        logger.log(`${node.name} has ${node.strokes.length} strokes, only the first unbound one is shown`);
      }
    }
  }
}

/**
 * Detects unbound opacity on a node (only reported when opacity < 1).
 */
function getUnboundOpacityUsage(node: NodeWithBindings, unboundUsages: UnboundUsage[]): void {
  if (!('opacity' in node)) return;
  const opacity = node.opacity as number | undefined;
  if (typeof opacity !== 'number' || opacity >= 1) return;
  if (node.boundVariables?.opacity?.id) return;
  if (!trackProperty(node.id, PROPERTY_NAMES.OPACITY)) {
    unboundUsages.push({
      layer: getLayerDisplayName(node),
      layerId: node.id,
      property: PROPERTY_NAMES.OPACITY,
      value: fmt(opacity),
    });
  }
}

/**
 * Detects unbound stroke weight(s) on a node (skipped when no strokes exist or weight is 0).
 */
function getUnboundStrokeWeightUsages(node: NodeWithBindings, unboundUsages: UnboundUsage[]): void {
  if (!('strokeWeight' in node)) return;
  const nodeWithStrokes = node as unknown as { strokes?: unknown[] };
  const hasStrokes =
    'strokes' in node &&
    Array.isArray(nodeWithStrokes.strokes) &&
    (nodeWithStrokes.strokes?.length ?? 0) > 0;
  if (!hasStrokes) return;

  const sw = node.strokeWeight as number | undefined;
  const hasAsymmetric =
    'strokeTopWeight' in node ||
    'strokeBottomWeight' in node ||
    'strokeLeftWeight' in node ||
    'strokeRightWeight' in node;

  if (typeof sw === 'number' && sw !== 0 && !node.boundVariables?.strokeWeight?.id && !hasAsymmetric) {
    if (!trackProperty(node.id, PROPERTY_NAMES.STROKE_WEIGHT)) {
      unboundUsages.push({
        layer: getLayerDisplayName(node),
        layerId: node.id,
        property: PROPERTY_NAMES.STROKE_WEIGHT,
        value: fmt(sw),
      });
    }
  }

  for (const prop of ['strokeTopWeight', 'strokeBottomWeight', 'strokeLeftWeight', 'strokeRightWeight'] as const) {
    if (!(prop in node)) continue;
    const weight = node[prop] as number | undefined;
    if (typeof weight !== 'number' || weight === 0) continue;
    if (node.boundVariables?.[prop]?.id) continue;
    const displayName = PROPERTY_MAPPING[prop] ?? prop;
    if (!trackProperty(node.id, displayName)) {
      unboundUsages.push({ layer: getLayerDisplayName(node), layerId: node.id, property: displayName, value: fmt(weight) });
    }
  }
}

/**
 * Detects unbound corner radius (uniform and asymmetric) on a node (skipped when 0).
 */
function getUnboundCornerRadiusUsages(node: NodeWithBindings, unboundUsages: UnboundUsage[]): void {
  if ('cornerRadius' in node) {
    const cr = node.cornerRadius as number | undefined;
    const hasAsymmetric =
      'topLeftRadius' in node ||
      'topRightRadius' in node ||
      'bottomLeftRadius' in node ||
      'bottomRightRadius' in node;
    if (
      typeof cr === 'number' &&
      cr !== 0 &&
      !node.boundVariables?.cornerRadius?.id &&
      !hasAsymmetric
    ) {
      if (!trackProperty(node.id, PROPERTY_NAMES.CORNER_RADIUS)) {
        unboundUsages.push({
          layer: getLayerDisplayName(node),
          layerId: node.id,
          property: PROPERTY_NAMES.CORNER_RADIUS,
          value: fmt(cr),
        });
      }
    }
  }

  for (const prop of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'] as const) {
    if (!(prop in node)) continue;
    const radius = node[prop] as number | undefined;
    if (typeof radius !== 'number' || radius === 0) continue;
    if (node.boundVariables?.[prop]?.id) continue;
    const displayName = PROPERTY_MAPPING[prop] ?? prop;
    if (!trackProperty(node.id, displayName)) {
      unboundUsages.push({ layer: getLayerDisplayName(node), layerId: node.id, property: displayName, value: fmt(radius) });
    }
  }
}

/**
 * Detects unbound text properties (font size, letter spacing, line height, paragraph spacing)
 * on a TextNode. Font size is skipped if it was already recorded as a bound variable.
 */
function getUnboundTextPropertyUsages(node: NodeWithBindings, unboundUsages: UnboundUsage[]): void {
  if ((node as SceneNode).type !== 'TEXT') return;
  const txt = node as unknown as TextNode & NodeWithBindings;

  const textProperties = [
    { key: 'fontSize', displayName: PROPERTY_NAMES.FONT_SIZE, skipIfProcessed: true },
    { key: 'letterSpacing', displayName: PROPERTY_NAMES.LETTER_SPACING, skipIfProcessed: false },
    { key: 'lineHeight', displayName: PROPERTY_NAMES.LINE_HEIGHT, skipIfProcessed: false },
    { key: 'paragraphSpacing', displayName: PROPERTY_NAMES.PARAGRAPH_SPACING, skipIfProcessed: false },
  ];

  for (const { key, displayName, skipIfProcessed } of textProperties) {
    if (skipIfProcessed && key === 'fontSize' && processedFontSizeNodeIds.has(txt.id)) continue;
    const value = (txt as Record<string, unknown>)[key];
    if (typeof value !== 'number' || value === 0) continue;
    if (node.boundVariables?.[key]?.id) continue;
    if (!trackProperty(node.id, displayName)) {
      unboundUsages.push({ layer: getLayerDisplayName(node), layerId: node.id, property: displayName, value: fmt(value) });
    }
  }
}

/**
 * Detects unbound spacing properties (padding and gap/item spacing) on a node.
 * Zero values are skipped.
 */
function getUnboundSpacingUsages(node: NodeWithBindings, unboundUsages: UnboundUsage[]): void {
  const spacingProperties = [
    { key: 'paddingLeft', displayName: PROPERTY_NAMES.PADDING_LEFT },
    { key: 'paddingRight', displayName: PROPERTY_NAMES.PADDING_RIGHT },
    { key: 'paddingTop', displayName: PROPERTY_NAMES.PADDING_TOP },
    { key: 'paddingBottom', displayName: PROPERTY_NAMES.PADDING_BOTTOM },
    { key: 'itemSpacing', displayName: PROPERTY_NAMES.ITEM_SPACING },
  ];

  for (const { key, displayName } of spacingProperties) {
    if (!(key in node)) continue;
    const value = node[key] as unknown;
    if (typeof value !== 'number' || value === 0) continue;
    if (node.boundVariables?.[key]?.id) continue;
    logger.log(`Found spacing property ${key} = ${value} on node ${node.name}`);
    if (!trackProperty(node.id, displayName)) {
      unboundUsages.push({ layer: getLayerDisplayName(node), layerId: node.id, property: displayName, value: fmt(value) });
    }
  }
}

/**
 * Detects all unbound float/numeric properties on a node (opacity, stroke weight,
 * corner radius, text properties, and spacing).
 *
 * @param node - The scene node to check.
 * @param unboundUsages - Array to append found unbound usages to.
 */
export function getUnboundFloatUsages(node: SceneNode, unboundUsages: UnboundUsage[]): void {
  const n = node as NodeWithBindings;
  getUnboundOpacityUsage(n, unboundUsages);
  getUnboundStrokeWeightUsages(n, unboundUsages);
  getUnboundCornerRadiusUsages(n, unboundUsages);
  getUnboundTextPropertyUsages(n, unboundUsages);
  getUnboundSpacingUsages(n, unboundUsages);
}

/**
 * Detects unbound effect properties (blur radius, shadow offset, spread, color) on a node.
 *
 * @param node - The scene node to check.
 * @param unboundUsages - Array to append found unbound usages to.
 */
export function getUnboundEffectUsages(node: SceneNode, unboundUsages: UnboundUsage[]): void {
  if (!('effects' in node) || !Array.isArray(node.effects)) return;

  for (const effect of node.effects as EffectWithBindings[]) {
    const boundVars = effect.boundVariables ?? {};
    const friendlyType = formatEffectType(effect.type);
    const isBlurOrShadow = effect.type.includes('BLUR') || effect.type.includes('SHADOW');

    if (typeof effect.radius === 'number') {
      const radiusBound = boundVars.radius as { id?: string } | undefined;
      if (!radiusBound?.id) {
        const label = isBlurOrShadow ? 'Blur' : 'Radius';
        unboundUsages.push({
          layer: getLayerDisplayName(node),
          layerId: node.id,
          property: `${friendlyType} ${label}`,
          value: fmt(effect.radius),
        });
      }
    }

    if (effect.type.includes('SHADOW') && effect.offset) {
      const offsetBound = (boundVars.offset as { x?: { id?: string }; y?: { id?: string } }) ?? {};
      if (typeof effect.offset.x === 'number' && !offsetBound.x?.id) {
        unboundUsages.push({
          layer: getLayerDisplayName(node),
          layerId: node.id,
          property: `${friendlyType} Offset X`,
          value: fmt(effect.offset.x),
        });
      }
      if (typeof effect.offset.y === 'number' && !offsetBound.y?.id) {
        unboundUsages.push({
          layer: getLayerDisplayName(node),
          layerId: node.id,
          property: `${friendlyType} Offset Y`,
          value: fmt(effect.offset.y),
        });
      }
    }

    if (typeof effect.spread === 'number') {
      const spreadBound = boundVars.spread as { id?: string } | undefined;
      if (!spreadBound?.id) {
        unboundUsages.push({
          layer: getLayerDisplayName(node),
          layerId: node.id,
          property: `${friendlyType} Spread`,
          value: fmt(effect.spread),
        });
      }
    }

    if (effect.color) {
      const colorBound = boundVars.color as { id?: string } | undefined;
      if (!colorBound?.id) {
        unboundUsages.push({
          layer: getLayerDisplayName(node),
          layerId: node.id,
          property: `${friendlyType} Color`,
          value: rgbString(effect.color),
        });
      }
    }
  }
}
