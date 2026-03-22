/// <reference types="@figma/plugin-typings" />

import { VariableDefinition } from './types';
import { inspectNode } from './nodeScanner';
import { collectAllNodes } from './nodeScanner';
import { logger } from './utils/logger';

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
  const firstModeValue = variable.valuesByMode[modeIds[0]];
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
 * First loads all local collection variables, then resolves any IDs found in the selection
 * that are not yet in the map (external/library variables).
 *
 * @returns A map from variable ID to its resolved definition.
 */
export async function loadVariables(): Promise<Map<string, VariableDefinition>> {
  const variableMap = new Map<string, VariableDefinition>();

  await loadLocalVariables(variableMap);
  await loadExternalVariables(variableMap);

  logger.log('loadVariables: found', variableMap.size, 'variables');
  return variableMap;
}

/**
 * Populates `variableMap` with all variables from local collections.
 *
 * @param variableMap - Map to populate in place.
 */
async function loadLocalVariables(variableMap: Map<string, VariableDefinition>): Promise<void> {
  const collections = figma.variables.getLocalVariableCollections();
  for (const col of collections) {
    for (const id of col.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(id);
      if (!variable) continue;
      variableMap.set(id, {
        name: variable.name,
        type: variable.resolvedType,
        origin: 'local',
        colorValue: resolveColorValue(variable),
      });
    }
  }
}

/**
 * Resolves variables referenced in the current selection that are not already in `variableMap`.
 * These are external (library) variables. Falls back to the original variable name if the
 * library import is unavailable.
 *
 * @param variableMap - Map to populate in place.
 */
async function loadExternalVariables(variableMap: Map<string, VariableDefinition>): Promise<void> {
  const selection = figma.currentPage.selection;
  const allNodes = collectAllNodes(selection);
  const missingIds = new Set<string>();

  for (const node of allNodes) {
    const usages = inspectNode(node);
    for (const { id } of usages) {
      if (!variableMap.has(id)) missingIds.add(id);
    }
  }

  for (const id of missingIds) {
    try {
      const variable = await figma.variables.getVariableByIdAsync(id);
      if (!variable) continue;

      // Store original name as fallback before attempting published import
      variableMap.set(id, {
        name: variable.name,
        type: variable.resolvedType,
        origin: 'external',
        colorValue: resolveColorValue(variable),
      });

      if (typeof figma.variables.importVariableByKeyAsync === 'function') {
        const imported = await figma.variables.importVariableByKeyAsync(variable.key);
        if (imported) {
          variableMap.set(id, {
            name: imported.name,
            type: imported.resolvedType,
            origin: 'external',
            colorValue: resolveColorValue(imported),
          });
        }
      }
    } catch (error) {
      logger.warn(`Impossible de récupérer la variable ${id}:`, error);
    }
  }
}
