/**
 * Tracks an unread-Updates count using a localStorage `lastSeen_updates`
 * timestamp + the existing fetchUpdates() feed. No backend changes.
 *
 * lastSeen is stored as a millisecond epoch; the count is the number of
 * UpdateEvents with `at > lastSeen`. When the user opens /updates we mark
 * everything seen — see `markUpdatesSeen()`.
 */
import { useEffect, useState } from 'react';
import { fetchUpdates } from './profile';

const KEY = 'gochords:lastSeen_updates';

export function getLastSeen(): number {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export function markUpdatesSeen(at: number = Date.now()): void {
  try { localStorage.setItem(KEY, String(at)); } catch { /* private mode */ }
  window.dispatchEvent(new Event('gochords:updates-seen'));
}

/**
 * Returns the number of UpdateEvents newer than the stored lastSeen. Refreshes
 * on sign-in, on the seen-event, and on a low-frequency poll (5 min) so the
 * badge doesn't go stale while the user has the app open.
 */
export function useUnreadUpdatesCount(signedIn: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!signedIn) { setCount(0); return; }
    let cancelled = false;

    const refresh = async () => {
      try {
        const events = await fetchUpdates(50);
        if (cancelled) return;
        const seen = getLastSeen();
        setCount(events.filter((e) => e.at > seen).length);
      } catch {
        if (!cancelled) setCount(0);
      }
    };

    refresh();
    const onSeen = () => setCount(0);
    window.addEventListener('gochords:updates-seen', onSeen);
    const interval = window.setInterval(refresh, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.removeEventListener('gochords:updates-seen', onSeen);
      clearInterval(interval);
    };
  }, [signedIn]);

  return count;
}
