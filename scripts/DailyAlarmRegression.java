import com.notiva.alarm.AlarmStore;
import java.util.Calendar;
import java.util.TimeZone;
import org.json.JSONObject;
import org.json.JSONArray;

// Run against the compiled app's actual AlarmStore (no Android UI/OS delivery).
class DailyAlarmRegression {
  static long time(int year, int month, int day, int hour, int minute) {
    Calendar c = Calendar.getInstance(); c.clear(); c.set(year, month - 1, day, hour, minute); return c.getTimeInMillis();
  }
  static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
  public static void main(String[] args) {
    AlarmStore store = AlarmStore.INSTANCE;
    for (String zone : new String[]{"Asia/Kolkata", "America/New_York"}) {
      TimeZone.setDefault(TimeZone.getTimeZone(zone));
      long first = time(2026, 9, 24, 22, 0);
      JSONObject data = new JSONObject().put("id", "native-alarm:daily-series:report").put("itemId", "report")
        .put("seriesId", "report").put("anchorItemId", "report").put("firstAt", first).put("startAt", first)
        .put("repeat", "daily").put("preAlertMinutes", 5).put("excludedDates", new JSONArray());
      check(store.next(data, first - 1) == first, "initial occurrence");
      long tomorrow = time(2026, 9, 25, 22, 0);
      check(store.next(data, first) == tomorrow, "next calendar day");
      check(store.occurrence(data, first).getString("itemId").equals("report"), "original identity");
      JSONObject fired = store.occurrence(data, tomorrow);
      check(fired.getString("itemId").equals("daily:report:2026-09-25"), "dated native Done identity");
      check(fired.getLong("startAt") == tomorrow, "actual occurrence timestamp");
      check(data.getString("id").equals("native-alarm:daily-series:report"), "firing does not mutate master");
      check(store.preAlertAt(data, tomorrow, first) == time(2026, 9, 25, 21, 55), "per-occurrence pre-alert");
      check(store.preAlertAt(data, first, time(2026, 9, 24, 21, 56)) == null, "expired pre-alert silent skip");
      check(store.next(data, time(2026, 9, 24, 21, 56)) == first, "expired pre-alert retains main");
      data.put("excludedDates", new JSONArray().put("2026-09-24"));
      check(store.next(data, first - 60000) == tomorrow, "early completion skips only completed date");
      data.put("startAt", time(2026, 3, 7, 22, 0)).put("excludedDates", new JSONArray());
      check(store.next(data, time(2026, 3, 7, 22, 0)) == time(2026, 3, 8, 22, 0), "spring DST wall time");
      data.put("startAt", time(2026, 10, 31, 22, 0));
      check(store.next(data, time(2026, 10, 31, 22, 0)) == time(2026, 11, 1, 22, 0), "fall DST wall time");
      data.put("startAt", first).put("repeat", "none");
      check(store.next(data, first) == null, "one-time stops recurrence");
    }
    System.out.println("PASS actual Kotlin Daily scheduler: occurrence identity, pre-alert time/skip, main retention, completion exclusion, DST, Repeat None");
  }
}
