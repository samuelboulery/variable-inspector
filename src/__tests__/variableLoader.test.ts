import { describe, it, expect, beforeEach, vi } from 'vitest';
import { figmaMock, makeVariable, makeAliasChain, makeRectNode } from '../__mocks__/figma';
import { loadVariables } from '../variableLoader';

beforeEach(() => {
  // Reset mock state between tests
  figmaMock.currentPage.selection = [];
  figmaMock.variables.getLocalVariableCollectionsAsync = async () => [];
  figmaMock.variables.getVariableByIdAsync = async () => null;
  figmaMock.variables.importVariableByKeyAsync = async () => null;
});

function makeCollection(variableIds: string[]): VariableCollection {
  return {
    id: 'col-1',
    name: 'Local Tokens',
    variableIds,
    modes: [],
    defaultModeId: 'mode-1',
    remote: false,
    hiddenFromPublishing: false,
    key: 'col-key',
  } as unknown as VariableCollection;
}

describe('loadVariables — local collections', () => {
  it('returns an empty map when no collections exist', async () => {
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [];
    const result = await loadVariables();
    expect(result.size).toBe(0);
  });

  it('loads a single local COLOR variable with origin "local"', async () => {
    const variable = makeVariable({
      id: 'var-1',
      name: 'color/primary',
      resolvedType: 'COLOR',
      valuesByMode: { 'mode-1': { r: 1, g: 0, b: 0 } as unknown as VariableValue },
    });
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [makeCollection(['var-1'])];
    figmaMock.variables.getVariableByIdAsync = async id => (id === 'var-1' ? variable : null);

    const result = await loadVariables();
    const def = result.get('var-1');
    expect(def).toBeDefined();
    expect(def?.name).toBe('color/primary');
    expect(def?.origin).toBe('local');
    expect(def?.type).toBe('COLOR');
    expect(def?.colorValue).toEqual({ r: 1, g: 0, b: 0 });
  });

  it('loads non-COLOR variables without colorValue', async () => {
    const variable = makeVariable({
      id: 'var-spacing',
      name: 'spacing/md',
      resolvedType: 'FLOAT',
      valuesByMode: { 'mode-1': 16 as unknown as VariableValue },
    });
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [
      makeCollection(['var-spacing']),
    ];
    figmaMock.variables.getVariableByIdAsync = async () => variable;

    const result = await loadVariables();
    const def = result.get('var-spacing');
    expect(def?.type).toBe('FLOAT');
    expect(def?.colorValue).toBeUndefined();
  });

  it('skips variables that resolve to null (unpublished external lib)', async () => {
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [
      makeCollection(['ghost-id']),
    ];
    figmaMock.variables.getVariableByIdAsync = async () => null;

    const result = await loadVariables();
    expect(result.size).toBe(0);
  });

  it('handles multiple collections with multiple variables', async () => {
    const v1 = makeVariable({
      id: 'a',
      name: 'a',
      resolvedType: 'COLOR',
      valuesByMode: { m: { r: 0, g: 0, b: 0 } as unknown as VariableValue },
    });
    const v2 = makeVariable({
      id: 'b',
      name: 'b',
      resolvedType: 'FLOAT',
      valuesByMode: { m: 4 as unknown as VariableValue },
    });
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [
      makeCollection(['a']),
      makeCollection(['b']),
    ];
    figmaMock.variables.getVariableByIdAsync = async id =>
      id === 'a' ? v1 : id === 'b' ? v2 : null;

    const result = await loadVariables();
    expect(result.size).toBe(2);
    expect(result.get('a')?.name).toBe('a');
    expect(result.get('b')?.name).toBe('b');
  });
});

