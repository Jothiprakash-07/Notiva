import { NativeModules, Platform } from 'react-native';
import type { ReminderItem } from '../types/item';
import { normalizeAlarmSound, type AlarmSound } from './alarmSounds';

type AlarmBridge = {
  setAlarmSound(sound: AlarmSound): Promise<void>;
  schedule(json: string): Promise<string>;
  cancel(id: string): Promise<void>;
  canSchedule(): Promise<boolean>;
  canFullScreen(): Promise<boolean>;
  openExactSettings(): Promise<void>;
  openFullScreenSettings(): Promise<void>;
  pendingDone(): Promise<string | null>;
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
export async function scheduleNativeAlarm(item: ReminderItem, settings: { vibration: boolean; alarmSound: AlarmSound }, preAlertIds: string[]) {
  return nativeAlarm().schedule(JSON.stringify({
    id: `${NATIVE_ALARM_PREFIX}${item.id}`, itemId: item.id, title: item.title,
    description: item.description, itemType: item.type,
    startAt: new Date(item.startAt).getTime(), repeat: item.repeat || 'none',
    vibration: settings.vibration, alarmSound: normalizeAlarmSound(settings.alarmSound), preAlertIds,
  }));
}
export async function readPendingAlarmDone(): Promise<{ token: string; itemId: string } | undefined> {
  if (Platform.OS !== 'android' || !NativeModules.NotivaAlarm) return;
  const raw = await nativeAlarm().pendingDone();
  return raw ? JSON.parse(raw) : undefined;
}
