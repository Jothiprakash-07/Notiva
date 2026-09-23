export const ALARM_SOUNDS = [
  { key: "system", label: "System Default" },
  { key: "ethereal_uplifting", label: "Ethereal Uplifting" },
  { key: "positive_vibe", label: "Positive Vibe" },
  { key: "positive_western", label: "Positive Western" },
  { key: "robotic_loop", label: "Robotic Loop" },
  { key: "sandy_summer", label: "Sandy Summer" },
] as const;

export type AlarmSound = typeof ALARM_SOUNDS[number]["key"];

export function normalizeAlarmSound(value: unknown): AlarmSound {
  return ALARM_SOUNDS.some(sound => sound.key === value) ? value as AlarmSound : "system";
}
