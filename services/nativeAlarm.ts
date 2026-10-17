import { NativeModules, Platform } from 'react-native';
import type { ReminderItem } from '../types/item';
import { normalizeAlarmSound, type AlarmSound } from './alarmSounds';
import { getItemAccount } from './itemAccount';

type AlarmBridge = {
  setAlarmSound(sound: AlarmSound): Promise<void>;
  schedule(json: string): Promise<string>;
  cancel(id: string): Promise<void>;
  canSchedule(): Promise<boolean>;
  dailyOccurrencesVersion?(): Promise<number>;
  weeklyOccurrencesVersion?(): Promise<number>;
  weekdaysOccurrencesVersion?(): Promise<number>;
  nativePreAlertsVersion?(): Promise<number>;
  setPreAlertSettings?(enabled: boolean, vibration: boolean): Promise<void>;
  hasSchedule?(id: string): Promise<boolean>;
  canFullScreen(): Promise<boolean>;
  openExactSettings(): Promise<void>;
  openFullScreenSettings(): Promise<void>;
  pendingDone(): Promise<string | null>;
  pendingDoneForAccount?(account: string): Promise<string | null>;
  acknowledgeDone(token: string): Promise<void>;
  previewSound(sound: AlarmSound): Promise<void>;
  stopPreview(): Promise<void>;
};
export const NATIVE_ALARM_PREFIX = 'native-alarm:';
export async function syncNativeAlarmSound(sound: AlarmSound): Promise<void> {
  if (Platform.OS !== 'android') return;
  const bridge = nativeAlarm();
  if (!bridge.setAlarmSound) throw new Error('Install the new Android build to save the alarm sound.');
  await bridge.setAlarmSound(normalizeAlarmSound(sound));
}
export function nativeAlarm(): AlarmBridge {
  const bridge = NativeModules.NotivaAlarm as AlarmBridge | undefined;
  if (!bridge) throw new Error('Native alarms require a rebuilt Android app. Expo Go is not supported.');
  return bridge;
}
export async function scheduleNativeAlarm(item: ReminderItem, settings: { vibration: boolean; alarmSound: AlarmSound; preAlerts?: boolean }, preAlertIds: string[]) {
  if (!(await nativeAlarm().nativePreAlertsVersion?.())) {
    throw new Error('Native pre-alerts require the new Android build. Rebuild and reopen Notiva.');
  }
  const daily = ['daily', 'weekly', 'weekdays', 'monthly', 'yearly'].includes(item.repeat) && item.seriesId && item.dailySeries;
  if (daily && item.repeat === 'weekdays' && !(await nativeAlarm().weekdaysOccurrencesVersion?.())) {
    throw new Error('Weekdays occurrences require the new Android build. Rebuild and reopen Notiva.');
  }
  if (daily && item.repeat === 'weekly' && !(await nativeAlarm().weeklyOccurrencesVersion?.())) {
    throw new Error('Weekly occurrences require the new Android build. Rebuild and reopen Notiva.');
  }
  if (daily && !(await nativeAlarm().dailyOccurrencesVersion?.())) {
    throw new Error('Daily occurrences require the new Android build. Rebuild and reopen Notiva.');
  }
  return nativeAlarm().schedule(JSON.stringify({
    id: daily ? `${NATIVE_ALARM_PREFIX}${item.repeat}-series:${item.seriesId}` : `${NATIVE_ALARM_PREFIX}${item.id}`,
    itemId: item.id, title: item.title,
    description: item.description, itemType: item.type,
    startAt: new Date(item.startAt).getTime(), repeat: item.repeat || 'none',
    weeklyDays: item.repeat === 'weekly' ? item.weeklyDays : undefined,
    vibration: settings.vibration, alarmSound: normalizeAlarmSound(settings.alarmSound), preAlertIds,
    preAlertMinutes: item.alertBefore?.minutes ?? 0,
    ...(daily ? { seriesId: item.seriesId, firstAt: new Date(daily.firstAt).getTime(), anchorItemId: daily.templateId,
      excludedDates: daily.excludedDates } : {}),
  }));
}
export async function readPendingAlarmDone(): Promise<{ token: string; itemId: string } | undefined> {
  if (Platform.OS !== 'android' || !NativeModules.NotivaAlarm) return;
  const bridge = nativeAlarm();
  const account = getItemAccount();
  if (account === null) return;
  const raw = account && bridge.pendingDoneForAccount
    ? await bridge.pendingDoneForAccount(account) : await bridge.pendingDone();
  return raw ? JSON.parse(raw) : undefined;
}
