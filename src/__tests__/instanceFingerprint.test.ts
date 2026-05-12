import { describe, it, expect } from 'vitest';
import { computeFingerprint, groupByFingerprint } from '../instanceFingerprint';

function makeInstance(overrides: {
  id: string;
  componentId?: string;
  componentSetId?: string;
  componentProperties?: Record<string, { type: string; value: unknown }>;
  boundVariables?: Record<string, unknown>;
  type?: string;
}): SceneNode {
  return {
    id: overrides.id,
    name: 'Inst',
    type: overrides.type ?? 'INSTANCE',
    mainComponent: overrides.componentId
      ? {
          id: overrides.componentId,
          parent: overrides.componentSetId
            ? { id: overrides.componentSetId, type: 'COMPONENT_SET' }
            : null,
        }
      : null,
    componentProperties: overrides.componentProperties ?? {},
    boundVariables: overrides.boundVariables ?? {},
  } as unknown as SceneNode;
}

describe('computeFingerprint', () => {
  it('returns the same hash for two instances with identical state', () => {
    const a = makeInstance({
      id: 'a',
      componentId: 'c1',
      componentProperties: { State: { type: 'VARIANT', value: 'default' } },
    });
    const b = makeInstance({
      id: 'b',
      componentId: 'c1',
      componentProperties: { State: { type: 'VARIANT', value: 'default' } },
    });
    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });

  it('returns different hashes when componentId differs', () => {
    const a = makeInstance({ id: 'a', componentId: 'c1' });
    const b = makeInstance({ id: 'b', componentId: 'c2' });
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it('returns different hashes when component property values differ', () => {
    const a = makeInstance({
      id: 'a',
      componentId: 'c1',
      componentProperties: { State: { type: 'VARIANT', value: 'default' } },
    });
    const b = makeInstance({
      id: 'b',
      componentId: 'c1',
      componentProperties: { State: { type: 'VARIANT', value: 'hover' } },
    });
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it('returns different hashes when bound variables differ', () => {
    const a = makeInstance({ id: 'a', componentId: 'c1', boundVariables: { color: { id: 'v1' } } });
    const b = makeInstance({ id: 'b', componentId: 'c1', boundVariables: { color: { id: 'v2' } } });
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it('is order-independent for componentProperties keys', () => {
    const a = makeInstance({
      id: 'a',
      componentId: 'c1',
      componentProperties: { A: { type: 'BOOL', value: true }, B: { type: 'BOOL', value: false } },
    });
    const b = makeInstance({
      id: 'b',
      componentId: 'c1',
      componentProperties: { B: { type: 'BOOL', value: false }, A: { type: 'BOOL', value: true } },
    });
    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });

  it('returns null for non-INSTANCE nodes', () => {
    const node = makeInstance({ id: 'r', type: 'RECTANGLE' });
    expect(computeFingerprint(node)).toBeNull();
  });

  it('returns null when mainComponent is missing (detached instance)', () => {
    const node = makeInstance({ id: 'a' });
    expect(computeFingerprint(node)).toBeNull();
  });
});

describe('groupByFingerprint', () => {
  it('groups identical instances together', () => {
    const a = makeInstance({ id: 'a', componentId: 'c1' });
    const b = makeInstance({ id: 'b', componentId: 'c1' });
    const c = makeInstance({ id: 'c', componentId: 'c2' });
    const result = groupByFingerprint([a, b, c]);
    const groupSizes = Array.from(result.values())
      .map(v => v.length)
      .sort();
    expect(groupSizes).toEqual([1, 2]);
  });

  it('skips non-INSTANCE nodes', () => {
    const a = makeInstance({ id: 'a', componentId: 'c1' });
    const r = makeInstance({ id: 'r', type: 'RECTANGLE' });
    const result = groupByFingerprint([a, r]);
    expect(Array.from(result.values()).flat()).toHaveLength(2);
  });
});
