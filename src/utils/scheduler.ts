/**
 * Yields execution back to the host scheduler so a long synchronous loop
 * does not block the Figma plugin thread. Uses a `setTimeout(0)` microtask
 * so the host can process incoming messages between batches.
 *
 * @returns A promise that resolves on the next tick.
 */
export function yieldToScheduler(): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, 0));
}
