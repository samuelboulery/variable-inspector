import { describe, it, expect } from 'vitest';
import { regroupByProperty, computeStats, filterUsages } from '../../ui/utils';
import { FullUsageEntry } from '../../types';

function entry(overrides: Partial<FullUsageEntry>): FullUsageEntry {
  return {
    layer: 'L', layerId: 'l1', property: 'P',
    name: 'n', type: 'COLOR', origin: 'local', id: 'v1',
    ...overrides,
  };
}

describe('regroupByProperty', () => {
  it('groups entries by property name', () => {
    const byLayer = {
      l1: [entry({ layerId: 'l1', layer: 'A', property: 'Fill' }), entry({ layerId: 'l1', layer: 'A', property: 'Stroke Color' })],
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
      l1: [
        entry({ origin: 'local', type: 'COLOR' }),
        entry({ origin: 'external', type: 'FLOAT' }),
      ],
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
    expect(filterUsages([a, b], { search: '', types: ['COLOR', 'FLOAT'], origins: [] })).toHaveLength(2);
  });

  it('filters by origin when origins array is non-empty', () => {
    const a = entry({ origin: 'local' });
    const b = entry({ origin: 'external' });
    expect(filterUsages([a, b], { search: '', types: [], origins: ['external'] })).toHaveLength(1);
  });

  it('combines filters with AND', () => {
    const a = entry({ layer: 'Card', type: 'COLOR', origin: 'local' });
    const b = entry({ layer: 'Card', type: 'FLOAT', origin: 'local' });
    expect(filterUsages([a, b], { search: 'card', types: ['COLOR'], origins: ['local'] })).toHaveLength(1);
  });
});
