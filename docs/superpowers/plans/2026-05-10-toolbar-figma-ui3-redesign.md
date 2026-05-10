# Toolbar Figma UI3 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four-row Variable Inspector toolbar with a two-row Figma UI3 design that collapses filter chips behind an expand button and matches Figma's native design tokens.

**Architecture:** Pure CSS + inline-JS change inside `src/style.css` and `src/ui.html`. No plugin-thread changes, no new tests, no new files. The toolbar is rebuilt from scratch in `renderToolbar()`; CSS is reorganised around a `:root` token block and `.fg-*` class namespace.

**Tech Stack:** Vanilla CSS variables, inline `<svg>` icons, inline-script DOM construction (no framework). Existing localStorage helpers with try/catch fallbacks (from commits `953bb22`, `9c230f6`) stay untouched.

**Testing note:** The toolbar is part of the inline UI script and has no unit-test coverage. Verification relies on (a) the existing 153-test plugin-thread suite still passing and (b) the manual QA checklist from the spec, executed once in Figma after the build is loaded. The plan ends with that checklist as Task 6.

---

### Task 1: Add CSS design tokens at top of `src/style.css`

**Files:**
- Modify: `src/style.css` (insert before line 1)

- [ ] **Step 1: Insert the `:root` token block at the very top of the stylesheet**

Edit `src/style.css` and prepend the following before the existing `body { ... }` rule:

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

- [ ] **Step 2: Verify no other CSS rule depends on these names**

Run: `grep -n "var(--fg-" src/style.css src/ui.html`
Expected: only the lines just added in step 1 (no pre-existing references).

- [ ] **Step 3: Confirm build still clean**

Run: `npm run typecheck && npm run build`
Expected: typecheck silent, build succeeds, bundle size unchanged (CSS additive).

- [ ] **Step 4: Commit**

```bash
git add src/style.css
git commit -m "style: introduce Figma UI3 design tokens in :root"
```

---

### Task 2: Add the new `.fg-*` CSS rules

**Files:**
- Modify: `src/style.css` (append at end of file, after the existing `.empty-state` rule on line 546)

- [ ] **Step 1: Append the new component rules**

Append the following at the end of `src/style.css`:

```css

/* ==========================================================================
   Figma UI3 toolbar — replaces the legacy .search-input / .rescan-btn /
   .sort-toggle / .filter-row / .chip rules. The legacy rules are removed
   in a follow-up commit once renderToolbar() emits the new markup.
   ========================================================================== */

.fg-search {
  flex: 1;
  height: 28px;
  padding: 0 8px 0 26px;
  border: 1px solid transparent;
  border-radius: var(--fg-radius);
  background: var(--fg-bg-soft) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23b3b3b3' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'/><line x1='21' y1='21' x2='16.65' y2='16.65'/></svg>") no-repeat 8px center;
  font-size: 11px;
  color: var(--fg-text);
  font-family: inherit;
  transition: background-color 0.1s, border-color 0.1s;
}
.fg-search::placeholder { color: var(--fg-text-muted); }
.fg-search:focus {
  outline: none;
  background-color: var(--fg-bg);
  border-color: var(--fg-accent);
}

.fg-ghost {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--fg-radius);
  background: transparent;
  cursor: pointer;
  color: var(--fg-text);
  transition: background 0.1s;
}
.fg-ghost:hover { background: var(--fg-bg-soft); }
.fg-ghost svg {
  width: 14px;
  height: 14px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.5;
}

.fg-rescan.scanning svg { animation: spin 1s linear infinite; }

.fg-seg {
  display: inline-flex;
  background: var(--fg-bg-soft);
  border-radius: var(--fg-radius);
  padding: 2px;
}
.fg-seg button {
  border: none;
  background: transparent;
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
  color: var(--fg-text);
  font-family: inherit;
  font-weight: 400;
  border-radius: 4px;
  transition: background 0.1s;
}
.fg-seg button.active {
  background: var(--fg-bg);
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.fg-filter-btn {
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  border: none;
  border-radius: var(--fg-radius);
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  color: var(--fg-text);
  font-family: inherit;
  transition: background 0.1s;
}
.fg-filter-btn:hover { background: var(--fg-bg-soft); }
.fg-filter-btn .fg-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  height: 14px;
  padding: 0 4px;
  border-radius: 7px;
  background: var(--fg-accent);
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
}
.fg-filter-btn .fg-caret {
  width: 10px;
  height: 10px;
  opacity: 0.6;
  stroke: currentColor;
  fill: none;
  stroke-width: 2;
}
.fg-filter-btn[data-expanded="true"] .fg-caret { transform: rotate(180deg); }

.fg-filters {
  margin-top: 6px;
  padding: 6px 0 2px 0;
}
.fg-frow {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.fg-frow:last-child { margin-bottom: 0; }
.fg-flabel {
  font-size: 10px;
  color: var(--fg-text-muted);
  min-width: 44px;
  font-weight: 500;
}

.fg-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border: none;
  border-radius: var(--fg-radius-pill);
  background: var(--fg-bg-soft);
  font-size: 10px;
  color: var(--fg-text);
  cursor: pointer;
  font-family: inherit;
  font-weight: 400;
  transition: background 0.1s, color 0.1s;
}
.fg-chip:hover { background: var(--fg-bg-hover); }
.fg-chip.active {
  background: var(--fg-accent);
  color: #fff;
}
```