describe('loadVariables — external (library) variables', () => {
  it('classifies a variable found via selection scan as origin "external"', async () => {
    const externalVar = makeVariable({
      id: 'ext-1',
      name: 'lib/blue',
      resolvedType: 'COLOR',
      valuesByMode: { 'mode-1': { r: 0, g: 0, b: 1 } as unknown as VariableValue },
    });
    const node = makeRectNode({
      id: 'rect-1',
      fills: [
        { type: 'SOLID', color: { r: 0, g: 0, b: 1 }, boundVariables: { color: { id: 'ext-1' } } },
      ],
    });
    figmaMock.currentPage.selection = [node];
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [];
    figmaMock.variables.getVariableByIdAsync = async id => (id === 'ext-1' ? externalVar : null);

    const result = await loadVariables();
    const def = result.get('ext-1');
    expect(def).toBeDefined();
    expect(def?.origin).toBe('external');
    expect(def?.name).toBe('lib/blue');
  });

  it('overrides the fallback name with the published-import name when available', async () => {
    const fallback = makeVariable({
      id: 'ext-1',
      name: 'fallback-name',
      key: 'k1',
      resolvedType: 'COLOR',
      valuesByMode: { m: { r: 0, g: 0, b: 0 } as unknown as VariableValue },
    });
    const imported = makeVariable({
      id: 'ext-1',
      name: 'imported-name',
      key: 'k1',
      resolvedType: 'COLOR',
      valuesByMode: { m: { r: 0, g: 1, b: 0 } as unknown as VariableValue },
    });
    const node = makeRectNode({
      id: 'rect-1',
      fills: [
        { type: 'SOLID', color: { r: 0, g: 0, b: 0 }, boundVariables: { color: { id: 'ext-1' } } },
      ],
    });
    figmaMock.currentPage.selection = [node];
    figmaMock.variables.getVariableByIdAsync = async () => fallback;
    figmaMock.variables.importVariableByKeyAsync = async () => imported;

    const result = await loadVariables();
    expect(result.get('ext-1')?.name).toBe('imported-name');
  });

  it('keeps the fallback when importVariableByKeyAsync returns null', async () => {
    const fallback = makeVariable({
      id: 'ext-1',
      name: 'fallback',
      key: 'k1',
      resolvedType: 'COLOR',
      valuesByMode: { m: { r: 1, g: 1, b: 1 } as unknown as VariableValue },
    });
    const node = makeRectNode({
      id: 'rect-1',
      fills: [
        { type: 'SOLID', color: { r: 1, g: 1, b: 1 }, boundVariables: { color: { id: 'ext-1' } } },
      ],
    });
    figmaMock.currentPage.selection = [node];
    figmaMock.variables.getVariableByIdAsync = async () => fallback;
    figmaMock.variables.importVariableByKeyAsync = async () => null;

    const result = await loadVariables();
    expect(result.get('ext-1')?.name).toBe('fallback');
  });

  it('survives an importVariableByKeyAsync that throws', async () => {
    const fallback = makeVariable({
      id: 'ext-1',
      name: 'fallback',
      key: 'k1',
      resolvedType: 'COLOR',
      valuesByMode: { m: { r: 0, g: 0, b: 0 } as unknown as VariableValue },
    });
    const node = makeRectNode({
      id: 'rect-1',
      fills: [
        { type: 'SOLID', color: { r: 0, g: 0, b: 0 }, boundVariables: { color: { id: 'ext-1' } } },
      ],
    });
    figmaMock.currentPage.selection = [node];
    figmaMock.variables.getVariableByIdAsync = async () => fallback;
    figmaMock.variables.importVariableByKeyAsync = async () => {
      throw new Error('network down');
    };

    const result = await loadVariables();
    // Catch swallows the error; fallback name persists.
    expect(result.get('ext-1')?.name).toBe('fallback');
  });

  it('skips IDs already loaded as local (no double fetch)', async () => {
    const local = makeVariable({
      id: 'shared',
      name: 'local-name',
      resolvedType: 'COLOR',
      valuesByMode: { m: { r: 0, g: 0, b: 0 } as unknown as VariableValue },
    });
    const node = makeRectNode({
      id: 'rect-1',
      fills: [
        { type: 'SOLID', color: { r: 0, g: 0, b: 0 }, boundVariables: { color: { id: 'shared' } } },
      ],
    });
    figmaMock.currentPage.selection = [node];
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [makeCollection(['shared'])];

    const fetchSpy = vi.fn(async (id: string) => (id === 'shared' ? local : null));
    figmaMock.variables.getVariableByIdAsync = fetchSpy;

    await loadVariables();

    // 1 call for the local pass; 0 for the external pass since the ID is already in the map.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('resolveColorValue (via loadVariables)', () => {
  it('returns undefined for non-COLOR variables', async () => {
    const variable = makeVariable({
      id: 'v1',
      resolvedType: 'STRING',
      valuesByMode: { m: 'hello' as unknown as VariableValue },
    });
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [makeCollection(['v1'])];
    figmaMock.variables.getVariableByIdAsync = async () => variable;

    const result = await loadVariables();
    expect(result.get('v1')?.colorValue).toBeUndefined();
  });

  it('returns undefined when valuesByMode is empty', async () => {
    const variable = makeVariable({ id: 'v1', resolvedType: 'COLOR', valuesByMode: {} });
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [makeCollection(['v1'])];
    figmaMock.variables.getVariableByIdAsync = async () => variable;

    const result = await loadVariables();
    expect(result.get('v1')?.colorValue).toBeUndefined();
  });

  it('returns RGBA when the first mode value has an alpha channel', async () => {
    const variable = makeVariable({
      id: 'v1',
      resolvedType: 'COLOR',
      valuesByMode: { m: { r: 1, g: 1, b: 1, a: 0.5 } as unknown as VariableValue },
    });
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [makeCollection(['v1'])];
    figmaMock.variables.getVariableByIdAsync = async () => variable;

    const result = await loadVariables();
    expect(result.get('v1')?.colorValue).toEqual({ r: 1, g: 1, b: 1, a: 0.5 });
  });

  it('returns undefined when the first mode value is a VARIABLE_ALIAS (chain not auto-resolved)', async () => {
    const { root, resolve } = makeAliasChain({
      rootId: 'a',
      leafId: 'b',
      leafValue: { r: 0, g: 0, b: 0 },
    });
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [makeCollection(['a'])];
    figmaMock.variables.getVariableByIdAsync = resolve;

    const result = await loadVariables();
    const def = result.get('a');
    expect(def?.name).toBe(root.name);
    // Current behaviour: resolveColorValue does not follow alias chains; it returns undefined
    // because the first mode value is a VariableAlias, not an RGB struct.
    expect(def?.colorValue).toBeUndefined();
  });
});
