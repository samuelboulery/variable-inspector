---
description: Refactor the codebase to improve quality, readability, and maintainability without changing behaviour.
---

# /refactor

## Goal

Improve the internal quality of the Variable Inspector codebase without changing any external behaviour or features. All tests must still pass after the refactor.

## Scope

Unless the user specifies a particular file or module, apply the following improvements across the whole `src/` directory:

1. **Extract types** — Move all inline type definitions and interfaces to `src/types.ts`. Remove duplicates.
2. **Split large functions** — Any function longer than 60 lines must be broken into smaller, named helpers.
3. **Split large files** — Any file longer than 300 lines must be reorganised into logical sub-modules.
4. **Eliminate `any`** — Replace every `any` with a proper type or `unknown` + type guard.
5. **Add JSDoc** — All exported functions must have a JSDoc comment explaining purpose, params, and return value.
6. **Replace `console.log`** — Swap all direct `console.*` calls with the `logger` utility. Create `src/utils/logger.ts` if it does not exist.
7. **Pure functions** — Where possible, extract side-effect-free logic out of functions that also do Figma API calls.
8. **Dead code** — Remove any commented-out code blocks, unreachable branches, or unused imports/exports.

## Workflow

```
1. Read the file(s) to be refactored
2. Identify all violations of the rules above
3. Plan the changes (list them before editing)
4. Apply changes one file at a time
5. After each file: run `npx tsc --noEmit` to verify TypeScript validity
6. After all files: run `npm run test` to confirm no regressions
7. Run `npm run build` to confirm the plugin still compiles
```

## Constraints

- Do **not** change any message types between plugin thread and UI thread without updating both sides.
- Do **not** rename exported symbols without updating all import sites.
- Do **not** change the Figma manifest or permissions.
- Do **not** add new npm dependencies without asking the user first.

## Commit Template

```
refactor(<scope>): <what changed and why>
```

Example: `refactor(core): extract variable-resolver into separate module`
