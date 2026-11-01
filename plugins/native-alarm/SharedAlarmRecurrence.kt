package com.notiva.alarm

import org.json.JSONObject
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/** Mirrors shared/recurrence.cjs wall-time adapter; parity fixtures run on this class. */
object SharedAlarmRecurrence {
  private val utc = TimeZone.getTimeZone("UTC")
  private fun wall(time: Long, zone: TimeZone) = time + zone.getOffset(time)
  private fun clock(time: Long) = Calendar.getInstance(utc).apply { timeInMillis = time }
  private fun instant(local: Long, zone: TimeZone): Long {
    val candidates = listOf(-36, -12, 0, 12, 36).map { zone.getOffset(local + it * 3600000L) }.distinct().map { local - it }
    return candidates.filter { wall(it, zone) == local }.minOrNull()
      ?: candidates.filter { wall(it, zone) > local }.minByOrNull { wall(it, zone) }
      ?: error("Invalid shared wall time")
  }
  private fun zone(rule: JSONObject): TimeZone {
    val name = rule.getString("timeZone")
    require(name in TimeZone.getAvailableIDs()) { "Unknown shared timezone" }
    return TimeZone.getTimeZone(name)
  }
  fun next(data: JSONObject, after: Long): Long? {
    val rule = data.getJSONObject("sharedRecurrence")
    if (!rule.optBoolean("active", true)) return null
    val zone = zone(rule)
    val start = rule.getLong("anchorAt")
    val anchor = clock(wall(start, zone))
    val candidate = clock(wall(maxOf(start, after), zone))
    val selected = rule.optJSONArray("weeklyDays")?.let { days -> (0 until days.length()).map { days.getInt(it) }.toSet() }
      ?: setOf(anchor.get(Calendar.DAY_OF_WEEK) - 1)
    val repeat = data.getString("repeat")
    require(repeat in listOf("daily", "weekly", "weekdays", "monthly", "yearly"))
    require(selected.isNotEmpty() && selected.all { it in 0..6 })
    repeat(366 * 9 + 1) {
      for (field in listOf(Calendar.HOUR_OF_DAY, Calendar.MINUTE, Calendar.SECOND, Calendar.MILLISECOND)) candidate.set(field, anchor.get(field))
      val weekday = candidate.get(Calendar.DAY_OF_WEEK) - 1
      val matches = when (repeat) {
        "weekly" -> weekday in selected
        "weekdays" -> weekday in 1..5
        "monthly" -> candidate.get(Calendar.DAY_OF_MONTH) == anchor.get(Calendar.DAY_OF_MONTH)
        "yearly" -> candidate.get(Calendar.DAY_OF_MONTH) == anchor.get(Calendar.DAY_OF_MONTH) && candidate.get(Calendar.MONTH) == anchor.get(Calendar.MONTH)
        else -> true
      }
      if (matches) {
        val due = instant(candidate.timeInMillis, zone)
        if (due > after && due >= start && due >= rule.optLong("effectiveFrom", start) && due >= rule.getLong("notBefore")) return due
      }
      candidate.add(Calendar.DAY_OF_YEAR, 1)
    }
    return null
  }
  fun key(data: JSONObject, due: Long): String {
    val rule = data.getJSONObject("sharedRecurrence")
    val zone = zone(rule)
    val date = clock(wall(due, zone))
    val anchor = clock(wall(rule.getLong("anchorAt"), zone))
    return String.format(Locale.US, "%d|%04d-%02d-%02dT%02d:%02d", rule.getInt("scheduleRevision"),
      date.get(Calendar.YEAR), date.get(Calendar.MONTH) + 1, date.get(Calendar.DAY_OF_MONTH), anchor.get(Calendar.HOUR_OF_DAY), anchor.get(Calendar.MINUTE))
  }
  fun occurrence(data: JSONObject, due: Long): JSONObject {
    val result = JSONObject(data.toString())
    val key = key(data, due)
    val item = data.getJSONObject("sharedRecurrence").getString("baseItemId") + "::occ[" + java.net.URLEncoder.encode(key, "UTF-8").replace("+", "%20") + "]"
    return result.put("sourceId", data.getString("id")).put("itemId", item).put("id", "native-alarm:$item")
      .put("occurrenceKey", key).put("startAt", due).put("nextAt", due)
  }
}
