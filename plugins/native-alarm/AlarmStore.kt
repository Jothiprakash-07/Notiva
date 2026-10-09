package com.notiva.alarm

import android.app.*
import android.content.*
import android.net.Uri
import android.os.Build
import android.media.AudioAttributes
import android.media.RingtoneManager
import org.json.JSONObject
import org.json.JSONArray
import java.util.Calendar
import java.util.Locale

/** Durable schedules; no JavaScript runtime is needed to fire or re-arm an alarm. */
object AlarmStore {
  private fun soundPrefs(c: Context) = c.getSharedPreferences("notiva_alarm_preferences", Context.MODE_PRIVATE)
  fun setAlarmSound(c: Context, sound: String) {
    check(soundPrefs(c).edit().putString("alarm_sound", AlarmAudio.normalize(sound)).commit()) {
      "Could not save alarm sound"
    }
  }
  fun alarmSound(c: Context, payload: JSONObject): String = AlarmAudio.normalize(
    soundPrefs(c).getString("alarm_sound", null) ?: payload.optString("alarmSound", "system")
  )

  fun prefs(c: Context) = c.getSharedPreferences("notiva.native.alarms.v1", Context.MODE_PRIVATE)
  fun manager(c: Context) = c.getSystemService(AlarmManager::class.java)
  fun allowed(c: Context) = Build.VERSION.SDK_INT < 31 || manager(c).canScheduleExactAlarms()
  fun get(c: Context, id: String): JSONObject? = prefs(c).getString("schedule:$id", null)?.let { JSONObject(it) }
  fun intent(c: Context, id: String) = Intent(c, AlarmReceiver::class.java).setData(Uri.parse("notiva-alarm:" + Uri.encode(id)))
  fun pending(c: Context, id: String): PendingIntent = PendingIntent.getBroadcast(c, 0, intent(c, id), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  private fun prePending(c: Context, id: String): PendingIntent = PendingIntent.getBroadcast(c, 0,
    intent(c, id).setAction("pre"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  private fun cancelLegacyPre(c: Context, id: String) {
    val old = PendingIntent.getBroadcast(c, 0, intent(c, id).setAction("daily-pre"),
      PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
    if (old != null) { manager(c).cancel(old); old.cancel() }
  }
  fun dayKey(time: Long): String = Calendar.getInstance().run {
    timeInMillis = time
    String.format(Locale.US, "%04d-%02d-%02d", get(Calendar.YEAR), get(Calendar.MONTH) + 1, get(Calendar.DAY_OF_MONTH))
  }
  fun occurrence(data: JSONObject, due: Long): JSONObject {
    val fired = JSONObject(data.toString())
    if (data.has("seriesId")) {
      val series = data.getString("seriesId")
      val itemId = if (dayKey(due) == dayKey(data.getLong("startAt"))) data.getString("anchorItemId")
        else if (dayKey(due) == dayKey(data.getLong("firstAt"))) series else "${data.optString("repeat", "daily")}:$series:${dayKey(due)}"
      fired.put("itemId", itemId).put("id", "native-alarm:$itemId").put("startAt", due)
    }
    return fired.put("nextAt", due)
  }
  fun groupSlot(data: JSONObject, due: Long = data.optLong("nextAt", data.optLong("startAt"))): String {
    val owner = Regex("notiva-account\\[([^\\]]+)\\]::").find(data.optString("itemId"))?.groupValues?.get(1) ?: "legacy"
    val clock = Calendar.getInstance().apply { timeInMillis = due }
    return "$owner:${dayKey(due)}:${clock.get(Calendar.HOUR_OF_DAY)}:${clock.get(Calendar.MINUTE)}"
  }
  private fun schedules(c: Context): List<JSONObject> = prefs(c).all.filterKeys { it.startsWith("schedule:") }
    .values.map { JSONObject(it as String) }
  private fun clearPreCard(c: Context, id: String) {
    val nm = c.getSystemService(NotificationManager::class.java)
    prefs(c).all.filterKeys { it.startsWith("pre-card:") }.forEach { (key, raw) ->
      val card = JSONObject(raw as String)
      val rows = card.getJSONArray("items")
      val remaining = (0 until rows.length()).map { rows.getJSONObject(it) }
        .filter { it.optString("sourceId") != id && it.optString("id") != id }
      if (remaining.size != rows.length()) {
        if (remaining.isEmpty()) { nm.cancel(key, 1); prefs(c).edit().remove(key).commit() }
        else { card.put("items", JSONArray(remaining)); prefs(c).edit().putString(key, card.toString()).commit()
          postPreCard(c, remaining, key, card.optBoolean("vibration", true)) }
      }
    }
  }
  fun preAlertAt(data: JSONObject, due: Long, now: Long): Long? {
    val minutes = data.optInt("preAlertMinutes", 0)
    val time = due - minutes * 60_000L
    return if (minutes > 0 && time > now) time else null
  }

  /** Independent cursor: a 24-hour lead may belong to a later occurrence than nextAt. */
  fun nextPreDue(data: JSONObject, now: Long): Long? {
    val minutes = data.optInt("preAlertMinutes", 0)
    if (minutes <= 0) return null
    return next(data, maxOf(now + minutes * 60_000L, data.optLong("preDeliveredDue", 0)))
  }

  @Synchronized fun setPreAlertSettings(c: Context, enabled: Boolean, vibration: Boolean) {
    val settings = soundPrefs(c)
    if (settings.contains("pre_enabled") && settings.getBoolean("pre_enabled", true) == enabled &&
      settings.getBoolean("pre_vibration", true) == vibration) return
    check(settings.edit().putBoolean("pre_enabled", enabled).putBoolean("pre_vibration", vibration).commit())
    prefs(c).all.filterKeys { it.startsWith("schedule:") }.values.forEach { raw ->
      val data = JSONObject(raw as String)
      armPre(c, data)
    }
  }

  private fun armPre(c: Context, data: JSONObject) {
    val id = data.getString("id")
    manager(c).cancel(prePending(c, id))
    cancelLegacyPre(c, id)
    val due = if (soundPrefs(c).getBoolean("pre_enabled", true) && allowed(c)) nextPreDue(data, System.currentTimeMillis()) else null
    data.remove("preDue")
    if (due != null) data.put("preDue", due)
    check(prefs(c).edit().putString("schedule:$id", data.toString()).commit())
    if (due != null) {
      val show = PendingIntent.getActivity(c, 0, c.packageManager.getLaunchIntentForPackage(c.packageName)!!,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      // Use the same alarm-clock scheduling class that survives this device's
      // freezer for main alarms. Delivery still posts ONLY a normal notification.
      manager(c).setAlarmClock(AlarmManager.AlarmClockInfo(due - data.optInt("preAlertMinutes") * 60_000L, show), prePending(c, id))
    }
  }

  // Calendar arithmetic preserves local wall time across DST. Invalid month days
  // (31st / February 29) are skipped, rather than drifting to the end of a month.
  fun next(data: JSONObject, after: Long): Long? {
    val start = data.getLong("startAt")
    val repeat = data.optString("repeat", "none")
    if (repeat == "none") return if (start > after) start else null
    require(repeat in listOf("daily", "weekly", "weekdays", "monthly", "yearly"))
    val anchor = Calendar.getInstance().apply { timeInMillis = start }
    val weeklyDays = data.optJSONArray("weeklyDays")?.let { days ->
      (0 until days.length()).map { days.getInt(it) }.toSet().also { selected ->
        require(selected.isNotEmpty() && selected.all { it in 0..6 }) { "Choose at least one weekday." }
      }
    } ?: setOf(anchor.get(Calendar.DAY_OF_WEEK) - 1)
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
        "weekly" -> (weekday - 1) in weeklyDays
        "weekdays" -> weekday != Calendar.SATURDAY && weekday != Calendar.SUNDAY
        "monthly" -> candidate.get(Calendar.DAY_OF_MONTH) == day
        "yearly" -> candidate.get(Calendar.DAY_OF_MONTH) == day && candidate.get(Calendar.MONTH) == month
        else -> true
      }
      val excluded = data.optJSONArray("excludedDates")
      val skipped = (repeat == "daily" || repeat == "weekly" || repeat == "weekdays") && excluded != null && (0 until excluded.length()).any { excluded.optString(it) == dayKey(candidate.timeInMillis) }
      if (matches && !skipped && candidate.timeInMillis >= start && candidate.timeInMillis > after) return candidate.timeInMillis
      candidate.add(Calendar.DAY_OF_YEAR, 1)
      if ((repeat == "daily" || repeat == "weekly" || repeat == "weekdays") && data.has("seriesId")) {
        candidate.set(Calendar.HOUR_OF_DAY, anchor.get(Calendar.HOUR_OF_DAY))
        candidate.set(Calendar.MINUTE, anchor.get(Calendar.MINUTE))
      }
    }
    error("Could not calculate next alarm")
  }

  @Synchronized fun schedule(c: Context, data: JSONObject, after: Long = System.currentTimeMillis(), rearmPre: Boolean = true): String {
    check(allowed(c)) { "Allow Alarms & reminders access before saving this reminder." }
    val id = data.getString("id")
    val previous = get(c, id)
    if (previous != null && previous.optLong("startAt") == data.optLong("startAt")) {
      data.put("preDeliveredDue", maxOf(previous.optLong("preDeliveredDue"), data.optLong("preDeliveredDue")))
    }
    val time = next(data, after) ?: error("Choose a future alarm time.")
    data.put("nextAt", time)
    val show = PendingIntent.getActivity(c, 0, c.packageManager.getLaunchIntentForPackage(c.packageName)!!,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    manager(c).setAlarmClock(AlarmManager.AlarmClockInfo(time, show), pending(c, id))
    check(prefs(c).edit().putString("schedule:$id", data.toString()).commit()) { "Could not save alarm" }
    if (rearmPre) armPre(c, data)
    return id
  }

  @Synchronized fun cancel(c: Context, id: String) {
    clearPreCard(c, id)
    manager(c).cancel(pending(c, id))
    manager(c).cancel(prePending(c, id))
    cancelLegacyPre(c, id)
    c.getSystemService(NotificationManager::class.java).cancel("notiva-pre:$id", 1)
    prefs(c).edit().remove("schedule:$id").commit()
    AlarmService.instance?.remove(id)
  }

  @Synchronized fun fire(c: Context, id: String) {
    val data = get(c, id) ?: return
    // Ignore stale/cancelled broadcasts; re-arm before starting the foreground service.
    val due = data.getLong("nextAt")
    if (due > System.currentTimeMillis() + 1000) return
    val fired = schedules(c).filter { groupSlot(it) == groupSlot(data, due) }.map { member ->
      val source = member.getString("id")
      val memberDue = member.getLong("nextAt")
      manager(c).cancel(pending(c, source))
      clearPreCard(c, source)
      prefs(c).edit().remove("schedule:$source").commit()
      val result = occurrence(member, memberDue)
      if (member.optString("repeat") != "none") schedule(c, member, maxOf(memberDue, System.currentTimeMillis()), false)
      result
    }
    val service = Intent(c, AlarmService::class.java).putExtra("alarm", fired.first().toString())
      .putExtra("alarms", JSONArray(fired).toString())
    if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(service) else c.startService(service)
  }

  @Synchronized fun preAlert(c: Context, id: String) {
    val data = get(c, id) ?: return
    if (!soundPrefs(c).getBoolean("pre_enabled", true) || data.optInt("preAlertMinutes") <= 0) return
    val due = data.optLong("preDue", 0)
    val now = System.currentTimeMillis()
    if (due <= data.optLong("preDeliveredDue") || now + 1000 < due - data.optInt("preAlertMinutes") * 60_000L) return
    if (now >= due) { data.put("preDeliveredDue", due); armPre(c, data); return }
    val preTime = (due - data.optInt("preAlertMinutes") * 60_000L) / 60_000L
    val fired = schedules(c).filter { member ->
      val memberDue = member.optLong("preDue")
      memberDue > member.optLong("preDeliveredDue") && memberDue > now && member.optInt("preAlertMinutes") > 0 &&
        groupSlot(member, memberDue) == groupSlot(data, due) &&
        (memberDue - member.optInt("preAlertMinutes") * 60_000L) / 60_000L == preTime
    }.map { member ->
      val memberDue = member.getLong("preDue")
      val result = occurrence(member, memberDue).put("sourceId", member.getString("id"))
      member.put("preDeliveredDue", memberDue)
      armPre(c, member)
      result
    }
    if (fired.isEmpty()) return
    val vibration = soundPrefs(c).getBoolean("pre_vibration", data.optBoolean("vibration", true))
    val tag = "pre-card:${groupSlot(data, due)}:$preTime"
    prefs(c).edit().putString(tag, JSONObject().put("items", JSONArray(fired)).put("vibration", vibration).toString()).commit()
    postPreCard(c, fired, tag, vibration)
  }

  private fun postPreCard(c: Context, fired: List<JSONObject>, tag: String, vibration: Boolean) {
    val data = fired.first()
    val open = if (fired.size == 1) Intent(Intent.ACTION_VIEW, Uri.parse("reminder54://screens/details/${Uri.encode(data.getString("itemId"))}"))
      .setPackage(c.packageName) else c.packageManager.getLaunchIntentForPackage(c.packageName)!!
    open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val tap = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val nm = c.getSystemService(NotificationManager::class.java)
    // Android channel vibration is immutable. Two stable normal channels allow
    // the app setting to select vibration without resetting user preferences.
    val channelId = if (vibration) "reminders" else "notiva-pre-no-vibration-v1"
    if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(channelId) == null) {
      nm.createNotificationChannel(NotificationChannel(channelId, if (vibration) "Reminders" else "Reminders (no vibration)", NotificationManager.IMPORTANCE_HIGH).apply {
        setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
        enableVibration(vibration)
        if (vibration) vibrationPattern = longArrayOf(0, 250, 150, 250)
        setShowBadge(false)
      })
    }
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(c, channelId) else Notification.Builder(c)
    val notification = builder.setSmallIcon(c.applicationInfo.icon)
      .setContentTitle(if (fired.size > 1) "${fired.size} items coming up" else data.getString("title"))
      .setContentText(if (fired.size > 1) "Scheduled for ${android.text.format.DateFormat.getTimeFormat(c).format(java.util.Date(data.optLong("nextAt")))}"
        else "${data.getString("title")} is due in ${data.optInt("preAlertMinutes")} minutes.")
      .setContentIntent(tap).setAutoCancel(true).setOnlyAlertOnce(true).setPriority(Notification.PRIORITY_HIGH)
      .setDefaults(Notification.DEFAULT_SOUND or (if (vibration) Notification.DEFAULT_VIBRATE else 0)).build()
    nm.notify(tag, 1, notification)
  }

  @Synchronized fun restore(c: Context) {
    if (!allowed(c)) return
    prefs(c).all.filterKeys { it.startsWith("schedule:") }.values.forEach { raw ->
      val data = JSONObject(raw as String)
      if (next(data, System.currentTimeMillis()) != null) schedule(c, data)
      else prefs(c).edit().remove("schedule:${data.getString("id")}").commit()
    }
  }

  @Synchronized fun repairFuture(c: Context) {
    if (!allowed(c)) return
    val now = System.currentTimeMillis()
    prefs(c).all.filterKeys { it.startsWith("schedule:") }.values.forEach { raw ->
      val data = JSONObject(raw as String)
      // Do not consume an overdue main alarm racing its receiver on foreground.
      if (data.optLong("nextAt") > now) schedule(c, data)
    }
  }
}

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == "dismiss-group") { AlarmService.instance?.dismissGroup(); return }
    if (intent.action == "dismiss") {
      intent.getStringExtra("id")?.let { AlarmService.instance?.remove(it) }
      return
    }
    val id = intent.data?.schemeSpecificPart ?: return
    try {
      if (intent.action == "pre") AlarmStore.preAlert(context, id)
      else if (intent.action != "daily-pre") AlarmStore.fire(context, id)
    } catch (e: Exception) { android.util.Log.e("NotivaAlarm", "Alarm delivery failed", e) }
  }
}

class AlarmRestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try { AlarmStore.restore(context) } catch (e: Exception) { android.util.Log.e("NotivaAlarm", "Alarm restoration failed", e) }
  }
}
