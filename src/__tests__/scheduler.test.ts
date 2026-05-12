import { describe, it, expect, vi } from 'vitest';
import { yieldToScheduler } from '../utils/scheduler';

describe('yieldToScheduler', () => {
  it('returns a Promise that resolves', async () => {
    const p = yieldToScheduler();
    expect(p).toBeInstanceOf(Promise);
    await expect(p).resolves.toBeUndefined();
  });

  it('yields control before resolving (uses setTimeout)', async () => {
    vi.useFakeTimers();
    try {
      let resolved = false;
      const p = yieldToScheduler().then(() => {
        resolved = true;
      });
      expect(resolved).toBe(false);
      await vi.runAllTimersAsync();
      await p;
      expect(resolved).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
