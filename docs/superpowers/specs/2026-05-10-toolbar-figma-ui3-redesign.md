# Toolbar redesign — Figma UI3 native aesthetic

**Status:** Approved, ready for implementation
**Date:** 2026-05-10
**Branch:** `feat/ux-overhaul`
**Related:** Features F.2 (sort toggle), G.5 (rescan), G.6 (search + filter chips) already ported in commits `2afd43a`, `6f178ce`, `9c230f6`, `43e3c4c`, `953bb22`.

## Context

The toolbar in `src/ui.html` (inline `renderToolbar()`) currently stacks 4 rows:

1. `<input class="search-input">` + `<button class="rescan-btn">⟳</button>`
2. `<div class="sort-toggle">` with `Par calque` / `Par propriété`
3. `<div class="filter-row">` with label `Type:` + chips `Color / Float / String / Bool`
4. `<div class="filter-row">` with label `Origine:` + chips `Local / External`

This stack consumes ≈140 px of a 300×400 panel — roughly 35% of the viewport before any layer-section renders. The CSS palette (accent `#1969d2`, font-size 16 px on `.rescan-btn`, mixed border styles) doesn't align with Figma's UI3 design system, so the panel feels foreign to the host environment.

## Goals

- Cut toolbar default height to ≈76 px (≈ −44 % vs current 140 px).
- Match Figma UI3 design tokens so the panel reads as native rather than third-party.
- Keep all existing controls reachable in ≤ 1 click — no feature removal.

## Non-goals

- No new functionality (search, filter, sort, rescan all already implemented).
- No icon library dependency — keep inline SVG stroke icons.
- No popover / floating panels — inline expand only.
- No persistent `filtersExpanded` state — collapsing on every render is acceptable.

## Design

### Layout (two rows by default)

```
┌────────────────────────────────────────────┐
│ [🔍 Rechercher           ]  [⟳]            │  row 1 (28 px)
│ [Calque|Propriété]              Filtres ▾  │  row 2 (28 px)
└────────────────────────────────────────────┘
                                                       ≈ 76 px (incl. padding)
```

Click `Filtres ▾` reveals chips inline below row 2 (push body down). Caret flips to `▴`. Second click collapses.

### Active filters state

`Filtres` button shows a blue badge `<span class="fg-badge">N</span>` whenever `filter.types.length + filter.origins.length > 0`. The search input value is reflected in its own state, not in the badge count, since the search field is always visible.

### Expanded panel

```
┌────────────────────────────────────────────┐
│ ...row 1 / row 2 unchanged...              │
│ ────────────────────────────────────────── │
│ TYPE     [Color] [Float] [String] [Bool]   │  filter row (24 px)
│ ORIGINE  [Local] [External]                │  filter row (24 px)
└────────────────────────────────────────────┘
                                                       ≈ 128 px (incl. padding)
```

Labels `TYPE` / `ORIGINE` rendered as `<span class="fg-flabel">` (10 px, color `#b3b3b3`, font-weight 500, fixed width 44 px so chips line up across rows).

### Design tokens (CSS variables)

Defined at top of `src/style.css` as variables so further polish stays single-source:

```css
:root {
  --fg-accent: #0d99ff;
  --fg-text: #1e1e1e;
  --fg-text-muted: #b3b3b3;
  --fg-border: #e6e6e6;
  --fg-bg: #ffffff;
  --fg-bg-soft: #f5f5f5;
  --fg-bg-hover: #ebebeb;
  --fg-radius: 6px;
  --fg-radius-pill: 999px;
}
```

The existing pill colours (`#e3f1ff` / `#1969d2` for local-variable, `#eee8ff` / `#6451cf` for external) stay untouched — they encode semantic content, not toolbar chrome.

### Component-level CSS

Each toolbar subcomponent gets a CSS class prefixed `fg-` (Figma-native). New / replaced classes:

