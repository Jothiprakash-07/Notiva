package com.notiva.alarm

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Promise

/** Short foreground-only preview. A real alarm always takes priority. */
object AlarmPreview {
  private val audio = AlarmAudio()
  private val handler = Handler(Looper.getMainLooper())
  private var pending: Promise? = null
  private val timeout = Runnable { stop() }

  fun start(context: Context, sound: String, promise: Promise) {
    stop()
    if (AlarmService.instance != null) {
      promise.reject("ALARM_ACTIVE", "Stop the ringing alarm before previewing a sound.")
      return
    }
    pending = promise
    handler.postDelayed(timeout, 5000L)
    audio.start(context, sound, false) { error ->
      val result = pending
      pending = null
      stop()
      if (error == null) result?.resolve(null)
      else result?.reject("PREVIEW_ERROR", "Could not play this alarm sound.", error)
    }
  }

  fun stop() {
    handler.removeCallbacks(timeout)
    audio.stop()
    val result = pending
    pending = null
    result?.resolve(null)
  }
}
