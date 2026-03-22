import { describe, it, expect, beforeEach } from 'vitest';
import { formatEffectType, collectAllNodes, inspectNode } from '../nodeScanner';
import { resetDedupSets } from '../dedup';
import { makeRectNode, makeFrameNode, makeTextNode } from '../__mocks__/figma';

beforeEach(() => {
  resetDedupSets();
});

// ---------------------------------------------------------------------------
// formatEffectType
// ---------------------------------------------------------------------------

describe('formatEffectType', () => {
  it('converts DROP_SHADOW to "Drop Shadow"', () => {
    expect(formatEffectType('DROP_SHADOW')).toBe('Drop Shadow');
  });

  it('converts INNER_SHADOW to "Inner Shadow"', () => {
    expect(formatEffectType('INNER_SHADOW')).toBe('Inner Shadow');
  });

  it('converts LAYER_BLUR to "Layer Blur"', () => {
    expect(formatEffectType('LAYER_BLUR')).toBe('Layer Blur');
  });

  it('converts BACKGROUND_BLUR to "Background Blur"', () => {
    expect(formatEffectType('BACKGROUND_BLUR')).toBe('Background Blur');
  });

  it('handles single-word type', () => {
    expect(formatEffectType('BLUR')).toBe('Blur');
  });
});

// ---------------------------------------------------------------------------
// collectAllNodes
// ---------------------------------------------------------------------------

describe('collectAllNodes', () => {
  it('returns empty array for empty selection', () => {
    expect(collectAllNodes([])).toEqual([]);
  });

  it('returns the node itself when it has no children', () => {
    const node = makeRectNode({ id: 'r1', name: 'Rect' });
    const result = collectAllNodes([node]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(node);
  });

  it('includes a frame and all its direct children', () => {
    const child1 = makeRectNode({ id: 'c1', name: 'Child1' });
    const child2 = makeRectNode({ id: 'c2', name: 'Child2' });
    const frame = makeFrameNode({ id: 'f1', name: 'Frame', children: [child1, child2] });

    const result = collectAllNodes([frame]);
    expect(result).toHaveLength(3);
    expect(result).toContain(frame);
    expect(result).toContain(child1);
    expect(result).toContain(child2);
  });

  it('collects nodes from multiple top-level items', () => {
    const rect = makeRectNode({ id: 'r1' });
    const frame = makeFrameNode({ id: 'f1', children: [makeRectNode({ id: 'r2' })] });

    const result = collectAllNodes([rect, frame]);
    expect(result).toHaveLength(3);
  });

  it('handles deeply nested trees without stack overflow', () => {
    // Build a chain of 100 nested frames
    let innermost: ReturnType<typeof makeFrameNode> = makeFrameNode({ id: 'deep-0' });
    for (let i = 1; i < 100; i++) {
      innermost = makeFrameNode({ id: `deep-${i}`, children: [innermost] });
    }
    const result = collectAllNodes([innermost]);
    expect(result).toHaveLength(100);
  });

  it('returns nodes as a flat array regardless of nesting depth', () => {
    const leaf = makeRectNode({ id: 'leaf' });
    const mid = makeFrameNode({ id: 'mid', children: [leaf] });
    const root = makeFrameNode({ id: 'root', children: [mid] });

    const result = collectAllNodes([root]);
    const ids = result.map(n => n.id);
    expect(ids).toContain('root');
    expect(ids).toContain('mid');
    expect(ids).toContain('leaf');
  });
});

// ---------------------------------------------------------------------------
// inspectNode — bound variable detection
// ---------------------------------------------------------------------------

describe('inspectNode', () => {
  it('returns no usages for a node with no bindings', () => {
    const node = makeRectNode();
    expect(inspectNode(node)).toEqual([]);
  });

  it('detects a fill color variable', () => {
    const node = makeRectNode({
      id: 'n1',
      name: 'Box',
      fills: [{ type: 'SOLID', boundVariables: { color: { id: 'var-fill-1' } } }],
    });
    const usages = inspectNode(node);
    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({ layer: 'Box', property: 'Fill', id: 'var-fill-1' });
  });

  it('detects a stroke color variable', () => {
    const node = makeRectNode({
      id: 'n1',
      name: 'Box',
      strokes: [{ type: 'SOLID', boundVariables: { color: { id: 'var-stroke-1' } } }],
    });
    const usages = inspectNode(node);
    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({ property: 'Stroke Color', id: 'var-stroke-1' });
  });

  it('deduplicates the same fill variable used twice on the same node', () => {
    const node = makeRectNode({
      id: 'n1',
      name: 'Box',
      fills: [
        { type: 'SOLID', boundVariables: { color: { id: 'var-fill-1' } } },
        { type: 'SOLID', boundVariables: { color: { id: 'var-fill-1' } } },
      ],
    });
    const usages = inspectNode(node);
    // getColorUsages deduplicates via seenColorIds
    expect(usages.filter(u => u.property === 'Fill')).toHaveLength(1);
  });

  it('detects an effect variable (drop shadow radius)', () => {
    const node = makeRectNode({
      id: 'n1',
      name: 'Card',
      effects: [{
        type: 'DROP_SHADOW',
        boundVariables: { radius: { id: 'var-radius-1' } },
      }],
    });
    const usages = inspectNode(node);
    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({ property: 'Drop Shadow radius', id: 'var-radius-1' });
  });

  it('detects a node-level bound variable (opacity)', () => {
    const node = makeRectNode({
      id: 'n1',
      name: 'Ghost',
      boundVariables: { opacity: { id: 'var-opacity-1' } },
    });
    const usages = inspectNode(node);
    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({ property: 'Opacity', id: 'var-opacity-1' });
  });

  it('does not report fill bindings via getNodeBoundVariables (already in Fill usages)', () => {
    const node = makeRectNode({
      id: 'n1',
      name: 'Box',
      fills: [{ type: 'SOLID', boundVariables: { color: { id: 'var-fill-1' } } }],
      // fills is also set as node-level boundVariables — should be skipped
      boundVariables: { fills: { id: 'var-fill-1' } },
    });
    const usages = inspectNode(node);
    const fillUsages = usages.filter(u => u.property === 'Fill');
    expect(fillUsages).toHaveLength(1);
  });

  it('detects fontSize variable on a TEXT node', () => {
    const node = makeTextNode({
      id: 't1',
      name: 'Heading',
      boundVariables: { fontSize: { id: 'var-fs-1' } },
    });
    const usages = inspectNode(node);
    const fsUsages = usages.filter(u => u.property === 'Font Size');
    expect(fsUsages.length).toBeGreaterThanOrEqual(1);
    expect(fsUsages[0].id).toBe('var-fs-1');
  });

  it('detects corner radius variable via node-level boundVariables', () => {
    const node = makeRectNode({
      id: 'n1',
      name: 'Pill',
      boundVariables: { cornerRadius: { id: 'var-cr-1' } },
    });
    const usages = inspectNode(node);
    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({ property: 'Corner Radius', id: 'var-cr-1' });
  });

  it('collects multiple independent bindings on the same node', () => {
    const node = makeRectNode({
      id: 'n1',
      name: 'Complex',
      fills: [{ type: 'SOLID', boundVariables: { color: { id: 'var-fill-1' } } }],
      strokes: [{ type: 'SOLID', boundVariables: { color: { id: 'var-stroke-1' } } }],
      boundVariables: { cornerRadius: { id: 'var-cr-1' } },
    });
    const usages = inspectNode(node);
    const props = usages.map(u => u.property);
    expect(props).toContain('Fill');
    expect(props).toContain('Stroke Color');
    expect(props).toContain('Corner Radius');
  });
});
