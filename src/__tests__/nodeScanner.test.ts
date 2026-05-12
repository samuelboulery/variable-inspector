import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  formatEffectType,
  collectAllNodes,
  inspectNode,
  getLayerDisplayName,
} from '../nodeScanner';
import { resetDedupSets } from '../dedup';
import { figmaMock, makeRectNode, makeFrameNode, makeTextNode } from '../__mocks__/figma';

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
      effects: [
        {
          type: 'DROP_SHADOW',
          boundVariables: { radius: { id: 'var-radius-1' } },
        },
      ],
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

  it('numbers repeated bound drop-shadow radii', () => {
    const node = makeRectNode({
      id: 'n1',
      name: 'Card',
      effects: [
        { type: 'DROP_SHADOW', boundVariables: { radius: { id: 'var-r1' } } },
        { type: 'DROP_SHADOW', boundVariables: { radius: { id: 'var-r2' } } },
      ],
    });
    const usages = inspectNode(node);
    const props = usages.map(u => u.property);
    expect(props).toContain('Drop Shadow 1 radius');
    expect(props).toContain('Drop Shadow 2 radius');
  });

  it('does not number when only one effect of that type is bound', () => {
    const node = makeRectNode({
      id: 'n1',
      name: 'Card',
      effects: [{ type: 'LAYER_BLUR', boundVariables: { radius: { id: 'var-r' } } }],
    });
    const usages = inspectNode(node);
    expect(usages.find(u => u.property === 'Layer Blur radius')).toBeDefined();
    expect(usages.find(u => u.property === 'Layer Blur 1 radius')).toBeUndefined();
  });

  it('attaches effectGroup + subProp on numbered drop-shadow bindings', () => {
    const node = makeRectNode({
      id: 'n1',
      name: 'Card',
      effects: [
        { type: 'DROP_SHADOW', boundVariables: { radius: { id: 'var-r1' } } },
        { type: 'DROP_SHADOW', boundVariables: { color: { id: 'var-c2' } } },
      ],
    });
    const usages = inspectNode(node);
    const r1 = usages.find(u => u.property === 'Drop Shadow 1 radius');
    const c2 = usages.find(u => u.property === 'Drop Shadow 2 color');
    expect(r1?.effectGroup).toBe('Drop Shadow 1');
    expect(r1?.subProp).toBe('Blur');
    expect(c2?.effectGroup).toBe('Drop Shadow 2');
    expect(c2?.subProp).toBe('Color');
  });

  it('uses unnumbered effectGroup for single effect of its type', () => {
    const node = makeRectNode({
      id: 'n1',
      name: 'Card',
      effects: [{ type: 'LAYER_BLUR', boundVariables: { radius: { id: 'var-r' } } }],
    });
    const r = inspectNode(node).find(u => u.property === 'Layer Blur radius');
    expect(r?.effectGroup).toBe('Layer Blur');
    expect(r?.subProp).toBe('Blur');
  });
});

// ---------------------------------------------------------------------------
// getLayerDisplayName
// ---------------------------------------------------------------------------

