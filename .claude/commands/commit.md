---
description: Stage, lint, and commit current changes following the project's Conventional Commits convention with required pre-commit checks.
---

# /commit

## Goal

Produce a single, well-scoped Conventional Commit that compiles, type-checks, and passes tests — never bypass hooks.

## Pre-Commit Gate (mandatory, in order)

```
1. git status                  → confirm what's staged vs unstaged
2. git diff --staged           → review the actual change content
3. npm run typecheck           → must exit 0
4. npm run test                → must exit 0
5. npm run build               → must exit 0 (rewrites dist/, may need restage)
6. If dist/ changed → git add dist/code.js dist/manifest.json
```

If any step fails: stop, surface the error, do not commit.

## Commit Message

Format: `<type>(<scope>): <subject>`

| Type | When |
|---|---|
| `feat` | New behaviour visible to the user |
| `fix` | Bug fix |
| `refactor` | Internal change, behaviour unchanged |
| `test` | Test-only change |
| `docs` | Docs / CLAUDE.md / READMEs |
| `chore` | Tooling, config, dependencies |
| `perf` | Performance improvement |

Scopes commonly used in this repo: `core`, `ui`, `build`, `test`, `docs`.

Subject rules:
- ≤ 72 characters
- Imperative mood (`add`, `fix`, `remove` — not `added` / `adds`)
- No trailing period
- Lowercase after the colon

Body (optional, only when the *why* isn't obvious from the diff):
- Wrap at 80 chars
- Explain the motivation, not the mechanics

## Examples

```
feat(core): merge duplicate instances with identical variabilization
fix(core): handle null from getVariableByIdAsync for unpublished libs
refactor(core): split monolithic code.ts into focused modules
test(core): cover 2-level VariableAlias chains
docs: add graphify section to CLAUDE.md
```

## Constraints

- Never use `--no-verify`.
- Never `--amend` a pushed commit.
- Never `git add -A` blindly — stage explicit paths.
- If `package-lock.json` was modified, stage it together with `package.json`.
- If unsure about scope or type, ask the user one question before committing.
