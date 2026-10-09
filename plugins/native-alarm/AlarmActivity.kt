package com.notiva.alarm

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Color
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.util.Date

class AlarmActivity : Activity() {

  companion object {
    var current: AlarmActivity? = null
  }

  private var completing = false
  private var entered = false

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
          ?.group()
          ?.any { it.getString("id") == id } == true
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
    val members = AlarmService.instance?.group() ?: listOf(data)
    val grouped = members.size > 1

    fun dp(value: Int) = (value * resources.displayMetrics.density + 0.5f).toInt()
    val purple = Color.rgb(77, 63, 230)
    val gray = Color.rgb(107, 107, 119)
    val title = data.getString("title")
    val occurrence = Date(data.optLong("nextAt", data.optLong("startAt", System.currentTimeMillis())))

    fun label(value: String, size: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
      text = value
      textSize = size
      gravity = Gravity.CENTER
      setTextColor(color)
      if (bold) setTypeface(typeface, Typeface.BOLD)
    }

    val layout = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(dp(24), dp(24), dp(24), dp(24))
      clipChildren = false
      clipToPadding = false
    }
    val card = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      background = GradientDrawable().apply {
        setColor(Color.WHITE)
        cornerRadius = dp(24).toFloat()
      }
      clipToOutline = true
      elevation = dp(18).toFloat()
    }
    val glow = FrameLayout(this).apply {
      setPadding(0, dp(12), 0, dp(12))
      clipChildren = false
      clipToPadding = false
      setBackgroundColor(Color.BLACK)
      addView(card, FrameLayout.LayoutParams(-1, if (grouped) -1 else -2))
    }
    layout.addView(glow, LinearLayout.LayoutParams(
      minOf(dp(400), resources.displayMetrics.widthPixels - dp(48)),
      if (grouped) LinearLayout.LayoutParams.MATCH_PARENT else LinearLayout.LayoutParams.WRAP_CONTENT
    ))

    val header = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(dp(24), dp(26), dp(24), dp(22))
      setBackgroundColor(purple)
    }
    // A native vector-style bell keeps the visual crisp at every display density.
    header.addView(object : android.view.View(this) {
      private val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        style = android.graphics.Paint.Style.STROKE
        strokeWidth = 1.7f
        strokeCap = android.graphics.Paint.Cap.ROUND
        strokeJoin = android.graphics.Paint.Join.ROUND
      }
      private val bell = android.graphics.Path().apply {
        moveTo(18f, 8f)
        cubicTo(18f, 4.7f, 15.3f, 3f, 12f, 3f)
        cubicTo(8.7f, 3f, 6f, 4.7f, 6f, 8f)
        cubicTo(6f, 13f, 5f, 14f, 4f, 16f)
        lineTo(20f, 16f)
        cubicTo(19f, 14f, 18f, 13f, 18f, 8f)
        moveTo(10f, 20f)
        quadTo(12f, 22f, 14f, 20f)
        moveTo(12f, 1f)
        lineTo(12f, 3f)
      }
      init {
        importantForAccessibility = android.view.View.IMPORTANT_FOR_ACCESSIBILITY_NO
        background = GradientDrawable().apply {
          shape = GradientDrawable.OVAL
          setColor(0x22FFFFFF)
          setStroke(dp(1), 0x55FFFFFF)
        }
      }
      override fun onDraw(canvas: android.graphics.Canvas) {
        super.onDraw(canvas)
        canvas.save()
        val iconSize = width * 0.48f
        canvas.translate((width - iconSize) / 2f, (height - iconSize) / 2f)
        canvas.scale(iconSize / 24f, iconSize / 24f)
        canvas.drawPath(bell, paint)
        canvas.restore()
      }
    }, LinearLayout.LayoutParams(dp(76), dp(76)))
    if (grouped) header.addView(label("Group Reminder", 20f, Color.WHITE, true).apply {
      setPadding(0, dp(14), 0, 0)
    })
    card.addView(header)

    val body = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(24), dp(22), dp(24), dp(24))
    }
    card.addView(body, if (grouped) LinearLayout.LayoutParams(-1, 0, 1f) else LinearLayout.LayoutParams(-1, -2))
    val meta = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    meta.addView(label(java.text.DateFormat.getDateInstance(java.text.DateFormat.MEDIUM).format(occurrence), 12f, gray).apply {
      gravity = Gravity.START or Gravity.CENTER_VERTICAL
      setPadding(0, 0, dp(8), 0)
    }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    meta.addView(label(android.text.format.DateFormat.getTimeFormat(this).format(occurrence), 12f, gray).apply {
      gravity = Gravity.END or Gravity.CENTER_VERTICAL
    }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    body.addView(meta)

    fun action(value: String, color: Int) = Button(this).apply {
      text = value
      isAllCaps = false
      textSize = 14f
      setTypeface(typeface, Typeface.BOLD)
      setTextColor(Color.WHITE)
      minHeight = dp(52)
      minimumHeight = dp(52)
      minWidth = dp(80)
      setPadding(dp(12), 0, dp(12), 0)
      stateListAnimator = null
      elevation = 0f
      background = RippleDrawable(ColorStateList.valueOf(0x33FFFFFF),
        GradientDrawable().apply { setColor(color); cornerRadius = dp(14).toFloat() }, null)
    }
    if (grouped) body.addView(label("${members.size} items", 14f, purple, true).apply { setPadding(0, dp(16), 0, 0) })
    // The group header, metadata and count stay fixed; only item cards scroll.
    val itemList = if (grouped) LinearLayout(this).apply { orientation = LinearLayout.VERTICAL } else body
    if (grouped) body.addView(ScrollView(this).apply {
      isFillViewport = false
      addView(itemList)
    }, LinearLayout.LayoutParams(-1, 0, 1f))
    for (member in members) {
      val memberId = member.getString("id")
      val row = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(if (grouped) dp(16) else 0, dp(16), if (grouped) dp(16) else 0, dp(16))
        if (grouped) background = GradientDrawable().apply { setColor(0xFFF7F5FF.toInt()); cornerRadius = dp(16).toFloat() }
      }
      if (grouped) row.addView(label(member.optString("itemType", "reminder").replaceFirstChar { it.uppercase() }, 12f, purple, true))
      row.addView(label(member.getString("title"), if (grouped) 20f else 23f, Color.rgb(23, 19, 41), true).apply {
        setPadding(0, dp(12), 0, dp(12)); maxLines = 4; ellipsize = android.text.TextUtils.TruncateAt.END
      })
      val description = if (member.isNull("description")) "" else member.optString("description")
      if (description.isNotBlank()) row.addView(label(description, 14f, gray).apply {
        setLineSpacing(dp(3).toFloat(), 1f); maxLines = 4; ellipsize = android.text.TextUtils.TruncateAt.END
        contentDescription = description
      })
      val actions = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, dp(18), 0, 0) }
      if (!grouped || member.optString("itemType", "reminder") in listOf("reminder", "task")) {
        actions.addView(action("Done", Color.rgb(36, 130, 78)).apply {
          contentDescription = if (grouped) "Done: ${member.getString("title")}" else "Done"
          setOnClickListener { done(memberId) }
        }, LinearLayout.LayoutParams(0, -2, 1f))
        actions.addView(android.view.View(this), LinearLayout.LayoutParams(dp(12), 1))
      }
      actions.addView(action("Dismiss", purple).apply {
        contentDescription = if (grouped) "Dismiss: ${member.getString("title")}" else "Dismiss"
        setOnClickListener { dismiss(memberId) }
      }, LinearLayout.LayoutParams(0, -2, 1f))
      row.addView(actions)
      itemList.addView(row, LinearLayout.LayoutParams(-1, -2).apply { topMargin = if (grouped) dp(12) else 0 })
    }
    if (grouped) body.addView(action("Dismiss All", purple).apply {
      contentDescription = "Dismiss All"
      setOnClickListener { AlarmService.instance?.dismissGroup() }
    }, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(16) })

    window.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(Color.BLACK))
    if (grouped) {
      layout.fitsSystemWindows = true
      layout.setBackgroundColor(Color.BLACK)
      setContentView(layout)
    } else setContentView(ScrollView(this).apply {
      isFillViewport = true
      fitsSystemWindows = true
      setBackgroundColor(Color.BLACK)
      addView(layout)
    })
    if (!entered) {
      entered = true; card.alpha = 0f; card.scaleX = 0.97f; card.scaleY = 0.97f
      card.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(180).start()
    }
  }

  private fun dismiss(id: String) {
    AlarmService.instance?.remove(id)
  }

  private fun done(id: String) {
    if (completing || AlarmService.instance?.group()?.none { it.getString("id") == id } != false) return
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
