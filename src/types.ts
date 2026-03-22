/// <reference types="@figma/plugin-typings" />

/** Resolved definition of a Figma variable after loading from collections. */
export interface VariableDefinition {
  name: string;
  type: VariableResolvedDataType;
  origin: 'local' | 'external';
  colorValue?: RGB | RGBA;
}

/** A single bound-variable usage found on a node's property. */
export interface VariableUsage {
  /** Display name of the layer. */
  layer: string;
  /** Human-readable property name (e.g. "Fill", "Padding Left"). */
  property: string;
  /** Figma variable ID. */
  id: string;
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
}
