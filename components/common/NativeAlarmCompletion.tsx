import { useEffect, useState } from 'react';
import { AppState, Alert } from 'react-native';
import CompletionNoteModal from './CompletionNoteModal';
import { getItemById, toggleComplete, migrateAndroidMainAlarms } from '../../services/itemStorage';
import { nativeAlarm, readPendingAlarmDone } from '../../services/nativeAlarm';
import { getItemStatus } from '../../utils/itemStatus';
import type { ReminderItem } from '../../types/item';

/** Native Done is durable across cold launches; status changes only on confirmation. */
export default function NativeAlarmCompletion() {
  const [pending, setPending] = useState<{ token: string; item: ReminderItem }>();
  useEffect(() => {
    const migrate = () => { void migrateAndroidMainAlarms().catch(error => console.warn('Could not migrate Android alarms:', error)); };
    migrate();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') migrate(); });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    let active = true;
    let reading = false;
    const recover = async () => {
      if (reading || pending || AppState.currentState !== 'active') return;
      reading = true;
      try {
        const action = await readPendingAlarmDone();
        if (!action || !active) return;
        const item = await getItemById(action.itemId);
        if (!active) return;
        if (!item || !['Pending', 'Missed', 'Overdue'].includes(getItemStatus(item)) || !['reminder', 'task'].includes(item.type)) {
          await nativeAlarm().acknowledgeDone(action.token);
          return;
        }
        setPending({ token: action.token, item });
      } catch (error) { console.warn('Could not recover alarm completion:', error); }
      finally { reading = false; }
    };
    void recover();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void recover(); });
    // Also covers an already resumed MainActivity and a second queued Done action.
    const timer = setInterval(() => { void recover(); }, 1000);
    return () => { active = false; subscription.remove(); clearInterval(timer); };
  }, [pending]);
  const close = async () => {
    if (!pending) return;
    await nativeAlarm().acknowledgeDone(pending.token);
    setPending(undefined);
  };
  return <CompletionNoteModal visible={!!pending} itemTitle={pending?.item.title}
    onClose={() => { void close().catch(() => Alert.alert('Could not close', 'Please try again.')); }}
    onConfirm={async note => {
      if (!pending) return;
      await toggleComplete(pending.item.id, note);
      await close();
    }} />;
}
