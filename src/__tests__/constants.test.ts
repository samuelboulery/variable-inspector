import { describe, it, expect } from 'vitest';
import {
  PROPERTY_NAMES,
  PROPERTY_MAPPING,
  SPACING_PROPERTY_KEYS,
  SCAN_YIELD_INTERVAL,
  MAX_SCAN_NODES,
  ALIAS_DEPTH_CAP,
  EXTRACT_BINDING_MAX_DEPTH,
  SELECTION_DEBOUNCE_MS,
} from '../constants';

describe('constants — PROPERTY_NAMES', () => {
  it('exposes every documented user-facing property label', () => {
    const expectedKeys = [
      'FILL',
      'STROKE',
      'STROKE_COLOR',
      'OPACITY',
      'STROKE_WEIGHT',
      'CORNER_RADIUS',
      'FONT_SIZE',
      'FONT_WEIGHT',
      'FONT_FAMILY',
      'LETTER_SPACING',
      'LINE_HEIGHT',
      'PARAGRAPH_SPACING',
      'PADDING_LEFT',
      'PADDING_RIGHT',
      'PADDING_TOP',
      'PADDING_BOTTOM',
      'ITEM_SPACING',
      'MIN_WIDTH',
      'MAX_WIDTH',
      'MIN_HEIGHT',
      'MAX_HEIGHT',
      'GRID_COLOR',
      'VISIBLE',
      'TEXT_DECORATION',
      'TEXT_CASE',
    ];
    for (const k of expectedKeys) {
      expect(PROPERTY_NAMES).toHaveProperty(k);
      expect(typeof (PROPERTY_NAMES as Record<string, string>)[k]).toBe('string');
    }
  });

  it('never produces empty labels', () => {
    for (const value of Object.values(PROPERTY_NAMES)) {
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

describe('constants — PROPERTY_MAPPING', () => {
  it('maps every spacing key to the matching SPACING_PROPERTY_KEYS value', () => {
    expect(PROPERTY_MAPPING.itemSpacing).toBe('Gap');
    expect(PROPERTY_MAPPING.paddingTop).toBe('Padding Top');
    expect(PROPERTY_MAPPING.paddingBottom).toBe('Padding Bottom');
    expect(PROPERTY_MAPPING.paddingLeft).toBe('Padding Left');
    expect(PROPERTY_MAPPING.paddingRight).toBe('Padding Right');
  });

  it('contains both uniform and asymmetric corner radius mappings', () => {
    expect(PROPERTY_MAPPING.cornerRadius).toBe('Corner Radius');
    expect(PROPERTY_MAPPING.topLeftRadius).toBe('Top Left Radius');
    expect(PROPERTY_MAPPING.bottomRightRadius).toBe('Bottom Right Radius');
  });

  it('contains stroke weight variants', () => {
    expect(PROPERTY_MAPPING.strokeWeight).toBe('Stroke Weight');
    expect(PROPERTY_MAPPING.strokeTopWeight).toBe('Stroke Top Weight');
  });
});

describe('constants — SPACING_PROPERTY_KEYS', () => {
  it('is non-empty', () => {
    expect(SPACING_PROPERTY_KEYS.length).toBeGreaterThan(0);
  });

  it('lists each padding side plus gap', () => {
    expect(SPACING_PROPERTY_KEYS).toContain('Padding Left');
    expect(SPACING_PROPERTY_KEYS).toContain('Padding Right');
    expect(SPACING_PROPERTY_KEYS).toContain('Padding Top');
    expect(SPACING_PROPERTY_KEYS).toContain('Padding Bottom');
    expect(SPACING_PROPERTY_KEYS).toContain('Gap');
  });
});

describe('constants — performance caps', () => {
  it('SCAN_YIELD_INTERVAL is a reasonable positive int', () => {
    expect(Number.isInteger(SCAN_YIELD_INTERVAL)).toBe(true);
    expect(SCAN_YIELD_INTERVAL).toBeGreaterThan(0);
    expect(SCAN_YIELD_INTERVAL).toBeLessThanOrEqual(2000);
  });

  it('MAX_SCAN_NODES is well above SCAN_YIELD_INTERVAL so chunking can run', () => {
    expect(MAX_SCAN_NODES).toBeGreaterThan(SCAN_YIELD_INTERVAL * 4);
  });

  it('ALIAS_DEPTH_CAP guards against infinite alias chains', () => {
    expect(ALIAS_DEPTH_CAP).toBeGreaterThan(1);
    expect(ALIAS_DEPTH_CAP).toBeLessThanOrEqual(20);
  });

  it('EXTRACT_BINDING_MAX_DEPTH guards against deep boundVariables trees', () => {
    expect(EXTRACT_BINDING_MAX_DEPTH).toBeGreaterThan(1);
  });

  it('SELECTION_DEBOUNCE_MS keeps the panel responsive', () => {
    expect(SELECTION_DEBOUNCE_MS).toBeGreaterThanOrEqual(100);
    expect(SELECTION_DEBOUNCE_MS).toBeLessThanOrEqual(1000);
  });
});
