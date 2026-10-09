import com.notiva.alarm.AlarmStore;
import java.util.Calendar;
import java.util.TimeZone;
import org.json.JSONObject;
import org.json.JSONArray;

// Execute the app's compiled production Kotlin helpers; Android delivery needs a device.
class WeekdaysAlarmRegression {
  static long time(int month, int day, int hour, int minute) {
    Calendar c = Calendar.getInstance(); c.clear(); c.set(2026, month - 1, day, hour, minute); return c.getTimeInMillis();
  }
  static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
  public static void main(String[] args) {
    AlarmStore store = AlarmStore.INSTANCE;
    for (String zone : new String[]{"Asia/Kolkata", "America/New_York", "UTC"}) {
      TimeZone.setDefault(TimeZone.getTimeZone(zone));
      long first = time(9, 21, 9, 0);
      JSONObject data = new JSONObject().put("id", "native-alarm:weekdays-series:office").put("itemId", "office")
        .put("seriesId", "office").put("anchorItemId", "office").put("firstAt", first).put("startAt", first)
        .put("repeat", "weekdays").put("preAlertMinutes", 5).put("excludedDates", new JSONArray());
      int[][] transitions = {{21,22},{22,23},{23,24},{24,25},{25,28},{26,28},{27,28}};
      for (int[] pair : transitions) {
        check(store.next(data, time(9, pair[0], 9, 0)) == time(9, pair[1], 9, 0), zone + ": " + pair[0] + " -> " + pair[1]);
      }
      long friday = time(9, 25, 9, 0), monday = time(9, 28, 9, 0);
      check(store.occurrence(data, first).getString("itemId").equals("office"), "root identity");
      check(store.occurrence(data, friday).getString("itemId").equals("weekdays:office:2026-09-25"), "Friday identity");
      check(store.occurrence(data, monday).getString("itemId").equals("weekdays:office:2026-09-28"), "Monday identity");
      check(store.preAlertAt(data, monday, friday) == time(9, 28, 8, 55), "Monday pre-alert");
      check(store.preAlertAt(data, friday, time(9, 25, 8, 56)) == null, "expired pre-alert skip");
      check(store.next(data, time(9, 25, 8, 56)) == friday, "expired pre-alert retains main");
      data.put("excludedDates", new JSONArray().put("2026-09-25"));
      check(store.next(data, friday - 60000) == monday, "early Done skips Friday only");
      JSONObject restored = new JSONObject(data.toString());
      check(store.next(restored, time(9, 26, 12, 0)) == monday, "persisted boot restore without JS");
      check(store.next(restored, time(9, 26, 12, 0)) == monday, "repeat restore deterministic");
      data.put("excludedDates", new JSONArray()).put("startAt", time(3, 6, 9, 0));
      check(store.next(data, time(3, 6, 9, 0)) == time(3, 9, 9, 0), "spring DST local clock");
      data.put("startAt", time(10, 30, 9, 0));
      check(store.next(data, time(10, 30, 9, 0)) == time(11, 2, 9, 0), "fall DST local clock");
      data.put("startAt", time(11, 2, 10, 0)).put("anchorItemId", "weekdays:office:2026-11-02").put("preAlertMinutes", 10);
      long edited = time(11, 2, 10, 0);
      check(store.next(data, time(11, 2, 8, 0)) == edited, "edited clock");
      check(store.preAlertAt(data, edited, time(11, 2, 8, 0)) == time(11, 2, 9, 50), "edited pre-alert");
      check(store.occurrence(data, edited).getString("itemId").equals("weekdays:office:2026-11-02"), "edited anchor identity");
      data.put("repeat", "none");
      check(store.next(data, edited) == null, "None stops re-arming");
    }
    System.out.println("PASS actual Kotlin Weekdays: all weekday/weekend transitions, identities, Done exclusion, pre-alert/skip, persisted restoration, DST, edits, None");
  }
}
