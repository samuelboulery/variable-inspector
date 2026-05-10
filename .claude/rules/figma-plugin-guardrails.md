# Figma Plugin Guardrails

Rules specific to the Figma Plugin API and the plugin thread / UI thread architecture.

## Thread Boundaries — Never Cross Them

The Figma plugin runtime has two isolated contexts:

| Context | File(s) | Can access |
|---------|---------|------------|
| Plugin thread | `code.ts` | Figma API, `postMessage` to UI |
| UI thread | `ui.js`, `main.js`, `components.js` | DOM, `window`, `parent.postMessage` back to plugin |

**Rules:**
- Never call `figma.*` from a UI file.
- Never access `document` or `window` from `code.ts`.
- All data transfer between threads must go through `postMessage` with a typed message envelope.

```typescript
// ✅ code.ts — send typed message to UI
figma.ui.postMessage({ type: 'SCAN_RESULT', payload: result })

// ✅ main.js — receive and route
window.onmessage = (event) => {
  const { type, payload } = event.data.pluginMessage
  if (type === 'SCAN_RESULT') renderResult(payload)
}
```

## Async API Calls

- Always prefer `*Async` variants: `getVariableByIdAsync`, `getLocalVariableCollectionsAsync`, etc.
- Never block the main plugin thread with a long synchronous loop. If iterating a large node tree, consider chunking with `setTimeout` or yielding between batches.

## Null Safety for External Libraries

Variables from unpublished or unlinked external libraries will return `null` from `getVariableByIdAsync`. Always handle this:

```typescript
const variable = await figma.variables.getVariableByIdAsync(alias.id)
if (!variable) {
  // Variable is from an unpublished external library — show graceful fallback
  return { id: alias.id, name: 'Unknown (external)', isExternal: true, unresolved: true }
}
```

## VariableAlias Resolution

`boundVariables` contains `VariableAlias` objects, not `Variable` objects. Always resolve them:

```typescript
if (alias.type === 'VARIABLE_ALIAS') {
  const variable = await figma.variables.getVariableByIdAsync(alias.id)
  // ...
}
```

A variable can alias another variable (chained aliases). Resolve recursively up to a reasonable depth limit (e.g., 10) to avoid infinite loops.

## Node Tree Traversal

- Use a stack-based (iterative) traversal instead of recursion to avoid stack overflows on deep trees.
- Respect `node.type` before accessing type-specific properties (e.g., only `TextNode` has `characters`).
- Skip invisible nodes unless the user explicitly opts in — invisible layers are rarely the problem to fix.

```typescript
function collectNodes(root: SceneNode): SceneNode[] {
  const result: SceneNode[] = []
  const stack: SceneNode[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    result.push(node)
    if ('children' in node) stack.push(...node.children)
  }
  return result
}
```

## Effects — Iterate All, Not Just First

Effects (drop shadow, inner shadow, blur) are arrays. Always iterate:

```typescript
if ('effects' in node) {
  node.effects.forEach((effect, index) => {
    const label = `${effectTypeLabel(effect.type)} ${index + 1}`
    // ...
  })
}
```

## Viewport & Selection

- Focus a node: `figma.viewport.scrollAndZoomIntoView([node])`
- Select a node: `figma.currentPage.selection = [node]`
- Always do both together for the "target" action (select + zoom).
- These calls must happen in the **plugin thread** (`code.ts`), triggered by a message from the UI.

## Plugin Permissions

The manifest declares `"permissions": ["currentuser"]`. Do not add permissions unless strictly necessary for a feature. Requesting broad permissions increases review scrutiny on the Figma Community.

## Error Reporting to User

Never let an unhandled error silently kill the plugin. Wrap the main scan logic:

```typescript
try {
  const result = await scanSelection()
  figma.ui.postMessage({ type: 'SCAN_RESULT', payload: result })
} catch (error) {
  figma.ui.postMessage({ type: 'ERROR', payload: String(error) })
}
```

The UI must render a visible error message when it receives an `ERROR` message type.

## Performance

- Debounce selection-change events if adding auto-scan on selection change (min 300 ms).
- Cache resolved variables by ID within a single scan session to avoid redundant async calls.
- Cap traversal depth at 50 levels to handle pathological nesting without hanging.
