package android.content; import java.util.*; public interface SharedPreferences {
 Map<String,?> getAll(); String getString(String k,String d); boolean getBoolean(String k,boolean d); boolean contains(String k); Editor edit();
 interface Editor { Editor putString(String k,String v); Editor putBoolean(String k,boolean v); Editor remove(String k); boolean commit(); }
 }