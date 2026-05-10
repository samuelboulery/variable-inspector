/// <reference types="@figma/plugin-typings" />

/**
 * Given fingerprint groups (output of groupByFingerprint), returns the set of
 * node IDs that should be excluded from the per-bucket scan pass.
 *
 * The exclusion set contains:
 *  - Every merged-away INSTANCE in each bucket of size > 1, i.e. bucket[1..N-1].
 *  - Every descendant of those merged-away instances, at every depth.
 *
 * Representatives (bucket[0]) and their descendants are never excluded —
 * the representative's subtree is the single source of truth for that
 * fingerprint group's bound and unbound properties.
 */
export function collectMergedAwayDescendantIds(
  groups: Map<string, readonly SceneNode[]>,
): Set<string> {
  const excluded = new Set<string>();

  for (const bucket of groups.values()) {
    if (bucket.length <= 1) continue;
    if (bucket[0].type !== 'INSTANCE') continue;

    for (let i = 1; i < bucket.length; i++) {
      collectSubtreeIds(bucket[i], excluded);
    }
  }

  return excluded;
}

/**
 * Iteratively walks the subtree rooted at `root` and adds every visited node's
 * ID (including the root itself) to `out`.
 */
function collectSubtreeIds(root: SceneNode, out: Set<string>): void {
  const stack: SceneNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    out.add(node.id);
    const maybeChildren = (node as { children?: readonly SceneNode[] }).children;
    if (Array.isArray(maybeChildren)) {
      stack.push(...maybeChildren);
    }
  }
}
