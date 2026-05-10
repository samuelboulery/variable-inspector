/// <reference types="@figma/plugin-typings" />
import uiHtml from './ui.html?raw';
import css from './style.css?raw';

import { FullUsageEntry, UnboundUsage, LayerInfo, PluginToUIMessage, UIToPluginMessage } from './types';
import { SPACING_PROPERTY_KEYS } from './constants';
import { resetDedupSets } from './dedup';
import { loadVariables } from './variableLoader';
import { inspectNode, collectAllNodes } from './nodeScanner';
import { getLayerDisplayName } from './utils/displayName';
import { getUnboundColorUsages, getUnboundFloatUsages, getUnboundEffectUsages } from './unboundDetector';
import { groupByFingerprint } from './instanceFingerprint';
import { collectMergedAwayDescendantIds } from './mergedInstanceExclusion';
import { logger } from './utils/logger';
import { computeStats } from './ui/utils';

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
 * Each unique `layerId` is resolved once via `figma.getNodeById`.
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
    await tryAdd(u.layerId, u.layer, mergedOrder + idx);
  }
  for (let idx = 0; idx < unboundUsages.length; idx++) {
    const u = unboundUsages[idx];
    await tryAdd(u.layerId, u.layer, mergedOrder + allUsages.length + idx);
  }

  return layerInfoMap;
}

/**
 * Groups a flat array of usage entries by layer name, deduplicating within each layer.
 * Spacing properties are never deduplicated.
 *
 * @param allUsages - All variable usage entries to group.
 * @returns Object mapping layer name to its deduplicated usage list.
 */
function groupUsagesByLayer(allUsages: FullUsageEntry[]): Record<string, FullUsageEntry[]> {
  const byLayerId: Record<string, FullUsageEntry[]> = {};
  logger.log(`Grouping ${allUsages.length} usages by layer`);

  const processedLayerProperties = new Map<string, Set<string>>();

  const sortedUsages = [...allUsages].sort((a, b) => {
    const layerCompare = a.layer.localeCompare(b.layer);
    return layerCompare !== 0 ? layerCompare : a.property.localeCompare(b.property);
  });

  for (const usage of sortedUsages) {
    if (!byLayerId[usage.layerId]) {
      byLayerId[usage.layerId] = [];
      processedLayerProperties.set(usage.layerId, new Set<string>());
    }

    const seen = processedLayerProperties.get(usage.layerId)!;
    const propertyKey = `${usage.property}_${usage.id ?? ''}`;
    const isSpacing = SPACING_PROPERTY_KEYS.some(key => usage.property.includes(key));

    logger.log(`Layer: ${usage.layer}, Property: ${usage.property}, isSpacing: ${isSpacing}, isDuplicate: ${seen.has(propertyKey)}`);

    if (!seen.has(propertyKey) || isSpacing) {
      byLayerId[usage.layerId].push(usage);
      seen.add(propertyKey);
    }
  }

  for (const [layerId, usages] of Object.entries(byLayerId)) {
    logger.log(`Layer ${layerId}: ${usages.length} usages after grouping`);
  }

  return byLayerId;
}

/**
 * Runs the full inspection pass on the current Figma selection and posts the result to the UI.
 * Resets deduplication state before each run.
 */
async function updateInspector(): Promise<void> {
  try {
    await runInspector();
  } catch (err) {
    logger.error('updateInspector error', err);
    const errorMsg: PluginToUIMessage = { type: 'error', message: String(err) };
    figma.ui.postMessage(errorMsg);
  }
}

async function runInspector(): Promise<void> {
  resetDedupSets();
  const startMs = Date.now();
  figma.ui.postMessage({ type: 'scan-start' } as PluginToUIMessage);

  const vars = await loadVariables();
  const selection = figma.currentPage.selection;
  const allNodes = collectAllNodes(selection);

  const groups = groupByFingerprint(allNodes);
  const excluded = collectMergedAwayDescendantIds(groups);
  const allUsages: FullUsageEntry[] = [];
  const unboundUsages: UnboundUsage[] = [];
  const mergedInfo = new Map<string, { count: number; nodeIds: string[] }>();

  for (const [, bucket] of groups) {
    const representative = bucket[0];
    if (excluded.has(representative.id)) continue;
    const isMerged = bucket.length > 1 && representative.type === 'INSTANCE';

    if (isMerged) {
      mergedInfo.set(representative.id, {
        count: bucket.length,
        nodeIds: bucket.map(n => n.id),
      });
    }

    const nodeUsages = inspectNode(representative);
    for (const usage of nodeUsages) {
      const { layer, property, id, effectGroup, subProp } = usage;
      const def = vars.get(id);
      allUsages.push(
        def
          ? { layer, layerId: representative.id, property, name: def.name, type: def.type, origin: def.origin, colorValue: def.colorValue, id, path: def.path, effectGroup, subProp }
          : { layer, layerId: representative.id, property, name: id, type: 'STRING', origin: 'external', id, effectGroup, subProp },
      );
    }
    getUnboundColorUsages(representative, unboundUsages);
    getUnboundFloatUsages(representative, unboundUsages);
    getUnboundEffectUsages(representative, unboundUsages);
  }

  const layerInfoMap = await buildLayerInfoMap(allUsages, unboundUsages, mergedInfo);
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

  logger.log('Final usages count:', allUsages.length);
  logger.log('Layers with variables:', Object.keys(byLayer).length);
  logger.log('Unbound usages count:', unboundUsages.length);
  logger.log('Total nodes in layerInfoMap:', layerInfoMap.size);

  const scanDurationMs = Date.now() - startMs;
  const stats = computeStats(byLayer, unboundUsages, scanDurationMs);

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
    } else if (msg.type === 'rescan') {
      updateInspector();
    }
  };

  let scanTimeout: ReturnType<typeof setTimeout> | null = null;
  figma.on('selectionchange', () => {
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(() => { updateInspector(); }, 300);
  });

  updateInspector();
}

initializePlugin();
