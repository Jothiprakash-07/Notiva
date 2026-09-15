package com.notiva.alarm

import android.app.*
import android.content.*
import android.net.Uri
import android.os.Build
import org.json.JSONObject
import java.util.Calendar

/** Durable schedules; no JavaScript runtime is needed to fire or re-arm an alarm. */
object AlarmStore {
  fun prefs(c: Context) = c.getSharedPreferences("notiva.native.alarms.v1", Context.MODE_PRIVATE)
  fun manager(c: Context) = c.getSystemService(AlarmManager::class.java)
  fun allowed(c: Context) = Build.VERSION.SDK_INT < 31 || manager(c).canScheduleExactAlarms()
  fun get(c: Context, id: String): JSONObject? = prefs(c).getString("schedule:$id", null)?.let { JSONObject(it) }
  fun intent(c: Context, id: String) = Intent(c, AlarmReceiver::class.java).setData(Uri.parse("notiva-alarm:" + Uri.encode(id)))
  fun pending(c: Context, id: String): PendingIntent = PendingIntent.getBroadcast(c, 0, intent(c, id), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  // Calendar arithmetic preserves local wall time across DST. Invalid month days
  // (31st / February 29) are skipped, rather than drifting to the end of a month.
  fun next(data: JSONObject, after: Long): Long? {
    val start = data.getLong("startAt")
    val repeat = data.optString("repeat", "none")
    if (repeat == "none") return if (start > after) start else null
    require(repeat in listOf("daily", "weekly", "weekdays", "monthly", "yearly"))
    val anchor = Calendar.getInstance().apply { timeInMillis = start }
    val day = anchor.get(Calendar.DAY_OF_MONTH)
    val month = anchor.get(Calendar.MONTH)
    val candidate = anchor.clone() as Calendar
    if (after > start) {
      candidate.timeInMillis = after
      candidate.set(Calendar.HOUR_OF_DAY, anchor.get(Calendar.HOUR_OF_DAY))
      candidate.set(Calendar.MINUTE, anchor.get(Calendar.MINUTE))
      candidate.set(Calendar.SECOND, anchor.get(Calendar.SECOND))
      candidate.set(Calendar.MILLISECOND, anchor.get(Calendar.MILLISECOND))
    }
    repeat(366 * 9) {
      val weekday = candidate.get(Calendar.DAY_OF_WEEK)
      val matches = when (repeat) {
        "weekly" -> weekday == anchor.get(Calendar.DAY_OF_WEEK)
        "weekdays" -> weekday != Calendar.SATURDAY && weekday != Calendar.SUNDAY
        "monthly" -> candidate.get(Calendar.DAY_OF_MONTH) == day
        "yearly" -> candidate.get(Calendar.DAY_OF_MONTH) == day && candidate.get(Calendar.MONTH) == month
        else -> true
      }
      if (matches && candidate.timeInMillis >= start && candidate.timeInMillis > after) return candidate.timeInMillis
      candidate.add(Calendar.DAY_OF_YEAR, 1)
    }
    error("Could not calculate next alarm")
  }

  @Synchronized fun schedule(c: Context, data: JSONObject, after: Long = System.currentTimeMillis()): String {
    check(allowed(c)) { "Allow Alarms & reminders access before saving this reminder." }
    val id = data.getString("id")
    val time = next(data, after) ?: error("Choose a future alarm time.")
    data.put("nextAt", time)
    val show = PendingIntent.getActivity(c, 0, c.packageManager.getLaunchIntentForPackage(c.packageName)!!,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    manager(c).setAlarmClock(AlarmManager.AlarmClockInfo(time, show), pending(c, id))
    check(prefs(c).edit().putString("schedule:$id", data.toString()).commit()) { "Could not save alarm" }
    return id
  }

  @Synchronized fun cancel(c: Context, id: String) {
    manager(c).cancel(pending(c, id))
    prefs(c).edit().remove("schedule:$id").commit()
    AlarmService.instance?.remove(id)
  }

  @Synchronized fun fire(c: Context, id: String) {
    val data = get(c, id) ?: return
    // Ignore stale/cancelled broadcasts; re-arm before starting the foreground service.
    val due = data.getLong("nextAt")
    if (due > System.currentTimeMillis() + 1000) return
    prefs(c).edit().remove("schedule:$id").commit()
    if (data.optString("repeat") != "none") schedule(c, data, maxOf(due, System.currentTimeMillis()))
    val service = Intent(c, AlarmService::class.java).putExtra("alarm", data.toString())
    if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(service) else c.startService(service)
  }

  @Synchronized fun restore(c: Context) {
    if (!allowed(c)) return
    prefs(c).all.filterKeys { it.startsWith("schedule:") }.values.forEach { raw ->
      val data = JSONObject(raw as String)
      if (next(data, System.currentTimeMillis()) != null) schedule(c, data)
      else prefs(c).edit().remove("schedule:${data.getString("id")}").commit()
    }
  }
}

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == "dismiss") {
      intent.getStringExtra("id")?.let { AlarmService.instance?.remove(it) }
      return
    }
    val id = intent.data?.schemeSpecificPart ?: return
    try { AlarmStore.fire(context, id) } catch (e: Exception) { android.util.Log.e("NotivaAlarm", "Alarm delivery failed", e) }
  }
}

class AlarmRestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try { AlarmStore.restore(context) } catch (e: Exception) { android.util.Log.e("NotivaAlarm", "Alarm restoration failed", e) }
  }
}
