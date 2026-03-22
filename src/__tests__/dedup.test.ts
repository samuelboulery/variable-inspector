import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPropertyId,
  trackProperty,
  resetDedupSets,
  processedProperties,
  processedFontSizeNodeIds,
} from '../dedup';

beforeEach(() => {
  resetDedupSets();
});

describe('getPropertyId', () => {
  it('returns nodeId|propertyName when no variableId is given', () => {
    expect(getPropertyId('n1', 'Fill')).toBe('n1|Fill');
  });

  it('returns nodeId|propertyName|variableId when variableId is given', () => {
    expect(getPropertyId('n1', 'Fill', 'var-abc')).toBe('n1|Fill|var-abc');
  });

  it('produces distinct keys for different nodes with the same property', () => {
    const a = getPropertyId('node-a', 'Opacity');
    const b = getPropertyId('node-b', 'Opacity');
    expect(a).not.toBe(b);
  });

  it('produces distinct keys for different properties on the same node', () => {
    const a = getPropertyId('n1', 'Fill');
    const b = getPropertyId('n1', 'Stroke');
    expect(a).not.toBe(b);
  });
});

describe('resetDedupSets', () => {
  it('clears processedProperties', () => {
    trackProperty('n1', 'Fill');
    expect(processedProperties.size).toBeGreaterThan(0);
    resetDedupSets();
    expect(processedProperties.size).toBe(0);
  });

  it('clears processedFontSizeNodeIds', () => {
    processedFontSizeNodeIds.add('n1');
    expect(processedFontSizeNodeIds.size).toBe(1);
    resetDedupSets();
    expect(processedFontSizeNodeIds.size).toBe(0);
  });
});

describe('trackProperty', () => {
  it('returns false on first encounter (property should be processed)', () => {
    expect(trackProperty('n1', 'Fill')).toBe(false);
  });

  it('returns true on second encounter (property is a duplicate)', () => {
    trackProperty('n1', 'Fill');
    expect(trackProperty('n1', 'Fill')).toBe(true);
  });

  it('treats (nodeId + property) pairs independently', () => {
    expect(trackProperty('n1', 'Opacity')).toBe(false);
    // Different node — should not be deduplicated
    expect(trackProperty('n2', 'Opacity')).toBe(false);
  });

  it('treats (nodeId + property + variableId) triples independently', () => {
    expect(trackProperty('n1', 'Fill', 'var-1')).toBe(false);
    expect(trackProperty('n1', 'Fill', 'var-2')).toBe(false);
  });

  it('treats second call with same variableId as duplicate', () => {
    trackProperty('n1', 'Fill', 'var-1');
    expect(trackProperty('n1', 'Fill', 'var-1')).toBe(true);
  });

  it('never deduplicates spacing properties (always returns false)', () => {
    expect(trackProperty('n1', 'Padding Left')).toBe(false);
    expect(trackProperty('n1', 'Padding Left')).toBe(false);
    expect(trackProperty('n1', 'Gap')).toBe(false);
    expect(trackProperty('n1', 'Gap')).toBe(false);
  });

  it('never deduplicates paddingRight even after multiple calls', () => {
    for (let i = 0; i < 3; i++) {
      expect(trackProperty('n1', 'Padding Right')).toBe(false);
    }
  });

  it('records non-spacing properties in processedProperties', () => {
    trackProperty('n1', 'Corner Radius');
    expect(processedProperties.has('n1|Corner Radius')).toBe(true);
  });

  it('records spacing properties in processedProperties too', () => {
    // Spacing is never deduplicated, but the key IS added (for potential future reads)
    trackProperty('n1', 'Padding Top');
    expect(processedProperties.has('n1|Padding Top')).toBe(true);
  });
});
