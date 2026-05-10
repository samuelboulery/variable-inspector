import { describe, it, expect } from 'vitest';
import { scanDimensionConstraints, scanLayoutGridColors, scanVisibility, scanTextDecoration } from '../propertyScanner';
import { VariableUsage } from '../types';
import { makeRectNode, makeFrameNode, makeTextNode } from '../__mocks__/figma';

describe('scanDimensionConstraints — bound', () => {
  it('reports a bound minWidth variable', () => {
    const node = makeFrameNode({
      id: 'f1',
      name: 'Card',
      boundVariables: { minWidth: { id: 'var-minw' } },
    });
    const usages: VariableUsage[] = [];
    scanDimensionConstraints(node, usages);
    expect(usages).toContainEqual({ layer: 'Card', property: 'Min Width', id: 'var-minw' });
  });

  it('reports all four constraint bindings independently', () => {
    const node = makeFrameNode({
      id: 'f1',
      name: 'Card',
      boundVariables: {
        minWidth: { id: 'a' },
        maxWidth: { id: 'b' },
        minHeight: { id: 'c' },
        maxHeight: { id: 'd' },
      },
    });
    const usages: VariableUsage[] = [];
    scanDimensionConstraints(node, usages);
    expect(usages).toHaveLength(4);
  });
});

describe('scanLayoutGridColors — bound', () => {
  it('reports a bound layout-grid color', () => {
    const node = {
      ...makeFrameNode({ id: 'f1', name: 'Page' }),
      layoutGrids: [{ pattern: 'GRID', color: { r: 1, g: 0, b: 0 }, boundVariables: { color: { id: 'var-grid' } } }],
    } as unknown as SceneNode;
    const usages: VariableUsage[] = [];
    scanLayoutGridColors(node, usages);
    expect(usages).toContainEqual({ layer: 'Page', property: 'Grid Color', id: 'var-grid' });
  });
});

describe('scanVisibility — bound', () => {
  it('reports a bound visible binding', () => {
    const node = makeRectNode({ id: 'r1', name: 'Maybe', boundVariables: { visible: { id: 'var-vis' } } });
    const usages: VariableUsage[] = [];
    scanVisibility(node, usages);
    expect(usages).toContainEqual({ layer: 'Maybe', property: 'Visible', id: 'var-vis' });
  });
});

describe('scanTextDecoration — bound', () => {
  it('reports textDecoration and textCase bindings on TextNode', () => {
    const node = makeTextNode({ id: 't1', name: 'Heading' }) as unknown as TextNode & { boundVariables?: Record<string, { id: string }> };
    (node as unknown as { boundVariables: Record<string, { id: string }> }).boundVariables = {
      textDecoration: { id: 'var-td' },
      textCase: { id: 'var-tc' },
    };
    const usages: VariableUsage[] = [];
    scanTextDecoration(node, usages);
    expect(usages.find(u => u.property === 'Text Decoration')?.id).toBe('var-td');
    expect(usages.find(u => u.property === 'Text Case')?.id).toBe('var-tc');
  });

  it('skips non-TEXT nodes', () => {
    const node = makeRectNode({ id: 'r1' });
    const usages: VariableUsage[] = [];
    scanTextDecoration(node as unknown as TextNode, usages);
    expect(usages).toHaveLength(0);
  });
});
