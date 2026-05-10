---
description: Diagnose and fix build or TypeScript errors until the project compiles cleanly.
---

# /build-fix

## Goal

Get the project to a clean build state: zero TypeScript errors and a successful `npm run build` output.

## Workflow

```
1. Run `npx tsc --noEmit` — capture all TypeScript errors
2. Run `npm run build` — capture any Vite/rollup build errors
3. Triage errors by severity and root cause
4. Fix errors from most fundamental to most derived (fixing one often resolves others)
5. Re-run both checks after each batch of fixes
6. Repeat until both commands exit with code 0
7. Run `npm run test` to verify no regressions were introduced
```

## Common Error Patterns

### TypeScript errors

| Error | Likely cause | Fix |
|-------|-------------|-----|
| `Property does not exist on type` | Wrong node type assumed | Add type guard before property access |
| `Argument of type X is not assignable to Y` | Missing type cast or wrong function signature | Check the types.ts definition and align |
| `Object is possibly null` | Missing null check after async Figma call | Add `if (!result) return …` guard |
| `Cannot find module` | Missing or wrong import path | Check file exists, verify relative path |
| `Type any is not allowed` | Strict mode violation | Replace with proper type or `unknown` |

### Build errors

| Error | Likely cause | Fix |
|-------|-------------|-----|
| `Rollup failed to resolve import` | Package not installed or wrong path | Run `npm install` or fix the import |
| `Circular dependency` | Two modules import each other | Extract shared code to a third module |
| `Entry point not found` | `vite.config.ts` entry path wrong | Check that `src/code.ts` exists |

## Constraints

- Fix the code, never disable TypeScript checks (`// @ts-ignore`, `strict: false`) without a comment.
- Do not introduce new `any` types to silence errors.
- If a fix requires adding a new dependency, confirm with the user first.

## Commit Template

```
fix(build): <description of what broke and how it was fixed>
```
