import { describe, it, expect } from 'vitest';
import { scanComponentProperties } from '../componentProps';
import { VariableUsage } from '../types';

function makeInstance(overrides: {
  id?: string;
  name?: string;
  componentPropertyReferences?: Record<string, string>;
  boundVariables?: { componentProperties?: Record<string, { id: string }> };
}): InstanceNode {
  return {
    id: overrides.id ?? 'i1',
    name: overrides.name ?? 'Button',
    type: 'INSTANCE',
    componentPropertyReferences: overrides.componentPropertyReferences ?? {},
    boundVariables: overrides.boundVariables ?? {},
  } as unknown as InstanceNode;
}

describe('scanComponentProperties', () => {
  it('reports a bound variant property', () => {
    const node = makeInstance({
      componentPropertyReferences: { State: 'def-state' },
      boundVariables: { componentProperties: { State: { id: 'var-state' } } },
    });
    const usages: VariableUsage[] = [];
    scanComponentProperties(node, usages);
    expect(usages).toContainEqual({
      layer: 'Button',
      property: 'Component / State',
      id: 'var-state',
    });
  });

  it('reports nothing when boundVariables.componentProperties is absent', () => {
    const node = makeInstance({});
    const usages: VariableUsage[] = [];
    scanComponentProperties(node, usages);
    expect(usages).toHaveLength(0);
  });

  it('reports multiple bound component properties', () => {
    const node = makeInstance({
      componentPropertyReferences: { State: 'a', Disabled: 'b', Label: 'c' },
      boundVariables: { componentProperties: { State: { id: 'v-s' }, Disabled: { id: 'v-d' } } },
    });
    const usages: VariableUsage[] = [];
    scanComponentProperties(node, usages);
    expect(usages).toHaveLength(2);
    expect(usages.map(u => u.property)).toContain('Component / State');
    expect(usages.map(u => u.property)).toContain('Component / Disabled');
  });

  it('does nothing for non-INSTANCE nodes', () => {
    const node = { id: 'r1', name: 'Rect', type: 'RECTANGLE' } as unknown as InstanceNode;
    const usages: VariableUsage[] = [];
    scanComponentProperties(node, usages);
    expect(usages).toHaveLength(0);
  });

  it('handles missing componentPropertyReferences gracefully', () => {
    const node = {
      id: 'i1',
      name: 'X',
      type: 'INSTANCE',
      boundVariables: { componentProperties: { Foo: { id: 'v' } } },
    } as unknown as InstanceNode;
    const usages: VariableUsage[] = [];
    scanComponentProperties(node, usages);
    expect(usages).toContainEqual({ layer: 'X', property: 'Component / Foo', id: 'v' });
  });
});
