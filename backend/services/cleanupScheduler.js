import { cleanupDeletedItems, DAY_MS, retentionMilliseconds } from "./deletedItemCleanup.js";

// Caller must await MongoDB and explicit index initialization first.
export function startCleanupScheduler({ cleanup = cleanupDeletedItems, logger = console,
  intervalMs = DAY_MS, retentionMs = retentionMilliseconds(),
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let stopped = false, timer;
  const run = async () => {
    try {
      const stats = await cleanup({ retentionMs });
      logger.info("[item-cleanup] completed", stats);
    } catch {
      logger.error("[item-cleanup] run failed; will retry next scheduled run");
    } finally {
      if (!stopped) {
        timer = setTimer(run, intervalMs);
        timer.unref?.();
      }
    }
  };
  const startup = run();
  return { startup, stop() { stopped = true; if (timer) clearTimer(timer); } };
}
