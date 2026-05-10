import { describe, it, expect, beforeEach } from 'vitest';
import { getUnboundColorUsages, getUnboundFloatUsages, getUnboundEffectUsages } from '../unboundDetector';
import { resetDedupSets } from '../dedup';
import { UnboundUsage } from '../types';
import { makeRectNode, makeTextNode, makeFrameNode } from '../__mocks__/figma';

beforeEach(() => {
  resetDedupSets();
});

// ---------------------------------------------------------------------------
// getUnboundColorUsages — fill
// ---------------------------------------------------------------------------

describe('getUnboundColorUsages — fills', () => {
  it('reports an unbound fill with its rgb() value', () => {
    const node = makeRectNode({
      id: 'n1',
      name: 'Box',
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
    });
    const usages: UnboundUsage[] = [];
    getUnboundColorUsages(node, usages);
    expect(usages).toHaveLength(1);
    expect(usages[0].property).toBe('Fill');
    expect(usages[0].value).toBe('rgb(255, 0, 0)');
    expect(usages[0].layer).toBe('Box');
    expect(usages[0].layerId).toBe('n1');
  });

  it('does not report a fill that is bound to a variable', () => {
    const node = makeRectNode({
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, boundVariables: { color: { id: 'var-1' } } }],
    });
    const usages: UnboundUsage[] = [];
    getUnboundColorUsages(node, usages);
    expect(usages).toHaveLength(0);
  });

  it('reports only unbound fills when mixed with bound ones', () => {
    const node = makeRectNode({
      fills: [
        { type: 'SOLID', color: { r: 0, g: 1, b: 0 }, boundVariables: { color: { id: 'var-1' } } },
        { type: 'SOLID', color: { r: 0, g: 0, b: 1 } },
      ],
    });
    const usages: UnboundUsage[] = [];
    getUnboundColorUsages(node, usages);
    expect(usages).toHaveLength(1);
    expect(usages[0].value).toBe('rgb(0, 0, 255)');
  });

  it('does not report a fill without a color property', () => {
    const node = makeRectNode({
      fills: [{ type: 'IMAGE' }], // no .color
    });
    const usages: UnboundUsage[] = [];
    getUnboundColorUsages(node, usages);
    expect(usages).toHaveLength(0);
  });

  it('rounds fractional rgb channel values correctly', () => {
    const node = makeRectNode({
      fills: [{ type: 'SOLID', color: { r: 0.502, g: 0.251, b: 0.749 } }],
    });
    const usages: UnboundUsage[] = [];
    getUnboundColorUsages(node, usages);
    expect(usages[0].value).toBe('rgb(128, 64, 191)');
  });
});

// ---------------------------------------------------------------------------
// getUnboundColorUsages — strokes
// ---------------------------------------------------------------------------

