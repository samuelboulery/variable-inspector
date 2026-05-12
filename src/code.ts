/// <reference types="@figma/plugin-typings" />
import uiHtml from './ui.html?raw';
import css from './style.css?raw';

import type {
  FullUsageEntry,
  UnboundUsage,
  LayerInfo,
  PluginToUIMessage,
  UIToPluginMessage,
  VariableUsage,
} from './types';
import {
  SPACING_PROPERTY_KEYS,
  SCAN_YIELD_INTERVAL,
  MAX_SCAN_NODES,
  SELECTION_DEBOUNCE_MS,
} from './constants';
import { resetDedupSets } from './dedup';
import { loadVariables } from './variableLoader';
import { inspectNode, collectAllNodes } from './nodeScanner';
import { getLayerDisplayName } from './utils/displayName';
import {
  getUnboundColorUsages,
  getUnboundFloatUsages,
  getUnboundEffectUsages,
} from './unboundDetector';
import { groupByFingerprint } from './instanceFingerprint';
import { collectMergedAwayDescendantIds } from './mergedInstanceExclusion';
import { logger } from './utils/logger';
import { computeStats } from './ui/utils';
import { resetVariableCachesForScan } from './variablePathResolver';
import { yieldToScheduler } from './utils/scheduler';

/**
 * Determines the display layer type for a scene node.
 * Prioritises COMPONENT/INSTANCE, then auto-layout orientation, then raw node type.
 *
 * @param node - The scene node.
 * @returns A string type label (e.g. "AUTO_HORIZONTAL", "COMPONENT", "FRAME").
 */
function getLayerType(node: SceneNode): string {
  if (node.type === 'COMPONENT' || node.type === 'INSTANCE') return node.type;
  if ('layoutMode' in node) {
    const frame = node as FrameNode;
    if (frame.layoutWrap === 'WRAP') return 'AUTO_WRAP';
    if (frame.layoutMode === 'HORIZONTAL') return 'AUTO_HORIZONTAL';
    if (frame.layoutMode === 'VERTICAL') return 'AUTO_VERTICAL';
    return node.type;
  }
  return node.type;
}

/**
 * Builds the layer info map from bound and unbound usage entries.
 * Each unique `layerId` is resolved once via `figma.getNodeByIdAsync`.
 *
 * @param allUsages - Enriched variable usage entries.
 * @param unboundUsages - Hardcoded property entries.
 * @param mergedInfo - Map of node IDs to merge metadata (count and nodeIds for identical instances).
 * @returns Map from layerId to LayerInfo metadata.
 */
async function buildLayerInfoMap(
  allUsages: FullUsageEntry[],
  unboundUsages: UnboundUsage[],
  mergedInfo: Map<string, { count: number; nodeIds: string[] }>,
): Promise<Map<string, LayerInfo>> {
  const layerInfoMap = new Map<string, LayerInfo>();

  const tryAdd = async (layerId: string, layerName: string, order: number): Promise<void> => {
    if (layerInfoMap.has(layerId)) return;
    const node = (await figma.getNodeByIdAsync(layerId)) as SceneNode | null;
    if (node) {
      const merge = mergedInfo.get(layerId);
      const info: LayerInfo = {
        id: layerId,
        name: layerName,
        order,
        type: getLayerType(node),
      };
      if (merge) {
        info.count = merge.count;
        info.mergedNodeIds = merge.nodeIds;
      }
      layerInfoMap.set(layerId, info);
    }
  };

  // Insert merged representatives first so that the UI fallback by name
  // (ui.html) finds the representative entry — which carries count and
  // mergedNodeIds — before any descendant entry sharing the same display
  // name. Without this, unbound-only merged layers never render the × N
  // badge because the fallback picks a descendant whose count is undefined.
  let mergedOrder = 0;
  for (const layerId of mergedInfo.keys()) {
    const node = (await figma.getNodeByIdAsync(layerId)) as SceneNode | null;
    if (node) {
      await tryAdd(layerId, node.name, mergedOrder++);
    }
  }
  for (let idx = 0; idx < allUsages.length; idx++) {
    const u = allUsages[idx];
    if (!u) continue;
    await tryAdd(u.layerId, u.layer, mergedOrder + idx);
  }
  for (let idx = 0; idx < unboundUsages.length; idx++) {
    const u = unboundUsages[idx];
    if (!u) continue;
    await tryAdd(u.layerId, u.layer, mergedOrder + allUsages.length + idx);
  }

  return layerInfoMap;
}

/**
 * Groups a flat array of usage entries by layer ID, deduplicating within each layer.
 * Spacing properties are never deduplicated.
 *
 * @param allUsages - All variable usage entries to group.
 * @returns Object mapping layer ID to its deduplicated usage list.
 */
