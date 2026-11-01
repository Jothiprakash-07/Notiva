const createCalendar = require('./personalCalendar.generated.cjs');
// Virtual UTC wall-clock dates let the unchanged personal calendar operate in
// the series timezone, rather than the server/device timezone.
class WallDate extends Date {
  constructor(...args) { super(args.length > 1 ? Date.UTC(...args) : args.length ? args[0] : Date.now()); }
  getFullYear() { return this.getUTCFullYear(); } getMonth() { return this.getUTCMonth(); }
  getDate() { return this.getUTCDate(); } getDay() { return this.getUTCDay(); }
  getHours() { return this.getUTCHours(); } getMinutes() { return this.getUTCMinutes(); }
  getSeconds() { return this.getUTCSeconds(); } getMilliseconds() { return this.getUTCMilliseconds(); }
  setDate(value) { return this.setUTCDate(value); } setHours(...args) { return this.setUTCHours(...args); }
  setFullYear(...args) { return this.setUTCFullYear(...args); } setMonth(...args) { return this.setUTCMonth(...args); }
}
const calendar = createCalendar(WallDate), formatters = new Map();
const repeats = ['none', 'daily', 'weekly', 'weekdays', 'monthly', 'yearly'];
function formatter(zone) {
  if (!formatters.has(zone)) formatters.set(zone, new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }));
  return formatters.get(zone);
}
function wall(instant, zone) {
  const date = new Date(instant), values = Object.fromEntries(formatter(zone).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  return new WallDate(values.year, values.month - 1, values.day, values.hour, values.minute, values.second, date.getUTCMilliseconds());
}
function instant(wallTime, zone) {
  const wanted = +wallTime, offsets = new Set();
  for (const shift of [-36, -12, 0, 12, 36]) { const time = wanted + shift * 3600000; offsets.add(+wall(time, zone) - time); }
  const candidates = [...offsets].map(offset => wanted - offset);
  const exact = candidates.filter(time => +wall(time, zone) === wanted);
  if (exact.length) return Math.min(...exact); // JS calendar's earlier DST fold.
  // Nonexistent local time: roll forward by the gap, like JS Date construction.
  return candidates.filter(time => +wall(time, zone) > wanted).sort((a, b) => +wall(a, zone) - +wall(b, zone))[0];
}
function normalizeRecurrence(value, schedule) {
  if (value === undefined) return { repeat: 'none' };
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).some(k => !['repeat', 'timeZone', 'weeklyDays', 'effectiveFrom'].includes(k)) || !repeats.includes(value.repeat)) throw Error('Invalid recurrence rule.');
  if (value.repeat === 'none') return { repeat: 'none' };
  if (typeof value.timeZone !== 'string' || value.timeZone.length > 100) throw Error('Choose a series timezone.');
  formatter(value.timeZone).format(new Date(schedule.startAt));
  const anchor = wall(schedule.startAt, value.timeZone);
  const result = { repeat: value.repeat, timeZone: value.timeZone };
  if (value.repeat === 'weekly') result.weeklyDays = calendar.normalizeWeeklyDays(value.weeklyDays, anchor.getDay());
  else if (value.weeklyDays !== undefined) throw Error('Weekday selection is only valid for Weekly.');
  return result;
}
function template(item) {
  const zone = item.recurrence.timeZone;
  const startAt = wall(item.schedule.startAt, zone).toISOString();
  return { id: item.id || String(item._id), seriesId: item.id || String(item._id), type: item.type, repeat: item.recurrence.repeat,
    startAt, dailySeries: { active: item.status === 'active', repeat: item.recurrence.repeat, template: { startAt, weeklyDays: item.recurrence.weeklyDays } } };
}
function dueOn(item, day) {
  if (!item.recurrence || item.recurrence.repeat === 'none' || item.status !== 'active') return null;
  const localDay = typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new WallDate(day + 'T12:00:00Z') : wall(day, item.recurrence.timeZone);
  const candidate = calendar.occurrenceOn(template(item), localDay);
  if (!candidate) return null;
  const start = instant(candidate, item.recurrence.timeZone);
  if (!Number.isFinite(start) || start < Date.parse(item.recurrence.effectiveFrom || item.schedule.startAt)) return null;
  const dayKey = calendar.localDateKey(candidate), time = `${String(candidate.getHours()).padStart(2, '0')}:${String(candidate.getMinutes()).padStart(2, '0')}`;
  const key = `${item.scheduleRevision}|${dayKey}T${time}`;
  const duration = item.schedule.endAt ? Date.parse(item.schedule.endAt) - Date.parse(item.schedule.startAt) : 0;
  return { key, date: dayKey, startAt: new Date(start).toISOString(), ...(item.schedule.endAt ? { endAt: new Date(start + duration).toISOString() } : {}) };
}
function currentOccurrence(item, now = new Date(), recipient) {
  const due = dueOn(item, now);
  return due && (recipient?.excludedOccurrenceKey === due.key || recipient?.eligibleFrom && Date.parse(due.startAt) < +new Date(recipient.eligibleFrom)) ? null : due;
}
function nextOccurrence(item, after = new Date(), history = [], globalHistory = []) {
  if (!item.recurrence || item.recurrence.repeat === 'none' || item.status !== 'active') return null;
  const local = wall(after, item.recurrence.timeZone);
  const resolved = new Set(history.filter(row => row.status === 'completed' || (item.type !== 'task' && row.status === 'acknowledged')).map(row => row.occurrenceKey));
  for (const row of globalHistory) if (row.status === 'completed') resolved.add(row.occurrenceKey);
  for (let offset = 0; offset <= 366 * 9; offset++) {
    const day = new WallDate(local.getFullYear(), local.getMonth(), local.getDate() + offset, 12);
    const due = dueOn(item, calendar.localDateKey(day));
    if (due && Date.parse(due.startAt) > +new Date(after) && !resolved.has(due.key)) return due;
  }
  return null;
}
function occurrenceStatus(item, due, recipientResult, globalResult, now = new Date()) {
  if (item.status !== 'active') return item.status;
  if (!due) return 'inactive';
  if (globalResult?.status === 'completed' || recipientResult?.status === 'completed') return 'completed';
  if (item.type === 'event') return +new Date(now) < Date.parse(due.startAt) ? 'upcoming' : +new Date(now) <= Date.parse(due.endAt || due.startAt) ? 'ongoing' : 'completed';
  if (recipientResult?.status === 'acknowledged') return 'acknowledged';
  return Date.parse(due.startAt) > +new Date(now) ? 'pending' : item.type === 'task' ? 'overdue' : 'missed';
}
function mergeHistory(history, row) {
  const map = new Map((history || []).map(value => [value.occurrenceKey, value])); map.set(row.occurrenceKey, row);
  return [...map.values()].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).slice(-366);
}
function nextMidnight(now, zone) {
  const local = wall(now, zone);
  return instant(new WallDate(local.getFullYear(), local.getMonth(), local.getDate() + 1), zone);
}
module.exports = { repeats, normalizeRecurrence, currentOccurrence, nextOccurrence, dueOn, occurrenceStatus, mergeHistory, nextMidnight, wallDateKey: (time, zone) => calendar.localDateKey(wall(time, zone)) };
