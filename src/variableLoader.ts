/// <reference types="@figma/plugin-typings" />

import type { VariableDefinition, VariableUsage } from './types';
import { inspectNode, collectAllNodes } from './nodeScanner';
import { resolveVariablePath } from './variablePathResolver';
import { logger } from './utils/logger';

/**
 * Pre-computed inspection data optionally passed to `loadVariables` so that
 * the loader does not have to re-traverse the selection just to find which
 * external (library) variable IDs are referenced.
 */
export interface PrecomputedScan {
  /** Flat list of all nodes already collected from the current selection. */
  allNodes: ReadonlyArray<SceneNode>;
  /** Variable usages already extracted from those nodes. */
  usages: ReadonlyArray<VariableUsage>;
}

/**
 * Extracts the first-mode color value from a Figma variable, if it is a COLOR type.
 * Returns `undefined` for non-color variables or if no mode values exist.
 *
 * @param variable - A resolved Figma Variable.
 * @returns The RGB or RGBA color value, or `undefined`.
 */
function resolveColorValue(variable: Variable): RGB | RGBA | undefined {
  if (variable.resolvedType !== 'COLOR') return undefined;
  const modeIds = Object.keys(variable.valuesByMode);
  if (modeIds.length === 0) return undefined;
  const firstModeId = modeIds[0];
  if (firstModeId === undefined) return undefined;
  const firstModeValue = variable.valuesByMode[firstModeId];
  if (
    typeof firstModeValue === 'object' &&
    firstModeValue !== null &&
    ('r' in firstModeValue || 'g' in firstModeValue || 'b' in firstModeValue)
  ) {
    return firstModeValue as RGB | RGBA;
  }
  return undefined;
}

/**
 * Loads all variables referenced by the current selection into a map keyed by variable ID.
 * Local collection variables are batched in parallel; external (library) variables are
 * resolved from the usage list (or, when absent, re-scanned from the current selection).
 *
 * @param precomputed - Optional pre-collected nodes and usages from the main scan,
 *                       used to skip a redundant traversal.
 * @returns A map from variable ID to its resolved definition.
 */
export async function loadVariables(
  precomputed?: PrecomputedScan,
): Promise<Map<string, VariableDefinition>> {
  const variableMap = new Map<string, VariableDefinition>();

  await loadLocalVariables(variableMap);
  await loadExternalVariables(variableMap, precomputed);

  logger.log('loadVariables: found', variableMap.size, 'variables');
  return variableMap;
}

/**
 * Populates `variableMap` with all variables from local collections.
 * Resolves the variables in parallel per collection to avoid an N+1
 * sequential await chain on large design systems.
 *
 * @param variableMap - Map to populate in place.
 */
async function loadLocalVariables(variableMap: Map<string, VariableDefinition>): Promise<void> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();

  const allIds: string[] = [];
  for (const col of collections) allIds.push(...col.variableIds);

  const variables = await Promise.all(allIds.map(id => figma.variables.getVariableByIdAsync(id)));

  const paths = await Promise.all(
    variables.map(v => (v ? resolveVariablePath(v, false) : Promise.resolve(undefined))),
  );

  for (let i = 0; i < variables.length; i++) {
    const variable = variables[i];
    const id = allIds[i];
    if (!variable || id === undefined) continue;
    variableMap.set(id, {
      name: variable.name,
      type: variable.resolvedType,
      origin: 'local',
      colorValue: resolveColorValue(variable),
      path: paths[i],
    });
  }
}

/**
 * Resolves variables referenced in the current selection that are not already in `variableMap`.
 * These are external (library) variables. Falls back to the original variable name if the
 * library import is unavailable.
 *
 * @param variableMap - Map to populate in place.
 * @param precomputed - Optional pre-collected nodes/usages from the main scan.
 */
async function loadExternalVariables(
  variableMap: Map<string, VariableDefinition>,
  precomputed?: PrecomputedScan,
): Promise<void> {
  const missingIds = collectMissingIds(variableMap, precomputed);

  await Promise.all(Array.from(missingIds).map(id => loadSingleExternalVariable(id, variableMap)));
}

/**
 * Gathers the variable IDs referenced by the current selection that are not
 * already present in `variableMap`. Reuses `precomputed.usages` when given,
 * otherwise re-traverses the current selection.
 */
function collectMissingIds(
  variableMap: ReadonlyMap<string, VariableDefinition>,
  precomputed?: PrecomputedScan,
): Set<string> {
  const missing = new Set<string>();

  if (precomputed) {
    for (const { id } of precomputed.usages) {
      if (!variableMap.has(id)) missing.add(id);
    }
    return missing;
  }

  // Fallback: scan the current selection ourselves (legacy callers / tests).
  const selection = figma.currentPage.selection;
  const allNodes = collectAllNodes(selection);
  for (const node of allNodes) {
    const usages = inspectNode(node);
    for (const { id } of usages) {
      if (!variableMap.has(id)) missing.add(id);
    }
  }
  return missing;
}

/**
 * Resolves one external variable ID into a definition, preferring the
 * published-import name when available. Errors are swallowed and logged
 * so a single failure cannot abort the whole scan.
 */
async function loadSingleExternalVariable(
  id: string,
  variableMap: Map<string, VariableDefinition>,
): Promise<void> {
  try {
    const variable = await figma.variables.getVariableByIdAsync(id);
    if (!variable) return;

    const fallbackPath = await resolveVariablePath(variable, true);
    variableMap.set(id, {
      name: variable.name,
      type: variable.resolvedType,
      origin: 'external',
      colorValue: resolveColorValue(variable),
      path: fallbackPath,
    });

    if (typeof figma.variables.importVariableByKeyAsync === 'function') {
      const imported = await figma.variables.importVariableByKeyAsync(variable.key);
      if (imported) {
        const importedPath = await resolveVariablePath(imported, true);
        variableMap.set(id, {
          name: imported.name,
          type: imported.resolvedType,
          origin: 'external',
          colorValue: resolveColorValue(imported),
          path: importedPath,
        });
      }
    }
  } catch (error) {
    logger.warn(`Failed to resolve variable ${id}:`, error);
  }
}
