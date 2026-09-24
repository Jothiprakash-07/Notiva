package com.notiva.alarm

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

class AlarmActivity : Activity() {

  companion object {
    var current: AlarmActivity? = null
  }

  private var completing = false

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.keyCode in listOf(KeyEvent.KEYCODE_VOLUME_UP, KeyEvent.KEYCODE_VOLUME_DOWN, KeyEvent.KEYCODE_VOLUME_MUTE)) {
      if (event.action == KeyEvent.ACTION_DOWN) AlarmService.instance?.silenceCurrentAlarm()
      return true
    }
    return super.dispatchKeyEvent(event)
  }

  fun closeIfRinging() {
    if (!completing) {
      finish()
    }
  }

  override fun onCreate(state: Bundle?) {
    super.onCreate(state)

    current = this

    window.addFlags(
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
    )

    if (Build.VERSION.SDK_INT >= 27) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }

    handle()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)

    setIntent(intent)

    handle()
  }

  private fun handle() {
    if (intent.getStringExtra("action") == "done") {
      val id = intent.getStringExtra("id")

      intent.removeExtra("action")

      if (
        id != null &&
        AlarmService.instance
          ?.current()
          ?.getString("id") == id
      ) {
        done(id)
        return
      }
    }

    render()
  }

  fun render() {
    val data =
      AlarmService.instance?.current()
        ?: run {
          finish()
          return
        }

    val id = data.getString("id")

    val layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL

      gravity = Gravity.CENTER

      setPadding(
        40,
        64,
        40,
        64
      )

      setBackgroundColor(
        Color.rgb(
          23,
          19,
          41
        )
      )
    }

    fun label(
      text: String,
      size: Float
    ) = TextView(this).apply {
      this.text = text

      textSize = size

      gravity = Gravity.CENTER

      setTextColor(
        Color.WHITE
      )

      setPadding(
        0,
        16,
        0,
        16
      )
    }

    /*
     * Reminder title
     *
     * Removed the old:
     * "NOTIVA ALARM"
     * and
     * "REMINDER"
     * top label.
     */
    layout.addView(
      label(
        data.getString("title"),
        30f
      )
    )

    /*
     * Reminder description
     */
    val description =
      if (data.isNull("description")) "" else data.optString("description")

    if (
      description.isNotBlank()
    ) {
      layout.addView(
        label(
          description,
          18f
        )
      )
    }

    /*
     * Done button
     */
    layout.addView(
      Button(this).apply {
        text = "Done"

        setOnClickListener {
          done(id)
        }
      }
    )

    /*
     * Dismiss button
     *
     * This stops the alarm,
     * but does not mark the item as Done.
     */
    layout.addView(
      Button(this).apply {
        text = "Dismiss"

        setOnClickListener {
          AlarmService.instance?.remove(id)
        }
      }
    )

    /*
     * Full-screen alarm content
     */
    setContentView(
      ScrollView(this).apply {
        isFillViewport = true

        addView(layout)
      }
    )
  }

  private fun done(id: String) {
    completing = true

    /*
     * AlarmService stops alarm audio/vibration
     * and stores the pending Done action.
     */
    AlarmService.instance?.done(id)

    /*
     * Open the Notiva app.
     * React Native will then handle the
     * Completion Note flow.
     */
    val openApp = {
      packageManager
        .getLaunchIntentForPackage(packageName)
        ?.let { launchIntent ->
          launchIntent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
              Intent.FLAG_ACTIVITY_CLEAR_TOP
          )

          startActivity(
            launchIntent
          )
        }

      finish()
    }

    val keyguard =
      getSystemService(
        KeyguardManager::class.java
      )

    /*
     * If the phone is locked,
     * request keyguard dismissal before
     * opening the main app.
     */
    if (
      Build.VERSION.SDK_INT >= 26 &&
      keyguard.isKeyguardLocked
    ) {
      keyguard.requestDismissKeyguard(
        this,
        object :
          KeyguardManager.KeyguardDismissCallback() {

          override fun onDismissSucceeded() {
            openApp()
          }

          override fun onDismissCancelled() {
            openApp()
          }

          override fun onDismissError() {
            openApp()
          }
        }
      )
    } else {
      openApp()
    }
  }

  /*
   * Back button / activity close:
   * the foreground alarm notification
   * remains available unless alarm is
   * explicitly Done or Dismissed.
   */
  override fun onDestroy() {
    if (
      current === this
    ) {
      current = null
    }

    super.onDestroy()
  }
}
