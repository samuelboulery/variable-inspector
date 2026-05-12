import { describe, it, expect } from 'vitest';
import {
  regroupByProperty,
  computeStats,
  filterUsages,
  computePropertyHealth,
} from '../../ui/utils';
import { FullUsageEntry, PropertyAggregate, UnboundUsage } from '../../types';

function agg(overrides: Partial<PropertyAggregate>): PropertyAggregate {
  return {
    property: 'P',
    bound: 0,
    unbound: 0,
    byOrigin: { local: 0, external: 0 },
    ...overrides,
  };
}

function entry(overrides: Partial<FullUsageEntry>): FullUsageEntry {
  return {
    layer: 'L',
    layerId: 'l1',
    property: 'P',
    name: 'n',
    type: 'COLOR',
    origin: 'local',
    id: 'v1',
    ...overrides,
  };
}

describe('regroupByProperty', () => {
  it('groups entries by property name', () => {
    const byLayer = {
      l1: [
        entry({ layerId: 'l1', layer: 'A', property: 'Fill' }),
        entry({ layerId: 'l1', layer: 'A', property: 'Stroke Color' }),
      ],
      l2: [entry({ layerId: 'l2', layer: 'B', property: 'Fill' })],
    };
    const result = regroupByProperty(byLayer);
    expect(Object.keys(result).sort()).toEqual(['Fill', 'Stroke Color']);
    expect(result.Fill).toHaveLength(2);
  });

  it('preserves layerId on each entry', () => {
    const byLayer = { l1: [entry({ layerId: 'l1', layer: 'A', property: 'Fill' })] };
    const result = regroupByProperty(byLayer);
    expect(result.Fill[0].layerId).toBe('l1');
  });

  it('returns empty object for empty input', () => {
    expect(regroupByProperty({})).toEqual({});
  });
});

