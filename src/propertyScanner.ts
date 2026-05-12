/// <reference types="@figma/plugin-typings" />

import type { VariableUsage } from './types';
import { PROPERTY_NAMES } from './constants';
import { getLayerDisplayName } from './utils/displayName';

type NodeWithBindings = SceneNode & {
  boundVariables?: Record<string, { id?: string }>;
};

type FrameWithGrids = SceneNode & {
  layoutGrids?: Array<{
    pattern: string;
    color?: RGB;
    boundVariables?: { color?: { id: string } };
  }>;
};

const DIMENSION_KEYS = [
  { key: 'minWidth', name: PROPERTY_NAMES.MIN_WIDTH },
  { key: 'maxWidth', name: PROPERTY_NAMES.MAX_WIDTH },
  { key: 'minHeight', name: PROPERTY_NAMES.MIN_HEIGHT },
  { key: 'maxHeight', name: PROPERTY_NAMES.MAX_HEIGHT },
] as const;

/**
 * Reports bound variables on auto-layout dimension constraints
 * (minWidth, maxWidth, minHeight, maxHeight).
 */
export function scanDimensionConstraints(node: SceneNode, usages: VariableUsage[]): void {
  const bv = (node as NodeWithBindings).boundVariables;
  if (!bv) return;
  for (const { key, name } of DIMENSION_KEYS) {
    const id = bv[key]?.id;
    if (id) usages.push({ layer: getLayerDisplayName(node), property: name, id });
  }
}

/**
 * Reports bound colors on each layoutGrid of the node.
 */
export function scanLayoutGridColors(node: SceneNode, usages: VariableUsage[]): void {
  const grids = (node as FrameWithGrids).layoutGrids;
  if (!Array.isArray(grids)) return;
  for (const grid of grids) {
    const id = grid.boundVariables?.color?.id;
    if (id)
      usages.push({ layer: getLayerDisplayName(node), property: PROPERTY_NAMES.GRID_COLOR, id });
  }
}

/**
 * Reports a bound `visible` binding on the node.
 */
export function scanVisibility(node: SceneNode, usages: VariableUsage[]): void {
  const id = (node as NodeWithBindings).boundVariables?.visible?.id;
  if (id) usages.push({ layer: getLayerDisplayName(node), property: PROPERTY_NAMES.VISIBLE, id });
}

/**
 * Reports bound textDecoration / textCase bindings on a TextNode.
 */
export function scanTextDecoration(node: TextNode, usages: VariableUsage[]): void {
  if ((node as SceneNode).type !== 'TEXT') return;
  const bv = (node as unknown as NodeWithBindings).boundVariables;
  if (!bv) return;
  const td = bv.textDecoration?.id;
  const tc = bv.textCase?.id;
  if (td)
    usages.push({
      layer: getLayerDisplayName(node),
      property: PROPERTY_NAMES.TEXT_DECORATION,
      id: td,
    });
  if (tc)
    usages.push({ layer: getLayerDisplayName(node), property: PROPERTY_NAMES.TEXT_CASE, id: tc });
}
