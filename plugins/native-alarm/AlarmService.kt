package com.notiva.alarm

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.media.*
import android.net.Uri
import android.os.*
import org.json.JSONObject

/** One foreground card and one sound player, even when several items ring together. */
class AlarmService : Service() {
  companion object {
    const val CHANNEL = "notiva-native-alarm-v1"
    const val CARD = 7401
    var instance: AlarmService? = null
      private set
  }
  private val alarms = linkedMapOf<String, JSONObject>()
  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { alarms.clear(); stopSelf(); AlarmActivity.current?.finish() }
  fun current(): JSONObject? = alarms.values.firstOrNull()

  override fun onCreate() {
    super.onCreate()
    instance = this
    if (Build.VERSION.SDK_INT >= 26) {
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL, "Ringing alarms", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Alarm controls and full-screen reminders"
          // Sound/vibration are owned by this service, never by repeated cards.
          setSound(null, null); enableVibration(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        })
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val raw = intent?.getStringExtra("alarm") ?: return START_NOT_STICKY
    val data = JSONObject(raw)
    alarms[data.getString("id")] = data
    // Remove delivered Expo pre-alert cards for this item before posting the alarm.
    val ids = data.optJSONArray("preAlertIds")
    val nm = getSystemService(NotificationManager::class.java)
    if (ids != null) for (i in 0 until ids.length()) {
      val tag = ids.getString(i)
      nm.activeNotifications.filter { it.tag == tag }.forEach { nm.cancel(it.tag, it.id) }
    }
    show()
    return START_NOT_STICKY
  }

  private fun activityIntent(data: JSONObject, action: String): PendingIntent {
    val intent = Intent(this, AlarmActivity::class.java)
      .setData(Uri.parse("notiva-alarm-ui:${Uri.encode(data.getString("id"))}/$action"))
      .putExtra("id", data.getString("id")).putExtra("action", action)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun show() {
    val data = current() ?: return
    val open = activityIntent(data, "show")
    val dismiss = PendingIntent.getBroadcast(this, 0,
      Intent(this, AlarmReceiver::class.java).setAction("dismiss")
        .setData(Uri.parse("notiva-dismiss:${Uri.encode(data.getString("id"))}"))
        .putExtra("id", data.getString("id")),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    builder.setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle(data.getString("title"))
      .setContentText(if (alarms.size > 1) "${alarms.size} alarms • Tap to respond" else data.optString("description", "Reminder due now"))
      .setCategory(Notification.CATEGORY_ALARM).setVisibility(Notification.VISIBILITY_PUBLIC)
      .setPriority(Notification.PRIORITY_MAX).setOngoing(true).setOnlyAlertOnce(true)
      .setContentIntent(open)
      .addAction(Notification.Action.Builder(null, "Done", activityIntent(data, "done")).build())
      .addAction(Notification.Action.Builder(null, "Dismiss", dismiss).build())
    if (Build.VERSION.SDK_INT < 34 || getSystemService(NotificationManager::class.java).canUseFullScreenIntent()) {
      builder.setFullScreenIntent(open, true)
    }
    if (Build.VERSION.SDK_INT >= 29) startForeground(CARD, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    else startForeground(CARD, builder.build())
    startRinging(data.optBoolean("vibration", true))
    AlarmActivity.current?.render()
    handler.removeCallbacks(timeout)
    handler.postDelayed(timeout, 10 * 60 * 1000L)
  }

  private fun startRinging(vibrate: Boolean) {
    if (wakeLock == null) wakeLock = getSystemService(PowerManager::class.java)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Notiva:alarm").apply { acquire(10 * 60 * 1000L) }
    if (player == null) {
      val audio = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
      val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
      val next = MediaPlayer()
      try {
        next.setAudioAttributes(audio); next.setDataSource(this, uri)
        next.isLooping = true; next.prepare(); next.start(); player = next
      } catch (e: Exception) { next.release(); android.util.Log.e("NotivaAlarm", "Alarm audio unavailable", e) }
    }
    vibrator = getSystemService(VIBRATOR_SERVICE) as Vibrator
    vibrator?.cancel()
    if (vibrate) {
      val pattern = longArrayOf(0, 600, 250, 600, 500)
      if (Build.VERSION.SDK_INT >= 26) vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
      else vibrator?.vibrate(pattern, 0)
    }
  }

  fun done(id: String) {
    val data = alarms[id] ?: return
    val token = java.util.UUID.randomUUID().toString()
    val pending = JSONObject().put("token", token).put("itemId", data.getString("itemId"))
    check(AlarmStore.prefs(this).edit().putString("done:$token", pending.toString()).commit())
    remove(id)
  }

  fun remove(id: String) {
    if (alarms.remove(id) == null) return
    if (alarms.isEmpty()) {
      releaseRinging()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      AlarmActivity.current?.closeIfRinging()
    } else {
      releaseRinging()
      show()
    }
  }

  private fun releaseRinging() {
    player?.release(); player = null
    vibrator?.cancel(); vibrator = null
    wakeLock?.let { if (it.isHeld) it.release() }; wakeLock = null
  }
  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    releaseRinging(); stopForeground(STOP_FOREGROUND_REMOVE)
    instance = null
    AlarmActivity.current?.closeIfRinging()
    super.onDestroy()
  }
  override fun onBind(intent: Intent?): IBinder? = null
}
