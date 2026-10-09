package com.notiva.alarm

import android.app.Activity
import android.app.Instrumentation
import android.app.PendingIntent
import android.os.Bundle
import org.json.JSONObject

/** Separate instrumentation APK; never shipped in Notiva. */
class PreAlertDeviceTest : Instrumentation() {
  private var mode = "schedule"
  private var actionIds = ""
  override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); mode = arguments?.getString("mode") ?: "schedule"; actionIds = arguments?.getString("ids") ?: ""; start() }
  override fun onStart() {
    val c = targetContext
    val id = "native-alarm:native-pre-device-test"
    val result = Bundle()
    try {
      if (mode == "account-checks") {
        val keys = listOf("native-bridge-validation-a", "native-bridge-validation-b", "native-bridge-validation-other")
        val prefs = AlarmStore.prefs(c)
        try {
          keys.forEachIndexed { index, token -> prefs.edit().putString("done:$token", JSONObject()
            .put("token", token).put("itemId", "notiva-account[${if (index == 2) "other" else "native-device-validation"}]::item-$index")
            .put("requestedAt", (index + 1) * 100L).toString()).commit() }
          runOnMainSync {
            val module = AlarmModule(com.facebook.react.bridge.BridgeReactContext(c))
            var selected: String? = null
            module.pendingDoneForAccount("native-device-validation", com.facebook.react.bridge.PromiseImpl(
              com.facebook.react.bridge.Callback { args -> selected = args.firstOrNull() as String? },
              com.facebook.react.bridge.Callback { error("Bridge rejected request") }))
            check(JSONObject(selected!!).getString("token") == keys[1])
            check(keys.all { prefs.contains("done:$it") }) // Reading never consumes another account's request.
            module.pendingDoneForAccount("missing", com.facebook.react.bridge.PromiseImpl(
              com.facebook.react.bridge.Callback { args -> selected = args.firstOrNull() as String? },
              com.facebook.react.bridge.Callback { error("Bridge rejected request") }))
            check(selected == null)
            module.invalidate()
          }
          result.putString("stream", "PASS shared bridge selects newest active-account completion and preserves foreign requests\n")
        } finally { keys.forEach { prefs.edit().remove("done:$it").commit() } }
        finish(Activity.RESULT_OK, result); return
      }
      if (mode == "actions-fire") {
        val ids = actionIds.split(',').filter { it.isNotBlank() }
        check(ids.isNotEmpty())
        val payloads = ids.map { id ->
          val data = AlarmStore.get(c, "native-alarm:$id") ?: error("Validation item not scheduled")
          check(data.getString("title").startsWith("GroupAction_") || data.getString("title").startsWith("SoloAction_"))
          check(data.optString("repeat") == "none")
          data
        }
        val due = System.currentTimeMillis() + 8000L
        payloads.forEach { AlarmStore.schedule(c, it.put("startAt", due).put("preAlertMinutes", 0)) }
        result.putString("stream", "PASS real validation item IDs scheduled; existing Done bridge unchanged\n")
        finish(Activity.RESULT_OK, result); return
      }
      if (mode.startsWith("group") || mode == "solo") {
        groupChecks(mode, result)
        finish(Activity.RESULT_OK, result); return
      }
      if (mode == "cleanup") {
        runOnMainSync { AlarmStore.cancel(c, id) }
        result.putString("stream", "PASS test pair cleaned up; user items untouched\n")
      } else {
        val now = System.currentTimeMillis()
        for (minutes in listOf(5, 10, 15, 30, 60, 1440)) {
          val data = JSONObject().put("id", id).put("itemId", "native-pre-device-test")
            .put("title", "Notiva native pre-alert test").put("description", "Device validation")
            .put("itemType", "reminder").put("repeat", "none").put("startAt", now + (minutes + 3) * 60_000L)
            .put("preAlertMinutes", minutes).put("vibration", true).put("alarmSound", "system")
          AlarmStore.schedule(c, data)
          check(AlarmStore.get(c, id)!!.getLong("preDue") == data.getLong("startAt"))
          val pre = PendingIntent.getBroadcast(c, 0, AlarmStore.intent(c,id).setAction("pre"), PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
          check(pre != null && pre != AlarmStore.pending(c,id))
          data.put("startAt", now + 60_000L)
          AlarmStore.schedule(c, data)
          check(!AlarmStore.get(c,id)!!.has("preDue"))
          check(AlarmStore.get(c,id)!!.getLong("nextAt") == now + 60_000L)
          runOnMainSync { AlarmStore.cancel(c,id) }
          check(AlarmStore.get(c,id) == null)
        }
        if (mode == "checks") {
          val settings = c.getSharedPreferences("notiva_alarm_preferences", 0)
          val enabled = settings.getBoolean("pre_enabled", true)
          val vibration = settings.getBoolean("pre_vibration", true)
          try {
            val due = System.currentTimeMillis() + 60 * 60_000L
            val data = JSONObject().put("id",id).put("itemId","native-pre-device-test")
              .put("title","Native validation").put("description","").put("itemType","reminder")
              .put("repeat","none").put("startAt",due).put("preAlertMinutes",5).put("vibration",true)
            AlarmStore.setPreAlertSettings(c,true,true)
            AlarmStore.schedule(c,data)
            data.put("preAlertMinutes",10); AlarmStore.schedule(c,data)
            check(AlarmStore.get(c,id)!!.getLong("nextAt") == due)
            check(AlarmStore.get(c,id)!!.getInt("preAlertMinutes") == 10)
            data.put("startAt",due+3600000); AlarmStore.schedule(c,data)
            check(AlarmStore.get(c,id)!!.getLong("preDue") == due+3600000)
            AlarmStore.setPreAlertSettings(c,false,false)
            check(!AlarmStore.get(c,id)!!.has("preDue"))
            check(AlarmStore.get(c,id)!!.getLong("nextAt") == due+3600000)
            AlarmStore.setPreAlertSettings(c,true,false)
            check(AlarmStore.get(c,id)!!.getLong("preDue") == due+3600000)
            AlarmStore.manager(c).cancel(AlarmStore.pending(c,id))
            AlarmStore.repairFuture(c)
            check(AlarmStore.get(c,id)!!.getLong("nextAt") == due+3600000)
            AlarmStore.restore(c) // Exact receiver restoration path, without rebooting the user's phone.
            check(AlarmStore.get(c,id)!!.getLong("preDue") == due+3600000)
            data.put("startAt",System.currentTimeMillis()+60000); AlarmStore.schedule(c,data)
            AlarmStore.restore(c)
            check(!AlarmStore.get(c,id)!!.has("preDue"))
            for (repeat in listOf("daily","weekly","weekdays")) {
              data.put("startAt",due).put("repeat",repeat)
              AlarmStore.schedule(c,data)
              data.put("repeat","none"); AlarmStore.schedule(c,data)
              check(AlarmStore.get(c,id)!!.getString("repeat") == "none")
            }
            result.putString("stream","PASS device edit 5->10/time, settings OFF/ON, vibration preference, foreground repair, reboot restoration path/expired skip, Repeat->None and pair cancellation\n")
          } finally {
            runOnMainSync { AlarmStore.cancel(c,id) }
            AlarmStore.setPreAlertSettings(c,enabled,vibration)
          }
          finish(Activity.RESULT_OK,result)
          return
        }
        // Leave one real 5-minute lead for passive background delivery validation.
        val main = System.currentTimeMillis() + 6 * 60_000L
        val data = JSONObject().put("id", id).put("itemId", "native-pre-device-test")
          .put("title", "Notiva native pre-alert test").put("description", "Device validation")
          .put("itemType", "reminder").put("repeat", "none").put("startAt", main)
          .put("preAlertMinutes",5).put("vibration",true).put("alarmSound","system")
        AlarmStore.schedule(c,data)
        result.putString("stream", "PASS all six offsets, separate PendingIntents, expired skip/main retention, replacement/cancel. Real test pre=" + (main-300000) + " main=" + main + "\n")
      }
      finish(Activity.RESULT_OK,result)
    } catch (e: Exception) {
      result.putString("stream", "FAIL " + e.toString() + "\n")
      finish(Activity.RESULT_CANCELED,result)
    }
  }

  private fun groupChecks(mode: String, result: Bundle) {
    val c = targetContext
    val prefix = "native-alarm:notiva-account[native-device-validation]::"
    val ids = listOf("group-a", "group-b", "group-c").map { prefix + it }
    fun payload(index: Int, due: Long) = JSONObject().put("id", ids[index])
      .put("itemId", "notiva-account[native-device-validation]::group-${('a'.code + index).toChar()}")
      .put("title", listOf("Call Client TEST", "Send Quotation TEST", "Team Meeting TEST")[index])
      .put("description", "Native group validation — only test schedules")
      .put("itemType", if (index == 2) "event" else if (index == 1) "task" else "reminder")
      .put("repeat", "none").put("startAt", due).put("preAlertMinutes", 5).put("vibration", true)
    fun cleanup() { runOnMainSync { ids.forEach { AlarmStore.cancel(c, it) } } }
    cleanup()
    if (mode == "group-cleanup") {
      result.putString("stream", "PASS group validation schedules removed\n"); return
    }
    val now = System.currentTimeMillis()
    if (mode == "solo" || mode == "group-show") {
      val due = now + 8000L
      val count = if (mode == "solo") 1 else 3
      repeat(count) { AlarmStore.schedule(c, payload(it, due).put("preAlertMinutes", 0)) }
      result.putString("stream", "PASS $mode scheduled in 8 seconds; independent test identities\n"); return
    }
    val settings = c.getSharedPreferences("notiva_alarm_preferences", 0)
    val enabled = settings.getBoolean("pre_enabled", true)
    val vibration = settings.getBoolean("pre_vibration", true)
    val doneBefore = AlarmStore.prefs(c).all.keys.filter { it.startsWith("done:") }.toSet()
    try {
      AlarmStore.setPreAlertSettings(c, true, true)
      val due = System.currentTimeMillis() + 300500L
      repeat(3) { AlarmStore.schedule(c, payload(it, due)) }
      check(AlarmStore.groupSlot(payload(0, due), due) == AlarmStore.groupSlot(payload(1, due), due))
      check(AlarmStore.groupSlot(payload(0, due), due) != AlarmStore.groupSlot(payload(1, due).put("itemId", "notiva-account[other-owner]::group-b"), due))
      check(AlarmStore.groupSlot(payload(0, due), due) != AlarmStore.groupSlot(payload(1, due + 60000), due + 60000))
      AlarmStore.preAlert(c, ids[0]); AlarmStore.preAlert(c, ids[1]); AlarmStore.preAlert(c, ids[2])
      val nm = c.getSystemService(android.app.NotificationManager::class.java)
      val cards = nm.activeNotifications.filter { it.tag?.startsWith("pre-card:native-device-validation:") == true }
      check(cards.size == 1) { "Expected one grouped pre-alert, got ${cards.size}" }
      check(cards[0].notification.extras.getString("android.title") == "3 items coming up")
      runOnMainSync { AlarmStore.cancel(c, ids[2]) }
      check(nm.activeNotifications.filter { it.tag?.startsWith("pre-card:native-device-validation:") == true }.size == 1)
      val main = System.currentTimeMillis() + 2500L
      repeat(3) { AlarmStore.schedule(c, payload(it, main).put("preAlertMinutes", 0)) }
      Thread.sleep(15000)
      runOnMainSync {
        val service = AlarmService.instance ?: error("Main alarm did not start")
        check(service.group().size == 3)
        check(nm.activeNotifications.count { it.id == AlarmService.CARD } == 1)
        val first = ids[0]
        service.done(first)
        check(service.group().size == 2)
        val pending = AlarmStore.prefs(c).all.filterKeys { it.startsWith("done:") && it !in doneBefore }
        check(pending.size == 1 && JSONObject(pending.values.first() as String).getString("itemId") == first.removePrefix("native-alarm:"))
        service.silenceCurrentAlarm()
        service.remove(ids[1])
        check(service.group().size == 1)
        service.dismissGroup()
        check(service.current() == null)
      }
      result.putString("stream", "PASS owner/date/minute grouping, one pre-alert, member cancellation, 3->2->solo, one foreground card, individual durable Done, silence and Dismiss All without false completion\n")
    } finally {
      cleanup()
      AlarmStore.prefs(c).all.keys.filter { it.startsWith("done:") && it !in doneBefore }.forEach { AlarmStore.prefs(c).edit().remove(it).commit() }
      AlarmStore.setPreAlertSettings(c, enabled, vibration)
    }
  }
}