- [ ] **Step 2: Verify the rules parse**

Run: `npm run build`
Expected: build succeeds. Bundle grows by ≈1–2 KB (new CSS string embedded in `code.js`).

- [ ] **Step 3: Confirm no class name collision with existing markup**

Run: `grep -nE "class=\"[^\"]*(fg-search|fg-ghost|fg-rescan|fg-seg|fg-filter-btn|fg-badge|fg-caret|fg-filters|fg-frow|fg-flabel|fg-chip)" src/ui.html`
Expected: zero matches — the new classes are not yet emitted by `renderToolbar()`.

- [ ] **Step 4: Commit**

```bash
git add src/style.css
git commit -m "style: add .fg-* component rules for Figma UI3 toolbar"
```

---

### Task 3: Rewrite `renderToolbar()` to emit the new markup

**Files:**
- Modify: `src/ui.html` lines ≈ 690–730 (`function renderToolbar() { ... }`)

- [ ] **Step 1: Locate the current function**

Run: `grep -n "function renderToolbar" src/ui.html`
Expected: a single match (currently at line 690).

- [ ] **Step 2: Replace the function body**

In `src/ui.html`, find the existing `function renderToolbar() { ... }` block. The block currently starts at `function renderToolbar() {` and ends at the closing `}` followed by the `// Applique le filter state` comment for `matchesFilter`. Replace the entire function (from `function renderToolbar() {` through its closing `}` brace, but not beyond) with:

```javascript
    function renderToolbar() {
      const toolbar = document.createElement('div');
      toolbar.className = 'toolbar';
      const filter = getFilterState();
      const activeFilterCount = filter.types.length + filter.origins.length;
      const expanded = filtersExpanded;
      toolbar.innerHTML = `
        <div class="toolbar-row">
          <input class="fg-search" type="text" placeholder="Rechercher" value="${escapeHtml(filter.search)}" />
          <button class="fg-ghost fg-rescan" title="Re-scan selection" aria-label="Re-scan">
            <svg viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          </button>
        </div>
        <div class="toolbar-row">
          <div class="fg-seg">
            <button data-mode="byLayer">Calque</button>
            <button data-mode="byProperty">Propriété</button>
          </div>
          <span style="flex:1"></span>
          <button class="fg-filter-btn" data-expanded="${expanded ? 'true' : 'false'}" aria-expanded="${expanded ? 'true' : 'false'}">
            Filtres${activeFilterCount > 0 ? ` <span class="fg-badge">${activeFilterCount}</span>` : ''}
            <svg class="fg-caret" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>
        ${expanded ? `
        <div class="fg-filters">
          <div class="fg-frow">
            <span class="fg-flabel">Type</span>
            <button class="fg-chip" data-filter="type" data-value="COLOR">Color</button>
            <button class="fg-chip" data-filter="type" data-value="FLOAT">Float</button>
            <button class="fg-chip" data-filter="type" data-value="STRING">String</button>
            <button class="fg-chip" data-filter="type" data-value="BOOLEAN">Bool</button>
          </div>
          <div class="fg-frow">
            <span class="fg-flabel">Origine</span>
            <button class="fg-chip" data-filter="origin" data-value="local">Local</button>
            <button class="fg-chip" data-filter="origin" data-value="external">External</button>
          </div>
        </div>` : ''}
      `;

      toolbar.querySelector('.fg-rescan').addEventListener('click', () => {
        parent.postMessage({ pluginMessage: { type: 'rescan' } }, '*');
      });

      const currentSort = getSortMode();
      toolbar.querySelectorAll('.fg-seg button').forEach(btn => {
        if (btn.dataset.mode === currentSort) btn.classList.add('active');
        btn.addEventListener('click', () => {
          if (btn.dataset.mode === getSortMode()) return;
          setSortMode(btn.dataset.mode);
          if (lastRender) handlePluginMessage(lastRender);
        });
      });

      toolbar.querySelector('.fg-filter-btn').addEventListener('click', () => {
        filtersExpanded = !filtersExpanded;
        if (lastRender) handlePluginMessage(lastRender);
      });

      toolbar.querySelectorAll('.fg-chip').forEach(chip => {
        const f = chip.dataset.filter;
        const v = chip.dataset.value;
        const arr = f === 'type' ? filter.types : filter.origins;
        if (arr.includes(v)) chip.classList.add('active');
        chip.addEventListener('click', () => {
          const cur = getFilterState();
          const target = f === 'type' ? cur.types : cur.origins;
          const idx = target.indexOf(v);
          if (idx >= 0) target.splice(idx, 1); else target.push(v);
          setFilterState(cur);
          if (lastRender) handlePluginMessage(lastRender);
        });
      });

      let searchTimer = null;
      const searchInput = toolbar.querySelector('.fg-search');
      searchInput.addEventListener('input', (ev) => {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          const cur = getFilterState();
          cur.search = ev.target.value;
          setFilterState(cur);
          if (lastRender) handlePluginMessage(lastRender);
        }, 150);
      });

      return toolbar;
    }
```

