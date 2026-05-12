/// <reference types="@figma/plugin-typings" />

/** Matches a pure Figma internal ID like "120:11083" or "I120:11083;62:3910". */
const IS_FIGMA_ID = /^I?\d+:\d+(;\d+:\d+)*$/;

/** Captures the embedded instance node ID from an "I120:11085;62:3213"-style sublayer name. */
const INSTANCE_SUBLAYER_ID = /^I(\d+:\d+)/;

/**
 * Returns the best human-readable name from an INSTANCE node by traversing
 * its mainComponent → COMPONENT_SET parent. Returns null when no usable
 * name can be derived.
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

/**
 * Walks up a node's ancestor chain (capped at `maxDepth` levels) and returns
 * the first real, non-Figma-ID name found. Skips PAGE and DOCUMENT ancestors.
 */
function walkAncestorsForName(start: BaseNode | null, maxDepth: number): string | null {
  let ancestor: BaseNode | null = start;
  let depth = 0;
  while (ancestor && depth < maxDepth) {
    const name = (ancestor as { name?: unknown }).name;
    if (
      typeof name === 'string' &&
      !IS_FIGMA_ID.test(name) &&
      ancestor.type !== 'PAGE' &&
      ancestor.type !== 'DOCUMENT'
    ) {
      return name;
    }
    ancestor = (ancestor as { parent?: BaseNode | null }).parent ?? null;
    depth++;
  }
  return null;
}

/**
 * Resolves an I-prefixed sublayer name (e.g. "I120:11085;62:3213") by looking
 * up the embedded container ID via figma.getNodeById and extracting a name
 * from the container itself or its ancestor chain.
 */
function resolveSublayerContainerName(rawName: string): string | null {
  const sublayerMatch = INSTANCE_SUBLAYER_ID.exec(rawName);
  if (!sublayerMatch) return null;
  const containerId = sublayerMatch[1];
  if (!containerId) return null;
  const container = figma.getNodeById(containerId) as SceneNode | null;
  if (!container) return null;
  if (!IS_FIGMA_ID.test(container.name)) return container.name;
  if (container.type === 'INSTANCE') {
    const name = resolveInstanceName(container as InstanceNode);
    if (name) return name;
  }
  return walkAncestorsForName(container.parent, 5);
}

/**
 * Returns a human-readable display name for a node. Detects Figma internal
 * ID-like names and falls back through INSTANCE → COMPONENT_SET resolution,
 * a parent-chain walk, an embedded-instance lookup, and finally a formatted
 * type label.
 *
 * @param node - The scene node to get a display name for.
 * @returns Human-readable layer name, never empty.
 */
export function getLayerDisplayName(node: SceneNode): string {
  if (!IS_FIGMA_ID.test(node.name)) return node.name;

  if (node.type === 'INSTANCE') {
    const name = resolveInstanceName(node as InstanceNode);
    if (name) return name;
  }

  if (node.type === 'COMPONENT') {
    const parent = node.parent;
    if (parent?.type === 'COMPONENT_SET' && !IS_FIGMA_ID.test(parent.name)) {
      return parent.name;
    }
  }

  const ancestorName = walkAncestorsForName(node.parent, 10);
  if (ancestorName) return ancestorName;

  const sublayerName = resolveSublayerContainerName(node.name);
  if (sublayerName) return sublayerName;

  return node.type.charAt(0).toUpperCase() + node.type.slice(1).toLowerCase().replace(/_/g, ' ');
}
