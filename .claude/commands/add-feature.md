---
description: Implement a new feature for the Variable Inspector plugin following the full TDD workflow.
---

# /add-feature

## Goal

Implement one of the features defined in CLAUDE.md, or a new feature described by the user, with tests, proper typing, and clean integration into the existing architecture.

## Before Starting

Confirm the following with the user if not specified:
- Which feature exactly (reference the spec number in CLAUDE.md if applicable)
- Whether it's a plugin-thread feature (data), UI feature (rendering), or both
- Any design/UX details not covered in CLAUDE.md

## Workflow

```
1. Read CLAUDE.md — understand the full feature spec
2. Read the relevant existing source files to understand current architecture
3. Draft a plan: list files to create/modify and the data shapes needed
4. Write the type definitions first (src/types.ts)
5. Write unit tests for the core logic (TDD approach)
6. Implement the plugin-thread logic in code.ts (or a new module)
7. Add the message type to the plugin ↔ UI message bus
8. Implement the UI rendering
9. Run tests: npm run test
10. Run build: npm run build
11. Describe how to manually test in Figma
```

## Feature Checklist

Before marking a feature done, confirm:

- [ ] Typed: all new functions and data shapes have explicit TypeScript types
- [ ] Tested: unit tests cover the core logic, edge cases included
- [ ] Documented: JSDoc on all exported functions
- [ ] Thread-safe: no Figma API calls from UI thread; no DOM access from plugin thread
- [ ] Null-safe: handles `null` returns from `getVariableByIdAsync`
- [ ] Error-handled: errors surface to the user via the ERROR message type
- [ ] No regressions: existing tests still pass
- [ ] Builds: `npm run build` exits with code 0

## Feature-specific Notes

### Feature 3 — Variable path on click
- Resolve `VariableAlias` chains iteratively (not recursively) with a depth cap.
- The path must include: collection name → (library file name if external) → variable group → variable name.
- Send the resolved path to the UI as a structured array, not a formatted string.

### Feature 5 — Local vs external differentiation
- A variable is **external** if `variable.variableCollectionId` does not appear in the IDs returned by `getLocalVariableCollectionsAsync()`.
- Cache the set of local collection IDs once per scan session.

### Feature 6 — One-click targeting
- The UI sends a `{ type: 'FOCUS_NODE', payload: { nodeId: string } }` message.
- `code.ts` handles it: `figma.currentPage.selection = [node]` then `figma.viewport.scrollAndZoomIntoView([node])`.
- If `nodeId` is not found on the current page, send back an error message.

### Feature 7 — Duplicate handling
- Build a stable fingerprint for each node's variabilization state (sorted JSON of bound + unbound props).
- Group by `(componentId or nodeType+name, fingerprint)`.
- Same fingerprint → merge + count badge. Different fingerprint → separate rows.

## Commit Template

```
feat(<scope>): <feature description>
```

Examples:
```
feat(core): resolve VariableAlias chains for path display
feat(ui): add one-click node targeting with zoom
feat(core): merge duplicate instances with identical variabilization
```
