import { describe, it, expect, beforeEach } from 'vitest';
import { figmaMock, makeRectNode } from '../__mocks__/figma';
import { getUnboundEffectUsages } from '../effectDetector';
import { UnboundUsage } from '../types';

beforeEach(() => {
  figmaMock.currentPage.selection = [];
});

describe('getUnboundEffectUsages', () => {
  it('returns nothing for a node with no effects', () => {
    const node = makeRectNode({ id: 'r1' });
    const out: UnboundUsage[] = [];
    getUnboundEffectUsages(node, out);
    expect(out).toHaveLength(0);
  });

  it('reports an unbound DROP_SHADOW radius (labelled "Blur")', () => {
    const node = makeRectNode({
      id: 'r1',
      effects: [
        {
          type: 'DROP_SHADOW',
          radius: 4,
          color: { r: 0, g: 0, b: 0 },
          offset: { x: 2, y: 4 },
        },
      ],
    });
    const out: UnboundUsage[] = [];
    getUnboundEffectUsages(node, out);

    const blur = out.find(u => u.property === 'Drop Shadow Blur');
    expect(blur).toBeDefined();
    expect(blur?.value).toBe('4');
    expect(blur?.effectGroup).toBe('Drop Shadow');
    expect(blur?.subProp).toBe('Blur');
  });

  it('reports SHADOW offsets X and Y separately', () => {
    const node = makeRectNode({
      id: 'r1',
      effects: [
        {
          type: 'DROP_SHADOW',
          radius: 0,
          offset: { x: 3, y: 7 },
        },
      ],
    });
    const out: UnboundUsage[] = [];
    getUnboundEffectUsages(node, out);
    expect(out.some(u => u.property === 'Drop Shadow Offset X' && u.value === '3')).toBe(true);
    expect(out.some(u => u.property === 'Drop Shadow Offset Y' && u.value === '7')).toBe(true);
  });

  it('skips offsets when the binding exists', () => {
    const node = makeRectNode({
      id: 'r1',
      effects: [
        {
          type: 'DROP_SHADOW',
          radius: 0,
          offset: { x: 1, y: 2 },
          boundVariables: {
            offset: { x: { id: 'v1' }, y: { id: 'v2' } },
          },
        },
      ],
    });
    const out: UnboundUsage[] = [];
    getUnboundEffectUsages(node, out);
    expect(out.some(u => u.property.startsWith('Drop Shadow Offset'))).toBe(false);
  });

  it('numbers multiple effects of the same type', () => {
    const node = makeRectNode({
      id: 'r1',
      effects: [
        { type: 'DROP_SHADOW', radius: 1, offset: { x: 0, y: 0 } },
        { type: 'DROP_SHADOW', radius: 2, offset: { x: 0, y: 0 } },
      ],
    });
    const out: UnboundUsage[] = [];
    getUnboundEffectUsages(node, out);
    expect(out.some(u => u.effectGroup === 'Drop Shadow 1')).toBe(true);
    expect(out.some(u => u.effectGroup === 'Drop Shadow 2')).toBe(true);
  });

  it('reports spread when present and unbound', () => {
    const node = makeRectNode({
      id: 'r1',
      effects: [{ type: 'DROP_SHADOW', radius: 0, spread: 5, offset: { x: 0, y: 0 } }],
    });
    const out: UnboundUsage[] = [];
    getUnboundEffectUsages(node, out);
    const sp = out.find(u => u.property === 'Drop Shadow Spread');
    expect(sp).toBeDefined();
    expect(sp?.value).toBe('5');
  });

  it('skips spread when bound to a variable', () => {
    const node = makeRectNode({
      id: 'r1',
      effects: [
        {
          type: 'DROP_SHADOW',
          radius: 0,
          spread: 5,
          offset: { x: 0, y: 0 },
          boundVariables: { spread: { id: 'var-spread' } },
        },
      ],
    });
    const out: UnboundUsage[] = [];
    getUnboundEffectUsages(node, out);
    expect(out.some(u => u.property === 'Drop Shadow Spread')).toBe(false);
  });

  it('reports unbound effect color in rgb() format', () => {
    const node = makeRectNode({
      id: 'r1',
      effects: [
        {
          type: 'DROP_SHADOW',
          radius: 0,
          offset: { x: 0, y: 0 },
          color: { r: 1, g: 0, b: 0 },
        },
      ],
    });
    const out: UnboundUsage[] = [];
    getUnboundEffectUsages(node, out);
    const color = out.find(u => u.property === 'Drop Shadow Color');
    expect(color?.value).toBe('rgb(255, 0, 0)');
  });

  it('uses "Radius" subProp for non-blur non-shadow effects', () => {
    const node = makeRectNode({
      id: 'r1',
      effects: [{ type: 'NOISE', radius: 3, offset: { x: 0, y: 0 } }],
    });
    const out: UnboundUsage[] = [];
    getUnboundEffectUsages(node, out);
    expect(out.some(u => u.subProp === 'Radius' && u.value === '3')).toBe(true);
  });

  it('labels LAYER_BLUR as "Layer Blur"', () => {
    const node = makeRectNode({
      id: 'r1',
      effects: [{ type: 'LAYER_BLUR', radius: 8 }],
    });
    const out: UnboundUsage[] = [];
    getUnboundEffectUsages(node, out);
    expect(out.some(u => u.effectGroup === 'Layer Blur')).toBe(true);
  });
});
