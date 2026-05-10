/// <reference types="@figma/plugin-typings" />

import { UnboundUsage } from './types';
import { formatEffectType } from './nodeScanner';
import { getLayerDisplayName } from './utils/displayName';

/** Formats a number to at most 2 decimal places, removing trailing zeros. */
function fmt(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** Converts an RGB struct to a CSS `rgb()` string. */
function rgbString(c: RGB): string {
  return `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
}

interface EffectWithBindings {
  type: string;
  radius?: number;
  spread?: number;
  offset?: { x: number; y: number };
  color?: RGB;
  boundVariables?: Record<string, { id?: string } | { x?: { id?: string }; y?: { id?: string } }>;
}

/**
 * Detects unbound effect properties (blur radius, shadow offset, spread, color)
 * on a node and appends them to `unboundUsages`. Each effect in `node.effects`
 * is iterated independently so multiple drop shadows are reported separately.
 * When a node has multiple effects of the same type, they are numbered
 * (e.g. "Drop Shadow 1 Blur", "Drop Shadow 2 Blur"). A single effect
 * of its type remains unnumbered (e.g. "Drop Shadow Blur").
 *
 * @param node - The scene node to check.
 * @param unboundUsages - Array to append found unbound usages to.
 */
export function getUnboundEffectUsages(node: SceneNode, unboundUsages: UnboundUsage[]): void {
  if (!('effects' in node) || !Array.isArray(node.effects)) return;
  const effects = node.effects as EffectWithBindings[];

  // Pre-count per type so single-of-its-type effects stay unnumbered
  const counts: Record<string, number> = {};
  for (const e of effects) counts[e.type] = (counts[e.type] ?? 0) + 1;

  const seenIdx: Record<string, number> = {};

  for (const effect of effects) {
    const total = counts[effect.type];
    seenIdx[effect.type] = (seenIdx[effect.type] ?? 0) + 1;
    const idx = seenIdx[effect.type];
    const baseLabel = formatEffectType(effect.type);
    const effectGroup = total > 1 ? `${baseLabel} ${idx}` : baseLabel;
    const isBlurOrShadow = effect.type.includes('BLUR') || effect.type.includes('SHADOW');
    const boundVars = effect.boundVariables ?? {};
    const layer = getLayerDisplayName(node);

    if (typeof effect.radius === 'number') {
      const radiusBound = boundVars.radius as { id?: string } | undefined;
      if (!radiusBound?.id) {
        const subProp = isBlurOrShadow ? 'Blur' : 'Radius';
        unboundUsages.push({
          layer,
          layerId: node.id,
          property: `${effectGroup} ${subProp}`,
          value: fmt(effect.radius),
          effectGroup,
          subProp,
        });
      }
    }

    if (effect.type.includes('SHADOW') && effect.offset) {
      const offsetBound = (boundVars.offset as { x?: { id?: string }; y?: { id?: string } }) ?? {};
      if (typeof effect.offset.x === 'number' && !offsetBound.x?.id) {
        unboundUsages.push({
          layer,
          layerId: node.id,
          property: `${effectGroup} Offset X`,
          value: fmt(effect.offset.x),
          effectGroup,
          subProp: 'Offset X',
        });
      }
      if (typeof effect.offset.y === 'number' && !offsetBound.y?.id) {
        unboundUsages.push({
          layer,
          layerId: node.id,
          property: `${effectGroup} Offset Y`,
          value: fmt(effect.offset.y),
          effectGroup,
          subProp: 'Offset Y',
        });
      }
    }

    if (typeof effect.spread === 'number') {
      const spreadBound = boundVars.spread as { id?: string } | undefined;
      if (!spreadBound?.id) {
        unboundUsages.push({
          layer,
          layerId: node.id,
          property: `${effectGroup} Spread`,
          value: fmt(effect.spread),
          effectGroup,
          subProp: 'Spread',
        });
      }
    }

    if (effect.color) {
      const colorBound = boundVars.color as { id?: string } | undefined;
      if (!colorBound?.id) {
        unboundUsages.push({
          layer,
          layerId: node.id,
          property: `${effectGroup} Color`,
          value: rgbString(effect.color),
          effectGroup,
          subProp: 'Color',
        });
      }
    }
  }
}
