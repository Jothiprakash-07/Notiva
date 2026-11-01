import com.notiva.alarm.*;
import org.json.*;
import java.nio.file.*;
import java.util.*;
import android.content.*;
import android.app.*;

/** Production Kotlin AlarmStore + fixed clock, with only Android OS boundaries doubled. */
class SharedAlarmRegression {
  static long now = java.time.Instant.parse("2030-01-04T09:00:00Z").toEpochMilli();
  static final AlarmStore store = AlarmStore.INSTANCE;
  static void check(boolean ok, String why) {if (!ok) throw new AssertionError(why);}
  static JSONObject data(String id, String repeat, long at) {
    return new JSONObject().put("id", "native-alarm:"+id).put("itemId", id).put("title", "Test").put("repeat", repeat).put("startAt", at).put("preAlertMinutes",5)
      .put("sharedRecurrence",new JSONObject().put("version",1).put("active",true).put("baseItemId", "notiva-account[A]::notiva-shared[one]::"+id)
        .put("organizationId","one").put("sharedItemId",id).put("timeZone","UTC").put("anchorAt",at).put("effectiveFrom",at).put("notBefore",at).put("scheduleRevision",1));
  }
  public static void main(String[] args) throws Exception {
    JSONArray fixtures = new JSONArray(Files.readString(Path.of(args[0])));
    for (String host : new String[]{"UTC","Asia/Tokyo","America/Los_Angeles"}) {
      TimeZone.setDefault(TimeZone.getTimeZone(host));
      for(int i=0;i<fixtures.length();i++) {
        JSONObject f=fixtures.getJSONObject(i), d=f.getJSONObject("data");long expected=f.getLong("expected");
        check(Objects.equals(store.next(d,f.getLong("after")),expected),"JS/Kotlin next parity "+f);
        check(SharedAlarmRecurrence.INSTANCE.key(d,expected).equals(f.getString("key")),"JS/Kotlin key parity "+f);
        check(store.occurrence(d,expected).getString("itemId").endsWith("::occ["+java.net.URLEncoder.encode(f.getString("key"),"UTF-8")+"]"),"occurrence Done identity");
      }
    }
    System.out.println("PASS "+fixtures.length()*3+" JS/Kotlin parity cases across three host timezones (all repeat types, month 28/29/30/31, leap dates, DST)");
    TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
    var clock=AlarmStore.class.getDeclaredField("now");clock.setAccessible(true);Object old=clock.get(null);clock.set(null,(kotlin.jvm.functions.Function0<Long>)()->now);
    try {
      for(String repeat:new String[]{"daily","weekly","weekdays","monthly","yearly"}) {
        Context c=new Context();JSONObject d=data(repeat,repeat,now);String id=d.getString("id");
        store.schedule(c,d,now-600000,true);PendingIntent stale=store.pending(c,id);
        check(c.manager.scheduled.size()==2,"initial main/pre pair");
        store.fire(c,id);JSONObject saved=store.get(c,id);long next=store.next(d,now);
        check(saved.getLong("nextAt")==next,"fire rearms "+repeat);
        check(saved.getLong("preDue")==next,"fire rearms next pre-alert "+repeat);
        check(c.manager.scheduled.size()==2,"one pair after fire "+repeat);
        check(!stale.equals(store.pending(c,id)),"occurrence-specific PendingIntent");
        int calls=c.deliveries;new AlarmReceiver().onReceive(c,stale.intent);store.fire(c,id);
        check(c.deliveries==calls && c.manager.scheduled.size()==2,"duplicate receiver/fire is idempotent");
        // Done/Dismiss only change the already-fired service snapshot. Neither consumes the persisted next schedule.
        JSONObject fired=new JSONObject(c.delivered.getStringExtra("alarm"));
        check(!fired.getString("id").equals(id) && fired.getString("sourceId").equals(id),"ringing occurrence separated from series control");
        c.manager.scheduled.clear();Context restarted=new Context();restarted.manager=c.manager;restarted.prefs.putAll(c.prefs);store.restore(restarted);check(restarted.manager.scheduled.size()==2,"reboot/process restore pair from persisted JSON");
        store.cancel(restarted,id);restarted.manager.scheduled.clear();store.restore(restarted);check(restarted.manager.scheduled.isEmpty(),"revocation stays removed after process restart");
        store.cancel(c,id);store.fire(c,id);store.restore(c);new AlarmReceiver().onReceive(c,stale.intent);
        check(store.get(c,id)==null && c.manager.scheduled.isEmpty(),"cancel/membership cleanup prevents resurrection");
      }
      check(store.next(data("week","weekly",now),now)==now+7*86400000L,"weekly singleton advances a week");
      check(store.next(data("weekdays","weekdays",now),now)==now+3*86400000L,"Friday advances to Monday");
      JSONObject inactive=data("off","daily",now);inactive.getJSONObject("sharedRecurrence").put("active",false);
      check(store.next(inactive,now)==null,"disabled metadata never produces a next alarm");
      Context c=new Context();JSONObject a=data("a","daily",now), b=data("b","weekdays",now), personal=new JSONObject().put("id","personal").put("itemId","personal").put("title","Personal").put("repeat","none").put("startAt",now);
      store.schedule(c,a,now-600000,true);store.schedule(c,b,now-600000,true);store.schedule(c,personal,now-600000,true);
      store.fire(c,"native-alarm:a");check(c.deliveries==1,"one grouped ringing session");
      check(new JSONArray(c.delivered.getStringExtra("alarms")).length()==3,"mixed personal/shared group");
      check(store.get(c,"personal")==null && store.get(c,"native-alarm:a")!=null && store.get(c,"native-alarm:b")!=null,"rearm each recurring series only");
      check(c.manager.scheduled.size()==4,"two independent next pairs");
      store.fire(c,"native-alarm:b");check(c.deliveries==1,"group member duplicate suppressed");
      PendingIntent previous=store.pending(c,"native-alarm:a");JSONObject edit=data("a","monthly",now+3600000);edit.getJSONObject("sharedRecurrence").put("scheduleRevision",2);
      store.cancel(c,"native-alarm:a");store.schedule(c,edit,now,true);new AlarmReceiver().onReceive(c,previous.intent);
      check(store.get(c,"native-alarm:a").getString("occurrenceKey").startsWith("2|"),"edit revision rejects stale native broadcast");
      check(c.manager.scheduled.size()==4,"edited pair replaces stale pair");
      now=java.time.Instant.parse("2030-01-04T08:50:00Z").toEpochMilli();
      Context preContext=new Context();JSONObject pre=data("pre","daily",now+600000);
      store.schedule(preContext,pre,now,true);
      PendingIntent preIntent=preContext.manager.scheduled.keySet().stream().filter(p->"pre".equals(p.intent.getAction())).findFirst().orElseThrow();
      now+=300000;new AlarmReceiver().onReceive(preContext,preIntent.intent);
      check(store.get(preContext,"native-alarm:pre").getLong("preDeliveredDue")==now+300000,"pre-alert records exact occurrence once");
      check(preContext.manager.scheduled.size()==2,"pre-alert rearm retains one main and one future pre");
      new AlarmReceiver().onReceive(preContext,preIntent.intent);check(preContext.manager.scheduled.size()==2,"duplicate old pre broadcast ignored");
      now+=300000;store.fire(preContext,"native-alarm:pre");check(preContext.manager.scheduled.size()==2,"main fire retains already-advanced pre pair");
      System.out.println("PASS actual Kotlin fire/rearm: five repeat types, paired pre-alerts, duplicate delivery, offline group, process/reboot persistence, edits, cancellation/membership cleanup");
    } finally {clock.set(null,old);}
  }
}

