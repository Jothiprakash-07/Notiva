package android.content; import android.net.Uri; import java.util.*; public class Intent {
 public static final int FLAG_ACTIVITY_NEW_TASK=0x10000000; private Uri data; private String action; private Map<String,String> extras=new HashMap<>();
 public Intent(){} public Intent(Context c,Class<?> k){} public Intent(String a,Uri u){action=a;data=u;}
 public Intent setData(Uri u){data=u;return this;} public Uri getData(){return data;}public Intent setAction(String a){action=a;return this;}public String getAction(){return action;}
 public Intent putExtra(String k,String v){extras.put(k,v);return this;}public String getStringExtra(String k){return extras.get(k);}public Intent addFlags(int f){return this;}public Intent setPackage(String p){return this;}
 public String identity(){return action+":"+data;}}
 