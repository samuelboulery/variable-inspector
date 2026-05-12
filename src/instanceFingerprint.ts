/// <reference types="@figma/plugin-typings" />

type InstanceWithExtras = InstanceNode & {
  componentProperties?: Record<string, { type: string; value: unknown }>;
  boundVariables?: Record<string, unknown>;
};

/**
 * Stable, order-independent fingerprint of an INSTANCE node's identity.
 * Two instances with the same fingerprint are considered "identical"
 * for Feature 7.1 dedup. Returns null for non-INSTANCE, detached nodes,
 * or any case where the synchronous Figma API access throws (e.g. legacy
 * mainComponent getter on an unresolved instance, or unsupported plugin
 * runtime version).
 */
export function computeFingerprint(node: SceneNode): string | null {
  if (node.type !== 'INSTANCE') return null;
  try {
    const inst = node as InstanceWithExtras;
    if (!inst.mainComponent) return null;

    const componentId = inst.mainComponent.id;
    const setId =
      (inst.mainComponent.parent as { id?: string; type?: string } | null)?.type === 'COMPONENT_SET'
        ? (inst.mainComponent.parent as { id: string }).id
        : '';
    const props = JSON.stringify(sortObjectKeys(inst.componentProperties ?? {}));
    const bound = JSON.stringify(
      sortObjectKeys((inst.boundVariables ?? {}) as Record<string, unknown>),
    );
    return [componentId, setId, props, bound].join('|');
  } catch {
    // Defensive: any synchronous Figma API throw (deprecated mainComponent
    // getter, missing componentProperties on older plugin runtimes, etc.)
    // falls back to no merge — node is treated as solo.
    return null;
  }
}

/**
 * Groups instances by fingerprint. Non-INSTANCE nodes are placed in
 * single-node "buckets" keyed by their unique node ID so the caller
 * can iterate the result uniformly.
 */
export function groupByFingerprint(nodes: readonly SceneNode[]): Map<string, SceneNode[]> {
  const map = new Map<string, SceneNode[]>();
  for (const node of nodes) {
    const key = computeFingerprint(node) ?? `__node__${node.id}`;
    const bucket = map.get(key) ?? [];
    bucket.push(node);
    map.set(key, bucket);
  }
  return map;
}

function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = obj[k];
  return sorted;
}
