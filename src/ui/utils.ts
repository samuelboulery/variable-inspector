import { FullUsageEntry } from '../types';

/**
 * Re-groups a layer-keyed usage map into a property-keyed map.
 * Each entry retains its layerId so the UI can still focus the layer on click.
 */
export function regroupByProperty(byLayer: Record<string, FullUsageEntry[]>): Record<string, FullUsageEntry[]> {
  const out: Record<string, FullUsageEntry[]> = {};
  for (const entries of Object.values(byLayer)) {
    for (const e of entries) {
      if (!out[e.property]) out[e.property] = [];
      out[e.property].push(e);
    }
  }
  return out;
}