- [ ] **Step 3: Confirm the only remaining `.search-input` / `.rescan-btn` / etc. references are in the now-obsolete CSS**

Run: `grep -n "class=\"search-input\"\|class=\"rescan-btn\"\|class=\"sort-toggle\"\|class=\"filter-row\"\|class=\"filter-label\"\|class=\"chip\"" src/ui.html`
Expected: zero matches.

- [ ] **Step 4: Verify the script still parses**

Run:
```bash
awk '/<script>/{flag=1; next} /<\/script>/{flag=0} flag' src/ui.html > /tmp/ui_script.js && node --check /tmp/ui_script.js
```
Expected: silent success.

- [ ] **Step 5: Don't commit yet — Task 4 finishes the JS side**

The rescan handler at line ≈ 920 still queries `.rescan-btn`. Task 4 fixes that. Hold the commit so the rescan spinner doesn't break between commits.

---

### Task 4: Update scan-start handler + add `filtersExpanded` module state

**Files:**
- Modify: `src/ui.html` (1 line near the existing `let lastRender = null;` declaration, 1 line in the `scan-start` branch of `handlePluginMessage`)

- [ ] **Step 1: Add the module-level `filtersExpanded` flag**

Find the existing line (currently around line 155):
```javascript
    let lastRender = null;
```

Replace it with:
```javascript
    let lastRender = null;
    let filtersExpanded = false;
```

- [ ] **Step 2: Update the scan-start handler selector**

Find the line (currently around line 920):
```javascript
        document.querySelectorAll('.rescan-btn').forEach(b => b.classList.add('scanning'));
```

Replace with:
```javascript
        document.querySelectorAll('.fg-rescan').forEach(b => b.classList.add('scanning'));
```

- [ ] **Step 3: Verify only one rescan selector remains**

Run: `grep -n "rescan-btn\|fg-rescan" src/ui.html`
Expected: only the `.fg-rescan` references introduced in Task 3 + Task 4 step 2. Zero `.rescan-btn` references.

- [ ] **Step 4: Verify the script still parses**

Run:
```bash
awk '/<script>/{flag=1; next} /<\/script>/{flag=0} flag' src/ui.html > /tmp/ui_script.js && node --check /tmp/ui_script.js
```
Expected: silent success.

- [ ] **Step 5: Verify the existing test suite still passes**

Run: `npm run typecheck && npm run test`
Expected: typecheck silent, 153 tests pass.

- [ ] **Step 6: Build + sync `public/code.js`**

Run:
```bash
npm run build
cp dist/code.js public/code.js
```
Expected: build succeeds, file copied.

- [ ] **Step 7: Commit both Task 3 + Task 4 changes**

```bash
git add src/ui.html dist/code.js
git commit -m "feat(ui): rebuild toolbar with Figma UI3 markup + filtersExpanded state"
```

---

### Task 5: Remove obsolete CSS rules

**Files:**
- Modify: `src/style.css` (delete lines previously occupied by `.sort-toggle`, `.rescan-btn`, `.search-input`, `.filter-row`, `.filter-label`, `.chip` rules)

- [ ] **Step 1: Confirm no JS still emits the old class names**

Run: `grep -nE "(\b|=\")(search-input|rescan-btn|sort-toggle|filter-row|filter-label|chip)\b" src/ui.html`
Expected: zero matches (Task 3 already removed them).

- [ ] **Step 2: Delete the obsolete rules from `src/style.css`**

Delete these specific rule blocks (line numbers refer to the file state immediately before this task; verify by content, not line number, in case prior tasks shifted them):

- `.sort-toggle { ... }` rule
- `.sort-toggle button { ... }` rule
- `.sort-toggle button:last-child { ... }` rule
- `.sort-toggle button.active { ... }` rule
- `.rescan-btn { ... }` rule
- `.rescan-btn:hover { ... }` rule
- `.rescan-btn.scanning { ... }` rule (NOTE: `.fg-rescan.scanning svg` in the new ruleset replaces this)
- `.search-input { ... }` rule
- `.search-input:focus { ... }` rule
- `.filter-row { ... }` rule
- `.filter-label { ... }` rule
- `.chip { ... }` rule
- `.chip:hover { ... }` rule
- `.chip.active { ... }` rule

