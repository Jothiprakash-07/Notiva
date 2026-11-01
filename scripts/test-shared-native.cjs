/* global __dirname */
// Executes compiled production Kotlin against deterministic JVM Android test doubles.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { spawnSync } = require('node:child_process');
const calendar = require('../shared/recurrence.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.shared-native-test');
const assert = require('node:assert/strict');
const service = fs.readFileSync(path.join(root, 'plugins/native-alarm/AlarmService.kt'), 'utf8');
const done = service.slice(service.indexOf('  fun done('), service.indexOf('  fun remove('));
assert.ok(done.includes('"done:$token"') && done.includes('remove(id)'));
assert.ok(!done.includes('AlarmStore.cancel') && !done.includes('AlarmStore.schedule'));
const activity = fs.readFileSync(path.join(root, 'plugins/native-alarm/AlarmActivity.kt'), 'utf8');
assert.ok(activity.includes('AlarmService.instance?.remove(id)'));
assert.ok(service.includes('if (intent.action == Intent.ACTION_SCREEN_OFF) silenceCurrentAlarm()'));
console.log('PASS Done persists intent, Dismiss removes ringing only, and screen-off silence do not consume next schedule (native source contracts)');
fs.mkdirSync(out, { recursive: true });
const fixtures = [];
for (const zone of ['UTC', 'Asia/Kolkata', 'America/New_York', 'Europe/Berlin', 'Australia/Lord_Howe']) {
  for (const [repeat, anchor] of [['daily', '2030-01-01T09:00:00Z'], ['weekly', '2030-01-01T09:00:00Z'], ['weekdays', '2030-01-04T09:00:00Z'],
    ...[28, 29, 30, 31].map(day => ['monthly', `2032-01-${day}T09:00:00Z`]), ['yearly', '2032-02-29T09:00:00Z'], ['yearly', '2030-10-22T09:00:00Z'],
    ['daily', '2030-03-09T02:30:00-05:00'], ['daily', '2030-11-02T01:30:00-04:00']]) {
    const item = { id: 'series', status: 'active', type: 'task', scheduleRevision: 7, schedule: { startAt: anchor }, recurrence: { repeat, timeZone: zone, ...(repeat === 'weekly' ? { weeklyDays: [2, 4] } : {}) } };
    let after = new Date(anchor);
    for (let step = 0; step < 8; step++) {
      const next = calendar.nextOccurrence(item, after);
      const data = { id: 'native-alarm:notiva-account[A]::notiva-shared[one]::series', itemId: 'notiva-account[A]::notiva-shared[one]::series', repeat, startAt: Date.parse(anchor), preAlertMinutes: 5,
        sharedRecurrence: { version: 1, active: true, anchorAt: Date.parse(anchor), effectiveFrom: Date.parse(anchor), notBefore: Date.parse(anchor), timeZone: zone, scheduleRevision: 7, baseItemId: 'notiva-account[A]::notiva-shared[one]::series', ...(repeat === 'weekly' ? { weeklyDays: [2, 4] } : {}) } };
      fixtures.push({ data, after: +after, expected: Date.parse(next.startAt), key: next.key }); after = new Date(next.startAt);
    }
  }
}
fs.writeFileSync(path.join(out, 'fixtures.json'), JSON.stringify(fixtures));
const sources = {
 'android/content/SharedPreferences.java': `package android.content; import java.util.*; public interface SharedPreferences {
 Map<String,?> getAll(); String getString(String k,String d); boolean getBoolean(String k,boolean d); boolean contains(String k); Editor edit();
 interface Editor { Editor putString(String k,String v); Editor putBoolean(String k,boolean v); Editor remove(String k); boolean commit(); }
 }`,
 'android/content/Context.java': `package android.content; import java.util.*; import android.app.*; public class Context {
 public static final int MODE_PRIVATE=0; public final Map<String,Memory> prefs=new HashMap<>(); public AlarmManager manager=new AlarmManager(); public Intent delivered; public int deliveries;
 public SharedPreferences getSharedPreferences(String n,int m) { return prefs.computeIfAbsent(n,k->new Memory()); }
 public <T>T getSystemService(Class<T> k) { return k.cast(k==AlarmManager.class ? manager : new NotificationManager()); }
 public android.content.pm.PackageManager getPackageManager(){return new android.content.pm.PackageManager();} public String getPackageName(){return "test";}
 public ComponentName startForegroundService(Intent i){ delivered=i; deliveries++; return null;} public ComponentName startService(Intent i){return startForegroundService(i);}
 public android.content.pm.ApplicationInfo getApplicationInfo(){return new android.content.pm.ApplicationInfo();}
 public static class Memory implements SharedPreferences { public final Map<String,Object> data=new LinkedHashMap<>();
 public Map<String,?> getAll(){return new LinkedHashMap<>(data);} public String getString(String k,String d){return (String)data.getOrDefault(k,d);}
 public boolean getBoolean(String k,boolean d){return (Boolean)data.getOrDefault(k,d);} public boolean contains(String k){return data.containsKey(k);}
 public Editor edit(){return new Editor(){Map<String,Object> writes=new HashMap<>();Set<String> removed=new HashSet<>();
 public Editor putString(String k,String v){writes.put(k,v);return this;} public Editor putBoolean(String k,boolean v){writes.put(k,v);return this;}
 public Editor remove(String k){removed.add(k);return this;}public boolean commit(){removed.forEach(data::remove);data.putAll(writes);return true;}};}}
 }`,
 'android/content/Intent.java': `package android.content; import android.net.Uri; import java.util.*; public class Intent {
 public static final int FLAG_ACTIVITY_NEW_TASK=0x10000000; private Uri data; private String action; private Map<String,String> extras=new HashMap<>();
 public Intent(){} public Intent(Context c,Class<?> k){} public Intent(String a,Uri u){action=a;data=u;}
 public Intent setData(Uri u){data=u;return this;} public Uri getData(){return data;}public Intent setAction(String a){action=a;return this;}public String getAction(){return action;}
 public Intent putExtra(String k,String v){extras.put(k,v);return this;}public String getStringExtra(String k){return extras.get(k);}public Intent addFlags(int f){return this;}public Intent setPackage(String p){return this;}
 public String identity(){return action+":"+data;}}
 `,
 'android/content/pm/PackageManager.java': `package android.content.pm; public class PackageManager {public android.content.Intent getLaunchIntentForPackage(String n){return new android.content.Intent();}}`,
 'android/content/pm/ApplicationInfo.java': `package android.content.pm;public class ApplicationInfo {public int icon=1;}`,
 'android/content/ComponentName.java': `package android.content;public class ComponentName {}`,
 'android/content/BroadcastReceiver.java': `package android.content;public abstract class BroadcastReceiver {public abstract void onReceive(Context c,Intent i);}`,
 'android/net/Uri.java': `package android.net; public class Uri {final String raw;Uri(String r){raw=r;}public static Uri parse(String r){return new Uri(r);}
 public static String encode(String s){return java.net.URLEncoder.encode(s,java.nio.charset.StandardCharsets.UTF_8).replace("+","%20");}
 public String getSchemeSpecificPart(){return java.net.URLDecoder.decode(raw.substring(raw.indexOf(':')+1).split("#",2)[0],java.nio.charset.StandardCharsets.UTF_8);}
 public String getFragment(){return raw.contains("#")?java.net.URLDecoder.decode(raw.split("#",2)[1],java.nio.charset.StandardCharsets.UTF_8):null;}public String toString(){return raw;}}`,
 'android/app/PendingIntent.java': `package android.app; import android.content.*;public class PendingIntent {
 public static final int FLAG_UPDATE_CURRENT=1,FLAG_IMMUTABLE=2,FLAG_NO_CREATE=4;public final Intent intent;final String key;
 PendingIntent(Intent i){intent=i;key=i.identity();}public static PendingIntent getBroadcast(Context c,int r,Intent i,int f){return new PendingIntent(i);}public static PendingIntent getActivity(Context c,int r,Intent i,int f){return new PendingIntent(i);}
 public void cancel(){}public boolean equals(Object o){return o instanceof PendingIntent p&&key.equals(p.key);}public int hashCode(){return key.hashCode();}}`,
 'android/app/AlarmManager.java': `package android.app; import java.util.*;public class AlarmManager {
 public final Map<PendingIntent,Long> scheduled=new HashMap<>();public static class AlarmClockInfo {final long time;public AlarmClockInfo(long t,PendingIntent p){time=t;}}
 public boolean canScheduleExactAlarms(){return true;}public void setAlarmClock(AlarmClockInfo i,PendingIntent p){scheduled.put(p,i.time);}public void cancel(PendingIntent p){scheduled.remove(p);}}`,
 'android/app/NotificationManager.java': `package android.app; public class NotificationManager {public void cancel(String t,int i){}public NotificationChannel getNotificationChannel(String s){return new NotificationChannel();}public void notify(String t,int i,Notification n){}public void createNotificationChannel(NotificationChannel c){}public static final int IMPORTANCE_HIGH=4;}`,
 'android/app/NotificationChannel.java': `package android.app;public class NotificationChannel {public NotificationChannel(){}public NotificationChannel(String i,CharSequence n,int a){}public void setSound(android.net.Uri u,android.media.AudioAttributes a){}public void enableVibration(boolean b){}public void setVibrationPattern(long[] p){}public void setShowBadge(boolean b){}}`,
 'android/app/Notification.java': `package android.app;public class Notification {public static final int PRIORITY_HIGH=1,DEFAULT_SOUND=1,DEFAULT_VIBRATE=2; public static class Builder {
 public Builder(android.content.Context c){}public Builder(android.content.Context c,String s){}public Builder setSmallIcon(int i){return this;}public Builder setContentTitle(CharSequence s){return this;}public Builder setContentText(CharSequence s){return this;}public Builder setContentIntent(PendingIntent p){return this;}public Builder setAutoCancel(boolean b){return this;}public Builder setOnlyAlertOnce(boolean b){return this;}public Builder setPriority(int i){return this;}public Builder setDefaults(int i){return this;}public Notification build(){return new Notification();}}}`,
 'android/media/AudioAttributes.java': `package android.media;public class AudioAttributes {public static final int USAGE_NOTIFICATION=5,CONTENT_TYPE_SONIFICATION=4;public static class Builder {public Builder setUsage(int i){return this;}public Builder setContentType(int i){return this;}public AudioAttributes build(){return new AudioAttributes();}}}`,
 'android/media/RingtoneManager.java': `package android.media;public class RingtoneManager {public static final int TYPE_NOTIFICATION=2;public static android.net.Uri getDefaultUri(int i){return android.net.Uri.parse("sound:test");}}`,
 'android/os/Build.java': `package android.os;public class Build {public static class VERSION {public static final int SDK_INT=36;}}`,
 'android/util/Log.java': `package android.util;public class Log {public static int e(String t,String m,Throwable e){throw new RuntimeException(m,e);}}`,
 'android/text/format/DateFormat.java': `package android.text.format;public class DateFormat {public static java.text.DateFormat getTimeFormat(android.content.Context c){return new java.text.SimpleDateFormat("HH:mm");}}`,
 'com/notiva/alarm/AlarmService.java': `package com.notiva.alarm;public class AlarmService {public static final Companion Companion=new Companion(); public static class Companion {public AlarmService getInstance(){return null;}} public void dismissGroup(){}public void remove(String s){}public void removeSource(String s){}}`,
};
for (const [name, source] of Object.entries(sources)) { const file = path.join(out, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, source); }
const gradle = process.env.GRADLE_USER_HOME || path.join(process.env.USERPROFILE || os.homedir(), '.gradle');
function jar(dir) { for (const name of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, name.name); if (name.isFile() && name.name.endsWith('.jar')) return full; if (name.isDirectory()) { const found = jar(full); if (found) return found; } } }
const json = jar(path.join(gradle, 'caches/modules-2/files-2.1/org.json/json'));
const kotlin = jar(path.join(gradle, 'caches/modules-2/files-2.1/org.jetbrains.kotlin/kotlin-stdlib/2.1.20'));
const production = path.join(root, 'android/app/build/tmp/kotlin-classes/debug');
const javaHome = process.env.JAVA_HOME;
function execute(binary, args) { const result = spawnSync(javaHome ? path.join(javaHome, 'bin', binary + (process.platform === 'win32' ? '.exe' : '')) : binary, args, { stdio: 'inherit' }); if (result.error) throw result.error; if (result.status) process.exit(result.status); }
const cp = [out, production, json, kotlin].join(path.delimiter);
execute('javac', ['-cp', cp, '-d', out, ...Object.keys(sources).map(name => path.join(out, name)), path.join(__dirname, 'SharedAlarmRegression.java')]);
execute('java', ['-cp', cp, 'SharedAlarmRegression', path.join(out, 'fixtures.json')]);

