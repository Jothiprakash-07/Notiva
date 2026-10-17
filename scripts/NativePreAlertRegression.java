import com.notiva.alarm.AlarmStore;
import java.util.Calendar;
import java.util.TimeZone;
import org.json.JSONObject;
import org.json.JSONArray;

class NativePreAlertRegression {
  static long at(int day, int hour, int minute) {
    Calendar c = Calendar.getInstance(); c.clear(); c.set(2026, 8, day, hour, minute); return c.getTimeInMillis();
  }
  static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
  public static void main(String[] args) {
    AlarmStore s = AlarmStore.INSTANCE;
    for (int day : new int[]{29,30,31}) {
      Calendar anchor = Calendar.getInstance(); anchor.clear(); anchor.set(2026,0,day,12,0);
      JSONObject monthly = new JSONObject().put("startAt",anchor.getTimeInMillis()).put("repeat","monthly")
        .put("seriesId","month").put("firstAt",anchor.getTimeInMillis()).put("anchorItemId","month");
      Calendar due = Calendar.getInstance(); due.setTimeInMillis(s.next(monthly,anchor.getTimeInMillis()));
      check(due.get(Calendar.MONTH)==2 && due.get(Calendar.DAY_OF_MONTH)==day,"invalid February day skipped");
      monthly.put("excludedDates",new JSONArray().put(s.dayKey(due.getTimeInMillis())));
      long following=s.next(monthly,anchor.getTimeInMillis());
      check(following>due.getTimeInMillis(),"monthly completed occurrence excluded");
    }
    Calendar leap=Calendar.getInstance(); leap.clear(); leap.set(2024,1,29,12,0);
    JSONObject yearly=new JSONObject().put("startAt",leap.getTimeInMillis()).put("repeat","yearly");
    Calendar nextLeap=Calendar.getInstance(); nextLeap.setTimeInMillis(s.next(yearly,leap.getTimeInMillis()));
    check(nextLeap.get(Calendar.YEAR)==2028 && nextLeap.get(Calendar.MONTH)==1 && nextLeap.get(Calendar.DAY_OF_MONTH)==29,"Feb 29 skips non-leap years");
    JSONObject ownerA = new JSONObject().put("itemId", "notiva-account[A]::one").put("startAt", at(28,10,30));
    JSONObject ownerA2 = new JSONObject().put("itemId", "notiva-account[A]::two").put("startAt", at(28,10,30));
    JSONObject ownerB = new JSONObject().put("itemId", "notiva-account[B]::one").put("startAt", at(28,10,30));
    check(s.groupSlot(ownerA, at(28,10,30)).equals(s.groupSlot(ownerA2, at(28,10,30)+59000)), "same owner/local minute derives group");
    check(!s.groupSlot(ownerA, at(28,10,30)).equals(s.groupSlot(ownerB, at(28,10,30))), "different owners never group");
    check(!s.groupSlot(ownerA, at(28,10,30)).equals(s.groupSlot(ownerA2, at(28,10,31))), "different minutes never group");
    check(!s.groupSlot(ownerA, at(28,10,30)).equals(s.groupSlot(ownerA2, at(29,10,30))), "different dates never group");
    for (String zone : new String[]{"Asia/Kolkata", "America/New_York"}) {
      TimeZone.setDefault(TimeZone.getTimeZone(zone));
      long now = at(28, 10, 0);
      for (int minutes : new int[]{5,10,15,30,60,1440}) {
        long due = now + (minutes + 3) * 60000L;
        JSONObject data = new JSONObject().put("startAt", due).put("repeat", "none").put("preAlertMinutes", minutes);
        check(s.nextPreDue(data, now) == due, "future native pre " + minutes);
        check(s.preAlertAt(data, due, now) == now + 180000, "offset " + minutes);
        check(s.nextPreDue(data, now + 180000) == null, "reboot at pre-time skips");
        check(s.nextPreDue(data, now + 240000) == null, "expired skips");
        check(s.next(data, now + 240000) == due, "main retained");
        data.put("preDeliveredDue", due);
        check(s.nextPreDue(data, now) == null, "delivered occurrence never repeats");
      }
      for (String repeat : new String[]{"daily", "weekly", "weekdays"}) {
        JSONObject data = new JSONObject().put("startAt", at(28, 10, 30)).put("repeat", repeat)
          .put("preAlertMinutes", 5).put("weeklyDays", new JSONArray().put(1).put(3));
        long due = s.nextPreDue(data, now);
        check(due == at(28,10,30), "first " + repeat);
        data.put("preDeliveredDue", due);
        long expected = repeat.equals("weekly") ? at(30,10,30) : at(29,10,30);
        check(s.nextPreDue(data, at(28,10,25)) == expected, "independent pre rearm " + repeat);
        data.remove("preDeliveredDue"); data.put("preAlertMinutes", 1440);
        check(s.nextPreDue(data, now) == expected, "one-day lead advances past expired first pre " + repeat);
        check(s.next(data, now) == at(28,10,30), "pre cursor does not advance main");
      }
      JSONObject weekdays = new JSONObject().put("startAt", at(25,10,30)).put("repeat","weekdays").put("preAlertMinutes",5);
      check(s.nextPreDue(weekdays, at(25,10,25)) == at(28,10,30), "Friday pre independently rearms Monday");
    }
    System.out.println("PASS actual Kotlin native pre-alert offsets, expired/reboot skip, independent main/pre cursors, no catch-up, delivered dedupe, Daily/Weekly/Weekdays, one-day leads");
  }
}
