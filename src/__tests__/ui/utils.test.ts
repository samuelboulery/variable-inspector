import { describe, it, expect } from 'vitest';
import { regroupByProperty } from '../../ui/utils';
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
