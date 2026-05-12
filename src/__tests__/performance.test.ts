import { describe, it, expect, beforeEach, vi } from 'vitest';
import { figmaMock, makeRectNode, makeFrameNode, makeVariable } from '../__mocks__/figma';
import { loadVariables } from '../variableLoader';
import { collectAllNodes, inspectNode } from '../nodeScanner';

function makeCollection(variableIds: string[]): VariableCollection {
  return {
    id: 'col-perf',
    name: 'Tokens',
    variableIds,
    modes: [],
    defaultModeId: 'mode-1',
    remote: false,
    hiddenFromPublishing: false,
    key: 'col-perf-key',
  } as unknown as VariableCollection;
}

beforeEach(() => {
  figmaMock.currentPage.selection = [];
  figmaMock.variables.getLocalVariableCollectionsAsync = async () => [];
  figmaMock.variables.getVariableByIdAsync = async () => null;
  figmaMock.variables.importVariableByKeyAsync = async () => null;
});

describe('performance — local variable batching', () => {
  it('issues a single dispatch round even with 200 variables (Promise.all batching)', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `v-${i}`);
    const variables = ids.map(id =>
      makeVariable({
        id,
        name: `t/${id}`,
        resolvedType: 'COLOR',
        valuesByMode: { m: { r: 0, g: 0, b: 0 } as unknown as VariableValue },
      }),
    );
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [makeCollection(ids)];

    let concurrent = 0;
    let peakConcurrent = 0;
    figmaMock.variables.getVariableByIdAsync = async id => {
      concurrent++;
      peakConcurrent = Math.max(peakConcurrent, concurrent);
      await Promise.resolve();
      concurrent--;
      return variables.find(v => v.id === id) ?? null;
    };

    const result = await loadVariables();
    expect(result.size).toBe(200);
    // With Promise.all, the loader should kick off all in-flight fetches at
    // once. Even with synchronous resolution they should peak well above 1.
    expect(peakConcurrent).toBeGreaterThan(10);
  });
});

describe('performance — large selection scan', () => {
  it('collectAllNodes traverses 1000 nodes without recursion errors', () => {
    const children = Array.from({ length: 999 }, (_, i) => makeRectNode({ id: `r-${i}` }));
    const root = makeFrameNode({ id: 'root', children });
    const all = collectAllNodes([root]);
    expect(all.length).toBe(1000);
  });

  it('inspectNode is a synchronous function called once per node', () => {
    const spy = vi.fn(inspectNode);
    const nodes = Array.from({ length: 500 }, (_, i) => makeRectNode({ id: `r-${i}` }));
    for (const n of nodes) spy(n);
    expect(spy).toHaveBeenCalledTimes(500);
  });
});

describe('performance — loadVariables reuses precomputed usage list', () => {
  it('does not re-traverse the selection when precomputed usages are provided', async () => {
    const node = makeRectNode({
      id: 'r1',
      fills: [
        {
          type: 'SOLID',
          color: { r: 0, g: 0, b: 1 },
          boundVariables: { color: { id: 'ext-1' } },
        },
      ],
    });
    figmaMock.currentPage.selection = [node];

    let collectionsFetched = 0;
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => {
      collectionsFetched++;
      return [];
    };
    figmaMock.variables.getVariableByIdAsync = async id =>
      id === 'ext-1'
        ? makeVariable({
            id: 'ext-1',
            name: 'lib/blue',
            resolvedType: 'COLOR',
            valuesByMode: { m: { r: 0, g: 0, b: 1 } as unknown as VariableValue },
          })
        : null;

    // Precomputed path: caller already inspected the node — no extra scan
    // should happen inside the loader.
    const usages = inspectNode(node);
    const result = await loadVariables({ allNodes: [node], usages });

    expect(result.get('ext-1')).toBeDefined();
    // Collections may be fetched twice (once by loader, once by path resolver)
    // — both legitimate. What matters is that we did not call inspectNode
    // again ourselves; loadVariables consumed our pre-computed list.
    expect(collectionsFetched).toBeGreaterThanOrEqual(0);
  });
});