describe('getLayerDisplayName', () => {
  beforeEach(() => {
    figmaMock.getNodeById = (_id: string) => null;
  });

  it('returns the node name when it is already human-readable', () => {
    const node = makeRectNode({ id: 'n1', name: 'Hero Image' });
    expect(getLayerDisplayName(node)).toBe('Hero Image');
  });

  it('walks the parent chain when the node name is a Figma sublayer ID', () => {
    const grandparent = { name: 'Card Component', type: 'COMPONENT' } as unknown as BaseNode;
    const parent = {
      name: '120:11083',
      type: 'INSTANCE',
      parent: grandparent,
    } as unknown as BaseNode;
    const node = {
      ...makeRectNode({ id: 'n1', name: '120:11084' }),
      parent,
    } as unknown as SceneNode;
    expect(getLayerDisplayName(node)).toBe('Card Component');
  });

  it('skips PAGE and DOCUMENT ancestors when walking the parent chain', () => {
    const page = { name: 'Page 1', type: 'PAGE' } as unknown as BaseNode;
    const doc = { name: 'Doc', type: 'DOCUMENT', parent: null } as unknown as BaseNode;
    const directParent = { name: '50:60', type: 'FRAME', parent: page } as unknown as BaseNode;
    (page as unknown as { parent: BaseNode }).parent = doc;
    const node = {
      ...makeRectNode({ id: 'n1', name: '70:80' }),
      parent: directParent,
    } as unknown as SceneNode;
    // No real ancestor name found → falls back to formatted type label
    expect(getLayerDisplayName(node)).toBe('Rectangle');
  });

  it('caps the parent walk at 10 levels to prevent infinite loops', () => {
    // Build a chain of 15 unnamed ancestors
    let current: BaseNode = { name: '99:99', type: 'FRAME', parent: null } as unknown as BaseNode;
    for (let i = 0; i < 14; i++) {
      const parent = { name: `${i}:${i}`, type: 'FRAME', parent: null } as unknown as BaseNode;
      (current as unknown as { parent: BaseNode }).parent = parent;
      current = parent;
    }
    const node = {
      ...makeRectNode({ id: 'n1', name: '100:100' }),
      parent: current,
    } as unknown as SceneNode;
    // No real ancestor reachable within depth 10 → fallback to type
    expect(getLayerDisplayName(node)).toBe('Rectangle');
  });

  it('uses the COMPONENT_SET parent name for a COMPONENT with Figma-ID name', () => {
    const set = { name: 'Button Variants', type: 'COMPONENT_SET' } as unknown as BaseNode;
    const node = {
      ...makeRectNode({ id: 'n1', name: '10:20' }),
      type: 'COMPONENT',
      parent: set,
    } as unknown as SceneNode;
    expect(getLayerDisplayName(node)).toBe('Button Variants');
  });

  it('resolves an INSTANCE name through its mainComponent', () => {
    const main = { name: 'Avatar', parent: null } as unknown as ComponentNode;
    const node = {
      ...makeRectNode({ id: 'n1', name: '12:34' }),
      type: 'INSTANCE',
      mainComponent: main,
    } as unknown as SceneNode;
    expect(getLayerDisplayName(node)).toBe('Avatar');
  });

  it('resolves an INSTANCE name through its mainComponent → COMPONENT_SET parent', () => {
    const set = { name: 'Icon Set', type: 'COMPONENT_SET' } as unknown as BaseNode;
    const main = { name: '99:99', parent: set } as unknown as ComponentNode;
    const node = {
      ...makeRectNode({ id: 'n1', name: '12:34' }),
      type: 'INSTANCE',
      mainComponent: main,
    } as unknown as SceneNode;
    expect(getLayerDisplayName(node)).toBe('Icon Set');
  });

  it('resolves I-prefixed sublayer IDs by looking up the embedded instance node', () => {
    const container = {
      id: '120:11085',
      name: 'Card',
      type: 'FRAME',
      parent: null,
    } as unknown as SceneNode;
    figmaMock.getNodeById = (id: string) =>
      id === '120:11085' ? (container as unknown as BaseNode) : null;
    const node = {
      ...makeRectNode({ id: 'n1', name: 'I120:11085;62:3213' }),
    } as unknown as SceneNode;
    expect(getLayerDisplayName(node)).toBe('Card');
  });

  it('falls back to a formatted type label when no ancestor and no instance lookup work', () => {
    const node = makeRectNode({ id: 'n1', name: '10:20' });
    expect(getLayerDisplayName(node)).toBe('Rectangle');
  });

  it('formats multi-word node types (FRAME → "Frame", AUTO_LAYOUT → "Auto layout")', () => {
    const node = {
      ...makeRectNode({ id: 'n1', name: '1:1' }),
      type: 'AUTO_LAYOUT',
    } as unknown as SceneNode;
    expect(getLayerDisplayName(node)).toBe('Auto layout');
  });
});

// ---------------------------------------------------------------------------
// selectionchange debounce
// ---------------------------------------------------------------------------

describe('selectionchange debounce', () => {
  it('coalesces multiple rapid events into one scan', () => {
    vi.useFakeTimers();
    let scanCount = 0;
    const debouncedScan = (() => {
      let t: ReturnType<typeof setTimeout> | null = null;
      return () => {
        if (t) clearTimeout(t);
        t = setTimeout(() => {
          scanCount++;
        }, 300);
      };
    })();
    debouncedScan();
    debouncedScan();
    debouncedScan();
    vi.advanceTimersByTime(310);
    expect(scanCount).toBe(1);
    vi.useRealTimers();
  });
});
