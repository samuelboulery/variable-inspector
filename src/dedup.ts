import { SPACING_PROPERTY_KEYS } from './constants';
import { logger } from './utils/logger';

/**
 * Tracks node IDs for which `fontSize` has already been recorded,
 * to avoid duplicate font-size entries from the two-pass text inspection.
 */
export const processedFontSizeNodeIds = new Set<string>();

/**
 * Tracks `nodeId|propertyName[|variableId]` keys already added to usages,
 * preventing duplicate rows in the results.
 */
export const processedProperties = new Set<string>();

/**
 * Builds a unique string key for a (node, property, variable) triple.
 *
 * @param nodeId - Figma node ID.
 * @param propertyName - Display name of the property.
 * @param variableId - Optional variable ID to distinguish multi-variable bindings.
 * @returns A pipe-delimited key string.
 */
export function getPropertyId(nodeId: string, propertyName: string, variableId?: string): string {
  return variableId ? `${nodeId}|${propertyName}|${variableId}` : `${nodeId}|${propertyName}`;
}

/**
 * Resets all deduplication sets at the start of each inspection run.
 */
export function resetDedupSets(): void {
  processedFontSizeNodeIds.clear();
  processedProperties.clear();
}

/**
 * Checks whether a property has already been tracked, and records it if not.
 * Spacing properties are never deduplicated — they always return `false`.
 *
 * @param nodeId - Figma node ID.
 * @param propertyName - Display name of the property.
 * @param variableId - Optional variable ID.
 * @returns `true` if the property was already recorded (skip it); `false` if it should be processed.
 */
export function trackProperty(nodeId: string, propertyName: string, variableId?: string): boolean {
  const propertyId = getPropertyId(nodeId, propertyName, variableId);

  logger.log(
    `Checking property: ${propertyId}, propertyName: ${propertyName}, exists: ${processedProperties.has(propertyId)}`,
  );

  const isSpacing = SPACING_PROPERTY_KEYS.some(key => propertyName.includes(key));
  if (isSpacing) {
    logger.log(`Skipping deduplication for spacing property: ${propertyName}`);
    processedProperties.add(propertyId);
    return false;
  }

  if (processedProperties.has(propertyId)) {
    return true;
  }
  processedProperties.add(propertyId);
  return false;
}
