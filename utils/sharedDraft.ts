import type { OrganizationEntry, SharedDraft, SharedItem, SharedTarget, SharedRepeat } from "../types/shared";
import * as calendar from "../shared/recurrence.cjs";
import { allowedTargetModes } from "./sharedPermissions";
export const sharedPreAlerts = [0, 5, 10, 15, 30, 60, 1440];
export function buildSharedTargets(mode: SharedTarget["targetType"] | "mixed", teamIds: string[], userIds: string[], modes: SharedTarget["targetType"][]) {
  if (mode !== "mixed" && !modes.includes(mode) || mode === "mixed" && (!modes.includes("team") || !modes.includes("user"))) throw new Error("You cannot share with this target mode.");
  const targets: SharedTarget[] = mode === "organization" ? [{ targetType: "organization" }] : [
    ...((mode === "team" || mode === "mixed") ? [...new Set(teamIds)].map(targetId => ({ targetType: "team" as const, targetId })) : []),
    ...((mode === "user" || mode === "mixed") ? [...new Set(userIds)].map(targetId => ({ targetType: "user" as const, targetId })) : []),
  ];
  if (!targets.length || targets.length > 100) throw new Error("Select 1–100 targets.");
  return targets;
}
export function buildSharedDraft(values: { type: SharedItem["type"]; title: string; description: string; start: Date; end?: Date;
  completionMode: "individual" | "collective"; mode: SharedTarget["targetType"] | "mixed"; teamIds: string[]; userIds: string[]; preAlert: number;
  repeat?: SharedRepeat; timeZone?: string; weeklyDays?: number[] }, org: OrganizationEntry): SharedDraft {
  if (!values.title.trim() || values.title.length > 200) throw new Error("Enter a title of 1–200 characters.");
  if (values.description.length > 10000) throw new Error("Description is too long.");
  if (!Number.isFinite(values.start.getTime()) || values.start.getTime() <= Date.now()) throw new Error("Choose a future date and time.");
  if (values.type === "event" && (!values.end || !Number.isFinite(values.end.getTime()) || values.end < values.start)) throw new Error("Event end must be on or after its start.");
  const targets = buildSharedTargets(values.mode, values.teamIds, values.userIds, allowedTargetModes(org));
  if (!sharedPreAlerts.includes(values.preAlert)) throw new Error("Choose a valid pre-alert.");
  const completionMode = values.type === "task" ? values.completionMode : "individual";
  return { type: values.type, title: values.title.trim(), description: values.description.trim(),
    schedule: { startAt: values.start.toISOString(), ...(values.type === "event" ? { endAt: values.end!.toISOString() } : {}),
      allDay: false, alertBefore: { label: values.preAlert ? `${values.preAlert} minutes before` : "None", minutes: values.preAlert } },
    completionMode, ...(completionMode === "collective" ? { collectiveRule: "any" as const } : {}), targets,
    ...(values.repeat ? { recurrence: calendar.normalizeRecurrence({ repeat: values.repeat, ...(values.repeat !== "none" ? { timeZone: values.timeZone,
      ...(values.repeat === "weekly" ? { weeklyDays: values.weeklyDays } : {}) } : {}) }, { startAt: values.start.toISOString() }) } : {}) };
}
