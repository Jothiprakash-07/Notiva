import { useCallback, useEffect, useState } from "react";
import { getNotificationHistory, NotificationHistoryEntry, subscribeNotificationHistory } from "../services/notificationHistory";

export function useNotificationHistory() {
  const [entries, setEntries] = useState<NotificationHistoryEntry[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => subscribeNotificationHistory(refresh), [refresh]);
  useEffect(() => {
    let active = true;
    void getNotificationHistory().then(value => {
      if (active) { setEntries(value); setError(false); }
    }).catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  return { entries, error, loading, refresh, unreadCount: entries.filter(entry => !entry.read).length };
}
