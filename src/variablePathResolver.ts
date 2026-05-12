/// <reference types="@figma/plugin-typings" />

import type { VariablePath } from './types';
import { ALIAS_DEPTH_CAP } from './constants';

let collectionNameCache: Map<string, string> | null = null;
let collectionFetchPromise: Promise<Map<string, string>> | null = null;

/**
 * Resolves a variable's structural path (collection / library / groups / name).
 * Follows VARIABLE_ALIAS chains up to ALIAS_DEPTH_CAP and reports the leaf path
 * with isAlias=true when traversal happened.
 */
export async function resolveVariablePath(
  variable: Variable,
  isExternal: boolean,
): Promise<VariablePath> {
  const visited: string[] = [];
  let current: Variable = variable;

  for (let depth = 0; depth < ALIAS_DEPTH_CAP; depth++) {
    visited.push(current.name);
    const modeIds = Object.keys(current.valuesByMode ?? {});
    if (modeIds.length === 0) break;
    const firstModeId = modeIds[0];
    if (firstModeId === undefined) break;
    const firstValue = current.valuesByMode[firstModeId] as
      | { type?: string; id?: string }
      | unknown;
    if (
      typeof firstValue === 'object' &&
      firstValue !== null &&
      (firstValue as { type?: string }).type === 'VARIABLE_ALIAS'
    ) {
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

/**
 * Looks up a collection name from the per-scan cache. The cache is built
 * lazily on the first miss by fetching the local collections exactly once
 * and reused for every subsequent lookup within the same scan run.
 */
async function resolveCollectionName(collectionId: string): Promise<string> {
  const cache = await getCollectionNameCache();
  return cache.get(collectionId) ?? 'Unknown collection';
}

/**
 * Lazily fetches the local-collection name cache. Concurrent callers share
 * the same in-flight promise so the underlying Figma API call happens once
 * per scan, regardless of how many variables need their collection name.
 */
async function getCollectionNameCache(): Promise<Map<string, string>> {
  if (collectionNameCache) return collectionNameCache;
  if (collectionFetchPromise) return collectionFetchPromise;

  collectionFetchPromise = (async () => {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const cache = new Map<string, string>();
    for (const c of collections) cache.set(c.id, c.name);
    collectionNameCache = cache;
    return cache;
  })();
  return collectionFetchPromise;
}

function deriveLibraryName(variable: Variable): string {
  return (variable as unknown as { libraryName?: string }).libraryName ?? 'External Library';
}

/**
 * Clears the per-scan caches so the next scan picks up any newly-published
 * collections or renames. Called by `code.ts` at the start of every
 * `runInspector` pass.
 */
export function resetVariableCachesForScan(): void {
  collectionNameCache = null;
  collectionFetchPromise = null;
}

/** Test-only: clears the collection name cache between runs. */
export function _resetCollectionCacheForTests(): void {
  resetVariableCachesForScan();
}
