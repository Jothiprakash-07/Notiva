package com.notiva.alarm

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.util.Log

/** One owned player. All calls and MediaPlayer callbacks run on the main thread. */
class AlarmAudio {
  private var player: MediaPlayer? = null
  private var sound: String? = null

  companion object {
    private val bundled = setOf("ethereal_uplifting", "positive_vibe", "positive_western", "robotic_loop", "sandy_summer")
    fun normalize(key: String) = if (key in bundled) key else "system"
    private fun systemUri(): Uri? = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

    fun uri(context: Context, key: String): Uri? {
      if (key in bundled) {
        // An allowlist keeps payloads from selecting arbitrary paths/resources.
        // Runtime lookup also permits a safe fallback if a resource is missing.
        val id = context.resources.getIdentifier(key, "raw", context.packageName)
        if (id != 0) return Uri.parse("android.resource://${context.packageName}/$id")
        Log.w("NotivaAlarm", "Missing alarm resource: $key; using system default")
      }
      return systemUri()
    }
  }

  fun start(context: Context, key: String, looping: Boolean, finished: (Exception?) -> Unit = {}) {
    val normalized = normalize(key)
    if (player != null && sound == normalized) return
    stop()
    sound = normalized
    play(context, uri(context, normalized), looping, normalized != "system", finished)
  }

  private fun play(context: Context, uri: Uri?, looping: Boolean, fallback: Boolean, finished: (Exception?) -> Unit) {
    val next = try { MediaPlayer() } catch (error: Exception) {
      Log.e("NotivaAlarm", "Could not create alarm player", error)
      sound = null
      finished(error)
      return
    }
    player = next
    fun failed(error: Exception) {
      if (player !== next) return
      Log.e("NotivaAlarm", "Alarm audio unavailable", error)
      next.release()
      player = null
      if (fallback) play(context, systemUri(), looping, false, finished)
      else { sound = null; finished(error) }
    }
    try {
      requireNotNull(uri) { "No system alarm sound available" }
      next.setAudioAttributes(AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
      next.setDataSource(context, uri)
      next.isLooping = looping
      next.setOnErrorListener { _, what, extra ->
        failed(IllegalStateException("MediaPlayer error $what/$extra")); true
      }
      next.setOnCompletionListener { if (player === next) { stop(); finished(null) } }
      next.prepare()
      next.start()
    } catch (error: Exception) { failed(error) }
  }

  fun stop() {
    val old = player
    player = null
    sound = null
    old?.setOnErrorListener(null)
    old?.setOnCompletionListener(null)
    try { old?.stop() } catch (_: Exception) { }
    old?.release()
  }
}
