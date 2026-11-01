package android.content; import java.util.*; import android.app.*; public class Context {
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
 }