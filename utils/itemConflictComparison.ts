import type { ReminderItem } from "../types/item";

/** Display values only; no account, queue, revision or notification metadata. */
export function conflictFields(item: ReminderItem): Record<string, string> {
  const date = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "Not set";
  const fields: Record<string, string> = {
    [item.type === "birthday" ? "Name" : "Title"]: item.title || "Untitled",
    Type: item.type[0].toUpperCase() + item.type.slice(1),
    Date: item.type === "birthday" || item.allDay ? new Date(item.startAt).toLocaleDateString() : date(item.startAt),
  };
  if (item.type !== "birthday") fields.Description = item.description || "None";
  if (item.type === "event") {
    fields.End = date(item.endAt); fields.Location = item.location || "None";
    fields["All day"] = item.allDay ? "Yes" : "No";
  }
  fields.Recurrence = item.repeat === "weekly" ? `Weekly: ${(item.weeklyDays ?? []).map(day => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ")}` : item.repeat || "none";
  fields.Completion = item.completed ? "Completed" : item.status || "Open";
  if (item.completedAt) fields["Completed at"] = date(item.completedAt);
  if (item.completionNote) fields["Completion note"] = item.completionNote;
  if (item.occurrenceHistory?.length) fields.History = `${item.occurrenceHistory.length} previous occurrences; ${item.occurrenceHistory.filter(row => row.status === "Done" || row.status === "Completed").length} completed`;
  if (item.type !== "birthday") {
    fields["Pre-alert"] = item.alertBefore?.minutes ? `${item.alertBefore.minutes} minutes before` : "None";
    fields.Priority = item.priority || "None"; fields.Category = item.category || "None";
    fields.Notes = item.notes || "None";
  }
  return fields;
}
