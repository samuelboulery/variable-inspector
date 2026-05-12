import { describe, it, expect } from 'vitest';
import { collectMergedAwayDescendantIds } from '../mergedInstanceExclusion';

interface NodeShape {
  id: string;
  type: string;
  children?: NodeShape[];
}

function makeNode(id: string, type: string, children: NodeShape[] = []): SceneNode {
  return { id, type, children } as unknown as SceneNode;
}

function makeInstance(id: string, children: NodeShape[] = []): SceneNode {
  return makeNode(id, 'INSTANCE', children);
}

describe('collectMergedAwayDescendantIds', () => {
  it('returns an empty set when no bucket is merged', () => {
    const inst = makeInstance('inst-1', [makeNode('child-1', 'RECTANGLE')]);
    const groups = new Map<string, SceneNode[]>([['fp1', [inst]]]);
    const excluded = collectMergedAwayDescendantIds(groups);
    expect(excluded.size).toBe(0);
  });

  it('returns descendants of merged-away instances (size > 1)', () => {
    const rep = makeInstance('rep', [makeNode('rep-child-1', 'VECTOR')]);
    const merged1 = makeInstance('merged-1', [makeNode('merged-1-child', 'VECTOR')]);
    const merged2 = makeInstance('merged-2', [makeNode('merged-2-child', 'VECTOR')]);
    const groups = new Map<string, SceneNode[]>([['fp', [rep, merged1, merged2]]]);
    const excluded = collectMergedAwayDescendantIds(groups);
    expect(excluded.has('merged-1')).toBe(true);
    expect(excluded.has('merged-1-child')).toBe(true);
    expect(excluded.has('merged-2')).toBe(true);
    expect(excluded.has('merged-2-child')).toBe(true);
    expect(excluded.has('rep')).toBe(false);
    expect(excluded.has('rep-child-1')).toBe(false);
  });

  it('walks deeply nested descendants of merged-away instances', () => {
    const deepChild = makeNode('deep', 'VECTOR');
    const midChild = makeNode('mid', 'FRAME', [deepChild]);
    const merged = makeInstance('merged', [midChild]);
    const rep = makeInstance('rep', []);
    const groups = new Map<string, SceneNode[]>([['fp', [rep, merged]]]);
    const excluded = collectMergedAwayDescendantIds(groups);
    expect(excluded.has('merged')).toBe(true);
    expect(excluded.has('mid')).toBe(true);
    expect(excluded.has('deep')).toBe(true);
  });

  it('ignores non-INSTANCE buckets even if size > 1', () => {
    const a = makeNode('a', 'RECTANGLE');
    const b = makeNode('b', 'RECTANGLE');
    const groups = new Map<string, SceneNode[]>([
      ['__node__a', [a]],
      ['__node__b', [b]],
    ]);
    const excluded = collectMergedAwayDescendantIds(groups);
    expect(excluded.size).toBe(0);
  });

  it('does not exclude representative (bucket[0]) or its descendants', () => {
    const repChild = makeNode('rep-child', 'VECTOR');
    const rep = makeInstance('rep', [repChild]);
    const merged = makeInstance('merged', [makeNode('mc', 'VECTOR')]);
    const groups = new Map<string, SceneNode[]>([['fp', [rep, merged]]]);
    const excluded = collectMergedAwayDescendantIds(groups);
    expect(excluded.has('rep')).toBe(false);
    expect(excluded.has('rep-child')).toBe(false);
  });

  it('handles multiple merged buckets independently', () => {
    const rep1 = makeInstance('rep1', [makeNode('rep1-c', 'VECTOR')]);
    const m1a = makeInstance('m1a', [makeNode('m1a-c', 'VECTOR')]);
    const rep2 = makeInstance('rep2', [makeNode('rep2-c', 'VECTOR')]);
    const m2a = makeInstance('m2a', [makeNode('m2a-c', 'VECTOR')]);
    const m2b = makeInstance('m2b', [makeNode('m2b-c', 'VECTOR')]);
    const groups = new Map<string, SceneNode[]>([
      ['fp1', [rep1, m1a]],
      ['fp2', [rep2, m2a, m2b]],
    ]);
    const excluded = collectMergedAwayDescendantIds(groups);
    expect(excluded.has('m1a')).toBe(true);
    expect(excluded.has('m1a-c')).toBe(true);
    expect(excluded.has('m2a')).toBe(true);
    expect(excluded.has('m2a-c')).toBe(true);
    expect(excluded.has('m2b')).toBe(true);
    expect(excluded.has('m2b-c')).toBe(true);
    expect(excluded.has('rep1')).toBe(false);
    expect(excluded.has('rep2')).toBe(false);
  });
});
