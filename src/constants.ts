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
} as const;

/** Spacing property keys that must never be deduplicated. */
export const SPACING_PROPERTY_KEYS = [
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingBottom',
  'itemSpacing',
  'gap',
] as const;