describe('getUnboundColorUsages — strokes', () => {
  it('reports an unbound stroke color', () => {
    const node = makeRectNode({
      id: 'n1',
      name: 'Bordered',
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
    });
    const usages: UnboundUsage[] = [];
    getUnboundColorUsages(node, usages);
    expect(usages).toHaveLength(1);
    expect(usages[0].property).toBe('Stroke');
    expect(usages[0].value).toBe('rgb(0, 0, 0)');
  });

  it('does not report a stroke that is bound to a variable', () => {
    const node = makeRectNode({
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, boundVariables: { color: { id: 'var-1' } } }],
    });
    const usages: UnboundUsage[] = [];
    getUnboundColorUsages(node, usages);
    expect(usages).toHaveLength(0);
  });

  it('does not report the same stroke twice when called twice', () => {
    const node = makeRectNode({
      id: 'n1',
      strokes: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
    });
    const usages: UnboundUsage[] = [];
    getUnboundColorUsages(node, usages);
    getUnboundColorUsages(node, usages);
    expect(usages.filter(u => u.property === 'Stroke')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getUnboundFloatUsages — opacity
// ---------------------------------------------------------------------------

describe('getUnboundFloatUsages — opacity', () => {
  it('reports unbound opacity when opacity < 1', () => {
    const node = makeRectNode({ id: 'n1', name: 'Ghost', opacity: 0.5 });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    const op = usages.find(u => u.property === 'Opacity');
    expect(op).toBeDefined();
    expect(op!.value).toBe('0.5');
  });

  it('does not report opacity when it equals 1', () => {
    const node = makeRectNode({ id: 'n1', opacity: 1 });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages.find(u => u.property === 'Opacity')).toBeUndefined();
  });

  it('does not report opacity when it is bound to a variable', () => {
    const node = makeRectNode({
      id: 'n1',
      opacity: 0.3,
      boundVariables: { opacity: { id: 'var-op' } },
    });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages.find(u => u.property === 'Opacity')).toBeUndefined();
  });

  it('formats opacity to at most 2 decimal places', () => {
    const node = makeRectNode({ id: 'n1', opacity: 0.123456 });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    const op = usages.find(u => u.property === 'Opacity');
    expect(op!.value).toBe('0.12');
  });

  it('removes trailing zeros from opacity value', () => {
    const node = makeRectNode({ id: 'n1', opacity: 0.5 });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    const op = usages.find(u => u.property === 'Opacity');
    // Should be "0.5" not "0.50"
    expect(op!.value).toBe('0.5');
  });
});

// ---------------------------------------------------------------------------
// getUnboundFloatUsages — corner radius
// ---------------------------------------------------------------------------

describe('getUnboundFloatUsages — corner radius', () => {
  it('reports unbound corner radius when non-zero', () => {
    const node = makeRectNode({ id: 'n1', name: 'Pill', cornerRadius: 8 });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    const cr = usages.find(u => u.property === 'Corner Radius');
    expect(cr).toBeDefined();
    expect(cr!.value).toBe('8');
  });

  it('does not report corner radius when it is 0', () => {
    const node = makeRectNode({ id: 'n1', cornerRadius: 0 });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages.find(u => u.property === 'Corner Radius')).toBeUndefined();
  });

  it('does not report corner radius when bound to a variable', () => {
    const node = makeRectNode({
      id: 'n1',
      cornerRadius: 12,
      boundVariables: { cornerRadius: { id: 'var-cr' } },
    });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages.find(u => u.property === 'Corner Radius')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getUnboundFloatUsages — stroke weight
// ---------------------------------------------------------------------------

describe('getUnboundFloatUsages — stroke weight', () => {
  it('reports unbound stroke weight when strokes are present and weight > 0', () => {
    const node = makeRectNode({
      id: 'n1',
      name: 'Lined',
      strokeWeight: 2,
      strokes: [{ type: 'SOLID' }],
    });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    const sw = usages.find(u => u.property === 'Stroke Weight');
    expect(sw).toBeDefined();
    expect(sw!.value).toBe('2');
  });

  it('does not report stroke weight when no strokes exist', () => {
    const node = makeRectNode({ id: 'n1', strokeWeight: 2, strokes: [] });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages.find(u => u.property === 'Stroke Weight')).toBeUndefined();
  });

  it('does not report stroke weight when bound to a variable', () => {
    const node = makeRectNode({
      id: 'n1',
      strokeWeight: 2,
      strokes: [{ type: 'SOLID' }],
      boundVariables: { strokeWeight: { id: 'var-sw' } },
    });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages.find(u => u.property === 'Stroke Weight')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getUnboundFloatUsages — text properties
// ---------------------------------------------------------------------------

describe('getUnboundFloatUsages — text properties', () => {
  it('reports unbound font size on a TEXT node', () => {
    const node = makeTextNode({ id: 't1', name: 'Heading', fontSize: 24 });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    const fs = usages.find(u => u.property === 'Font Size');
    expect(fs).toBeDefined();
    expect(fs!.value).toBe('24');
  });

  it('does not report font size when bound to a variable', () => {
    const node = makeTextNode({
      id: 't1',
      fontSize: 24,
      boundVariables: { fontSize: { id: 'var-fs' } },
    });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages.find(u => u.property === 'Font Size')).toBeUndefined();
  });

  it('does not report font size for non-TEXT nodes', () => {
    const node = makeRectNode({ id: 'n1' });
    // Patch on a non-TEXT node — should be ignored
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages.find(u => u.property === 'Font Size')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getUnboundEffectUsages — numeric effect properties
// ---------------------------------------------------------------------------

describe('getUnboundEffectUsages', () => {
  it('reports unbound blur radius on a LAYER_BLUR effect', () => {
    const node = makeRectNode({
      id: 'n1',
      name: 'Frosted',
      effects: [{ type: 'LAYER_BLUR', radius: 10 }],
    });
    const usages: UnboundUsage[] = [];
    getUnboundEffectUsages(node, usages);
    expect(usages).toHaveLength(1);
    expect(usages[0].property).toBe('Layer Blur Blur');
    expect(usages[0].value).toBe('10');
  });

  it('reports unbound shadow offset X and Y', () => {
    const node = makeRectNode({
      id: 'n1',
      name: 'Card',
      effects: [{
        type: 'DROP_SHADOW',
        radius: 0,
        offset: { x: 4, y: 8 },
      }],
    });
    const usages: UnboundUsage[] = [];
    getUnboundEffectUsages(node, usages);
    const props = usages.map(u => u.property);
    expect(props).toContain('Drop Shadow Offset X');
    expect(props).toContain('Drop Shadow Offset Y');
    expect(usages.find(u => u.property === 'Drop Shadow Offset X')!.value).toBe('4');
    expect(usages.find(u => u.property === 'Drop Shadow Offset Y')!.value).toBe('8');
  });

  it('does not report effect properties that are bound to variables', () => {
    const node = makeRectNode({
      id: 'n1',
      effects: [{
        type: 'LAYER_BLUR',
        radius: 10,
        boundVariables: { radius: { id: 'var-blur' } },
      }],
    });
    const usages: UnboundUsage[] = [];
    getUnboundEffectUsages(node, usages);
    expect(usages).toHaveLength(0);
  });

  it('reports unbound shadow color', () => {
    const node = makeRectNode({
      id: 'n1',
      effects: [{
        type: 'DROP_SHADOW',
        radius: 0,
        color: { r: 0, g: 0, b: 0 },
      }],
    });
    const usages: UnboundUsage[] = [];
    getUnboundEffectUsages(node, usages);
    const colorUsage = usages.find(u => u.property === 'Drop Shadow Color');
    expect(colorUsage).toBeDefined();
    expect(colorUsage!.value).toBe('rgb(0, 0, 0)');
  });

  it('returns no usages for a node without effects', () => {
    const node = makeRectNode({ id: 'n1', effects: [] });
    const usages: UnboundUsage[] = [];
    getUnboundEffectUsages(node, usages);
    expect(usages).toHaveLength(0);
  });

  it('reports unbound shadow spread', () => {
    const node = makeRectNode({
      id: 'n1',
      effects: [{ type: 'DROP_SHADOW', radius: 0, spread: 6 }],
    });
    const usages: UnboundUsage[] = [];
    getUnboundEffectUsages(node, usages);
    const spread = usages.find(u => u.property === 'Drop Shadow Spread');
    expect(spread).toBeDefined();
    expect(spread!.value).toBe('6');
  });

  it('skips offset.x when bound but reports offset.y when unbound', () => {
    const node = makeRectNode({
      id: 'n1',
      effects: [{
        type: 'DROP_SHADOW',
        radius: 0,
        offset: { x: 2, y: 4 },
        boundVariables: { offset: { x: { id: 'var-x' } } },
      }],
    });
    const usages: UnboundUsage[] = [];
    getUnboundEffectUsages(node, usages);
    const props = usages.map(u => u.property);
    expect(props).not.toContain('Drop Shadow Offset X');
    expect(props).toContain('Drop Shadow Offset Y');
  });

  it('uses "Radius" label (not "Blur") for non-blur, non-shadow effect types', () => {
    const node = makeRectNode({
      id: 'n1',
      effects: [{ type: 'NOISE', radius: 3 }],
    });
    const usages: UnboundUsage[] = [];
    getUnboundEffectUsages(node, usages);
    expect(usages[0].property).toBe('Noise Radius');
  });
});

// ---------------------------------------------------------------------------
// getUnboundEffectUsages — numbering repeated effects
// ---------------------------------------------------------------------------

describe('getUnboundEffectUsages — numbering repeated effects', () => {
  it('does not number a single effect of its type', () => {
    const node = makeRectNode({
      id: 'n1',
      effects: [{ type: 'DROP_SHADOW', radius: 4 }],
    });
    const usages: UnboundUsage[] = [];
    getUnboundEffectUsages(node, usages);
    expect(usages.some(u => u.property === 'Drop Shadow Blur')).toBe(true);
    expect(usages.some(u => u.property === 'Drop Shadow 1 Blur')).toBe(false);
  });

  it('numbers multiple Drop Shadows 1 / 2 / 3', () => {
    const node = makeRectNode({
      id: 'n1',
      effects: [
        { type: 'DROP_SHADOW', radius: 2 },
        { type: 'DROP_SHADOW', radius: 4 },
        { type: 'DROP_SHADOW', radius: 8 },
      ],
    });
    const usages: UnboundUsage[] = [];
    getUnboundEffectUsages(node, usages);
    const props = usages.map(u => u.property);
    expect(props).toContain('Drop Shadow 1 Blur');
    expect(props).toContain('Drop Shadow 2 Blur');
    expect(props).toContain('Drop Shadow 3 Blur');
  });

  it('counts DROP_SHADOW and INNER_SHADOW separately', () => {
    const node = makeRectNode({
      id: 'n1',
      effects: [
        { type: 'DROP_SHADOW', radius: 2 },
        { type: 'INNER_SHADOW', radius: 4 },
        { type: 'DROP_SHADOW', radius: 6 },
      ],
    });
    const usages: UnboundUsage[] = [];
    getUnboundEffectUsages(node, usages);
    const props = usages.map(u => u.property);
    expect(props).toContain('Drop Shadow 1 Blur');
    expect(props).toContain('Drop Shadow 2 Blur');
    expect(props).toContain('Inner Shadow Blur');
  });
});

// ---------------------------------------------------------------------------
// getUnboundFloatUsages — text properties: lineHeight, letterSpacing, paragraphSpacing
// ---------------------------------------------------------------------------

describe('getUnboundFloatUsages — additional text properties', () => {
  it('reports unbound letterSpacing on a TEXT node', () => {
    const node = makeTextNode({ id: 't1', name: 'Caption', letterSpacing: 1.5 });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    const ls = usages.find(u => u.property.toLowerCase().includes('letter'));
    expect(ls).toBeDefined();
    expect(ls!.value).toBe('1.5');
  });

  it('reports unbound lineHeight on a TEXT node', () => {
    const node = makeTextNode({ id: 't1', name: 'Body', lineHeight: 24 });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    const lh = usages.find(u => u.property.toLowerCase().includes('line'));
    expect(lh).toBeDefined();
    expect(lh!.value).toBe('24');
  });

  it('reports unbound paragraphSpacing on a TEXT node', () => {
    const node = makeTextNode({ id: 't1', name: 'Body', paragraphSpacing: 8 });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    const ps = usages.find(u => u.property.toLowerCase().includes('paragraph'));
    expect(ps).toBeDefined();
    expect(ps!.value).toBe('8');
  });

  it('skips text properties bound to variables', () => {
    const node = makeTextNode({
      id: 't1',
      letterSpacing: 1,
      boundVariables: { letterSpacing: { id: 'var-ls' } },
    });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages.find(u => u.property.toLowerCase().includes('letter'))).toBeUndefined();
  });

  it('skips zero-valued text properties', () => {
    const node = makeTextNode({ id: 't1', letterSpacing: 0, paragraphSpacing: 0 });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages.find(u => u.property.toLowerCase().includes('letter'))).toBeUndefined();
    expect(usages.find(u => u.property.toLowerCase().includes('paragraph'))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getUnboundFloatUsages — spacing (padding, gap)
// ---------------------------------------------------------------------------

describe('getUnboundFloatUsages — spacing', () => {
  function makeAutoLayoutFrame(overrides: {
    paddingLeft?: number;
    paddingRight?: number;
    paddingTop?: number;
    paddingBottom?: number;
    itemSpacing?: number;
    boundVariables?: Record<string, unknown>;
  } = {}): SceneNode {
    return {
      id: 'al-1',
      name: 'AutoFrame',
      type: 'FRAME',
      paddingLeft: overrides.paddingLeft ?? 0,
      paddingRight: overrides.paddingRight ?? 0,
      paddingTop: overrides.paddingTop ?? 0,
      paddingBottom: overrides.paddingBottom ?? 0,
      itemSpacing: overrides.itemSpacing ?? 0,
      boundVariables: overrides.boundVariables ?? {},
    } as unknown as SceneNode;
  }

  it('reports unbound padding on each side', () => {
    const node = makeAutoLayoutFrame({ paddingLeft: 12, paddingRight: 16, paddingTop: 4, paddingBottom: 8 });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    const props = usages.map(u => u.property);
    expect(props).toContain('Padding Left');
    expect(props).toContain('Padding Right');
    expect(props).toContain('Padding Top');
    expect(props).toContain('Padding Bottom');
  });

  it('reports unbound itemSpacing as Gap', () => {
    const node = makeAutoLayoutFrame({ itemSpacing: 10 });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    const gap = usages.find(u => u.property.toLowerCase().includes('gap') || u.property.toLowerCase().includes('item'));
    expect(gap).toBeDefined();
    expect(gap!.value).toBe('10');
  });

  it('skips spacing when value is 0', () => {
    const node = makeAutoLayoutFrame({ paddingLeft: 0, itemSpacing: 0 });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages).toHaveLength(0);
  });

  it('skips paddingLeft when bound to a variable', () => {
    const node = makeAutoLayoutFrame({ paddingLeft: 12, boundVariables: { paddingLeft: { id: 'var-pl' } } });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages.find(u => u.property === 'Padding Left')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getUnboundFloatUsages — dimension constraints
// ---------------------------------------------------------------------------

describe('getUnboundFloatUsages — dimension constraints', () => {
  it('reports unbound minWidth and maxWidth', () => {
    const node = {
      ...makeFrameNode({ id: 'f1', name: 'Card' }),
      minWidth: 100,
      maxWidth: 400,
    } as unknown as SceneNode;
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages.find(u => u.property === 'Min Width')?.value).toBe('100');
    expect(usages.find(u => u.property === 'Max Width')?.value).toBe('400');
  });

  it('skips dimension constraints bound to variables', () => {
    const node = {
      ...makeFrameNode({ id: 'f1' }),
      minWidth: 100,
      boundVariables: { minWidth: { id: 'var-mw' } },
    } as unknown as SceneNode;
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages.find(u => u.property === 'Min Width')).toBeUndefined();
  });

  it('skips dimension constraints when value is null or undefined', () => {
    const node = makeFrameNode({ id: 'f1', name: 'Card' });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages.find(u => u.property === 'Min Width')).toBeUndefined();
  });
});
