---
description: Run the Vitest suite, verify coverage, and show a focused diagnosis if anything fails.
---

# /test

## Goal

Run the full test suite and produce a verdict the developer can act on in under 30 seconds.

## Workflow

```
1. Run `npm run typecheck` — fail fast on TypeScript errors before tests
2. Run `npm run test` — full Vitest suite
3. If any failure:
   - List failing test files + names
   - For each: read the failing test and the source under test
   - Diagnose root cause (assertion vs setup vs mock)
   - Propose a fix (do NOT apply unless the user agrees)
4. If all green:
   - Run `npm run test:cov`
   - Report total coverage and any file < 80 %
   - Suggest tests to add for the uncovered branches
```

## Output Format

```
## Result
PASS | FAIL

## Failures (if any)
- <test file>::<test name>
  Cause: <one sentence>
  Fix:   <one sentence — code change or mock change>

## Coverage
Total:    <pct>%
Below 80: <file list, or "none">

## Next
<one concrete action: "ship", "fix X", "add test for Y">
```

## Constraints

- Never modify a test to make it pass — fix the implementation, or surface that the test is wrong and ask.
- Never delete a test without explicit user approval.
- Never bump the coverage threshold to silence a regression.
