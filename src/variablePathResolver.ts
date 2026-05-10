/// <reference types="@figma/plugin-typings" />

import { VariablePath } from './types';

const COLLECTION_NAME_CACHE = new Map<string, string>();
const ALIAS_DEPTH_CAP = 10;

/**
 * Resolves a variable's structural path (collection / library / groups / name).
 * Follows VARIABLE_ALIAS chains up to ALIAS_DEPTH_CAP and reports the leaf path
 * with isAlias=true when traversal happened.
 */
export async function resolveVariablePath(variable: Variable, isExternal: boolean): Promise<VariablePath> {
  const visited: string[] = [];
  let current: Variable = variable;

  for (let depth = 0; depth < ALIAS_DEPTH_CAP; depth++) {
    visited.push(current.name);
    const modeIds = Object.keys(current.valuesByMode ?? {});
    if (modeIds.length === 0) break;
    const firstValue = current.valuesByMode[modeIds[0]] as { type?: string; id?: string } | unknown;
    if (typeof firstValue === 'object' && firstValue !== null && (firstValue as { type?: string }).type === 'VARIABLE_ALIAS') {
      const aliasId = (firstValue as { id: string }).id;
      const next = await figma.variables.getVariableByIdAsync(aliasId);
      if (!next || next.id === current.id) break;
      current = next;
      continue;
    }
    break;
  }

  const isAlias = visited.length > 1;
  const collection = await resolveCollectionName(current.variableCollectionId);
  const segments = current.name.split('/').filter(s => s.length > 0);
  const name = segments.pop() ?? current.name;

  const result: VariablePath = {
    collection,
    groups: segments,
    name,
    isAlias,
  };
  if (isExternal) result.library = deriveLibraryName(current);
  if (isAlias) result.aliasChain = visited;
  return result;
}

async function resolveCollectionName(collectionId: string): Promise<string> {
  if (COLLECTION_NAME_CACHE.has(collectionId)) return COLLECTION_NAME_CACHE.get(collectionId)!;
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (const c of collections) {
    COLLECTION_NAME_CACHE.set(c.id, c.name);
    if (c.id === collectionId) return c.name;
  }
  return 'Unknown collection';
}

function deriveLibraryName(variable: Variable): string {
  return (variable as unknown as { libraryName?: string }).libraryName ?? 'External Library';
}

/** Test-only: clears the collection name cache between runs. */
export function _resetCollectionCacheForTests(): void {
  COLLECTION_NAME_CACHE.clear();
}
