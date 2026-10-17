// These fields mirror types/item.ts. Dates remain strings so local timestamps
// and recurrence anchors round-trip without timezone conversion.
const string = value => typeof value === "string" && value.length <= 50000;
const id = value => typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\x00-\x1f]/.test(value);
const date = value => string(value) && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const boolean = value => typeof value === "boolean";
const choice = values => value => values.includes(value);
const array = check => value => Array.isArray(value) && value.length <= 10000 && value.every(check);
const nullable = check => value => value === null || check(value);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const shape = (fields, required = []) => value => object(value) &&
  Object.keys(value).every(key => Object.hasOwn(fields, key) && fields[key](value[key])) &&
  required.every(key => Object.hasOwn(value, key));
const types = ["reminder", "task", "event", "birthday"];
const templateFields = {
  type: choice(types), title: value => string(value) && value.trim().length > 0,
  description: string, category: nullable(string), priority: nullable(choice(["High", "Medium", "Low"])),
  alertBefore: nullable(shape({ label: string, minutes: value => Number.isFinite(value) && value >= 0 }, ["label", "minutes"])),
  startAt: date, endAt: date, allDay: boolean, location: string, notes: string,
  weeklyDays: array(value => Number.isInteger(value) && value >= 0 && value <= 6),
};
export const itemFields = {
  occurrenceKey: id,
  occurrenceHistory: value => Array.isArray(value) && value.length <= 366 && value.every(shape({
    occurrenceKey: id, scheduledAt: date, status: choice(["Pending", "Done", "Missed", "Overdue", "Upcoming", "Ongoing", "Completed", "Cancelled"]),
    completedAt: date, completionNote: string, actionResolved: boolean,
  }, ["occurrenceKey", "scheduledAt", "status"])),
  ...templateFields, seriesId: id, completedAt: date, dailyHidden: boolean,
  repeat: choice(["none", "daily", "weekly", "weekdays", "monthly", "yearly"]),
  completionNote: string,
  status: choice(["Pending", "Done", "Missed", "Overdue", "Upcoming", "Ongoing", "Completed", "Cancelled"]),
  completed: boolean, actionResolved: boolean, notificationIds: array(string), createdAt: date, updatedAt: date,
  dailySeries: shape({
    masterVersion: value => value === 1,
    repeat: choice(["daily", "weekly", "weekdays", "monthly", "yearly"]), active: boolean, firstAt: date, templateId: id,
    template: shape(templateFields, ["type", "title", "description", "startAt"]),
    excludedDates: array(value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)),
    notificationIds: array(string), dirty: boolean,
  }, ["active", "firstAt", "templateId", "template", "excludedDates", "notificationIds", "dirty"]),
};
export const validClientItemId = id;

export function validateItemBody(body, patch = false) {
  if (!object(body)) return "Provide an item object.";
  const allowed = [...Object.keys(itemFields), ...(patch ? [] : ["clientItemId", "id"])];
  if (Object.keys(body).some(key => !allowed.includes(key))) return "Unsupported or immutable item field.";
  if (patch && !Object.keys(body).length) return "Provide fields to update.";
  if (patch && Object.hasOwn(body, "createdAt")) return "createdAt cannot change.";
  if (!patch && (!id(body.clientItemId ?? body.id) ||
    (body.id !== undefined && body.clientItemId !== undefined && body.id !== body.clientItemId))) return "Provide a consistent clientItemId.";
  if (!patch && ["type", "title", "description", "repeat", "startAt", "notificationIds", "createdAt", "updatedAt"].some(key => !Object.hasOwn(body, key))) return "Required item fields are missing.";
  for (const [key, value] of Object.entries(body)) {
    if (patch && value === null && !["type", "title", "description", "repeat", "startAt", "notificationIds", "createdAt", "updatedAt"].includes(key)) continue;
    if (key === "id" || key === "clientItemId") { if (!id(value)) return "Invalid clientItemId."; }
    else if (!itemFields[key](value)) return `Invalid ${key}.`;
  }
  return null;
}

export function publicItem(document) {
  const item = document.toObject ? document.toObject() : document;
  return { id: item.clientItemId, clientItemId: item.clientItemId,
    ...Object.fromEntries(Object.keys(itemFields).filter(key => item[key] !== undefined).map(key => [key, item[key]])),
    revision: item.revision, deletedAt: item.deletedAt ?? null,
    serverCreatedAt: item.serverCreatedAt, serverUpdatedAt: item.serverUpdatedAt };
}
