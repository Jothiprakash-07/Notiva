import com.notiva.alarm.AlarmStore;
import java.util.Calendar;
import java.util.TimeZone;
import org.json.JSONObject;
import org.json.JSONArray;

// Uses the compiled production Kotlin scheduler. OS delivery needs device testing.
class WeeklyAlarmRegression {
  static long time(int month, int day, int hour, int minute) {
    Calendar c = Calendar.getInstance(); c.clear(); c.set(2026, month - 1, day, hour, minute); return c.getTimeInMillis();
  }
  static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
  public static void main(String[] args) {
    AlarmStore store = AlarmStore.INSTANCE;
    for (String zone : new String[]{"Asia/Kolkata", "America/New_York", "UTC"}) {
      TimeZone.setDefault(TimeZone.getTimeZone(zone));
      long mon = time(9, 28, 10, 0), wed = time(9, 30, 10, 0), fri = time(10, 2, 10, 0);
      JSONObject data = new JSONObject().put("id", "native-alarm:weekly-series:team").put("itemId", "team")
        .put("seriesId", "team").put("anchorItemId", "team").put("firstAt", mon).put("startAt", mon)
        .put("repeat", "weekly").put("weeklyDays", new JSONArray().put(1).put(3).put(5))
        .put("preAlertMinutes", 5).put("excludedDates", new JSONArray());
      check(store.next(data, mon - 1) == mon, "initial occurrence");
      check(store.next(data, mon) == wed, "Monday to Wednesday");
      check(store.next(data, wed) == fri, "Wednesday to Friday");
      check(store.next(data, fri) == time(10, 5, 10, 0), "Friday to Monday");
      check(store.occurrence(data, mon).getString("itemId").equals("team"), "root identity");
      check(store.occurrence(data, wed).getString("itemId").equals("weekly:team:2026-09-30"), "dated Done identity");
      check(store.preAlertAt(data, wed, mon) == time(9, 30, 9, 55), "Wednesday pre-alert");
      check(store.preAlertAt(data, mon, time(9, 28, 9, 56)) == null, "expired pre-alert skipped");
      check(store.next(data, time(9, 28, 9, 56)) == mon, "main retained after pre-alert expires");
      data.put("excludedDates", new JSONArray().put("2026-09-28"));
      check(store.next(data, mon - 60000) == wed, "Done affects only Monday");
      // Same JSON round-trip used by SharedPreferences: no JS or in-memory series required.
      JSONObject restored = new JSONObject(data.toString());
      check(store.next(restored, time(10, 4, 12, 0)) == time(10, 5, 10, 0), "boot restore after missed dates");
      check(store.next(restored, time(10, 4, 12, 0)).equals(store.next(restored, time(10, 4, 12, 0))), "idempotent restore");
      data.put("weeklyDays", new JSONArray().put(3));
      check(store.next(data, wed) == time(10, 7, 10, 0), "single Wednesday +7 days");
      data.put("weeklyDays", new JSONArray().put(1).put(3).put(5)).put("excludedDates", new JSONArray());
      data.put("startAt", time(3, 6, 10, 0));
      check(store.next(data, time(3, 6, 10, 0)) == time(3, 9, 10, 0), "spring DST wall clock");
      data.put("startAt", time(10, 30, 10, 0));
      check(store.next(data, time(10, 30, 10, 0)) == time(11, 2, 10, 0), "fall DST wall clock");
      data.put("startAt", time(11, 2, 11, 0)).put("anchorItemId", "weekly:team:2026-11-02")
        .put("weeklyDays", new JSONArray().put(2).put(4)).put("preAlertMinutes", 10);
      check(store.next(data, time(11, 2, 9, 0)) == time(11, 3, 11, 0), "edited weekdays and time");
      check(store.preAlertAt(data, time(11, 3, 11, 0), time(11, 2, 9, 0)) == time(11, 3, 10, 50), "edited pre-alert");
      data.put("repeat", "none");
      check(store.next(data, time(11, 2, 12, 0)) == null, "None stops recurrence");
    }
    System.out.println("PASS actual Kotlin Weekly scheduler: selected weekdays, identity, pre-alert skip/main, completion exclusion, persisted restoration, DST, edits, None");
  }
}