**Keep:**
- `.toolbar { ... }` (the sticky container is still needed)
- `.toolbar-row { ... }` (still used in the new markup)
- `@keyframes spin { ... }` (referenced by both old `.rescan-btn.scanning` and new `.fg-rescan.scanning svg` — the new rule is the only caller now, do not delete the keyframes)
- All other unrelated rules (`.property-section`, `.stats-dashboard`, etc.)

- [ ] **Step 3: Sanity check — no orphan selectors**

Run:
```bash
grep -nE "^\.(search-input|rescan-btn|sort-toggle|filter-row|filter-label|chip)\b" src/style.css
```
Expected: zero matches.

Run:
```bash
grep -n "@keyframes spin" src/style.css
```
Expected: exactly one match.

- [ ] **Step 4: Verify build + tests still green**

Run: `npm run typecheck && npm run test && npm run build`
Expected: typecheck silent, 153 tests pass, build succeeds.

- [ ] **Step 5: Sync `public/code.js`**

Run: `cp dist/code.js public/code.js`

- [ ] **Step 6: Commit**

```bash
git add src/style.css dist/code.js
git commit -m "style: drop obsolete toolbar CSS rules superseded by .fg-*"
```

---

### Task 6: Manual QA in Figma (no automated UI tests)

**Files:** None (verification only).

This task is a checklist run inside Figma after the build. The user must execute it; the agent cannot automate browser-in-Figma testing.

- [ ] **Step 1: Reload the plugin in Figma**

Plugins → Development → Variable Inspector → Run (or Rerun last plugin via Cmd+Opt+P).

- [ ] **Step 2: Verify the 10 acceptance checks from the spec**

Quoting `docs/superpowers/specs/2026-05-10-toolbar-figma-ui3-redesign.md` § Verification, run through each item and confirm:

1. Default state: search + rescan visible (row 1), sort segmented + `Filtres ▾` (row 2). Total toolbar height ≈ 76 px.
2. Hover any ghost button → bg `#f5f5f5`. Hover `Filtres` → same.
3. Focus search input → bg becomes white, border becomes `#0d99ff`.
4. Click `Calque` / `Propriété` → segmented active card moves between segments. Persists across plugin sessions per `vi.sortMode` (only when localStorage works; in-session fallback covers `data:` URL case).
5. Click `Filtres ▾` → panel expands inline with `TYPE` row + `ORIGINE` row of chips. Caret flips to `▴`. Total height ≈ 128 px.
6. Click any chip → background becomes blue, text white. Badge `1` appears on `Filtres` button. Second click on same chip → reverts.
7. Click `Filtres ▴` → panel collapses, badge persists, caret flips back.
8. Type in search → focus stays in input across debounced re-renders (regression check for commit `43e3c4c`).
9. Click rescan ⟳ → SVG rotates (`.scanning` class). Stops once a `render` message arrives.
10. Confirm `localStorage`-disabled fallback still works — sort + filter prefs persist *during* the session even when storage throws (regression for commit `953bb22`).

- [ ] **Step 3: If any check fails**

Capture the failing behaviour (screenshot or text description) and report back. Common failure modes to look for first:
  - Selector typo on `.fg-rescan` (Task 4 step 2) — spinner doesn't animate.
  - `filtersExpanded` not toggling — verify it's declared at module scope, not inside `renderToolbar`.
  - Search focus loss — confirm the focus-restore block from commit `43e3c4c` was preserved by the rewrite.

- [ ] **Step 4: If all checks pass, mark feature done**

No further commit required. The feature branch `feat/ux-overhaul` is ready for whatever integration step the user chooses (PR, merge, more work).

---

## Self-review notes (for the engineer)

- **Spec coverage:** every section in the spec (layout, design tokens, expanded panel, JS changes, file changes, verification) is addressed by tasks 1–6. No requirement is left dangling.
- **Type / selector consistency:** rescan button class is `fg-ghost fg-rescan` across Task 3 (markup), Task 2 step 1 (`.fg-rescan.scanning svg`), and Task 4 step 2 (handler selector). Filter button has `data-expanded` attribute consumed by `.fg-filter-btn[data-expanded="true"] .fg-caret` rotation rule.
- **Risk callouts from spec:** dark-mode and shadow weight are flagged as out-of-scope by the spec; do not extend the plan to cover them. Search-icon contrast risk is observational only — no remediation task.
- **No new tests:** the existing 153-test suite is the regression net; the toolbar inline JS has no unit-test coverage on purpose. Task 6 is the user-acceptance test.
