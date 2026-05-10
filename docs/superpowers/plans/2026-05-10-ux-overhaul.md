# Variable Inspector UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Features 3, 4, 7 from CLAUDE.md, fill Figma property coverage gaps (min/max W/H, layoutGrids, visible, textDecoration, textCase, componentProperties), and add UX evolutions (search, filter, stats, color swatch, rescan + debounce).

**Architecture:** 8 phases (A–H) executed sequentially with two parallelisable warm-up phases (A + B). Each task introduces or modifies one focused module. New TypeScript modules live in `src/` (plugin thread) or `src/ui/` (UI thread utilities). DOM rendering remains in JS (`src/ui.js`, `src/main.js`, `src/components.js`) but pure logic is extracted to `src/ui/utils.ts` for testing.

**Tech Stack:** TypeScript 5.8 (strict), Vite 6, Vitest 2, `@vitest/coverage-v8` 2, Figma Plugin API (`@figma/plugin-typings` 1.110), no linter, no formatter.

**Spec:** `docs/superpowers/specs/2026-05-10-ux-overhaul-design.md`

---

## File Structure

### New TypeScript modules
- `src/variablePathResolver.ts` — collection→library→group→name path
- `src/instanceFingerprint.ts` — stable hash for identical-instance merge
- `src/propertyScanner.ts` — minWidth/maxWidth/minHeight/maxHeight, layoutGrids, visible, textDecoration, textCase
- `src/componentProps.ts` — componentProperties bindings (variants/booleans/instanceSwap)
- `src/ui/utils.ts` — pure UI utilities (filterUsages, regroupByProperty, computeStats)

### Modified TypeScript modules
- `src/types.ts` — add `VariablePath`, `LayerInfo.count/mergedNodeIds`, `ScanStats`, `SortMode`, `RescanMessage`, `OpenVariableMessage`, `ScanStartMessage`, extend `RenderMessage`
- `src/code.ts` — debounce 300 ms, instance fingerprinting in `runInspector`, stats computation, rescan handler, scan-start emission
- `src/nodeScanner.ts` — call propertyScanner + componentProps + numbered effects, use new path resolver
- `src/unboundDetector.ts` — call propertyScanner unbound functions
- `src/effectDetector.ts` — number repeated effects (Drop Shadow N)
- `src/variableLoader.ts` — call variablePathResolver to enrich VariableDefinition
- `src/dedup.ts` — per-node effect counter
- `src/constants.ts` — add MIN_WIDTH, MAX_WIDTH, MIN_HEIGHT, MAX_HEIGHT, GRID_COLOR, VISIBLE, TEXT_DECORATION, TEXT_CASE
- `src/__mocks__/figma.ts` — `makeInstanceNode`, `makeAutoLayoutFrame`, mocks for `figma.libraries`

### Modified JS UI files
- `src/main.js` — handle `scan-start`, render stats, render toolbar, route rescan/open-variable
- `src/components.js` — pill expand-on-click, ×N badge, color swatch, layer type icon (currently dead)
- `src/ui.js` — add propertyIcons for new properties (Min Width, Visible, etc.)
- `src/style.css` — toolbar, swatch, expanded pill breadcrumb, ×N badge, stats dashboard

### New test files
- `src/__tests__/variablePathResolver.test.ts`
- `src/__tests__/instanceFingerprint.test.ts`
- `src/__tests__/propertyScanner.test.ts`
- `src/__tests__/componentProps.test.ts`
- `src/__tests__/ui/utils.test.ts`

### Updated test files
- `src/__tests__/effectDetector.test.ts` — numbering tests
- `src/__tests__/nodeScanner.test.ts` — propertyScanner integration
- `src/__tests__/unboundDetector.test.ts` — new property unbound tests

---

## Phase A — Warm-up bug fixes

### Task A.1: Debounce selectionchange event

**Files:**
- Modify: `src/code.ts:183` (the `figma.on('selectionchange', ...)` handler)

- [ ] **Step 1: Write the failing test**

This is a behaviour test — debounce timing is hard to unit-test cleanly. Skip a unit test and rely on manual QA + a smoke test that the handler still triggers `updateInspector` after the timeout.

Add to `src/__tests__/nodeScanner.test.ts` (or create `src/__tests__/code.debounce.test.ts` if preferred):

```ts
import { describe, it, expect, vi } from 'vitest';

describe('selectionchange debounce', () => {
  it('coalesces multiple rapid events into one scan', async () => {
    vi.useFakeTimers();
    let scanCount = 0;
    const debouncedScan = (() => {
      let t: ReturnType<typeof setTimeout> | null = null;
      return () => {
        if (t) clearTimeout(t);
        t = setTimeout(() => { scanCount++; }, 300);
      };
    })();
    debouncedScan(); debouncedScan(); debouncedScan();
    vi.advanceTimersByTime(310);
    expect(scanCount).toBe(1);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/nodeScanner.test.ts -t debounce`
Expected: PASS (the test exercises pure setTimeout behaviour, not your code yet — this proves the test itself works).

- [ ] **Step 3: Implement debounce in code.ts**

Replace the existing `figma.on('selectionchange', ...)` line:

```ts
let scanTimeout: ReturnType<typeof setTimeout> | null = null;
figma.on('selectionchange', () => {
  if (scanTimeout) clearTimeout(scanTimeout);
  scanTimeout = setTimeout(() => { updateInspector(); }, 300);
});
```

- [ ] **Step 4: Run full test suite**

Run: `npm run test`
Expected: 100/100 passing (was 99, +1 debounce test).

- [ ] **Step 5: Commit**

```bash
git add src/code.ts src/__tests__/nodeScanner.test.ts
git commit -m "feat(core): debounce selectionchange events 300 ms

Avoids re-running runInspector on every keystroke / drag tick during
multi-select. Falls back to a single scan once selection stops changing
for 300 ms."
```

### Task A.2: Render dead layer-type icon in layer header

**Files:**
- Modify: `src/components.js:95` (createLayerSection — currently never calls createLayerTypeIcon)

- [ ] **Step 1: Inspect current state**

Run: `grep -n createLayerTypeIcon src/components.js src/main.js src/ui.js`
Expected: defined in `src/ui.js` and exported, but never imported or called.

- [ ] **Step 2: Wire it into createLayerSection**

In `src/components.js`, update the import:

```js
import { createVariableTypeIcon, createPropertyIcon, createLayerTypeIcon } from './ui.js';
```

In the same file, modify `createLayerSection` so the header includes the icon before the layer name. Replace the existing `headerContent` block (~lines 92–98):

```js
const headerContent = document.createElement('div');
headerContent.className = 'layer-header-content';

const layerIcon = createLayerTypeIcon(layerInfo.type);
if (layerIcon) {
  headerContent.appendChild(layerIcon);
}

const layerName = document.createElement('h2');
layerName.textContent = layerInfo.name;
headerContent.appendChild(layerName);
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: exit 0, dist/code.js regenerated.

- [ ] **Step 4: Manual visual check**

Load `dist/manifest.json` in Figma → select a frame with auto-layout and a frame without → confirm icons appear in the layer headers.

- [ ] **Step 5: Commit**

```bash
git add src/components.js dist/code.js
git commit -m "fix(ui): render layer-type icon in layer section header

createLayerTypeIcon was defined and exported but never called. Add it
to createLayerSection so users see frame / auto-layout / component
icons in the section header."
```

---

## Phase B — Property coverage gap

### Task B.1: Add new constants

**Files:**
- Modify: `src/constants.ts`

- [ ] **Step 1: Read current constants**

Run: `cat src/constants.ts`

- [ ] **Step 2: Add new property name keys**

Append to the `PROPERTY_NAMES` object:

```ts
MIN_WIDTH: 'Min Width',
MAX_WIDTH: 'Max Width',
MIN_HEIGHT: 'Min Height',
MAX_HEIGHT: 'Max Height',
GRID_COLOR: 'Grid Color',
VISIBLE: 'Visible',
TEXT_DECORATION: 'Text Decoration',
TEXT_CASE: 'Text Case',
```

Append to the `PROPERTY_MAPPING` object (Figma key → display name):

```ts
minWidth: 'Min Width',
maxWidth: 'Max Width',
minHeight: 'Min Height',
maxHeight: 'Max Height',
visible: 'Visible',
textDecoration: 'Text Decoration',
textCase: 'Text Case',
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/constants.ts
git commit -m "feat(constants): add property names for new bindable Figma properties

minWidth/maxWidth/minHeight/maxHeight (auto-layout constraints),
layoutGrids color, visible, textDecoration, textCase. Used by the
upcoming propertyScanner module."
```

### Task B.2: Create propertyScanner module — bound side

**Files:**
- Create: `src/propertyScanner.ts`
- Create: `src/__tests__/propertyScanner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/propertyScanner.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scanDimensionConstraints, scanLayoutGridColors, scanVisibility, scanTextDecoration } from '../propertyScanner';
import { VariableUsage } from '../types';
import { makeRectNode, makeFrameNode, makeTextNode } from '../__mocks__/figma';

describe('scanDimensionConstraints — bound', () => {
  it('reports a bound minWidth variable', () => {
    const node = makeFrameNode({
      id: 'f1',
      name: 'Card',
      boundVariables: { minWidth: { id: 'var-minw' } },
    });
    const usages: VariableUsage[] = [];
    scanDimensionConstraints(node, usages);
    expect(usages).toContainEqual({ layer: 'Card', property: 'Min Width', id: 'var-minw' });
  });

  it('reports all four constraint bindings independently', () => {
    const node = makeFrameNode({
      id: 'f1',
      name: 'Card',
      boundVariables: {
        minWidth: { id: 'a' },
        maxWidth: { id: 'b' },
        minHeight: { id: 'c' },
        maxHeight: { id: 'd' },
      },
    });
    const usages: VariableUsage[] = [];
    scanDimensionConstraints(node, usages);
    expect(usages).toHaveLength(4);
  });
});

describe('scanLayoutGridColors — bound', () => {
  it('reports a bound layout-grid color', () => {
    const node = {
      ...makeFrameNode({ id: 'f1', name: 'Page' }),
      layoutGrids: [{ pattern: 'GRID', color: { r: 1, g: 0, b: 0 }, boundVariables: { color: { id: 'var-grid' } } }],
    } as unknown as SceneNode;
    const usages: VariableUsage[] = [];
    scanLayoutGridColors(node, usages);
    expect(usages).toContainEqual({ layer: 'Page', property: 'Grid Color', id: 'var-grid' });
  });
});

