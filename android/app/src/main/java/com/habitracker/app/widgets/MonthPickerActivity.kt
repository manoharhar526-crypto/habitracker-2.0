package com.habitracker.app.widgets

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.TextView
import java.util.Calendar

/**
 * Small dialog opened by tapping the calendar widget's title.
 * Pick a year with ‹ › and tap a month — the widget jumps straight there.
 */
class MonthPickerActivity : Activity() {
    companion object {
        const val PREFS = "calendar_widget_state"
        const val KEY_OFFSET = "month_offset"
        private val SHORT = arrayOf("Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec")
    }

    private var year = 0
    private var yearMode = false
    private var yearPage = 0
    private var shownMonth = 0
    private lateinit var yearLabel: TextView
    private lateinit var grid: GridLayout

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun bg(color: Int, stroke: Int? = null) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(10).toFloat()
        if (stroke != null) setStroke(dp(1), stroke)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val offset = getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(KEY_OFFSET, 0)
        val shown = Calendar.getInstance().apply { set(Calendar.DAY_OF_MONTH, 1); add(Calendar.MONTH, offset) }
        year = shown.get(Calendar.YEAR); shownMonth = shown.get(Calendar.MONTH)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(16), dp(18), dp(16))
            background = bg(0xFF15171B.toInt(), 0xFF2A2D33.toInt())
        }
        root.addView(TextView(this).apply {
            text = "Jump to month"; setTextColor(Color.WHITE); textSize = 16f
            setTypeface(typeface, Typeface.BOLD); setPadding(0, 0, 0, dp(10))
        })
        val nav = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        fun arrow(t: String, d: Int) = TextView(this).apply {
            text = t; textSize = 20f; setTextColor(Color.WHITE); gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(dp(44), dp(40))
            background = bg(0xFF22252B.toInt())
            setOnClickListener { if (yearMode) yearPage += d * 12 else year += d; render() }
        }
        yearLabel = TextView(this).apply {
            textSize = 18f; setTextColor(Color.WHITE); gravity = Gravity.CENTER
            setTypeface(typeface, Typeface.BOLD)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            setOnClickListener { yearMode = !yearMode; yearPage = year - 5; render() }
        }
        nav.addView(arrow("‹", -1)); nav.addView(yearLabel); nav.addView(arrow("›", 1))
        root.addView(nav)
        grid = GridLayout(this).apply { columnCount = 3; setPadding(0, dp(12), 0, dp(8)) }
        root.addView(grid)
        root.addView(TextView(this).apply {
            text = "Today"; setTextColor(Color.BLACK); textSize = 13f; gravity = Gravity.CENTER
            setTypeface(typeface, Typeface.BOLD); background = bg(Color.WHITE)
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(40))
            setOnClickListener { save(0) }
        })
        setContentView(root)
        window?.setBackgroundDrawableResource(android.R.color.transparent)
        render()
    }

    private fun render() {
        grid.removeAllViews()
        val now = Calendar.getInstance()
        val curY = now.get(Calendar.YEAR); val curM = now.get(Calendar.MONTH)
        val cellW = (resources.displayMetrics.widthPixels * 0.8f / 3 - dp(10)).toInt().coerceAtMost(dp(96))
        if (yearMode) {
            yearLabel.text = "$yearPage – ${yearPage + 11}"
            for (y in yearPage until yearPage + 12) {
                grid.addView(TextView(this).apply {
                    text = y.toString(); textSize = 14f; gravity = Gravity.CENTER
                    setTextColor(if (y == year) Color.BLACK else Color.WHITE)
                    background = when {
                        y == year -> bg(Color.WHITE)
                        y == curY -> bg(0xFF22252B.toInt(), Color.WHITE)
                        else -> bg(0xFF22252B.toInt())
                    }
                    layoutParams = GridLayout.LayoutParams().apply {
                        width = cellW; height = dp(42); setMargins(dp(4), dp(4), dp(4), dp(4))
                    }
                    setOnClickListener { year = y; yearMode = false; render() }
                })
            }
            return
        }
        yearLabel.text = "$year ▾"
        for (m in 0 until 12) {
            val selected = m == shownMonth && year == currentShownYear()
            val isNow = m == curM && year == curY
            grid.addView(TextView(this).apply {
                text = SHORT[m]; textSize = 14f; gravity = Gravity.CENTER
                setTextColor(if (selected) Color.BLACK else Color.WHITE)
                background = when {
                    selected -> bg(Color.WHITE)
                    isNow -> bg(0xFF22252B.toInt(), Color.WHITE)
                    else -> bg(0xFF22252B.toInt())
                }
                layoutParams = GridLayout.LayoutParams().apply {
                    width = cellW; height = dp(42); setMargins(dp(4), dp(4), dp(4), dp(4))
                }
                setOnClickListener { save((year - curY) * 12 + (m - curM)) }
            })
        }
    }

    private var initialYear = -1
    private fun currentShownYear(): Int {
        if (initialYear == -1) initialYear = year
        return initialYear
    }

    private fun save(offset: Int) {
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt(KEY_OFFSET, offset).apply()
        val mgr = AppWidgetManager.getInstance(this)
        val ids = mgr.getAppWidgetIds(ComponentName(this, CalendarWidget::class.java))
        sendBroadcast(Intent(this, CalendarWidget::class.java).apply {
            action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        })
        finish()
    }
}