describe('computeStats', () => {
  it('returns zero stats for empty input', () => {
    const s = computeStats({}, [], 5);
    expect(s.totalVariables).toBe(0);
    expect(s.totalHardcoded).toBe(0);
    expect(s.variableCoverage).toBe(0);
    expect(s.scanDurationMs).toBe(5);
  });

  it('counts variables by origin and type', () => {
    const byLayer = {
      l1: [entry({ origin: 'local', type: 'COLOR' }), entry({ origin: 'external', type: 'FLOAT' })],
    };
    const s = computeStats(byLayer, [], 0);
    expect(s.totalVariables).toBe(2);
    expect(s.byOrigin).toEqual({ local: 1, external: 1 });
    expect(s.byType.COLOR).toBe(1);
    expect(s.byType.FLOAT).toBe(1);
  });

  it('calculates coverage as bound / (bound + hardcoded)', () => {
    const byLayer = { l1: [entry({}), entry({}), entry({}), entry({})] };
    const unbound = [{ layer: 'a', layerId: 'l1', property: 'Fill', value: 'rgb(0,0,0)' }];
    const s = computeStats(byLayer, unbound, 0);
    expect(s.variableCoverage).toBeCloseTo(4 / 5);
  });

  it('returns empty byProperty/topHardcoded and zero merged count by default', () => {
    const s = computeStats({}, [], 0);
    expect(s.byProperty).toEqual([]);
    expect(s.topHardcoded).toEqual([]);
    expect(s.instanceMergedCount).toBe(0);
  });

  it('aggregates byProperty: bound + unbound counts per property', () => {
    const byLayer = {
      l1: [
        entry({ property: 'Fill', origin: 'local' }),
        entry({ property: 'Fill', origin: 'external' }),
        entry({ property: 'Stroke', origin: 'local' }),
      ],
    };
    const unbound: UnboundUsage[] = [
      { layer: 'a', layerId: 'l2', property: 'Fill', value: 'rgb(0,0,0)' },
      { layer: 'b', layerId: 'l3', property: 'Padding Left', value: '12' },
    ];
    const s = computeStats(byLayer, unbound, 0);
    const fill = s.byProperty.find(p => p.property === 'Fill');
    const stroke = s.byProperty.find(p => p.property === 'Stroke');
    const padding = s.byProperty.find(p => p.property === 'Padding Left');
    expect(fill).toEqual({
      property: 'Fill',
      bound: 2,
      unbound: 1,
      byOrigin: { local: 1, external: 1 },
    });
    expect(stroke).toEqual({
      property: 'Stroke',
      bound: 1,
      unbound: 0,
      byOrigin: { local: 1, external: 0 },
    });
    expect(padding).toEqual({
      property: 'Padding Left',
      bound: 0,
      unbound: 1,
      byOrigin: { local: 0, external: 0 },
    });
  });

  it('sorts byProperty desc by (bound + unbound)', () => {
    const byLayer = {
      l1: [entry({ property: 'Small' })],
    };
    const unbound: UnboundUsage[] = [
      { layer: 'a', layerId: 'l1', property: 'Big', value: 'v1' },
      { layer: 'a', layerId: 'l1', property: 'Big', value: 'v2' },
      { layer: 'a', layerId: 'l1', property: 'Big', value: 'v3' },
      { layer: 'a', layerId: 'l1', property: 'Mid', value: 'x' },
    ];
    const s = computeStats(byLayer, unbound, 0);
    expect(s.byProperty.map(p => p.property)).toEqual(['Big', 'Mid', 'Small']);
  });

  it('aggregates topHardcoded by (property, value), counts occurrences, collects nodeIds', () => {
    const unbound: UnboundUsage[] = [
      { layer: 'a', layerId: 'n1', property: 'Fill', value: 'rgb(255,0,0)' },
      { layer: 'b', layerId: 'n2', property: 'Fill', value: 'rgb(255,0,0)' },
      { layer: 'c', layerId: 'n3', property: 'Fill', value: 'rgb(255,0,0)' },
      { layer: 'd', layerId: 'n4', property: 'Padding Left', value: '16' },
    ];
    const s = computeStats({}, unbound, 0);
    const red = s.topHardcoded.find(t => t.value === 'rgb(255,0,0)' && t.property === 'Fill');
    expect(red).toBeDefined();
    expect(red?.count).toBe(3);
    expect(red?.nodeIds.sort()).toEqual(['n1', 'n2', 'n3']);
  });

  it('caps topHardcoded at the provided limit (default 10)', () => {
    const unbound: UnboundUsage[] = [];
    for (let i = 0; i < 20; i++) {
      // Each unique value: count = (i + 1), so values 0..19 sorted desc by count.
      for (let j = 0; j <= i; j++) {
        unbound.push({ layer: 'l', layerId: `n${i}_${j}`, property: 'P', value: `v${i}` });
      }
    }
    const defaultS = computeStats({}, unbound, 0);
    expect(defaultS.topHardcoded).toHaveLength(10);
    expect(defaultS.topHardcoded[0]?.value).toBe('v19');
    expect(defaultS.topHardcoded[9]?.value).toBe('v10');

    const small = computeStats({}, unbound, 0, { topHardcodedLimit: 3 });
    expect(small.topHardcoded).toHaveLength(3);
  });

  it('keeps only repeated hardcoded values in topHardcoded (count >= 2)', () => {
    const unbound: UnboundUsage[] = [
      { layer: 'a', layerId: 'n1', property: 'Fill', value: 'shared' },
      { layer: 'a', layerId: 'n2', property: 'Fill', value: 'shared' },
      { layer: 'a', layerId: 'n3', property: 'Fill', value: 'unique' },
    ];
    const s = computeStats({}, unbound, 0);
    expect(s.topHardcoded.map(t => t.value)).toEqual(['shared']);
  });

  it('forwards instanceMergedCount from options', () => {
    const s = computeStats({}, [], 0, { instanceMergedCount: 42 });
    expect(s.instanceMergedCount).toBe(42);
  });
});