function groupUsagesByLayer(allUsages: FullUsageEntry[]): Record<string, FullUsageEntry[]> {
  const byLayerId: Record<string, FullUsageEntry[]> = {};
  const processedLayerProperties = new Map<string, Set<string>>();

  const sortedUsages = [...allUsages].sort((a, b) => {
    const layerCompare = a.layer.localeCompare(b.layer);
    return layerCompare !== 0 ? layerCompare : a.property.localeCompare(b.property);
  });

  for (const usage of sortedUsages) {
    const bucket = byLayerId[usage.layerId];
    let seen = processedLayerProperties.get(usage.layerId);
    if (!bucket || !seen) {
      byLayerId[usage.layerId] = [];
      seen = new Set<string>();
      processedLayerProperties.set(usage.layerId, seen);
    }

    const propertyKey = `${usage.property}_${usage.id ?? ''}`;
    const isSpacing = SPACING_PROPERTY_KEYS.some(key => usage.property.includes(key));

    if (!seen.has(propertyKey) || isSpacing) {
      (byLayerId[usage.layerId] ??= []).push(usage);
      seen.add(propertyKey);
    }
  }

  return byLayerId;
}

/**
 * Monotonically increasing token used to abandon stale scans when the user
 * changes the selection mid-flight. Each scan reads the snapshot at start
 * and bails out at chunk boundaries if it has been superseded.
 */
let scanGeneration = 0;

/**
 * Runs the full inspection pass on the current Figma selection and posts the result to the UI.
 * Resets deduplication state before each run.
 */
async function updateInspector(options?: { force?: boolean }): Promise<void> {
  try {
    await runInspector(options?.force === true);
  } catch (err) {
    logger.error('updateInspector error', err);
    const errorMsg: PluginToUIMessage = { type: 'error', message: String(err) };
    figma.ui.postMessage(errorMsg);
  }
}

/**
 * Inspects every node in the selection and dispatches the result to the UI.
 *
 * The work is chunked: every `SCAN_YIELD_INTERVAL` representative nodes the
 * loop yields to the host scheduler so Figma stays responsive on large
 * selections. A monotonic `scanGeneration` token lets a newer scan abort
 * the in-flight pass at the next chunk boundary.
 *
 * @param force - When true, bypasses the `MAX_SCAN_NODES` safety cap.
 */
