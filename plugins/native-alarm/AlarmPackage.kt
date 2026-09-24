package com.notiva.alarm

import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import org.json.JSONObject

class AlarmPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(AlarmModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class AlarmModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context), LifecycleEventListener {
  init { context.addLifecycleEventListener(this) }
  override fun onHostResume() {}
  override fun onHostPause() { UiThreadUtil.runOnUiThread { AlarmPreview.stop() } }
  override fun onHostDestroy() { UiThreadUtil.runOnUiThread { AlarmPreview.stop() } }
  override fun invalidate() {
    context.removeLifecycleEventListener(this)
    UiThreadUtil.runOnUiThread { AlarmPreview.stop() }
    super.invalidate()
  }
  @ReactMethod fun previewSound(sound: String, p: Promise) {
    UiThreadUtil.runOnUiThread {
      if (context.lifecycleState != com.facebook.react.common.LifecycleState.RESUMED) {
        p.reject("PREVIEW_BACKGROUND", "Open sound settings to preview an alarm.")
      } else AlarmPreview.start(context, sound, p)
    }
  }
  @ReactMethod fun stopPreview(p: Promise) {
    UiThreadUtil.runOnUiThread { result(p) { AlarmPreview.stop(); null } }
  }
  override fun getName() = "NotivaAlarm"
  @ReactMethod fun setAlarmSound(sound: String, p: Promise) = result(p) {
    AlarmStore.setAlarmSound(context, sound); null
  }
  private fun result(p: Promise, block: () -> Any?) { try { p.resolve(block()) } catch (e: Exception) { p.reject("ALARM_ERROR", e.message, e) } }
  @ReactMethod fun schedule(json: String, p: Promise) = result(p) { AlarmStore.schedule(context, JSONObject(json)) }
  @ReactMethod fun cancel(id: String, p: Promise) {
    // Service state and Activity callbacks are confined to the main thread.
    UiThreadUtil.runOnUiThread { result(p) { AlarmStore.cancel(context, id); null } }
  }
  @ReactMethod fun canSchedule(p: Promise) = result(p) { AlarmStore.allowed(context) }
  @ReactMethod fun canFullScreen(p: Promise) = result(p) {
    Build.VERSION.SDK_INT < 34 || context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
  }
  private fun settings(action: String) {
    context.startActivity(Intent(action, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }
  @ReactMethod fun openExactSettings(p: Promise) = result(p) {
    settings(if (Build.VERSION.SDK_INT >= 31) Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM else Settings.ACTION_APPLICATION_DETAILS_SETTINGS); null
  }
  @ReactMethod fun openFullScreenSettings(p: Promise) = result(p) {
    settings(if (Build.VERSION.SDK_INT >= 34) Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT else Settings.ACTION_APPLICATION_DETAILS_SETTINGS); null
  }
  @ReactMethod fun pendingDone(p: Promise) = result(p) {
    AlarmStore.prefs(context).all.filterKeys { it.startsWith("done:") }.toSortedMap().values.firstOrNull() as String?
  }
  @ReactMethod fun acknowledgeDone(token: String, p: Promise) = result(p) {
    AlarmStore.prefs(context).edit().remove("done:$token").commit(); null
  }
}