| Class | Purpose | Key styles |
|---|---|---|
| `.toolbar` | Outer container | `padding: 8px; border-bottom: 1px solid var(--fg-border); background: var(--fg-bg);` |
| `.toolbar-row` | Row flex container | `display: flex; align-items: center; gap: 4px; margin-bottom: 4px;` (`:last-child` no margin) |
| `.fg-search` | Search input | Pill, 28 px high, bg `--fg-bg-soft`, padding-left 26 px for inline SVG, focus → bg white + border accent |
| `.fg-ghost` | Icon-only button (rescan, future) | 28×28, transparent, hover bg `--fg-bg-soft`, no border. SVG stroke 1.5 px, currentColor |
| `.fg-seg` | Segmented sort | Bg `--fg-bg-soft`, padding 2 px, radius 6 px. Active button = white card with subtle shadow |
| `.fg-filter-btn` | Filter trigger | Ghost-style, gap 4 px between label / badge / caret |
| `.fg-badge` | Active filter count | Min-width 14 px, height 14 px, bg `--fg-accent`, white text, font-size 9 px, font-weight 600 |
| `.fg-caret` | Chevron SVG | 10×10, stroke currentColor, opacity 0.6; `transform: rotate(180deg)` when expanded |
| `.fg-filters` | Expanded panel | Margin-top 6 px, padding-top 6 px, no top border (parent's row spacing is enough) |
| `.fg-frow` | Filter group row | Flex, gap 4 px, flex-wrap |
| `.fg-flabel` | Mini label `TYPE` / `ORIGINE` | 10 px, color `--fg-text-muted`, font-weight 500, min-width 44 px |
| `.fg-chip` | Filter chip | Pill, bg `--fg-bg-soft`, font-size 10 px, padding 3 px 9 px, no border; `.active` → bg `--fg-accent`, color white |

The old classes `.search-input`, `.rescan-btn`, `.sort-toggle`, `.filter-row`, `.filter-label`, `.chip` are removed from `src/style.css` once the JS stops emitting them (no callers remain after the JS update). The `.merge-badge` class for the layer-level × N badge is unchanged.

### Icons

Two inline SVGs only:

- **Search** (inside `.fg-search` background): magnifier (`circle r=8` + line). Stroke `#b3b3b3`.
- **Rescan**: refresh-arrow (`<path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>`), stroke `currentColor`, 14×14.
- **Caret**: `<polyline points="6 9 12 15 18 9"/>` 10×10, rotated 180° in expanded state.

The existing rescan button keeps its `.scanning` animation — apply `@keyframes spin` to `.fg-ghost.scanning svg` (rotate the inner SVG, not the button). Keeps hover bg static.

## JS changes

`src/ui.html` inline `renderToolbar()` is rewritten end-to-end:

1. HTML template uses the new `.fg-*` class names.
2. Rescan button becomes `<button class="fg-ghost">` with the refresh SVG inline (replaces the `⟳` text).
3. Sort toggle becomes `.fg-seg` with two `<button>` children. Active class moves from `<button data-mode>` to whichever has `data-mode === currentSort`.
4. Filter row is a single `<button class="fg-filter-btn">` carrying:
   - label text `Filtres`
   - optional `<span class="fg-badge">N</span>` when `filter.types.length + filter.origins.length > 0`
   - caret SVG
5. New module-level `let filtersExpanded = false;` controls whether the `.fg-filters` panel is rendered.
6. Filter button click handler toggles `filtersExpanded` and re-invokes `handlePluginMessage(lastRender)`. The panel is recreated on every render (cheap, no animation, behaviour matches the existing search/sort re-render flow).
7. Chips remain functional — click toggles in `filter.types` / `filter.origins`, persists via `setFilterState`, triggers re-render via `handlePluginMessage(lastRender)` (focus-preservation already in place from `43e3c4c`).
8. Search input class becomes `.fg-search`; placeholder loses the `🔍` emoji because the icon is in the background CSS.

The rescan button gets the additional class `fg-rescan` (so the markup is `<button class="fg-ghost fg-rescan">`). The existing `'scan-start'` handler updates from `document.querySelectorAll('.rescan-btn')` to `document.querySelectorAll('.fg-rescan')`. Same selector is referenced by the `.scanning` animation CSS (`.fg-rescan.scanning svg { animation: spin 1s linear infinite; }`) so a single stable hook drives both behaviours.

## File changes

| File | Change |
|---|---|
| `src/style.css` | Add `:root` token block. Add `.fg-*` class definitions. Remove obsolete classes (`.search-input`, `.rescan-btn`, `.sort-toggle button`, `.filter-row`, `.filter-label`, `.chip`). Keep `.toolbar` shell + `.toolbar-row` rules adapted to new spacing. |
| `src/ui.html` | Rewrite `renderToolbar()` HTML template + handlers per § JS changes. Add `let filtersExpanded = false` near the other module-level state. Update the scan-start handler selector. |

No changes to: plugin-thread code (`src/code.ts`, scanners, dedup), data types, message envelope, tests.

## Verification

End-to-end QA inside Figma (no automated UI tests available):

```bash
npm run typecheck
npm run test           # 153 tests stay green
npm run build
cp dist/code.js public/code.js
```

Then reload the plugin and verify:

1. Default state — search + rescan visible (row 1), sort segmented + `Filtres ▾` (row 2). Total toolbar height ≈ 76 px (measure via Figma's plugin viewport, or open dev-tools on the plugin and measure `.toolbar`).
2. Hover any ghost button → bg `#f5f5f5`. Hover `Filtres` → same.
3. Focus search input → bg becomes white, border becomes `#0d99ff`.
4. Click `Calque` / `Propriété` → segmented active card animates between segments. Persists across plugin sessions per `vi.sortMode`.
5. Click `Filtres ▾` → panel expands inline with `TYPE` row + `ORIGINE` row of chips. Caret flips to `▴`. Total height ≈ 128 px.
6. Click any chip → background becomes blue, text white. Badge `1` appears on `Filtres` button. Second click on same chip → reverts.
7. Click `Filtres ▴` → panel collapses, badge persists, caret flips back.
8. Type in search → focus stays in input across debounced re-renders (regression check for `43e3c4c`).
9. Click rescan ⟳ → SVG rotates (`.scanning` class). Stops once `'render'` message arrives.
10. Confirm `localStorage`-disabled fallback still works — pref persists during session even when storage throws (regression for `953bb22`).

## Risks / open questions

- **Light theme only.** The current plugin doesn't react to Figma's dark mode (no `figma-dark` class wired up). Out of scope here, but the token block in `:root` makes a dark-mode override trivial later — add `[data-theme="dark"] :root { ... }` when Figma's theme bridge is wired up.
- **Sort segmented active-card shadow.** `box-shadow: 0 1px 2px rgba(0,0,0,0.06)` is the only soft shadow in the design. If it looks heavy on light gray, drop to `0 0 0 1px rgba(0,0,0,0.04)` (inset-style ring).
- **Search icon contrast on light gray.** `#b3b3b3` on `#f5f5f5` is at the edge of WCAG AA for non-text content. Acceptable in Figma's native UI but flag if a user reports illegibility.

## References

- Existing styling: `src/style.css` lines 357–540 (current toolbar + chip rules).
- Existing renderer: `src/ui.html` `renderToolbar()` around lines 640–730.
- Visual companion mockup (deleted with `.superpowers/` after this work): `.superpowers/brainstorm/50634-1778443213/content/figma-native.html`.
