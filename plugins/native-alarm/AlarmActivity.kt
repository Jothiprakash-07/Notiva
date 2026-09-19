package com.notiva.alarm

import android.app.*
import android.content.Intent
import android.graphics.Color
import android.os.*
import android.view.*
import android.widget.*

class AlarmActivity : Activity() {
  companion object { var current: AlarmActivity? = null }
  private var completing = false
  fun closeIfRinging() { if (!completing) finish() }
  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    current = this
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true) }
    else window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    handle()
  }
  override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); handle() }
  private fun handle() {
    if (intent.getStringExtra("action") == "done") {
      val id = intent.getStringExtra("id")
      intent.removeExtra("action")
      if (id != null && AlarmService.instance?.current()?.getString("id") == id) { done(id); return }
    }
    render()
  }
  fun render() {
    val data = AlarmService.instance?.current() ?: run { finish(); return }
    val id = data.getString("id")
    val layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
      setPadding(40, 64, 40, 64); setBackgroundColor(Color.rgb(23, 19, 41))
    }
    fun label(text: String, size: Float) = TextView(this).apply {
      this.text = text; textSize = size; gravity = Gravity.CENTER; setTextColor(Color.WHITE); setPadding(0, 16, 0, 16)
    }
    layout.addView(label("REMINDER", 16f))
    layout.addView(label(data.getString("title"), 30f))
    layout.addView(label(data.optString("description"), 18f))
    layout.addView(Button(this).apply { text = "Done"; setOnClickListener { done(id) } })
    layout.addView(Button(this).apply { text = "Dismiss"; setOnClickListener { AlarmService.instance?.remove(id) } })
    setContentView(ScrollView(this).apply { isFillViewport = true; addView(layout) })
  }
  private fun done(id: String) {
    completing = true
    AlarmService.instance?.done(id)
    val open = {
      packageManager.getLaunchIntentForPackage(packageName)?.let {
        startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))
      }
      finish()
    }
    val keyguard = getSystemService(KeyguardManager::class.java)
    if (Build.VERSION.SDK_INT >= 26 && keyguard.isKeyguardLocked) {
      keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
        override fun onDismissSucceeded() { open() }
        override fun onDismissCancelled() { open() }
        override fun onDismissError() { open() }
      })
    } else open()
  }
  // Back hides the screen; the foreground controls remain available.
  override fun onDestroy() { if (current === this) current = null; super.onDestroy() }
}
