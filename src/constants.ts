/**
 * Human-readable display names for supported node properties.
 * Use these constants everywhere a property label is needed.
 */
export const PROPERTY_NAMES = {
  FILL: 'Fill',
  STROKE: 'Stroke',
  STROKE_COLOR: 'Stroke Color',
  OPACITY: 'Opacity',
  STROKE_WEIGHT: 'Stroke Weight',
  CORNER_RADIUS: 'Corner Radius',
  FONT_SIZE: 'Font Size',
  FONT_WEIGHT: 'Font Weight',
  FONT_FAMILY: 'Font Family',
  LETTER_SPACING: 'Letter Spacing',
  LINE_HEIGHT: 'Line Height',
  PARAGRAPH_SPACING: 'Paragraph Spacing',
  PADDING_LEFT: 'Padding Left',
  PADDING_RIGHT: 'Padding Right',
  PADDING_TOP: 'Padding Top',
  PADDING_BOTTOM: 'Padding Bottom',
  ITEM_SPACING: 'Gap',
  MIN_WIDTH: 'Min Width',
  MAX_WIDTH: 'Max Width',
  MIN_HEIGHT: 'Min Height',
  MAX_HEIGHT: 'Max Height',
  GRID_COLOR: 'Grid Color',
  VISIBLE: 'Visible',
  TEXT_DECORATION: 'Text Decoration',
  TEXT_CASE: 'Text Case',
} as const;

/**
 * Maps Figma API `boundVariables` property keys to human-readable display names.
 * Keys that are not present fall back to the raw key string.
 */
export const PROPERTY_MAPPING: Record<string, string> = {
  itemSpacing: 'Gap',
  paddingTop: 'Padding Top',
  paddingRight: 'Padding Right',
  paddingBottom: 'Padding Bottom',
  paddingLeft: 'Padding Left',
  cornerRadius: 'Corner Radius',
  strokeWeight: 'Stroke Weight',
  opacity: 'Opacity',
  fontSize: 'Font Size',
  fontWeight: 'Font Weight',
  fontName: 'Font Family',
  letterSpacing: 'Letter Spacing',
  lineHeight: 'Line Height',
  paragraphSpacing: 'Paragraph Spacing',
  paragraphIndent: 'Paragraph Indent',
  textCase: 'Text Case',
  textDecoration: 'Text Decoration',
  textAlignHorizontal: 'Text Align Horizontal',
  textAlignVertical: 'Text Align Vertical',
  topLeftRadius: 'Top Left Radius',
  topRightRadius: 'Top Right Radius',
  bottomLeftRadius: 'Bottom Left Radius',
  bottomRightRadius: 'Bottom Right Radius',
  strokeTopWeight: 'Stroke Top Weight',
  strokeBottomWeight: 'Stroke Bottom Weight',
  strokeLeftWeight: 'Stroke Left Weight',
  strokeRightWeight: 'Stroke Right Weight',
  width: 'Width',
  height: 'Height',
  minWidth: 'Min Width',
  maxWidth: 'Max Width',
  minHeight: 'Min Height',
  maxHeight: 'Max Height',
  visible: 'Visible',
} as const;

/** Spacing property display names that must never be deduplicated. */
export const SPACING_PROPERTY_KEYS = [
  'Padding Left',
  'Padding Right',
  'Padding Top',
  'Padding Bottom',
  'Gap',
] as const;

// ---------------------------------------------------------------------------
// Performance / safety caps — tuned for large selections on modest hardware.
// ---------------------------------------------------------------------------

/**
 * Number of nodes processed between scheduler yields during the main scan
 * loop. Lower values keep the plugin thread responsive at the cost of a
 * slightly longer wall-clock scan time.
 */
export const SCAN_YIELD_INTERVAL = 200;

/**
 * Hard upper bound on the number of nodes a single scan will inspect. When
 * the selection's flattened tree exceeds this, the plugin reports a
 * `too-large` message to the UI and aborts the scan to keep Figma responsive
 * on weak machines.
 */
export const MAX_SCAN_NODES = 8000;

/**
 * Maximum alias-chain depth when resolving a variable's structural path.
 * Prevents infinite recursion on circular alias references.
 */
export const ALIAS_DEPTH_CAP = 10;

/**
 * Maximum recursion depth allowed when walking a `boundVariables` subtree
 * to harvest nested `{ id }` bindings. The traversal is iterative; the cap
 * is a defensive safety net for pathological / cyclic structures.
 */
export const EXTRACT_BINDING_MAX_DEPTH = 20;

/**
 * Selection-change debounce in milliseconds. Lower values make the panel
 * feel snappier but waste CPU during a drag-select; higher values reduce
 * CPU pressure on large boards.
 */
export const SELECTION_DEBOUNCE_MS = 250;
