# Variable Inspector — CLAUDE.md

This file provides guidance to Claude Code when working on the **Variable Inspector** Figma plugin.

## Project Overview

Variable Inspector is a Figma plugin that helps designers audit the variable (design token) coverage of any selected frame, component, or screen. It surfaces which properties are bound to variables, which ones are hardcoded, and lets the user navigate and fix issues directly from the plugin panel.

## Build & Dev

```bash
# Install dependencies
npm install

# Dev mode (watch + rebuild on save)
npm run dev

# Production build
npm run build

# TypeScript check (no emit)
npm run typecheck

# Tests
npm run test          # one-shot
npm run test:watch    # watch mode
npm run test:cov      # with coverage
```

Build output goes to `dist/`. Load the plugin in Figma via **Plugins → Development → Import plugin from manifest** pointing to `dist/manifest.json`.

The **source of truth** for the manifest is `public/manifest.json` — Vite copies it to `dist/` on build. Edit the source, never the built copy.

## Architecture

```
src/
├── code.ts              # Plugin-thread entry — message bus, scan orchestration
├── nodeScanner.ts       # Node-tree traversal + bound-variable collection
├── unboundDetector.ts   # Detects hardcoded (non-variabilized) properties
├── variableLoader.ts    # Async resolution of VariableAlias chains, local/external classification
├── dedup.ts             # Duplicate-instance fingerprinting + merging
├── constants.ts         # Shared constants (depth caps, property tables)
├── types.ts             # Shared TypeScript types (BoundProperty, ScanResult, etc.)
├── types.d.ts           # Asset type declarations (CSS/HTML imports)
├── utils/logger.ts      # No-op logger in production
├── ui.html              # Plugin panel shell (inlined scripts + styles)
├── ui.js                # UI rendering logic — builds DOM from plugin messages
├── main.js              # UI bootstrap, message routing, panel resize
├── components.js        # Reusable UI component factories
├── style.css            # Plugin panel styling
├── __mocks__/figma.ts   # Vitest Figma API mock
└── __tests__/*.test.ts  # Unit tests (vitest)
```

**Communication pattern**: `code.ts` (plugin thread) ↔ `postMessage` ↔ UI thread (`main.js` / `ui.js`).
Never call Figma API from the UI thread.

## Feature Specification

These are the required features. Any code change must not regress them.

### 1 — Variables used in selection
Scan the entire node tree of the selection and collect every bound variable (color, float, string, boolean). Group results by layer, then by property type.

### 2 — Non-variabilized properties
For each supported property that is hardcoded (not bound to a variable), report it as a warning with its raw value.
Supported property families: fills, strokes, effects, text styles, spacing (padding, gap), corner radii, dimensions (width, height).

### 3 — Variable path on click
Clicking a variable pill must display its full resolution path: local collection → (library file if external) → variable group → variable name.
This requires resolving `VariableAlias` chains.

### 4 — Sort by frame/component and by type
Results must be organizable both by the containing frame/component and by property type (color, spacing, typography, etc.). Default sort: by frame hierarchy.

### 5 — Local vs external visual differentiation
Variables from the current file's collections are **local**. Variables resolved from a linked library are **external**. Each must have a distinct visual treatment (badge, icon, or color accent).

### 6 — One-click element targeting
Every reported layer (variable or non-variabilized) must have a "focus" action: clicking it calls `figma.viewport.scrollAndZoomIntoView([node])` and sets `figma.currentPage.selection = [node]`.

### 7 — Duplicate handling
- **Identical instances** (same component, same props, same variabilization) → merge into a single row and show a count badge.
- **Divergent instances** (same component, different variabilization) → show as separate rows, never merge.
- **Repeated properties** within one node (e.g., multiple Drop Shadows) → label them `Drop Shadow 1`, `Drop Shadow 2`, etc. with individual values.

## Code Quality Rules

- TypeScript strict mode is **always on** (`tsconfig.json`). No `any`, no `@ts-ignore` without an explanatory comment.
- All public functions must have JSDoc comments.
- Keep `code.ts` focused on data collection only — no rendering logic.
- Keep UI files focused on rendering — no direct Figma API calls.
- Extract shared types to a dedicated `src/types.ts` file.
- Max function length: 60 lines. Extract helpers aggressively.
- No `console.log` in production builds — use a `logger` utility that is a no-op in production.

## Testing

Tests live in `src/__tests__/` and use **Vitest**.

```bash
npm run test        # run all tests
npm run test:watch  # watch mode
```

Every utility function in the plugin-thread modules (`nodeScanner.ts`, `unboundDetector.ts`, `dedup.ts`, `variableLoader.ts`) must have a unit test. Mock the Figma API with the `@figma/plugin-typings` types + the local `__mocks__/figma.ts` file. Target ≥ 80 % coverage on `src/` (UI files exempt).

## File Naming

- Source files: `camelCase.ts` / `camelCase.js`
- Test files: `camelCase.test.ts`
- No default exports — always named exports (except Vite entry points).

## Commit Convention

Follow **Conventional Commits**:

```
feat(ui): add local/external variable badge
fix(core): resolve VariableAlias chain correctly
refactor(code): extract property-scanner into separate module
test(core): add unit tests for duplicate detection
docs: update CLAUDE.md feature spec
```

Prefixes: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`.

## Key Figma API Concepts

- `node.boundVariables` — map of property → `VariableAlias | VariableAlias[]`
- `figma.variables.getLocalVariableCollectionsAsync()` — all local collections
- `figma.variables.getVariableByIdAsync(id)` — resolve a variable by ID
- `VariableAlias.type === 'VARIABLE_ALIAS'` + `VariableAlias.id` — use to follow chains
- `figma.viewport.scrollAndZoomIntoView([node])` — focus a node in the canvas
- Variable scope: check `variable.resolvedType` for COLOR / FLOAT / STRING / BOOLEAN

## Common Pitfalls

- `getVariableByIdAsync` can return `null` for variables from unpublished external libraries — handle gracefully.
- `boundVariables` for effects is an array — iterate over each effect, not just index 0.
- Avoid synchronous Figma API calls — the async variants are always preferred.
- Figma plugin thread has no access to `window`, `document`, or the DOM.
- `dist/code.js` and `dist/manifest.json` are tracked in git for plugin distribution — `npm run build` rewrites them, commit the result.

## graphify (knowledge graph)

Optional. If `graphify-out/` exists, read `graphify-out/GRAPH_REPORT.md` before exploring the codebase. For cross-cutting questions: `/graphify query "<question>"`.

- Code commits → post-commit hook auto-runs AST extraction (no LLM cost). Install once with `graphify hook install`.
- Docs / spec / new feature → run `/graphify . --update` manually.
- `graphify-out/` is gitignored — local artefact only.
