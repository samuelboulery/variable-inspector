# Coding Standards — Variable Inspector

## TypeScript

- Strict mode is always on. Never disable it or add exceptions without a comment explaining why.
- No `any` type. Use `unknown` + type guards when the type is genuinely unknown.
- No `@ts-ignore` or `@ts-expect-error` without a comment on the same line.
- Prefer `interface` over `type` for object shapes that could be extended.
- Use `type` for unions, intersections, and aliases.
- Always type function return values explicitly for public functions.

```typescript
// ✅ Good
export function getVariablePath(variable: Variable): VariablePath {
  ...
}

// ❌ Bad
export function getVariablePath(variable) {
  ...
}
```

## File & Module Structure

- One concern per file. `code.ts` collects data, UI files render it.
- Max file length: 300 lines. Split beyond that.
- Max function length: 60 lines. Extract helpers when approaching the limit.
- Named exports only. No default exports except for Vite entry points.
- Relative imports within `src/`. No path aliases except `@/` when strictly needed.

```typescript
// ✅ Good
export { collectVariables, collectUnboundProps }

// ❌ Bad
export default function collectVariables() { ... }
```

## Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | camelCase | `variableScanner.ts` |
| Functions | camelCase | `resolveAlias()` |
| Classes | PascalCase | `VariablePath` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_DEPTH` |
| Types/Interfaces | PascalCase | `BoundProperty` |
| Boolean variables | `is` / `has` / `can` prefix | `isExternal`, `hasAlias` |

## Functions & Logic

- Pure functions wherever possible — take input, return output, no side effects.
- Side effects (Figma API calls, `postMessage`) must be isolated in clearly named functions.
- Avoid nested callbacks more than 2 levels deep — extract named functions.
- Handle all error cases explicitly. Never silently swallow errors.

```typescript
// ✅ Good
const variable = await figma.variables.getVariableByIdAsync(id)
if (!variable) {
  logger.warn(`Variable not found: ${id}`)
  return null
}

// ❌ Bad
const variable = await figma.variables.getVariableByIdAsync(id)
return variable!
```

## Logging

Use the `logger` utility (`src/utils/logger.ts`). Never use `console.log` directly.
The logger is a no-op in production builds (`process.env.NODE_ENV === 'production'`).

```typescript
import { logger } from './utils/logger'
logger.log('Scanning node', node.name)
logger.warn('Variable not found', id)
logger.error('Failed to resolve alias', error)
```

## Async / Figma API

- Always use `async/await`, never raw `.then()` chains.
- All Figma API calls that have async variants must use the async variant.
- Wrap top-level plugin logic in a `try/catch` and report errors to the UI via `postMessage`.

## Comments & JSDoc

- All exported functions must have a JSDoc block.
- Inline comments explain *why*, not *what*.
- Comments must be in English.

```typescript
/**
 * Resolves a VariableAlias chain to its root Variable.
 * Returns null if the variable is from an unpublished external library.
 */
export async function resolveAlias(alias: VariableAlias): Promise<Variable | null> {
  ...
}
```

## Testing

- Every utility/helper function must have a unit test in `src/__tests__/`.
- Tests use **Vitest**. Mock the Figma API using `src/__mocks__/figma.ts`.
- Test filenames mirror source filenames: `variableScanner.ts` → `variableScanner.test.ts`.
- Aim for ≥ 80% coverage on files in `src/`. UI files are exempt.
- Tests must pass before any commit. Run `npm run test` to verify.

## Commits

Follow Conventional Commits. Prefix with one of:
`feat` | `fix` | `refactor` | `test` | `docs` | `chore` | `perf`

```
feat(ui): add local/external variable badge
fix(core): resolve VariableAlias chain correctly
refactor(code): extract property-scanner into separate module
```

Subject line: ≤ 72 characters, imperative mood, no trailing period.
