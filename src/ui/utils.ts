import { FullUsageEntry, UnboundUsage, ScanStats } from '../types';

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

/**
 * Aggregates bound and unbound usage into statistics for dashboard rendering.
 */
export function computeStats(
  byLayer: Record<string, FullUsageEntry[]>,
  unbound: UnboundUsage[],
  scanDurationMs: number,
): ScanStats {
  const all = Object.values(byLayer).flat();
  const totalVariables = all.length;
  const totalHardcoded = unbound.length;
  const denom = totalVariables + totalHardcoded;
  const variableCoverage = denom === 0 ? 0 : totalVariables / denom;

  const byOrigin = { local: 0, external: 0 };
  const byType = { COLOR: 0, FLOAT: 0, STRING: 0, BOOLEAN: 0 };
  for (const e of all) {
    byOrigin[e.origin] += 1;
    if (e.type === 'COLOR' || e.type === 'FLOAT' || e.type === 'STRING' || e.type === 'BOOLEAN') {
      byType[e.type] += 1;
    }
  }

  return {
    totalVariables,
    totalHardcoded,
    variableCoverage,
    byOrigin,
    byType,
    layerCount: Object.keys(byLayer).length,
    scanDurationMs,
  };
}