describe('scanVisibility — bound', () => {
  it('reports a bound visible binding', () => {
    const node = makeRectNode({ id: 'r1', name: 'Maybe', boundVariables: { visible: { id: 'var-vis' } } });
    const usages: VariableUsage[] = [];
    scanVisibility(node, usages);
    expect(usages).toContainEqual({ layer: 'Maybe', property: 'Visible', id: 'var-vis' });
  });
});

describe('scanTextDecoration — bound', () => {
  it('reports textDecoration and textCase bindings on TextNode', () => {
    const node = makeTextNode({ id: 't1', name: 'Heading' }) as unknown as TextNode & { boundVariables?: Record<string, { id: string }> };
    (node as unknown as { boundVariables: Record<string, { id: string }> }).boundVariables = {
      textDecoration: { id: 'var-td' },
      textCase: { id: 'var-tc' },
    };
    const usages: VariableUsage[] = [];
    scanTextDecoration(node, usages);
    expect(usages.find(u => u.property === 'Text Decoration')?.id).toBe('var-td');
    expect(usages.find(u => u.property === 'Text Case')?.id).toBe('var-tc');
  });

  it('skips non-TEXT nodes', () => {
    const node = makeRectNode({ id: 'r1' });
    const usages: VariableUsage[] = [];
    scanTextDecoration(node as unknown as TextNode, usages);
    expect(usages).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/propertyScanner.test.ts`
Expected: FAIL with "Cannot find module ../propertyScanner".

- [ ] **Step 3: Create propertyScanner.ts (bound side)**

```ts
/// <reference types="@figma/plugin-typings" />

import { VariableUsage } from './types';
import { PROPERTY_NAMES } from './constants';
import { getLayerDisplayName } from './utils/displayName';

type NodeWithBindings = SceneNode & {
  boundVariables?: Record<string, { id?: string }>;
};

type FrameWithGrids = SceneNode & {
  layoutGrids?: Array<{
    pattern: string;
    color?: RGB;
    boundVariables?: { color?: { id: string } };
  }>;
};

const DIMENSION_KEYS = [
  { key: 'minWidth', name: PROPERTY_NAMES.MIN_WIDTH },
  { key: 'maxWidth', name: PROPERTY_NAMES.MAX_WIDTH },
  { key: 'minHeight', name: PROPERTY_NAMES.MIN_HEIGHT },
  { key: 'maxHeight', name: PROPERTY_NAMES.MAX_HEIGHT },
] as const;

/**
 * Reports bound variables on auto-layout dimension constraints
 * (minWidth, maxWidth, minHeight, maxHeight).
 */
export function scanDimensionConstraints(node: SceneNode, usages: VariableUsage[]): void {
  const bv = (node as NodeWithBindings).boundVariables;
  if (!bv) return;
  for (const { key, name } of DIMENSION_KEYS) {
    const id = bv[key]?.id;
    if (id) usages.push({ layer: getLayerDisplayName(node), property: name, id });
  }
}

/**
 * Reports bound colors on each layoutGrid of the node.
 */
export function scanLayoutGridColors(node: SceneNode, usages: VariableUsage[]): void {
  const grids = (node as FrameWithGrids).layoutGrids;
  if (!Array.isArray(grids)) return;
  for (const grid of grids) {
    const id = grid.boundVariables?.color?.id;
    if (id) usages.push({ layer: getLayerDisplayName(node), property: PROPERTY_NAMES.GRID_COLOR, id });
  }
}

/**
 * Reports a bound `visible` binding on the node.
 */
export function scanVisibility(node: SceneNode, usages: VariableUsage[]): void {
  const id = (node as NodeWithBindings).boundVariables?.visible?.id;
  if (id) usages.push({ layer: getLayerDisplayName(node), property: PROPERTY_NAMES.VISIBLE, id });
}

/**
 * Reports bound textDecoration / textCase bindings on a TextNode.
 */
export function scanTextDecoration(node: TextNode, usages: VariableUsage[]): void {
  if ((node as SceneNode).type !== 'TEXT') return;
  const bv = (node as unknown as NodeWithBindings).boundVariables;
  if (!bv) return;
  const td = bv.textDecoration?.id;
  const tc = bv.textCase?.id;
  if (td) usages.push({ layer: getLayerDisplayName(node), property: PROPERTY_NAMES.TEXT_DECORATION, id: td });
  if (tc) usages.push({ layer: getLayerDisplayName(node), property: PROPERTY_NAMES.TEXT_CASE, id: tc });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/propertyScanner.test.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/propertyScanner.ts src/__tests__/propertyScanner.test.ts
git commit -m "feat(scanner): add propertyScanner with bound dim/grid/visible/text props

scanDimensionConstraints, scanLayoutGridColors, scanVisibility,
scanTextDecoration — covers minWidth/maxWidth/minHeight/maxHeight,
layoutGrids[].color, visible, textDecoration, textCase bindings.
Tests included for each."
```

### Task B.3: Wire propertyScanner into nodeScanner

**Files:**
- Modify: `src/nodeScanner.ts:334` (inspectNode function)

- [ ] **Step 1: Add imports at the top of nodeScanner.ts**

```ts
import {
  scanDimensionConstraints,
  scanLayoutGridColors,
  scanVisibility,
  scanTextDecoration,
} from './propertyScanner';
```

- [ ] **Step 2: Call them inside inspectNode**

Replace the body of `inspectNode`:

```ts
export function inspectNode(node: SceneNode): VariableUsage[] {
  const usages: VariableUsage[] = [];

  getColorUsages(node, usages);
  getStrokeUsages(node, usages);
  getEffectUsages(node, usages);
  scanDimensionConstraints(node, usages);
  scanLayoutGridColors(node, usages);
  scanVisibility(node, usages);

  if (node.type === 'TEXT') {
    getTextNodeVariables(node as TextNode, usages);
    scanTextDecoration(node as TextNode, usages);
  }

  getNodeBoundVariables(node, usages);
  return usages;
}
```

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: All tests still pass (existing 100 + 5 new = 105).

- [ ] **Step 4: Commit**

```bash
git add src/nodeScanner.ts
git commit -m "feat(scanner): wire propertyScanner into inspectNode

inspectNode now also scans dimension constraints, layout grid colors,
visibility binding, and text decoration / case bindings on every node."
```

### Task B.4: Add unbound versions to unboundDetector

**Files:**
- Modify: `src/unboundDetector.ts`
- Modify: `src/__tests__/unboundDetector.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/__tests__/unboundDetector.test.ts`:

```ts
import { figmaMock } from '../__mocks__/figma';
// existing imports stay

describe('getUnboundFloatUsages — dimension constraints', () => {
  it('reports unbound minWidth and maxWidth', () => {
    const node = {
      ...makeFrameNode({ id: 'f1', name: 'Card' }),
      minWidth: 100,
      maxWidth: 400,
    } as unknown as SceneNode;
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages.find(u => u.property === 'Min Width')?.value).toBe('100');
    expect(usages.find(u => u.property === 'Max Width')?.value).toBe('400');
  });

  it('skips dimension constraints bound to variables', () => {
    const node = {
      ...makeFrameNode({ id: 'f1' }),
      minWidth: 100,
      boundVariables: { minWidth: { id: 'var-mw' } },
    } as unknown as SceneNode;
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages.find(u => u.property === 'Min Width')).toBeUndefined();
  });

  it('skips dimension constraints when value is null or undefined', () => {
    const node = makeFrameNode({ id: 'f1', name: 'Card' });
    const usages: UnboundUsage[] = [];
    getUnboundFloatUsages(node, usages);
    expect(usages.find(u => u.property === 'Min Width')).toBeUndefined();
  });
});
```

(Note: `makeFrameNode` must be importable; it is, from `../__mocks__/figma`.)

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run src/__tests__/unboundDetector.test.ts -t dimension`
Expected: FAIL — Min Width / Max Width not yet detected.

- [ ] **Step 3: Implement unbound dimension detection**

In `src/unboundDetector.ts`, locate `getUnboundFloatUsages` (around line 239). Add a new helper above it:

```ts
const DIMENSION_PROPERTIES = [
  { key: 'minWidth', displayName: PROPERTY_NAMES.MIN_WIDTH },
  { key: 'maxWidth', displayName: PROPERTY_NAMES.MAX_WIDTH },
  { key: 'minHeight', displayName: PROPERTY_NAMES.MIN_HEIGHT },
  { key: 'maxHeight', displayName: PROPERTY_NAMES.MAX_HEIGHT },
];

function getUnboundDimensionUsages(node: NodeWithBindings, unboundUsages: UnboundUsage[]): void {
  for (const { key, displayName } of DIMENSION_PROPERTIES) {
    const value = (node as unknown as Record<string, unknown>)[key];
    if (typeof value !== 'number') continue;
    if (node.boundVariables?.[key]?.id) continue;
    if (!trackProperty(node.id, displayName)) {
      unboundUsages.push({
        layer: getLayerDisplayName(node),
        layerId: node.id,
        property: displayName,
        value: fmt(value),
      });
    }
  }
}
```

Then call it inside `getUnboundFloatUsages`:

```ts
export function getUnboundFloatUsages(node: SceneNode, unboundUsages: UnboundUsage[]): void {
  const n = node as NodeWithBindings;
  getUnboundOpacityUsage(n, unboundUsages);
  getUnboundStrokeWeightUsages(n, unboundUsages);
  getUnboundCornerRadiusUsages(n, unboundUsages);
  getUnboundTextPropertyUsages(n, unboundUsages);
  getUnboundSpacingUsages(n, unboundUsages);
  getUnboundDimensionUsages(n, unboundUsages);
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: All passing (105 + 3 = 108).

- [ ] **Step 5: Commit**

```bash
git add src/unboundDetector.ts src/__tests__/unboundDetector.test.ts
git commit -m "feat(detector): detect hardcoded min/max width and height

getUnboundDimensionUsages handles minWidth, maxWidth, minHeight,
maxHeight on auto-layout frames. Skips bound or null values."
```

### Task B.5: Create componentProps module

**Files:**
- Create: `src/componentProps.ts`
- Create: `src/__tests__/componentProps.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/componentProps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scanComponentProperties } from '../componentProps';
import { VariableUsage } from '../types';

function makeInstance(overrides: {
  id?: string;
  name?: string;
  componentPropertyReferences?: Record<string, string>;
  boundVariables?: { componentProperties?: Record<string, { id: string }> };
}): InstanceNode {
  return {
    id: overrides.id ?? 'i1',
    name: overrides.name ?? 'Button',
    type: 'INSTANCE',
    componentPropertyReferences: overrides.componentPropertyReferences ?? {},
    boundVariables: overrides.boundVariables ?? {},
  } as unknown as InstanceNode;
}

describe('scanComponentProperties', () => {
  it('reports a bound variant property', () => {
    const node = makeInstance({
      componentPropertyReferences: { State: 'def-state' },
      boundVariables: { componentProperties: { State: { id: 'var-state' } } },
    });
    const usages: VariableUsage[] = [];
    scanComponentProperties(node, usages);
    expect(usages).toContainEqual({ layer: 'Button', property: 'Component / State', id: 'var-state' });
  });

  it('reports nothing when boundVariables.componentProperties is absent', () => {
    const node = makeInstance({});
    const usages: VariableUsage[] = [];
    scanComponentProperties(node, usages);
    expect(usages).toHaveLength(0);
  });

  it('reports multiple bound component properties', () => {
    const node = makeInstance({
      componentPropertyReferences: { State: 'a', Disabled: 'b', Label: 'c' },
      boundVariables: { componentProperties: { State: { id: 'v-s' }, Disabled: { id: 'v-d' } } },
    });
    const usages: VariableUsage[] = [];
    scanComponentProperties(node, usages);
    expect(usages).toHaveLength(2);
    expect(usages.map(u => u.property)).toContain('Component / State');
    expect(usages.map(u => u.property)).toContain('Component / Disabled');
  });

  it('does nothing for non-INSTANCE nodes', () => {
    const node = { id: 'r1', name: 'Rect', type: 'RECTANGLE' } as unknown as InstanceNode;
    const usages: VariableUsage[] = [];
    scanComponentProperties(node, usages);
    expect(usages).toHaveLength(0);
  });

  it('handles missing componentPropertyReferences gracefully', () => {
    const node = {
      id: 'i1',
      name: 'X',
      type: 'INSTANCE',
      boundVariables: { componentProperties: { Foo: { id: 'v' } } },
    } as unknown as InstanceNode;
    const usages: VariableUsage[] = [];
    scanComponentProperties(node, usages);
    // Still reports — references is informational, the binding alone is enough
    expect(usages).toContainEqual({ layer: 'X', property: 'Component / Foo', id: 'v' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/componentProps.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create componentProps.ts**

```ts
/// <reference types="@figma/plugin-typings" />

import { VariableUsage } from './types';
import { getLayerDisplayName } from './utils/displayName';

type InstanceWithCompPropBindings = InstanceNode & {
  boundVariables?: {
    componentProperties?: Record<string, { id: string }>;
  };
};

/**
 * Reports bound componentProperties on an InstanceNode (variant, boolean,
 * text, instanceSwap properties bound to variables). Property names are
 * prefixed with "Component / " so users can distinguish from native props.
 */
export function scanComponentProperties(node: InstanceNode, usages: VariableUsage[]): void {
  if ((node as SceneNode).type !== 'INSTANCE') return;
  const bound = (node as InstanceWithCompPropBindings).boundVariables?.componentProperties;
  if (!bound) return;
  for (const [propName, binding] of Object.entries(bound)) {
    if (binding?.id) {
      usages.push({
        layer: getLayerDisplayName(node),
        property: `Component / ${propName}`,
        id: binding.id,
      });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/componentProps.test.ts`
Expected: PASS, 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/componentProps.ts src/__tests__/componentProps.test.ts
git commit -m "feat(scanner): scan componentProperties variant/boolean bindings

scanComponentProperties on InstanceNode reports each variant or
boolean component property bound to a variable, prefixed with
\"Component / \" to distinguish from native bindings. Guards against
non-INSTANCE nodes and missing boundVariables sub-trees."
```

### Task B.6: Wire componentProps into nodeScanner

**Files:**
- Modify: `src/nodeScanner.ts`

- [ ] **Step 1: Add import**

At the top of `nodeScanner.ts`:

```ts
import { scanComponentProperties } from './componentProps';
```

- [ ] **Step 2: Call inside inspectNode**

Replace the `inspectNode` body to add:

```ts
if (node.type === 'INSTANCE') {
  scanComponentProperties(node as InstanceNode, usages);
}
```

(Inserted after the TEXT block, before the final `getNodeBoundVariables` call.)

- [ ] **Step 3: Run tests + build**

```bash
npm run test
npm run build
```
Expected: tests green, build exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/nodeScanner.ts
git commit -m "feat(scanner): wire componentProps into inspectNode for INSTANCE nodes"
```

---

## Phase C — Effect numbering (Feature 7.3)

### Task C.1: Number repeated effects in unbound detection

**Files:**
- Modify: `src/effectDetector.ts`
- Modify: `src/__tests__/unboundDetector.test.ts` (the existing effect tests will fail)

- [ ] **Step 1: Write the new test cases**

Append to `src/__tests__/unboundDetector.test.ts`:

```ts
describe('getUnboundEffectUsages — numbering repeated effects', () => {
  it('does not number a single effect of its type', () => {
    const node = makeRectNode({
      id: 'n1',
      effects: [{ type: 'DROP_SHADOW', radius: 4 }],
    });
    const usages: UnboundUsage[] = [];
    getUnboundEffectUsages(node, usages);
    expect(usages.some(u => u.property === 'Drop Shadow Blur')).toBe(true);
    expect(usages.some(u => u.property === 'Drop Shadow 1 Blur')).toBe(false);
  });

  it('numbers multiple Drop Shadows 1 / 2 / 3', () => {
    const node = makeRectNode({
      id: 'n1',
      effects: [
        { type: 'DROP_SHADOW', radius: 2 },
        { type: 'DROP_SHADOW', radius: 4 },
        { type: 'DROP_SHADOW', radius: 8 },
      ],
    });
    const usages: UnboundUsage[] = [];
    getUnboundEffectUsages(node, usages);
    const props = usages.map(u => u.property);
    expect(props).toContain('Drop Shadow 1 Blur');
    expect(props).toContain('Drop Shadow 2 Blur');
    expect(props).toContain('Drop Shadow 3 Blur');
  });

  it('counts DROP_SHADOW and INNER_SHADOW separately', () => {
    const node = makeRectNode({
      id: 'n1',
      effects: [
        { type: 'DROP_SHADOW', radius: 2 },
        { type: 'INNER_SHADOW', radius: 4 },
        { type: 'DROP_SHADOW', radius: 6 },
      ],
    });
    const usages: UnboundUsage[] = [];
    getUnboundEffectUsages(node, usages);
    const props = usages.map(u => u.property);
    expect(props).toContain('Drop Shadow 1 Blur');
    expect(props).toContain('Drop Shadow 2 Blur');
    expect(props).toContain('Inner Shadow Blur');
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run src/__tests__/unboundDetector.test.ts -t numbering`
Expected: FAIL.

- [ ] **Step 3: Update effectDetector.ts to number when there are duplicates**

Replace `getUnboundEffectUsages` with:

```ts
export function getUnboundEffectUsages(node: SceneNode, unboundUsages: UnboundUsage[]): void {
  if (!('effects' in node) || !Array.isArray(node.effects)) return;
  const effects = node.effects as EffectWithBindings[];

  // Pre-count per type to know whether to number
  const counts: Record<string, number> = {};
  for (const e of effects) counts[e.type] = (counts[e.type] ?? 0) + 1;

  const seenIdx: Record<string, number> = {};

  for (const effect of effects) {
    const total = counts[effect.type];
    seenIdx[effect.type] = (seenIdx[effect.type] ?? 0) + 1;
    const idx = seenIdx[effect.type];
    const baseLabel = formatEffectType(effect.type);
    const friendlyType = total > 1 ? `${baseLabel} ${idx}` : baseLabel;
    const isBlurOrShadow = effect.type.includes('BLUR') || effect.type.includes('SHADOW');
    const boundVars = effect.boundVariables ?? {};

    if (typeof effect.radius === 'number') {
      const radiusBound = boundVars.radius as { id?: string } | undefined;
      if (!radiusBound?.id) {
        const label = isBlurOrShadow ? 'Blur' : 'Radius';
        unboundUsages.push({
          layer: getLayerDisplayName(node),
          layerId: node.id,
          property: `${friendlyType} ${label}`,
          value: fmt(effect.radius),
        });
      }
    }
    if (effect.type.includes('SHADOW') && effect.offset) {
      const offsetBound = (boundVars.offset as { x?: { id?: string }; y?: { id?: string } }) ?? {};
      if (typeof effect.offset.x === 'number' && !offsetBound.x?.id) {
        unboundUsages.push({ layer: getLayerDisplayName(node), layerId: node.id, property: `${friendlyType} Offset X`, value: fmt(effect.offset.x) });
      }
      if (typeof effect.offset.y === 'number' && !offsetBound.y?.id) {
        unboundUsages.push({ layer: getLayerDisplayName(node), layerId: node.id, property: `${friendlyType} Offset Y`, value: fmt(effect.offset.y) });
      }
    }
    if (typeof effect.spread === 'number') {
      const spreadBound = boundVars.spread as { id?: string } | undefined;
      if (!spreadBound?.id) {
        unboundUsages.push({ layer: getLayerDisplayName(node), layerId: node.id, property: `${friendlyType} Spread`, value: fmt(effect.spread) });
      }
    }
    if (effect.color) {
      const colorBound = boundVars.color as { id?: string } | undefined;
      if (!colorBound?.id) {
        unboundUsages.push({ layer: getLayerDisplayName(node), layerId: node.id, property: `${friendlyType} Color`, value: rgbString(effect.color) });
      }
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test`
Expected: All passing. The pre-existing test "Layer Blur Blur" (single effect) should remain green because total=1.

- [ ] **Step 5: Commit**

```bash
git add src/effectDetector.ts src/__tests__/unboundDetector.test.ts
git commit -m "feat(detector): number repeated effects per node (Drop Shadow 1, 2, 3)

Per-type counter ensures multiple drop shadows are reported as
\"Drop Shadow 1 Blur\", \"Drop Shadow 2 Blur\", etc. A single effect
of its type keeps the unnumbered label. DROP_SHADOW and INNER_SHADOW
counters are independent."
```

### Task C.2: Number repeated effects in bound detection

**Files:**
- Modify: `src/nodeScanner.ts` (function `getEffectUsages`, ~line 195)
- Modify: `src/__tests__/nodeScanner.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/__tests__/nodeScanner.test.ts` inside the `describe('inspectNode', ...)` block:

```ts
it('numbers repeated bound drop-shadow radii', () => {
  const node = makeRectNode({
    id: 'n1',
    name: 'Card',
    effects: [
      { type: 'DROP_SHADOW', boundVariables: { radius: { id: 'var-r1' } } },
      { type: 'DROP_SHADOW', boundVariables: { radius: { id: 'var-r2' } } },
    ],
  });
  const usages = inspectNode(node);
  const props = usages.map(u => u.property);
  expect(props).toContain('Drop Shadow 1 radius');
  expect(props).toContain('Drop Shadow 2 radius');
});

it('does not number when only one effect of that type is bound', () => {
  const node = makeRectNode({
    id: 'n1',
    name: 'Card',
    effects: [{ type: 'LAYER_BLUR', boundVariables: { radius: { id: 'var-r' } } }],
  });
  const usages = inspectNode(node);
  expect(usages.find(u => u.property === 'Layer Blur radius')).toBeDefined();
  expect(usages.find(u => u.property === 'Layer Blur 1 radius')).toBeUndefined();
});
```

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run src/__tests__/nodeScanner.test.ts -t "numbers repeated"`
Expected: FAIL.

- [ ] **Step 3: Update getEffectUsages**

Replace the function body in `nodeScanner.ts`:

```ts
function getEffectUsages(node: SceneNode, usages: VariableUsage[]): void {
  if (!('effects' in node) || !Array.isArray(node.effects)) return;
  const effects = node.effects as EffectWithBindings[];
  const counts: Record<string, number> = {};
  for (const e of effects) counts[e.type] = (counts[e.type] ?? 0) + 1;
  const seenIdx: Record<string, number> = {};

  for (const effect of effects) {
    if (!effect.boundVariables) continue;
    const total = counts[effect.type];
    seenIdx[effect.type] = (seenIdx[effect.type] ?? 0) + 1;
    const idx = seenIdx[effect.type];
    const baseLabel = formatEffectType(effect.type);
    const friendlyType = total > 1 ? `${baseLabel} ${idx}` : baseLabel;
    for (const [prop, bind] of Object.entries(effect.boundVariables)) {
      if ((bind as { id?: string }).id) {
        usages.push({
          layer: getLayerDisplayName(node),
          property: `${friendlyType} ${prop}`,
          id: (bind as { id: string }).id,
        });
      }
    }
  }
}
```

- [ ] **Step 4: Run all tests**

Run: `npm run test`
Expected: All passing.

- [ ] **Step 5: Commit**

```bash
git add src/nodeScanner.ts src/__tests__/nodeScanner.test.ts
git commit -m "feat(scanner): number repeated bound effects (Drop Shadow N radius)

Bound effect properties on a node with multiple effects of the same
type now get prefixed with the index. Mirrors the unbound numbering
already in effectDetector."
```

---

## Phase D — Instance fingerprint + merge (Feature 7.1)

### Task D.1: Create instanceFingerprint module

**Files:**
- Create: `src/instanceFingerprint.ts`
- Create: `src/__tests__/instanceFingerprint.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/instanceFingerprint.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeFingerprint, groupByFingerprint } from '../instanceFingerprint';

function makeInstance(overrides: {
  id: string;
  componentId?: string;
  componentSetId?: string;
  componentProperties?: Record<string, { type: string; value: unknown }>;
  boundVariables?: Record<string, unknown>;
  type?: string;
}): SceneNode {
  return {
    id: overrides.id,
    name: 'Inst',
    type: overrides.type ?? 'INSTANCE',
    mainComponent: overrides.componentId
      ? { id: overrides.componentId, parent: overrides.componentSetId ? { id: overrides.componentSetId, type: 'COMPONENT_SET' } : null }
      : null,
    componentProperties: overrides.componentProperties ?? {},
    boundVariables: overrides.boundVariables ?? {},
  } as unknown as SceneNode;
}

describe('computeFingerprint', () => {
  it('returns the same hash for two instances with identical state', () => {
    const a = makeInstance({ id: 'a', componentId: 'c1', componentProperties: { State: { type: 'VARIANT', value: 'default' } } });
    const b = makeInstance({ id: 'b', componentId: 'c1', componentProperties: { State: { type: 'VARIANT', value: 'default' } } });
    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });

  it('returns different hashes when componentId differs', () => {
    const a = makeInstance({ id: 'a', componentId: 'c1' });
    const b = makeInstance({ id: 'b', componentId: 'c2' });
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it('returns different hashes when component property values differ', () => {
    const a = makeInstance({ id: 'a', componentId: 'c1', componentProperties: { State: { type: 'VARIANT', value: 'default' } } });
    const b = makeInstance({ id: 'b', componentId: 'c1', componentProperties: { State: { type: 'VARIANT', value: 'hover' } } });
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it('returns different hashes when bound variables differ', () => {
    const a = makeInstance({ id: 'a', componentId: 'c1', boundVariables: { color: { id: 'v1' } } });
    const b = makeInstance({ id: 'b', componentId: 'c1', boundVariables: { color: { id: 'v2' } } });
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it('is order-independent for componentProperties keys', () => {
    const a = makeInstance({ id: 'a', componentId: 'c1', componentProperties: { A: { type: 'BOOL', value: true }, B: { type: 'BOOL', value: false } } });
    const b = makeInstance({ id: 'b', componentId: 'c1', componentProperties: { B: { type: 'BOOL', value: false }, A: { type: 'BOOL', value: true } } });
    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });

  it('returns null for non-INSTANCE nodes', () => {
    const node = makeInstance({ id: 'r', type: 'RECTANGLE' });
    expect(computeFingerprint(node)).toBeNull();
  });

  it('returns null when mainComponent is missing (detached instance)', () => {
    const node = makeInstance({ id: 'a' });
    expect(computeFingerprint(node)).toBeNull();
  });
});

describe('groupByFingerprint', () => {
  it('groups identical instances together', () => {
    const a = makeInstance({ id: 'a', componentId: 'c1' });
    const b = makeInstance({ id: 'b', componentId: 'c1' });
    const c = makeInstance({ id: 'c', componentId: 'c2' });
    const result = groupByFingerprint([a, b, c]);
    const groupSizes = Array.from(result.values()).map(v => v.length).sort();
    expect(groupSizes).toEqual([1, 2]);
  });

  it('skips non-INSTANCE nodes', () => {
    const a = makeInstance({ id: 'a', componentId: 'c1' });
    const r = makeInstance({ id: 'r', type: 'RECTANGLE' });
    const result = groupByFingerprint([a, r]);
    expect(Array.from(result.values()).flat()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run src/__tests__/instanceFingerprint.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create the module**

```ts
/// <reference types="@figma/plugin-typings" />

type InstanceWithExtras = InstanceNode & {
  componentProperties?: Record<string, { type: string; value: unknown }>;
  boundVariables?: Record<string, unknown>;
};

/**
 * Stable, order-independent fingerprint of an INSTANCE node's identity.
 * Two instances with the same fingerprint are considered "identical"
 * for Feature 7.1 dedup. Returns null for non-INSTANCE or detached nodes.
 */
export function computeFingerprint(node: SceneNode): string | null {
  if (node.type !== 'INSTANCE') return null;
  const inst = node as InstanceWithExtras;
  if (!inst.mainComponent) return null;

  const componentId = inst.mainComponent.id;
  const setId = (inst.mainComponent.parent as { id?: string; type?: string } | null)?.type === 'COMPONENT_SET'
    ? (inst.mainComponent.parent as { id: string }).id
    : '';
  const props = JSON.stringify(sortObjectKeys(inst.componentProperties ?? {}));
  const bound = JSON.stringify(sortObjectKeys((inst.boundVariables ?? {}) as Record<string, unknown>));
  return [componentId, setId, props, bound].join('|');
}

/**
 * Groups instances by fingerprint. Non-INSTANCE nodes are placed in
 * single-node "buckets" keyed by their unique node ID so the caller
 * can iterate the result uniformly.
 */
export function groupByFingerprint(nodes: readonly SceneNode[]): Map<string, SceneNode[]> {
  const map = new Map<string, SceneNode[]>();
  for (const node of nodes) {
    const key = computeFingerprint(node) ?? `__node__${node.id}`;
    const bucket = map.get(key) ?? [];
    bucket.push(node);
    map.set(key, bucket);
  }
  return map;
}

function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = obj[k];
  return sorted;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/instanceFingerprint.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/instanceFingerprint.ts src/__tests__/instanceFingerprint.test.ts
git commit -m "feat(core): instanceFingerprint module for Feature 7.1 dedup

computeFingerprint() returns a deterministic string hash combining
componentId, COMPONENT_SET id, sorted componentProperties, and
sorted boundVariables. groupByFingerprint() partitions a node list
into identical-instance buckets, with non-INSTANCE nodes kept solo."
```

### Task D.2: Extend LayerInfo type with count + mergedNodeIds

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Update the interface**

In `src/types.ts`, replace the `LayerInfo` interface:

```ts
export interface LayerInfo {
  id: string;
  name: string;
  order: number;
  parent?: string;
  type: string;
  /** Number of merged identical instances (>= 2 when merged, undefined when solo). */
  count?: number;
  /** All node IDs that share this fingerprint, in document order. */
  mergedNodeIds?: string[];
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): extend LayerInfo with count + mergedNodeIds for instance merge"
```

### Task D.3: Apply fingerprint dedup in runInspector

**Files:**
- Modify: `src/code.ts`

- [ ] **Step 1: Add import**

```ts
import { groupByFingerprint } from './instanceFingerprint';
```

- [ ] **Step 2: Replace the per-node loop in runInspector**

Find the section in `runInspector` where `allNodes` is iterated. Replace with:

```ts
const groups = groupByFingerprint(allNodes);
const allUsages: FullUsageEntry[] = [];
const unboundUsages: UnboundUsage[] = [];
const mergedInfo = new Map<string, { count: number; nodeIds: string[] }>();

for (const [_key, bucket] of groups) {
  const representative = bucket[0];
  const isMerged = bucket.length > 1 && representative.type === 'INSTANCE';

  if (isMerged) {
    mergedInfo.set(representative.id, {
      count: bucket.length,
      nodeIds: bucket.map(n => n.id),
    });
  }

  const nodeUsages = inspectNode(representative);
  for (const { layer, property, id } of nodeUsages) {
    const def = vars.get(id);
    allUsages.push(
      def
        ? { layer, layerId: representative.id, property, name: def.name, type: def.type, origin: def.origin, colorValue: def.colorValue, id }
        : { layer, layerId: representative.id, property, name: id, type: 'STRING', origin: 'external', id },
    );
  }
  getUnboundColorUsages(representative, unboundUsages);
  getUnboundFloatUsages(representative, unboundUsages);
  getUnboundEffectUsages(representative, unboundUsages);
}
```

- [ ] **Step 3: Apply mergedInfo in buildLayerInfoMap**

Modify `buildLayerInfoMap` to accept `mergedInfo` and inject `count` + `mergedNodeIds`:

```ts
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
      layerInfoMap.set(layerId, {
        id: layerId, name: layerName, order, type: getLayerType(node),
        ...(merge ? { count: merge.count, mergedNodeIds: merge.nodeIds } : {}),
      });
    }
  };

  for (let idx = 0; idx < allUsages.length; idx++) await tryAdd(allUsages[idx].layerId, allUsages[idx].layer, idx);
  for (let idx = 0; idx < unboundUsages.length; idx++) await tryAdd(unboundUsages[idx].layerId, unboundUsages[idx].layer, allUsages.length + idx);

  return layerInfoMap;
}
```

Update the call site in `runInspector`:

```ts
const layerInfoMap = await buildLayerInfoMap(allUsages, unboundUsages, mergedInfo);
```

- [ ] **Step 4: Run tests + build**

```bash
npm run test
npm run build
```
Expected: all green, build OK.

- [ ] **Step 5: Commit**

```bash
git add src/code.ts
git commit -m "feat(core): merge identical instances in runInspector

groupByFingerprint partitions selection into buckets. Each bucket's
representative is scanned once; the count and full nodeId list are
stored in LayerInfo for the UI to render the × N badge and cycle
focus between nodes."
```

### Task D.4: Render ×N badge + cycling focus in UI

**Files:**
- Modify: `src/components.js`
- Modify: `src/main.js` (only if cycle state needed there)
- Modify: `src/style.css`

- [ ] **Step 1: Add badge rendering in createLayerSection**

In `src/components.js`, after the layerName append in the headerContent block:

```js
if (layerInfo.count && layerInfo.count > 1) {
  const badge = document.createElement('span');
  badge.className = 'merge-badge';
  badge.textContent = `× ${layerInfo.count}`;
  badge.title = 'Click to cycle through merged instances';
  badge.dataset.cycleIndex = '0';
  badge.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const ids = layerInfo.mergedNodeIds ?? [];
    if (ids.length === 0) return;
    let idx = parseInt(badge.dataset.cycleIndex, 10) || 0;
    parent.postMessage({ pluginMessage: { type: 'select-node', nodeId: ids[idx] } }, '*');
    idx = (idx + 1) % ids.length;
    badge.dataset.cycleIndex = String(idx);
  });
  headerContent.appendChild(badge);
}
```

- [ ] **Step 2: Style the badge**

Append to `src/style.css`:

```css
.merge-badge {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #1969d2;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;
}

.merge-badge:hover {
  background: #1454ab;
}
```

- [ ] **Step 3: Build + manual test**

```bash
npm run build
```

In Figma : selectionner 4 instances identiques d'un Button → vérifier qu'1 seule section apparaît avec `× 4` → cliquer le badge plusieurs fois → vérifier que la sélection cycle entre les 4 nodes.

- [ ] **Step 4: Commit**

```bash
git add src/components.js src/style.css dist/code.js
git commit -m "feat(ui): render × N badge with cycling focus on merged sections

Identical instance groups now show a × N badge in the layer header.
Clicking cycles through the merged node IDs, sending select-node
postMessages to focus each instance in turn."
```

---

## Phase E — Variable path on click (Feature 3)

### Task E.1: Add VariablePath type

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Append the type**

```ts
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
```

Extend `VariableDefinition`:

```ts
export interface VariableDefinition {
  name: string;
  type: VariableResolvedDataType;
  origin: 'local' | 'external';
  colorValue?: RGB | RGBA;
  path?: VariablePath;       // NEW
}
```

Extend `FullUsageEntry`:

```ts
export interface FullUsageEntry {
  layer: string;
  layerId: string;
  property: string;
  name: string;
  type: VariableResolvedDataType;
  origin: 'local' | 'external';
  colorValue?: RGB | RGBA;
  id: string;
  path?: VariablePath;       // NEW
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add VariablePath type, attach to VariableDefinition + FullUsageEntry"
```

### Task E.2: Create variablePathResolver module

**Files:**
- Create: `src/variablePathResolver.ts`
- Create: `src/__tests__/variablePathResolver.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/variablePathResolver.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { figmaMock, makeVariable, makeAliasChain } from '../__mocks__/figma';
import { resolveVariablePath } from '../variablePathResolver';

beforeEach(() => {
  figmaMock.variables.getLocalVariableCollectionsAsync = async () => [];
  figmaMock.variables.getVariableByIdAsync = async () => null;
});

function makeCollection(id: string, name: string, variableIds: string[]): VariableCollection {
  return { id, name, variableIds, modes: [], defaultModeId: 'm', remote: false, hiddenFromPublishing: false, key: 'k' } as unknown as VariableCollection;
}

describe('resolveVariablePath — local', () => {
  it('parses groups from a slash-separated variable name', async () => {
    const v = makeVariable({ id: 'v1', name: 'Color/Brand/primary' });
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [makeCollection('c1', 'Tokens', ['v1'])];
    figmaMock.variables.getVariableByIdAsync = async () => v;
    const path = await resolveVariablePath(v, false);
    expect(path).toEqual({
      collection: 'Tokens',
      groups: ['Color', 'Brand'],
      name: 'primary',
      isAlias: false,
    });
  });

  it('handles a variable with no group (single segment)', async () => {
    const v = makeVariable({ id: 'v1', name: 'spacing' });
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [makeCollection('c1', 'Tokens', ['v1'])];
    figmaMock.variables.getVariableByIdAsync = async () => v;
    const path = await resolveVariablePath(v, false);
    expect(path?.groups).toEqual([]);
    expect(path?.name).toBe('spacing');
  });

  it('returns "Unknown collection" when collection lookup fails', async () => {
    const v = makeVariable({ id: 'v1', name: 'orphan', variableCollectionId: 'missing' });
    figmaMock.variables.getLocalVariableCollectionsAsync = async () => [];
    const path = await resolveVariablePath(v, false);
    expect(path?.collection).toBe('Unknown collection');
  });
});

describe('resolveVariablePath — external', () => {
  it('marks library when variable is external', async () => {
    const v = makeVariable({ id: 'v1', name: 'Color/primary' });
    (v as unknown as { remote: boolean }).remote = true;
    const path = await resolveVariablePath(v, true);
    expect(path?.library).toBeDefined();
  });
});

describe('resolveVariablePath — alias chain', () => {
  it('marks isAlias true and follows the chain to the leaf', async () => {
    const { root, leaf, resolve } = makeAliasChain({ rootId: 'a', leafId: 'b', leafValue: { r: 1, g: 0, b: 0 } });
    figmaMock.variables.getVariableByIdAsync = resolve;
    const path = await resolveVariablePath(root, false);
    expect(path?.isAlias).toBe(true);
    expect(path?.name).toBe('alias/leaf'.split('/').pop());
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run src/__tests__/variablePathResolver.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create the module**

```ts
/// <reference types="@figma/plugin-typings" />

import { VariablePath } from './types';

const COLLECTION_NAME_CACHE = new Map<string, string>();
const ALIAS_DEPTH_CAP = 10;

/**
 * Resolves a variable's structural path (collection / library / groups / name).
 * Follows VARIABLE_ALIAS chains up to ALIAS_DEPTH_CAP and reports the leaf path
 * with isAlias=true when traversal happened.
 */
export async function resolveVariablePath(variable: Variable, isExternal: boolean): Promise<VariablePath> {
  const visited: string[] = [];
  let current: Variable = variable;

  for (let depth = 0; depth < ALIAS_DEPTH_CAP; depth++) {
    visited.push(current.name);
    const modeIds = Object.keys(current.valuesByMode ?? {});
    if (modeIds.length === 0) break;
    const firstValue = current.valuesByMode[modeIds[0]] as { type?: string; id?: string } | unknown;
    if (typeof firstValue === 'object' && firstValue !== null && (firstValue as { type?: string }).type === 'VARIABLE_ALIAS') {
      const aliasId = (firstValue as { id: string }).id;
      const next = await figma.variables.getVariableByIdAsync(aliasId);
      if (!next || next.id === current.id) break;
      current = next;
      continue;
    }
    break;
  }

  const isAlias = visited.length > 1;
  const collection = await resolveCollectionName(current.variableCollectionId);
  const segments = current.name.split('/').filter(s => s.length > 0);
  const name = segments.pop() ?? current.name;

  return {
    collection,
    library: isExternal ? deriveLibraryName(current) : undefined,
    groups: segments,
    name,
    isAlias,
    ...(isAlias ? { aliasChain: visited } : {}),
  };
}

async function resolveCollectionName(collectionId: string): Promise<string> {
  if (COLLECTION_NAME_CACHE.has(collectionId)) return COLLECTION_NAME_CACHE.get(collectionId)!;
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (const c of collections) {
    COLLECTION_NAME_CACHE.set(c.id, c.name);
    if (c.id === collectionId) return c.name;
  }
  return 'Unknown collection';
}

function deriveLibraryName(variable: Variable): string {
  // Figma exposes library via variable.key prefix or via figma.libraries (recent API).
  // Fallback: use the collection name; the user can still see it's external via the badge.
  return (variable as unknown as { libraryName?: string }).libraryName ?? 'External Library';
}

/** Test-only: clears the collection name cache between runs. */
export function _resetCollectionCacheForTests(): void {
  COLLECTION_NAME_CACHE.clear();
}
```

- [ ] **Step 4: Add cache reset to test beforeEach**

Edit the test file to also call `_resetCollectionCacheForTests()` in `beforeEach`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/__tests__/variablePathResolver.test.ts`
Expected: PASS, 5 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/variablePathResolver.ts src/__tests__/variablePathResolver.test.ts
git commit -m "feat(loader): variablePathResolver — collection / library / groups / name

Resolves a Variable to a structured VariablePath. Follows alias chains
to the leaf (depth cap 10), parses groups from slash-separated names,
caches collection name lookups. Library detection falls back to a
generic label until figma.libraries API is wired (future work)."
```

### Task E.3: Enrich VariableDefinition + FullUsageEntry with path

**Files:**
- Modify: `src/variableLoader.ts`
- Modify: `src/code.ts`

- [ ] **Step 1: Update variableLoader to call resolver**

In `src/variableLoader.ts`, import the resolver and call it for each variable:

```ts
import { resolveVariablePath } from './variablePathResolver';
```

In `loadLocalVariables`, after building each `VariableDefinition`, attach the path:

```ts
const path = await resolveVariablePath(variable, false);
variableMap.set(id, {
  name: variable.name,
  type: variable.resolvedType,
  origin: 'local',
  colorValue: resolveColorValue(variable),
  path,
});
```

Same in `loadExternalVariables` for both the fallback and the imported variants — pass `true` for `isExternal`.

- [ ] **Step 2: Propagate path into FullUsageEntry in code.ts**

In `runInspector`, when constructing `allUsages.push(...)`, add `path: def.path`:

```ts
def
  ? { layer, layerId: representative.id, property, name: def.name, type: def.type, origin: def.origin, colorValue: def.colorValue, id, path: def.path }
  : { layer, layerId: representative.id, property, name: id, type: 'STRING', origin: 'external', id },
```

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All passing (existing variableLoader tests should still pass, but you may need to update the alias-chain test which previously asserted `colorValue undefined` — now still undefined, but path should now be populated).

If the alias test fails, update its assertion:

```ts
expect(def?.path?.isAlias).toBe(true);
```

- [ ] **Step 4: Commit**

```bash
git add src/variableLoader.ts src/code.ts src/__tests__/variableLoader.test.ts
git commit -m "feat(loader): attach VariablePath to every VariableDefinition + entry

resolveVariablePath now runs for each variable loaded by
loadLocalVariables and loadExternalVariables. The path travels into
FullUsageEntry so the UI can render the breadcrumb on click."
```

### Task E.4: Render expandable pill in UI

**Files:**
- Modify: `src/components.js` (createVariablePill)
- Modify: `src/style.css`

- [ ] **Step 1: Update createVariablePill to support expand-on-click**

Replace the function in `src/components.js`:

```js
let openPathPill = null; // singleton open pill for auto-close

export function createVariablePill(item) {
  const wrapper = document.createElement('div');
  wrapper.className = 'pill-wrapper';

  const pill = document.createElement('span');
  pill.className = `variable-pill ${item.origin}-variable`;
  pill.style.cursor = item.path ? 'pointer' : 'default';

  const typeIcon = createVariableTypeIcon(item.type);
  if (typeIcon) pill.appendChild(typeIcon);

  const nameSpan = document.createElement('span');
  nameSpan.textContent = item.name;
  pill.appendChild(nameSpan);

  wrapper.appendChild(pill);

  if (item.path) {
    const pathBox = document.createElement('div');
    pathBox.className = 'variable-path';
    pathBox.style.display = 'none';
    pathBox.appendChild(buildPathBreadcrumb(item.path));
    wrapper.appendChild(pathBox);

    pill.addEventListener('click', () => {
      const isOpen = pathBox.style.display === 'block';
      if (openPathPill && openPathPill !== pathBox) openPathPill.style.display = 'none';
      pathBox.style.display = isOpen ? 'none' : 'block';
      openPathPill = isOpen ? null : pathBox;
    });
  }

  return wrapper;
}

function buildPathBreadcrumb(path) {
  const root = document.createElement('div');
  root.className = 'path-content';
  const parts = [];
  if (path.library) parts.push(path.library);
  parts.push(path.collection);
  for (const g of path.groups) parts.push(g);
  parts.push(path.name);
  root.textContent = '└─ ' + parts.join(' / ');
  if (path.isAlias) {
    const aliasTag = document.createElement('span');
    aliasTag.className = 'alias-tag';
    aliasTag.textContent = ' (alias)';
    root.appendChild(aliasTag);
  }
  return root;
}
```

- [ ] **Step 2: Style the path box**

Append to `src/style.css`:

```css
.pill-wrapper {
  display: inline-block;
  margin: 0;
}

.variable-path {
  margin-top: 4px;
  padding: 6px 10px;
  background: #f7fafd;
  border-left: 2px solid #1969d2;
  font-size: 11px;
  color: #444;
  border-radius: 0 4px 4px 0;
  animation: slide-down 150ms ease-out;
}

.alias-tag {
  color: #b06000;
  font-style: italic;
  font-size: 10px;
}

@keyframes slide-down {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 3: Build + manual test**

```bash
npm run build
```

In Figma : sélectionner un frame avec variables locales et externes → cliquer chaque pill → vérifier que le breadcrumb apparaît → cliquer une autre pill → vérifier que la première se referme.

- [ ] **Step 4: Commit**

```bash
git add src/components.js src/style.css dist/code.js
git commit -m "feat(ui): expand variable pill on click with path breadcrumb

Click on a pill toggles a slide-down breadcrumb showing
library / collection / groups / name. Single-open semantics: opening
one pill closes any other expanded pill. Aliases are flagged with
\"(alias)\" tag."
```

---

## Phase F — Sort toggle (Feature 4)

### Task F.1: Add SortMode type + ui/utils.ts with regroupByProperty

**Files:**
- Modify: `src/types.ts`
- Create: `src/ui/utils.ts`
- Create: `src/__tests__/ui/utils.test.ts`

- [ ] **Step 1: Add SortMode to types**

In `src/types.ts`:

```ts
export type SortMode = 'byLayer' | 'byProperty';
```

- [ ] **Step 2: Write the failing test**

Create `src/__tests__/ui/utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { regroupByProperty } from '../../ui/utils';
import { FullUsageEntry } from '../../types';

function entry(overrides: Partial<FullUsageEntry>): FullUsageEntry {
  return {
    layer: 'L', layerId: 'l1', property: 'P',
    name: 'n', type: 'COLOR', origin: 'local', id: 'v1',
    ...overrides,
  };
}

describe('regroupByProperty', () => {
  it('groups entries by property name', () => {
    const byLayer = {
      l1: [entry({ layerId: 'l1', layer: 'A', property: 'Fill' }), entry({ layerId: 'l1', layer: 'A', property: 'Stroke Color' })],
      l2: [entry({ layerId: 'l2', layer: 'B', property: 'Fill' })],
    };
    const result = regroupByProperty(byLayer);
    expect(Object.keys(result).sort()).toEqual(['Fill', 'Stroke Color']);
    expect(result.Fill).toHaveLength(2);
  });

  it('preserves layerId on each entry', () => {
    const byLayer = { l1: [entry({ layerId: 'l1', layer: 'A', property: 'Fill' })] };
    const result = regroupByProperty(byLayer);
    expect(result.Fill[0].layerId).toBe('l1');
  });

  it('returns empty object for empty input', () => {
    expect(regroupByProperty({})).toEqual({});
  });
});
```

- [ ] **Step 3: Run failing tests**

Run: `npx vitest run src/__tests__/ui/utils.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Create src/ui/utils.ts**

```ts
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
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/__tests__/ui/utils.test.ts`
Expected: PASS, 3 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/ui/utils.ts src/__tests__/ui/utils.test.ts
git commit -m "feat(ui): regroupByProperty util + SortMode type

Extracts the byLayer→byProperty transform into a pure, testable util.
Required for the upcoming sort toggle in the toolbar."
```

### Task F.2: Add toolbar with sort toggle in main.js

**Files:**
- Modify: `src/main.js`
- Modify: `src/style.css`

- [ ] **Step 1: Add toolbar render fn at the top of main.js (after import)**

```js
import { createLayerSection } from './components.js';

const SORT_KEY = 'vi.sortMode';

function getSortMode() {
  return localStorage.getItem(SORT_KEY) === 'byProperty' ? 'byProperty' : 'byLayer';
}

function setSortMode(mode) {
  localStorage.setItem(SORT_KEY, mode);
}

function renderToolbar(onSortChange) {
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `
    <div class="sort-toggle">
      <button data-mode="byLayer">Par calque</button>
      <button data-mode="byProperty">Par propriété</button>
    </div>
  `;
  const current = getSortMode();
  toolbar.querySelectorAll('button[data-mode]').forEach(btn => {
    if (btn.dataset.mode === current) btn.classList.add('active');
    btn.addEventListener('click', () => {
      const next = btn.dataset.mode;
      setSortMode(next);
      onSortChange(next);
    });
  });
  return toolbar;
}
```

- [ ] **Step 2: Render the toolbar in handleRenderMessage**

Replace `handleRenderMessage` body to call `renderToolbar` first and then re-render content based on the active sort mode:

```js
let lastMessage = null;

function handleRenderMessage(message) {
  lastMessage = message;
  const app = document.getElementById('app');
  app.innerHTML = '';

  app.appendChild(renderToolbar(() => renderBody(app, lastMessage)));

  renderBody(app, message);
}

function renderBody(app, message) {
  // remove old body if any
  const old = app.querySelector('.app-body');
  if (old) old.remove();

  const body = document.createElement('div');
  body.className = 'app-body';

  if (message.noVariablesFound) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No variables or unbound properties found in the selection.';
    body.appendChild(empty);
    app.appendChild(body);
    return;
  }

  const sortMode = getSortMode();

  if (sortMode === 'byLayer') {
    const layerIds = Object.keys(message.byLayer).sort((a, b) => {
      const orderA = message.layerInfoMap[a]?.order ?? 0;
      const orderB = message.layerInfoMap[b]?.order ?? 0;
      return orderA - orderB;
    });
    layerIds.forEach(layerId => {
      const layerInfo = message.layerInfoMap[layerId];
      if (!layerInfo) return;
      const variables = message.byLayer[layerId];
      body.appendChild(createLayerSection(layerInfo, variables));
    });
  } else {
    // byProperty mode — flat list grouped by property
    const all = Object.values(message.byLayer).flat();
    const byProp = {};
    for (const e of all) {
      if (!byProp[e.property]) byProp[e.property] = [];
      byProp[e.property].push(e);
    }
    const props = Object.keys(byProp).sort();
    props.forEach(prop => {
      const section = document.createElement('div');
      section.className = 'property-section';
      const h = document.createElement('h2');
      h.textContent = `${prop} (${byProp[prop].length})`;
      section.appendChild(h);
      byProp[prop].forEach(entry => {
        const row = document.createElement('div');
        row.className = 'property-row';
        const layerLabel = document.createElement('span');
        layerLabel.className = 'property-row-layer';
        layerLabel.textContent = entry.layer;
        layerLabel.style.cursor = 'pointer';
        layerLabel.addEventListener('click', () => {
          parent.postMessage({ pluginMessage: { type: 'select-node', nodeId: entry.layerId } }, '*');
        });
        row.appendChild(layerLabel);
        row.appendChild(document.createTextNode(' → '));
        // import lazily; createVariablePill expects a wrapper
        // simple inline rendering:
        const pill = document.createElement('span');
        pill.className = `variable-pill ${entry.origin}-variable`;
        pill.textContent = entry.name;
        row.appendChild(pill);
        section.appendChild(row);
      });
      body.appendChild(section);
    });
  }

  // Unbound section (same as before)
  if (message.unbound && message.unbound.length > 0) {
    const dangerSection = document.createElement('div');
    dangerSection.className = 'danger';
    const title = document.createElement('h3');
    title.textContent = 'Hardcoded properties (not bound to variables)';
    dangerSection.appendChild(title);
    const list = document.createElement('ul');
    message.unbound.forEach(usage => {
      const li = document.createElement('li');
      li.className = 'unbound-variable';
      li.textContent = `${usage.layer} — ${usage.property}: ${usage.value}`;
      list.appendChild(li);
    });
    dangerSection.appendChild(list);
    body.appendChild(dangerSection);
  }

  app.appendChild(body);
}
```

- [ ] **Step 3: Style the toolbar**

Append to `src/style.css`:

```css
.toolbar {
  position: sticky;
  top: 0;
  background: #fff;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
  margin: -1rem -1rem 1rem -1rem;
  padding-left: 1rem;
  padding-right: 1rem;
  z-index: 10;
}

.sort-toggle {
  display: inline-flex;
  border: 1px solid #ccc;
  border-radius: 6px;
  overflow: hidden;
}

.sort-toggle button {
  background: #fff;
  border: none;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  border-right: 1px solid #ccc;
}

.sort-toggle button:last-child { border-right: none; }
.sort-toggle button.active { background: #1969d2; color: #fff; }

.property-section {
  margin-bottom: 16px;
  border-bottom: 1px solid #e6e6e6;
  padding-bottom: 12px;
}

.property-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}

.property-row-layer {
  color: #1969d2;
  text-decoration: none;
}

.property-row-layer:hover { text-decoration: underline; }
```

- [ ] **Step 4: Build + manual test**

```bash
npm run build
```

In Figma : vérifier le toggle, persistence après reload, rendu correct des deux modes.

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/style.css dist/code.js
git commit -m "feat(ui): sort toolbar with byLayer / byProperty toggle (Feature 4)

Sticky toolbar at the top of the panel with a segmented control.
State persisted in localStorage. Property mode flat-lists every
binding under property headings, with each row clickable to focus
the layer."
```

---

## Phase G — UX evolutions (search + filter + stats + swatch + rescan)

### Task G.1: Add ScanStats type + computeStats util

**Files:**
- Modify: `src/types.ts`
- Modify: `src/ui/utils.ts`
- Modify: `src/__tests__/ui/utils.test.ts`

- [ ] **Step 1: Add ScanStats type**

In `src/types.ts`:

```ts
export interface ScanStats {
  totalVariables: number;
  totalHardcoded: number;
  variableCoverage: number;        // 0..1
  byOrigin: { local: number; external: number };
  byType: { COLOR: number; FLOAT: number; STRING: number; BOOLEAN: number };
  layerCount: number;
  scanDurationMs: number;
}
```

- [ ] **Step 2: Write failing test for computeStats**

Append to `src/__tests__/ui/utils.test.ts`:

```ts
import { computeStats } from '../../ui/utils';

describe('computeStats', () => {
  it('returns zero stats for empty input', () => {
    const s = computeStats({}, [], 5);
    expect(s.totalVariables).toBe(0);
    expect(s.totalHardcoded).toBe(0);
    expect(s.variableCoverage).toBe(0);
    expect(s.scanDurationMs).toBe(5);
  });

  it('counts variables by origin and type', () => {
    const byLayer = {
      l1: [
        entry({ origin: 'local', type: 'COLOR' }),
        entry({ origin: 'external', type: 'FLOAT' }),
      ],
    };
    const s = computeStats(byLayer, [], 0);
    expect(s.totalVariables).toBe(2);
    expect(s.byOrigin).toEqual({ local: 1, external: 1 });
    expect(s.byType.COLOR).toBe(1);
    expect(s.byType.FLOAT).toBe(1);
  });

  it('calculates coverage as bound / (bound + hardcoded)', () => {
    const byLayer = { l1: [entry({}), entry({}), entry({}), entry({})] };
    const unbound = [{ layer: 'a', layerId: 'l1', property: 'Fill', value: 'rgb(0,0,0)' }];
    const s = computeStats(byLayer, unbound, 0);
    expect(s.variableCoverage).toBeCloseTo(4 / 5);
  });
});
```

- [ ] **Step 3: Run failing tests**

Run: `npx vitest run src/__tests__/ui/utils.test.ts -t computeStats`
Expected: FAIL.

- [ ] **Step 4: Implement computeStats**

In `src/ui/utils.ts`:

```ts
import { FullUsageEntry, UnboundUsage, ScanStats } from '../types';

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
    byType[e.type] = (byType[e.type] ?? 0) + 1;
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
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/__tests__/ui/utils.test.ts`
Expected: PASS, all green.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/ui/utils.ts src/__tests__/ui/utils.test.ts
git commit -m "feat(ui): computeStats util + ScanStats type

Pure aggregation: bound/unbound counts, coverage ratio, breakdown
by origin (local/external) and type (COLOR/FLOAT/STRING/BOOLEAN)."
```

### Task G.2: Compute stats in code.ts and emit in RenderMessage

**Files:**
- Modify: `src/types.ts` (extend RenderMessage)
- Modify: `src/code.ts`

- [ ] **Step 1: Extend RenderMessage**

```ts
export interface RenderMessage {
  type: 'render';
  byLayer: Record<string, FullUsageEntry[]>;
  unbound: UnboundUsage[];
  layerInfoMap: Record<string, LayerInfo>;
  noVariablesFound: boolean;
  stats: ScanStats;
  scanDurationMs: number;
}
```

- [ ] **Step 2: Compute and attach in runInspector**

Add timing + stats computation at the end of `runInspector`:

```ts
import { computeStats } from './ui/utils';

// at start of runInspector:
const startMs = Date.now();

// at end, before posting:
const scanDurationMs = Date.now() - startMs;
const stats = computeStats(byLayer, unboundUsages, scanDurationMs);

const msg: PluginToUIMessage = {
  type: 'render',
  byLayer,
  unbound: unboundUsages,
  layerInfoMap: Object.fromEntries(layerInfoMap),
  noVariablesFound: allUsages.length === 0 && unboundUsages.length === 0,
  stats,
  scanDurationMs,
};
figma.ui.postMessage(msg);
```

- [ ] **Step 3: Run tests + build**

```bash
npm run test
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/code.ts dist/code.js
git commit -m "feat(core): compute scan stats and include in RenderMessage

runInspector now times its own execution and computes ScanStats via
the shared util. Stats travel to the UI for the dashboard render."
```

### Task G.3: Render stats dashboard at top of UI

**Files:**
- Modify: `src/main.js`
- Modify: `src/style.css`

- [ ] **Step 1: Add stats render fn**

In `src/main.js`:

```js
function renderStats(stats) {
  const dashboard = document.createElement('div');
  dashboard.className = 'stats-dashboard';
  const coveragePct = Math.round(stats.variableCoverage * 100);
  dashboard.innerHTML = `
    <div class="stats-line">
      <strong>${stats.totalVariables}</strong> variables
      • <strong>${stats.totalHardcoded}</strong> hardcoded (${100 - coveragePct}%)
    </div>
    <div class="stats-line">
      <strong>${stats.byOrigin.local}</strong> local • <strong>${stats.byOrigin.external}</strong> external
    </div>
    <div class="stats-bar">
      <div class="stats-bar-fill" style="width: ${coveragePct}%"></div>
      <span class="stats-bar-label">Coverage : ${coveragePct}%</span>
    </div>
  `;
  return dashboard;
}
```

Call it inside `handleRenderMessage` before the toolbar:

```js
if (message.stats) app.appendChild(renderStats(message.stats));
```

- [ ] **Step 2: Style**

Append to `src/style.css`:

```css
.stats-dashboard {
  margin-bottom: 12px;
  padding: 8px 10px;
  background: #f7fafd;
  border-radius: 6px;
  border: 1px solid #e0e8f0;
}

.stats-line {
  font-size: 12px;
  color: #444;
  margin-bottom: 4px;
}

.stats-bar {
  position: relative;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  margin-top: 6px;
}

.stats-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #1969d2, #19a3d2);
  transition: width 0.3s ease;
}

.stats-bar-label {
  position: absolute;
  top: -16px;
  right: 0;
  font-size: 10px;
  color: #666;
}
```

- [ ] **Step 3: Build + manual test**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/main.js src/style.css dist/code.js
git commit -m "feat(ui): stats dashboard at top of panel

Renders totalVariables, totalHardcoded, byOrigin counts, and a
coverage progress bar. Reads stats from the new RenderMessage field."
```

### Task G.4: Add color swatch on COLOR pills

**Files:**
- Modify: `src/components.js` (createVariablePill)
- Modify: `src/style.css`

- [ ] **Step 1: Inject swatch in pill**

In `createVariablePill`, after `pill.appendChild(typeIcon)`:

```js
if (item.type === 'COLOR' && item.colorValue) {
  const swatch = document.createElement('span');
  swatch.className = 'color-swatch';
  swatch.style.backgroundColor = formatRGBA(item.colorValue);
  pill.insertBefore(swatch, typeIcon);
}
```

(Need to import `formatRGBA` if not already.)

- [ ] **Step 2: Style**

Append to `src/style.css`:

```css
.color-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  margin-right: 4px;
  background-image:
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-size: 6px 6px;
  background-position: 0 0, 0 3px, 3px -3px, -3px 0;
}
```

The checkerboard ensures transparent colors are still visible.

- [ ] **Step 3: Build + manual test**

```bash
npm run build
```
Verify color swatches appear before COLOR pills.

- [ ] **Step 4: Commit**

```bash
git add src/components.js src/style.css dist/code.js
git commit -m "feat(ui): color swatch on COLOR variable pills

12×12 swatch rendered before the type icon for COLOR variables that
have a resolved colorValue. Checkerboard background ensures
transparent colors are visible."
```

### Task G.5: Add rescan button + scan-start message

**Files:**
- Modify: `src/types.ts`
- Modify: `src/code.ts`
- Modify: `src/main.js`
- Modify: `src/style.css`

- [ ] **Step 1: Add new message types**

In `src/types.ts`:

```ts
export interface RescanMessage { type: 'rescan'; }
export interface ScanStartMessage { type: 'scan-start'; }

export type UIToPluginMessage = SelectNodeMessage | ResizeMessage | RescanMessage;
export type PluginToUIMessage = RenderMessage | ErrorMessage | ScanStartMessage;
```

- [ ] **Step 2: Handle rescan in code.ts**

In the `figma.ui.onmessage` handler:

```ts
} else if (msg.type === 'rescan') {
  updateInspector();
}
```

In `runInspector`, emit `scan-start` before the heavy work:

```ts
figma.ui.postMessage({ type: 'scan-start' } as PluginToUIMessage);
```

(Place this right after `resetDedupSets()`.)

- [ ] **Step 3: Render rescan button + spinner in main.js**

In `renderToolbar`, append a rescan button. Update `handlePluginMessage` to handle `scan-start`:

```js
case 'scan-start':
  document.querySelectorAll('.rescan-btn').forEach(b => b.classList.add('scanning'));
  break;
case 'render':
  document.querySelectorAll('.rescan-btn').forEach(b => b.classList.remove('scanning'));
  handleRenderMessage(message);
  break;
```

In the toolbar HTML:

```js
toolbar.innerHTML = `
  <div class="toolbar-row">
    <div class="sort-toggle">
      <button data-mode="byLayer">Par calque</button>
      <button data-mode="byProperty">Par propriété</button>
    </div>
    <button class="rescan-btn" title="Re-scan selection">⟳</button>
  </div>
`;
toolbar.querySelector('.rescan-btn').addEventListener('click', () => {
  parent.postMessage({ pluginMessage: { type: 'rescan' } }, '*');
});
```

- [ ] **Step 4: Style the spinner**

Append to `src/style.css`:

```css
.toolbar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rescan-btn {
  background: transparent;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 16px;
  color: #555;
  transition: color 0.15s, border-color 0.15s;
}

.rescan-btn:hover {
  color: #1969d2;
  border-color: #1969d2;
}

.rescan-btn.scanning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 5: Build + manual test**

```bash
npm run build
```
Verify the ⟳ button triggers a re-scan and animates while scanning.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/code.ts src/main.js src/style.css dist/code.js
git commit -m "feat(ui): rescan button + scan-start loading state

Toolbar gains a ⟳ button that posts a rescan message. The plugin
emits scan-start before runInspector so the button can spin during
long scans. selectionchange debounce already covers automatic scans;
rescan covers cases where the selection didn't change but Figma did."
```

### Task G.6: Add search + filter to toolbar (UI-only filtering)

**Files:**
- Modify: `src/main.js`
- Modify: `src/style.css`
- Modify: `src/ui/utils.ts`
- Modify: `src/__tests__/ui/utils.test.ts`

- [ ] **Step 1: Write failing test for filterUsages**

Append to `src/__tests__/ui/utils.test.ts`:

```ts
import { filterUsages } from '../../ui/utils';

describe('filterUsages', () => {
  it('matches case-insensitive on layer/property/name', () => {
    const e = entry({ layer: 'Card', property: 'Fill', name: 'color/primary' });
    expect(filterUsages([e], { search: 'card', types: [], origins: [] })).toHaveLength(1);
    expect(filterUsages([e], { search: 'PRIMARY', types: [], origins: [] })).toHaveLength(1);
    expect(filterUsages([e], { search: 'fill', types: [], origins: [] })).toHaveLength(1);
    expect(filterUsages([e], { search: 'nope', types: [], origins: [] })).toHaveLength(0);
  });

  it('filters by type when types array is non-empty', () => {
    const a = entry({ type: 'COLOR' });
    const b = entry({ type: 'FLOAT' });
    expect(filterUsages([a, b], { search: '', types: ['COLOR'], origins: [] })).toHaveLength(1);
    expect(filterUsages([a, b], { search: '', types: ['COLOR', 'FLOAT'], origins: [] })).toHaveLength(2);
  });

  it('filters by origin when origins array is non-empty', () => {
    const a = entry({ origin: 'local' });
    const b = entry({ origin: 'external' });
    expect(filterUsages([a, b], { search: '', types: [], origins: ['external'] })).toHaveLength(1);
  });

  it('combines filters with AND', () => {
    const a = entry({ layer: 'Card', type: 'COLOR', origin: 'local' });
    const b = entry({ layer: 'Card', type: 'FLOAT', origin: 'local' });
    expect(filterUsages([a, b], { search: 'card', types: ['COLOR'], origins: ['local'] })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npx vitest run src/__tests__/ui/utils.test.ts -t filterUsages`
Expected: FAIL.

- [ ] **Step 3: Implement filterUsages**

In `src/ui/utils.ts`:

```ts
export interface FilterState {
  search: string;
  types: Array<'COLOR' | 'FLOAT' | 'STRING' | 'BOOLEAN'>;
  origins: Array<'local' | 'external'>;
}

export function filterUsages(entries: FullUsageEntry[], filter: FilterState): FullUsageEntry[] {
  const q = filter.search.trim().toLowerCase();
  return entries.filter(e => {
    if (q && !(
      e.layer.toLowerCase().includes(q) ||
      e.property.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q)
    )) return false;
    if (filter.types.length > 0 && !filter.types.includes(e.type as FilterState['types'][number])) return false;
    if (filter.origins.length > 0 && !filter.origins.includes(e.origin)) return false;
    return true;
  });
}
```

- [ ] **Step 4: Wire up search + filter chips in main.js**

Extend `renderToolbar` to include a search input and chips. Apply filtering before `renderBody`. Persist filter state in `localStorage` keys `vi.filter.types`, `vi.filter.origins`, `vi.search`.

(Implementation is several dozen lines of DOM glue — follow the same structure as the existing toolbar render. Apply `filterUsages` to a flattened version of `byLayer` then re-bucket per layerId for the byLayer mode, or per-property for the byProperty mode.)

- [ ] **Step 5: Build + manual test**

```bash
npm run build
```
Verify search filters in real-time, chips toggle, state persists across reloads.

- [ ] **Step 6: Commit**

```bash
git add src/ui/utils.ts src/__tests__/ui/utils.test.ts src/main.js src/style.css dist/code.js
git commit -m "feat(ui): search + type/origin filter chips with localStorage persistence

Toolbar gains a search input (debounced 150 ms) and chips for type
and origin. filterUsages() pure util tested with 4 cases; UI plumbing
re-applies the filter and re-renders the body without re-scan."
```

---

## Phase H — Manual QA + bug fixes

### Task H.1: Run the manual checklist

**Files:** none

- [ ] **Step 1: Run the QA checklist from the design doc**

Open `docs/superpowers/specs/2026-05-10-ux-overhaul-design.md`, jump to the "QA manuel Figma" section, and tick each item live in Figma. Note any failure with file path + reproduction steps.

- [ ] **Step 2: Fix any failures**

For each failure: write a failing test if possible, fix the source, commit per the conventions table at the end of this plan.

- [ ] **Step 3: Update CLAUDE.md spec status**

In `CLAUDE.md`, in the "Feature Specification" section, append a status badge after each feature title:

- Feature 1 — implemented ✅
- Feature 2 — implemented ✅
- Feature 3 — implemented ✅
- Feature 4 — implemented ✅
- Feature 5 — implemented ✅
- Feature 6 — implemented ✅
- Feature 7 — implemented ✅

- [ ] **Step 4: Final verification**

```bash
npm run typecheck    # 0 errors
npm run test         # 140+ green
npm run test:cov     # ≥ 80% lines, ≥ 75% branches
npm run build        # exit 0, dist size < 200 KB
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: mark Features 1-7 as implemented after UX overhaul QA"
```

---

## Self-review checklist

After this plan is complete:

- [ ] Every spec section maps to one or more tasks (covered above):
  - Feature 3 → E.1–E.4
  - Feature 4 → F.1–F.2
  - Feature 7.1 → D.1–D.4
  - Feature 7.2 → covered by D.1 fingerprint test (divergent split)
  - Feature 7.3 → C.1, C.2
  - Property coverage gap → B.1–B.6
  - Search + filter → G.6
  - Stats → G.1, G.2, G.3
  - Color swatch → G.4
  - Rescan + debounce → A.1, G.5

- [ ] No "TBD" / "implement later" / "fill in details" placeholders.
- [ ] Function names consistent across tasks (`computeFingerprint`, `groupByFingerprint`, `regroupByProperty`, `filterUsages`, `computeStats`, `resolveVariablePath`).
- [ ] Type names consistent (`VariablePath`, `LayerInfo.count`, `LayerInfo.mergedNodeIds`, `ScanStats`, `FilterState`, `SortMode`).
- [ ] All new modules have at least one test file with multiple tests.
- [ ] Phase A has 2 quick wins to warm up; Phase H has the manual QA gate.

## Final validation gate

After Phase H is complete, the project should satisfy:

```
✓ npm run typecheck                  → 0 errors
✓ npm run test                        → ≥ 140 green
✓ npm run test:cov                    → ≥ 80% lines, ≥ 75% branches
✓ npm run build                       → exit 0
✓ Bundle: dist/code.js < 200 KB raw, < 50 KB gz
✓ All 16 manual QA items in design doc ticked
✓ CLAUDE.md feature statuses updated
```
