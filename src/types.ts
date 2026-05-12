/// <reference types="@figma/plugin-typings" />

/** Resolved structural path to a variable, surfaced for Feature 3. */
export interface VariablePath {
  collection: string;
  /** Library name when the variable is external. */
  library?: string;
  /** Group segments (Figma uses "/" in variable names as group separator). */
  groups: string[];
  /** Final variable name (last segment). */
  name: string;
  /** True when path resolution traversed at least one VARIABLE_ALIAS. */
  isAlias: boolean;
  /** Names visited during alias resolution (debug only). */
  aliasChain?: string[];
}

/** Resolved definition of a Figma variable after loading from collections. */
export interface VariableDefinition {
  name: string;
  type: VariableResolvedDataType;
  origin: 'local' | 'external';
  colorValue?: RGB | RGBA;
  path?: VariablePath;
}

/** A single bound-variable usage found on a node's property. */
export interface VariableUsage {
  /** Display name of the layer. */
  layer: string;
  /** Human-readable property name (e.g. "Fill", "Padding Left"). */
  property: string;
  /** Figma variable ID. */
  id: string;
  /**
   * Effect grouping key when this usage is a sub-property of a Figma effect.
   * "Drop Shadow" for a single effect of its type, "Drop Shadow 1" / "Drop Shadow 2"
   * when the same node has multiple effects of the same type. UI uses this to
   * render all sub-props of one effect under a single sub-section.
   */
  effectGroup?: string;
  /**
   * Canonical sub-property name within an effect group: "Radius", "Blur",
   * "Color", "Offset X", "Offset Y", "Spread". Set together with effectGroup.
   */
  subProp?: string;
}

/** A property that is hardcoded — not bound to any variable. */
export interface UnboundUsage {
  /** Display name of the layer. */
  layer: string;
  /** Figma node ID of the layer. */
  layerId: string;
  /** Human-readable property name. */
  property: string;
  /** Raw formatted value (e.g. "rgb(255, 0, 0)", "16"). */
  value: string;
  /** See VariableUsage.effectGroup. */
  effectGroup?: string;
  /** See VariableUsage.subProp. */
  subProp?: string;
}

/** Full usage entry enriched with variable metadata, used for UI rendering. */
export interface FullUsageEntry {
  layer: string;
  layerId: string;
  property: string;
  name: string;
  type: VariableResolvedDataType;
  origin: 'local' | 'external';
  colorValue?: RGB | RGBA;
  id: string;
  path?: VariablePath;
  /** See VariableUsage.effectGroup. */
  effectGroup?: string;
  /** See VariableUsage.subProp. */
  subProp?: string;
}

/** Metadata about a layer node sent to the UI. */
export interface LayerInfo {
  id: string;
  name: string;
  /** Insertion order used for stable sorting. */
  order: number;
  /** Optional ID of the parent layer. */
  parent?: string;
  /** Figma node type string (e.g. "FRAME", "AUTO_HORIZONTAL", "COMPONENT"). */
  type: string;
  /** Number of merged identical instances (>= 2 when merged, undefined when solo). */
  count?: number;
  /** All node IDs that share this fingerprint, in document order. */
  mergedNodeIds?: string[];
}

// ---------------------------------------------------------------------------
// Plugin thread ↔ UI thread message types
// ---------------------------------------------------------------------------

/** Sent by the plugin thread when a scan result is ready to render. */
export interface RenderMessage {
  type: 'render';
  byLayer: Record<string, FullUsageEntry[]>;
  unbound: UnboundUsage[];
  layerInfoMap: Record<string, LayerInfo>;
  /**
   * INSTANCE node IDs grouped by display name. Lets the UI surface a × N
   * badge for any layer whose name appears on >= 2 INSTANCE nodes, even
   * when the plugin-side fingerprint did not merge them (e.g. instances
   * carrying different boundVariables or variant props).
   */
  instancesByName: Record<string, string[]>;
  noVariablesFound: boolean;
  stats: ScanStats;
  scanDurationMs: number;
}

/** Sent by the plugin thread when an unrecoverable error occurs. */
export interface ErrorMessage {
  type: 'error';
  message: string;
}

/** Sent by the plugin thread to announce that a scan has started — UI shows loading state. */
export interface ScanStartMessage {
  type: 'scan-start';
}

/**
 * Sent by the plugin thread when the flattened selection exceeds
 * `MAX_SCAN_NODES`. The UI must render an explanatory state and offer a
 * "scan anyway" override.
 */
export interface TooLargeMessage {
  type: 'too-large';
  nodeCount: number;
  limit: number;
}

/** Union of all messages the plugin thread can send to the UI. */
export type PluginToUIMessage = RenderMessage | ErrorMessage | ScanStartMessage | TooLargeMessage;

/** Sent by the UI thread to select and focus a node in the canvas. */
export interface SelectNodeMessage {
  type: 'select-node';
  nodeId: string;
}

/** Sent by the UI thread to resize the plugin panel. */
export interface ResizeMessage {
  type: 'resize';
  width: number;
  height: number;
}

/** Sent by the UI thread to request a forced re-scan of the current selection. */
export interface RescanMessage {
  type: 'rescan';
}

/**
 * Sent by the UI thread to force a scan even when the selection exceeds
 * the safety cap (`MAX_SCAN_NODES`). Equivalent to `rescan` but bypasses
 * the `too-large` guard.
 */
export interface ForceScanMessage {
  type: 'force-scan';
}

/** Union of all messages the UI thread can send to the plugin thread. */
export type UIToPluginMessage =
  | SelectNodeMessage
  | ResizeMessage
  | RescanMessage
  | ForceScanMessage;

/** Sort modes for the UI's main rendering. */
export type SortMode = 'byLayer' | 'byProperty' | 'unbound';

/** Aggregate statistics computed by the plugin and rendered in the UI dashboard. */
export interface ScanStats {
  totalVariables: number;
  totalHardcoded: number;
  /** 0..1 ratio of bound vs (bound + hardcoded). */
  variableCoverage: number;
  byOrigin: { local: number; external: number };
  byType: { COLOR: number; FLOAT: number; STRING: number; BOOLEAN: number };
  layerCount: number;
  scanDurationMs: number;
}