describe('filterUsages', () => {
  it('matches case-insensitive on layer/property/name', () => {
    const e = entry({ layer: 'Card', property: 'Fill', name: 'color/primary' });
    expect(filterUsages([e], { search: 'card', types: [], origins: [] })).toHaveLength(1);
    expect(filterUsages([e], { search: 'PRIMARY', types: [], origins: [] })).toHaveLength(1);
    expect(filterUsages([e], { search: 'fill', types: [], origins: [] })).toHaveLength(1);
    expect(filterUsages([e], { search: 'nope', types: [], origins: [] })).toHaveLength(0);
  });

  it('filters by type when types array is non-empty', () => {
    const a = entry({ type: 'COLOR' });
    const b = entry({ type: 'FLOAT' });
    expect(filterUsages([a, b], { search: '', types: ['COLOR'], origins: [] })).toHaveLength(1);
    expect(
      filterUsages([a, b], { search: '', types: ['COLOR', 'FLOAT'], origins: [] }),
    ).toHaveLength(2);
  });

  it('filters by origin when origins array is non-empty', () => {
    const a = entry({ origin: 'local' });
    const b = entry({ origin: 'external' });
    expect(filterUsages([a, b], { search: '', types: [], origins: ['external'] })).toHaveLength(1);
  });

  it('combines filters with AND', () => {
    const a = entry({ layer: 'Card', type: 'COLOR', origin: 'local' });
    const b = entry({ layer: 'Card', type: 'FLOAT', origin: 'local' });
    expect(
      filterUsages([a, b], { search: 'card', types: ['COLOR'], origins: ['local'] }),
    ).toHaveLength(1);
  });
});

describe('computePropertyHealth', () => {
  it('returns zero counts and null extremes for empty input', () => {
    const r = computePropertyHealth([]);
    expect(r).toEqual({ allBound: 0, partial: 0, allUnbound: 0, best: null, worst: null });
  });

  it('counts fully bound / partial / fully unbound properties', () => {
    const input = [
      agg({ property: 'A', bound: 10, unbound: 0 }), // allBound
      agg({ property: 'B', bound: 0, unbound: 8 }),  // allUnbound
      agg({ property: 'C', bound: 4, unbound: 6 }),  // partial
      agg({ property: 'D', bound: 5, unbound: 0 }),  // allBound
      agg({ property: 'E', bound: 0, unbound: 0 }),  // ignored (total 0)
    ];
    const r = computePropertyHealth(input);
    expect(r.allBound).toBe(2);
    expect(r.allUnbound).toBe(1);
    expect(r.partial).toBe(1);
  });

  it('picks best/worst by coverage ratio among properties with total >= minTotal', () => {
    const input = [
      agg({ property: 'Tiny', bound: 1, unbound: 0 }),         // total 1, ignored
      agg({ property: 'Good', bound: 49, unbound: 1 }),        // 98%
      agg({ property: 'Mid', bound: 20, unbound: 30 }),        // 40%
      agg({ property: 'Bad', bound: 3, unbound: 47 }),         // 6%
    ];
    const r = computePropertyHealth(input, 5);
    expect(r.best?.property).toBe('Good');
    expect(r.worst?.property).toBe('Bad');
  });

  it('falls back to all properties when none meet minTotal', () => {
    const input = [
      agg({ property: 'A', bound: 1, unbound: 0 }),
      agg({ property: 'B', bound: 0, unbound: 1 }),
    ];
    const r = computePropertyHealth(input, 5);
    expect(r.best?.property).toBe('A');
    expect(r.worst?.property).toBe('B');
  });

  it('returns the same property as best and worst when only one qualifies', () => {
    const input = [
      agg({ property: 'Only', bound: 6, unbound: 4 }),
      agg({ property: 'Tiny', bound: 1, unbound: 0 }),
    ];
    const r = computePropertyHealth(input, 5);
    expect(r.best?.property).toBe('Only');
    expect(r.worst?.property).toBe('Only');
  });
});
