package com.notiva.alarm

import android.app.*
import android.content.*
import android.content.pm.ServiceInfo
import android.media.*
import android.net.Uri
import android.os.*
import org.json.JSONObject
import org.json.JSONArray

/**
 * Native alarm foreground service.
 *
 * Important behavior:
 * - Foreground notification card is SILENT.
 * - Actual alarm audio is played only by MediaPlayer.
 * - Actual vibration is controlled only by this service.
 * - Prevents notification sound + alarm sound from playing together.
 */
class AlarmService : Service() {

  companion object {
    /**
     * v2 is intentional.
     *
     * Android notification-channel sound settings are cached permanently
     * after a channel is created. Using a new channel ID guarantees that
     * the new silent-channel configuration is applied.
     */
    const val CHANNEL = "notiva-native-alarm-v2"

    const val CARD = 7401

    var instance: AlarmService? = null
      private set
  }

  /**
   * Supports multiple alarms ringing close together while still using
   * one foreground notification card and one MediaPlayer.
   */
  private val alarms = linkedMapOf<String, JSONObject>()

  private val audio = AlarmAudio()
  private val silenced = mutableSetOf<String>()
  private var screenReceiverRegistered = false
  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action == Intent.ACTION_SCREEN_OFF) silenceCurrentAlarm()
    }
  }
  private var vibrator: Vibrator? = null
  private var wakeLock: PowerManager.WakeLock? = null

  private val handler = Handler(Looper.getMainLooper())

  /**
   * Safety timeout:
   * automatically stops the alarm after 10 minutes.
   */
  private val timeout = Runnable {
    alarms.clear()
    stopSelf()
    AlarmActivity.current?.finish()
  }

  fun current(): JSONObject? = alarms.values.firstOrNull()
  fun group(): List<JSONObject> = current()?.let { first -> alarms.values.filter {
    AlarmStore.groupSlot(it) == AlarmStore.groupSlot(first)
  } } ?: emptyList()
  private var ringingSlot: String? = null
  fun dismissGroup() { group().map { it.getString("id") }.forEach { remove(it) } }

  override fun onCreate() {
    super.onCreate()

    AlarmPreview.stop()
    instance = this
    val filter = IntentFilter(Intent.ACTION_SCREEN_OFF)
    if (Build.VERSION.SDK_INT >= 33) {
      registerReceiver(screenReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      registerReceiver(screenReceiver, filter)
    }
    screenReceiverRegistered = true

    /**
     * Android 8+ requires a notification channel.
     *
     * IMPORTANT:
     * This notification channel itself must NOT make sound or vibration.
     * MediaPlayer + Vibrator below are the only alarm sources.
     */
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {

      val channel = NotificationChannel(
        CHANNEL,
        "Ringing alarms",
        NotificationManager.IMPORTANCE_HIGH
      ).apply {

        description = "Alarm controls and full-screen reminders"

        /**
         * Keep foreground notification completely silent.
         *
         * This prevents:
         * notification ding + looping alarm audio
         * from playing together.
         */
        setSound(null, null)

        /**
         * Notification channel vibration disabled.
         * Native alarm vibration is controlled by startRinging().
         */
        enableVibration(false)

        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }

      getSystemService(NotificationManager::class.java)
        .createNotificationChannel(channel)
    }
  }

  override fun onStartCommand(
    intent: Intent?,
    flags: Int,
    startId: Int
  ): Int {

    val raw = intent?.getStringExtra("alarm")
      ?: return START_NOT_STICKY

    val data = JSONObject(raw)

    /**
     * Store/replace alarm by native alarm ID.
     */
    alarms[data.getString("id")] = data
    intent.getStringExtra("alarms")?.let { rawGroup ->
      val group = JSONArray(rawGroup)
      for (i in 0 until group.length()) {
        val member = group.getJSONObject(i)
        alarms[member.getString("id")] = member
      }
    }

    /**
     * Remove delivered Expo pre-alert notification cards for this item.
     *
     * Example:
     * 6:25 PM -> pre-alert notification
     * 6:30 PM -> native alarm
     *
     * Once the native alarm starts, stale pre-alert cards are removed.
     */
    val ids = data.optJSONArray("preAlertIds")

    val notificationManager =
      getSystemService(NotificationManager::class.java)

    if (ids != null) {
      for (i in 0 until ids.length()) {

        val tag = ids.getString(i)

        notificationManager.activeNotifications
          .filter { it.tag == tag }
          .forEach {
            notificationManager.cancel(it.tag, it.id)
          }
      }
    }

    show()

    return START_NOT_STICKY
  }

  /**
   * Creates PendingIntent for opening the native alarm UI.
   */
  private fun activityIntent(
    data: JSONObject,
    action: String
  ): PendingIntent {

    val intent = Intent(
      this,
      AlarmActivity::class.java
    )
      .setData(
        Uri.parse(
          "notiva-alarm-ui:${Uri.encode(data.getString("id"))}/$action"
        )
      )
      .putExtra(
        "id",
        data.getString("id")
      )
      .putExtra(
        "action",
        action
      )
      .addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_SINGLE_TOP
      )

    return PendingIntent.getActivity(
      this,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or
        PendingIntent.FLAG_IMMUTABLE
    )
  }

  /**
   * Shows one foreground alarm card
   * and starts native alarm audio/vibration.
   */
  private fun show() {

    val data = current() ?: return
    val members = group()

    val open = activityIntent(
      data,
      "show"
    )

    /**
     * Dismiss stops ringing,
     * but must NOT mark reminder as completed.
     */
    val dismiss = PendingIntent.getBroadcast(
      this,
      0,
      Intent(
        this,
        AlarmReceiver::class.java
      )
        .setAction(if (members.size > 1) "dismiss-group" else "dismiss")
        .setData(
          Uri.parse(
            "notiva-dismiss:${Uri.encode(data.getString("id"))}"
          )
        )
        .putExtra(
          "id",
          data.getString("id")
        ),
      PendingIntent.FLAG_UPDATE_CURRENT or
        PendingIntent.FLAG_IMMUTABLE
    )

    /**
     * Build silent foreground notification.
     */
    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {

        Notification.Builder(
          this,
          CHANNEL
        )

      } else {

        Notification.Builder(this)
      }

    builder
      .setSmallIcon(
        android.R.drawable.ic_lock_idle_alarm
      )
      .setContentTitle(
        if (members.size > 1) "Group Reminder" else data.getString("title")
      )
      .setContentText(
        if (members.size > 1) {
          "${members.size} items • Tap to respond"
        } else {
          data.optString(
            "description",
            "Reminder due now"
          )
        }
      )
      .setCategory(
        Notification.CATEGORY_ALARM
      )
      .setVisibility(
        Notification.VISIBILITY_PUBLIC
      )
      .setPriority(
        Notification.PRIORITY_MAX
      )
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(open)
      .addAction(
        Notification.Action.Builder(
          null,
          if (members.size > 1) "Open" else "Done",
          activityIntent(
            data,
            if (members.size > 1) "show" else "done"
          )
        ).build()
      )
      .addAction(
        Notification.Action.Builder(
          null,
          if (members.size > 1) "Dismiss All" else "Dismiss",
          dismiss
        ).build()
      )

    /**
     * Full-screen alarm UI.
     */
    if (
      Build.VERSION.SDK_INT < 34 ||
      getSystemService(
        NotificationManager::class.java
      ).canUseFullScreenIntent()
    ) {

      builder.setFullScreenIntent(
        open,
        true
      )
    }

    /**
     * Start foreground service.
     */
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {

      startForeground(
        CARD,
        builder.build(),
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      )

    } else {

      startForeground(
        CARD,
        builder.build()
      )
    }

    /**
     * Actual alarm sound + vibration start here.
     */
    val slot = AlarmStore.groupSlot(data)
    if (ringingSlot != slot && data.getString("id") !in silenced) {
      ringingSlot = slot
      startRinging(
      AlarmStore.alarmSound(this, data),
      data.optBoolean(
        "vibration",
        true
      )
    )

    }
    /**
     * Refresh currently visible native alarm screen.
     */
    AlarmActivity.current?.render()

    /**
     * Reset safety timeout.
     */
    handler.removeCallbacks(timeout)

    handler.postDelayed(
      timeout,
      10 * 60 * 1000L
    )
  }

  /**
   * Actual native alarm audio and vibration.
   *
   * This is the ONLY place that should create alarm sound.
   */
  private fun startRinging(
    sound: String,
    vibrate: Boolean
  ) {

    /**
     * Keep CPU awake while alarm is ringing.
     */
    if (wakeLock == null) {

      wakeLock =
        getSystemService(
          PowerManager::class.java
        )
          .newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "Notiva:alarm"
          )
          .apply {
            acquire(
              10 * 60 * 1000L
            )
          }
    }

    // Single owned player; switching sound releases the previous player first.
    android.util.Log.i("NotivaAlarm", "Playing alarm sound = $sound")
    audio.start(this, sound, true)

    /**
     * Native vibration.
     */
    vibrator =
      getSystemService(
        VIBRATOR_SERVICE
      ) as Vibrator

    /**
     * Cancel old vibration pattern before starting another.
     */
    vibrator?.cancel()

    if (vibrate) {

      val pattern =
        longArrayOf(
          0,
          600,
          250,
          600,
          500
        )

      if (
        Build.VERSION.SDK_INT >=
        Build.VERSION_CODES.O
      ) {

        vibrator?.vibrate(
          VibrationEffect.createWaveform(
            pattern,
            0
          )
        )

      } else {

        @Suppress("DEPRECATION")
        vibrator?.vibrate(
          pattern,
          0
        )
      }
    }
  }

  /**
   * Done:
   *
   * Stops alarm and stores a pending completion request.
   *
   * React Native side later opens CompletionNoteModal.
   * Reminder is NOT marked Done here directly.
   */
  fun done(
    id: String
  ) {

    val data =
      alarms[id] ?: return
    silenceCurrentAlarm()

    val token =
      java.util.UUID
        .randomUUID()
        .toString()

    val pending =
      JSONObject()
        .put("requestedAt", System.currentTimeMillis())
        .put(
          "token",
          token
        )
        .put(
          "itemId",
          data.getString("itemId")
        )

    check(
      AlarmStore
        .prefs(this)
        .edit()
        .putString(
          "done:$token",
          pending.toString()
        )
        .commit()
    )

    remove(id)
  }

  /**
   * Removes one currently ringing alarm.
   *
   * If no alarms remain:
   * stop sound, vibration, foreground service and UI.
   */
  fun remove(
    id: String
  ) {
    val previousSlot = current()?.let { AlarmStore.groupSlot(it) }

    if (
      alarms.remove(id) == null
    ) {
      return
    }

    if (alarms.isEmpty()) {

      releaseRinging()

      stopForeground(
        STOP_FOREGROUND_REMOVE
      )

      stopSelf()

      AlarmActivity.current
        ?.closeIfRinging()

    } else {

      /**
       * Another alarm is still active.
       *
       * Reset existing player/vibration and show next alarm.
       */
      if (current()?.let { AlarmStore.groupSlot(it) } != previousSlot) releaseRinging()
      show()
    }
  }

  /** Silence leaves the alarm and its Done/Dismiss actions unresolved. */
  fun silenceCurrentAlarm() {
    group().forEach { silenced.add(it.getString("id")) }
    audio.stop()
    vibrator?.cancel()
  }

  /**
   * Fully releases alarm resources.
   */
  private fun releaseRinging() {
    ringingSlot = null

    audio.stop()

    vibrator?.cancel()

    vibrator = null

    wakeLock?.let {

      if (it.isHeld) {
        it.release()
      }
    }

    wakeLock = null
  }

  override fun onDestroy() {
    if (screenReceiverRegistered) {
      unregisterReceiver(screenReceiver)
      screenReceiverRegistered = false
    }

    handler.removeCallbacksAndMessages(
      null
    )

    releaseRinging()

    stopForeground(
      STOP_FOREGROUND_REMOVE
    )

    instance = null

    AlarmActivity.current
      ?.closeIfRinging()

    super.onDestroy()
  }

  override fun onBind(
    intent: Intent?
  ): IBinder? = null
}