async function runInspector(force: boolean): Promise<void> {
  scanGeneration += 1;
  const myGeneration = scanGeneration;

  resetDedupSets();
  resetVariableCachesForScan();
  const startMs = Date.now();
  figma.ui.postMessage({ type: 'scan-start' } as PluginToUIMessage);

  const selection = figma.currentPage.selection;
  const allNodes = collectAllNodes(selection);

  if (!force && allNodes.length > MAX_SCAN_NODES) {
    const tooLargeMsg: PluginToUIMessage = {
      type: 'too-large',
      nodeCount: allNodes.length,
      limit: MAX_SCAN_NODES,
    };
    figma.ui.postMessage(tooLargeMsg);
    return;
  }

  const groups = groupByFingerprint(allNodes);
  const excluded = collectMergedAwayDescendantIds(groups);
  const allUsages: FullUsageEntry[] = [];
  const unboundUsages: UnboundUsage[] = [];
  const mergedInfo = new Map<string, { count: number; nodeIds: string[] }>();
  const rawUsages: VariableUsage[] = [];

  const totalGroups = groups.size;
  const partialLayerIds = new Set<string>();
  let processed = 0;
  for (const [, bucket] of groups) {
    if (scanGeneration !== myGeneration) {
      logger.log('Scan superseded — aborting');
      return;
    }

    const representative = bucket[0];
    if (!representative || excluded.has(representative.id)) continue;
    const isMerged = bucket.length > 1 && representative.type === 'INSTANCE';

    if (isMerged) {
      mergedInfo.set(representative.id, {
        count: bucket.length,
        nodeIds: bucket.map(n => n.id),
      });
    }

    const nodeUsages = inspectNode(representative);
    for (const usage of nodeUsages) {
      rawUsages.push(usage);
      const { layer, property, id, effectGroup, subProp } = usage;
      const entry: FullUsageEntry = {
        layer,
        layerId: representative.id,
        property,
        name: id,
        type: 'STRING',
        origin: 'external',
        id,
      };
      if (effectGroup !== undefined) entry.effectGroup = effectGroup;
      if (subProp !== undefined) entry.subProp = subProp;
      allUsages.push(entry);
      partialLayerIds.add(representative.id);
    }
    getUnboundColorUsages(representative, unboundUsages);
    getUnboundFloatUsages(representative, unboundUsages);
    getUnboundEffectUsages(representative, unboundUsages);

    processed += 1;
    if (processed % SCAN_YIELD_INTERVAL === 0) {
      const partial: PluginToUIMessage = {
        type: 'partial-render',
        progress: totalGroups === 0 ? 1 : processed / totalGroups,
        statsPreview: {
          totalVariables: allUsages.length,
          totalHardcoded: unboundUsages.length,
          layerCount: partialLayerIds.size,
        },
      };
      figma.ui.postMessage(partial);
      await yieldToScheduler();
    }
  }

  // Resolve variable metadata after the node scan so the loader can reuse
  // the already-collected nodes/usages instead of re-traversing the tree.
  const vars = await loadVariables({ allNodes, usages: rawUsages });
  if (scanGeneration !== myGeneration) return;

  // Enrich each usage entry with the resolved variable definition. Entries
  // were initialised with placeholder metadata above; replace in place.
  for (let i = 0; i < allUsages.length; i++) {
    const entry = allUsages[i];
    if (!entry) continue;
    const def = vars.get(entry.id);
    if (!def) continue;
    const enriched: FullUsageEntry = {
      layer: entry.layer,
      layerId: entry.layerId,
      property: entry.property,
      name: def.name,
      type: def.type,
      origin: def.origin,
      id: entry.id,
    };
    if (def.colorValue !== undefined) enriched.colorValue = def.colorValue;
    if (def.path !== undefined) enriched.path = def.path;
    if (entry.effectGroup !== undefined) enriched.effectGroup = entry.effectGroup;
    if (entry.subProp !== undefined) enriched.subProp = entry.subProp;
    allUsages[i] = enriched;
  }

  const layerInfoMap = await buildLayerInfoMap(allUsages, unboundUsages, mergedInfo);
  if (scanGeneration !== myGeneration) return;
  const byLayer = groupUsagesByLayer(allUsages);

  // Count INSTANCE nodes grouped by display name — independent of the
  // fingerprint-based merge above. The UI uses this as a fallback to render
  // the × N badge for layers whose instances do not share a fingerprint
  // (e.g. different boundVariables on each instance) but still resolve to
  // the same display name from the user's perspective.
  const instancesByName: Record<string, string[]> = {};
  for (const node of allNodes) {
    if (node.type !== 'INSTANCE') continue;
    const name = getLayerDisplayName(node);
    const list = instancesByName[name] ?? [];
    list.push(node.id);
    instancesByName[name] = list;
  }

  const scanDurationMs = Date.now() - startMs;
  // Total nodes skipped by the fingerprint dedup pass — surfaced in the UI
  // dashboard as a "× N instances dédupliquées" counter.
  let instanceMergedCount = 0;
  for (const { count } of mergedInfo.values()) {
    if (count > 1) instanceMergedCount += count - 1;
  }
  const stats = computeStats(byLayer, unboundUsages, scanDurationMs, { instanceMergedCount });

  logger.log(
    `Scan ${myGeneration} done: ${allUsages.length} usages, ${unboundUsages.length} unbound, ${scanDurationMs}ms`,
  );

  const msg: PluginToUIMessage = {
    type: 'render',
    byLayer,
    unbound: unboundUsages,
    layerInfoMap: Object.fromEntries(layerInfoMap),
    instancesByName,
    noVariablesFound: allUsages.length === 0 && unboundUsages.length === 0,
    stats,
    scanDurationMs,
  };
  figma.ui.postMessage(msg);
}

/**
 * Bootstraps the plugin: shows the UI, registers message and selection-change handlers,
 * and runs the initial inspection.
 */
function initializePlugin(): void {
  figma.showUI(uiHtml.replace('</head>', `<style>${css}</style></head>`), {
    width: 300,
    height: 400,
    title: 'Variable Inspector',
    themeColors: true,
  });

  figma.ui.onmessage = async (msg: UIToPluginMessage) => {
    if (msg.type === 'resize') {
      figma.ui.resize(msg.width, msg.height);
    } else if (msg.type === 'select-node') {
      const node = (await figma.getNodeByIdAsync(msg.nodeId)) as SceneNode | null;
      if (node) {
        figma.currentPage.selection = [node];
        figma.viewport.scrollAndZoomIntoView([node]);
      }
    } else if (msg.type === 'select-nodes') {
      const resolved = await Promise.all(
        msg.nodeIds.map(id => figma.getNodeByIdAsync(id) as Promise<SceneNode | null>),
      );
      const nodes = resolved.filter((n): n is SceneNode => n !== null);
      if (nodes.length > 0) {
        figma.currentPage.selection = nodes;
        figma.viewport.scrollAndZoomIntoView(nodes);
      }
    } else if (msg.type === 'rescan') {
      void updateInspector();
    } else if (msg.type === 'force-scan') {
      void updateInspector({ force: true });
    }
  };

  let scanTimeout: ReturnType<typeof setTimeout> | null = null;
  figma.on('selectionchange', () => {
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => {
      void updateInspector();
    }, SELECTION_DEBOUNCE_MS);
  });

  void updateInspector();
}

initializePlugin();
