import { describe, it, expect, beforeEach } from 'vitest';
import { figmaMock, makeVariable, makeAliasChain } from '../__mocks__/figma';
import { resolveVariablePath, _resetCollectionCacheForTests } from '../variablePathResolver';

beforeEach(() => {
  figmaMock.variables.getLocalVariableCollectionsAsync = async () => [];
  figmaMock.variables.getVariableByIdAsync = async () => null;
  _resetCollectionCacheForTests();
});

function makeCollection(id: string, name: string, variableIds: string[]): VariableCollection {
  return { id, name, variableIds, modes: [], defaultModeId: 'm', remote: false, hiddenFromPublishing: false, key: 'k' } as unknown as VariableCollection;
}

describe('resolveVariablePath — local', () => {
  it('parses groups from a slash-separated variable name', async () => {
    const v = makeVariable({ id: 'v1', name: 'Color/Brand/primary' });
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [makeCollection('col-1', 'Tokens', ['v1'])];
    figmaMock.variables.getVariableByIdAsync = async () => v;
    const path = await resolveVariablePath(v, false);
    expect(path).toEqual({
      collection: 'Tokens',
      groups: ['Color', 'Brand'],
      name: 'primary',
      isAlias: false,
    });
  });

  it('handles a variable with no group (single segment)', async () => {
    const v = makeVariable({ id: 'v1', name: 'spacing' });
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [makeCollection('col-1', 'Tokens', ['v1'])];
    figmaMock.variables.getVariableByIdAsync = async () => v;
    const path = await resolveVariablePath(v, false);
    expect(path?.groups).toEqual([]);
    expect(path?.name).toBe('spacing');
  });

  it('returns "Unknown collection" when collection lookup fails', async () => {
    const v = makeVariable({ id: 'v1', name: 'orphan', variableCollectionId: 'missing' });
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [];
    const path = await resolveVariablePath(v, false);
    expect(path?.collection).toBe('Unknown collection');
  });
});

describe('resolveVariablePath — external', () => {
  it('marks library when variable is external', async () => {
    const v = makeVariable({ id: 'v1', name: 'Color/primary' });
    (v as unknown as { remote: boolean }).remote = true;
    const path = await resolveVariablePath(v, true);
    expect(path?.library).toBeDefined();
  });
});

describe('resolveVariablePath — alias chain', () => {
  it('marks isAlias true and follows the chain to the leaf', async () => {
    const { root, resolve } = makeAliasChain({ rootId: 'a', leafId: 'b', leafValue: { r: 1, g: 0, b: 0 } });
    figmaMock.variables.getVariableByIdAsync = resolve;
    const path = await resolveVariablePath(root, false);
    expect(path?.isAlias).toBe(true);
  });
});
