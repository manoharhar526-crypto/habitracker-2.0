package com.habitracker.app.widgets

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.view.View
import android.widget.RemoteViews
import com.habitracker.app.R
import java.util.Calendar

/**
 * Month calendar widget styled like the in-app Calendar card:
 * ‹ Month Year › header, a white "Today · 2 Oct" pill, Sun–Sat labels,
 * a ringed today cell and a small dot under days that have notes.
 * Arrows and the Today pill change month in place (no app launch);
 * tapping a day opens the small note editor pop-up.
 */
class CalendarWidget : AppWidgetProvider() {
    companion object {
        private const val ACTION_NAV = "com.habitracker.app.widgets.CAL_NAV"
        private const val EXTRA_DELTA = "delta"
        private const val PREFS = "calendar_widget_state"
        private const val KEY_OFFSET = "month_offset"
        private const val KEY_YEAR_MODE = "year_mode"
        private const val ACTION_MODE = "com.habitracker.app.widgets.CAL_MODE"
        private val MONTHS = arrayOf("January","February","March","April","May","June","July","August","September","October","November","December")
    }

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) {
            heightDp = try { mgr.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) } catch (_: Exception) { 0 }
            // Never let one bad value leave the widget stuck on the static "Calendar" placeholder.
            val views = try { build(ctx) } catch (e: Exception) {
                android.util.Log.e("CalendarWidget", "build failed", e)
                fallback(ctx)
            }
            try { mgr.updateAppWidget(id, views) } catch (e: Exception) {
                android.util.Log.e("CalendarWidget", "update failed", e)
            }
        }
    }

    /** Current widget height in dp (0 = unknown) — drives text size as it is resized. */
    private var heightDp = 0

    override fun onEnabled(ctx: Context) { refreshAll(ctx) }

    override fun onAppWidgetOptionsChanged(ctx: Context, mgr: AppWidgetManager, id: Int, opts: android.os.Bundle) {
        onUpdate(ctx, mgr, intArrayOf(id))
    }

    private fun refreshAll(ctx: Context) {
        val mgr = AppWidgetManager.getInstance(ctx)
        onUpdate(ctx, mgr, mgr.getAppWidgetIds(ComponentName(ctx, CalendarWidget::class.java)))
    }

    /** Minimal, always-safe view: real month title + working arrows. */
    private fun fallback(ctx: Context): RemoteViews {
        val v = RemoteViews(ctx.packageName, R.layout.widget_calendar)
        val cal = Calendar.getInstance()
        cal.set(Calendar.DAY_OF_MONTH, 1)
        cal.add(Calendar.MONTH, ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(KEY_OFFSET, 0))
        v.setTextViewText(R.id.title, "${MONTHS[cal.get(Calendar.MONTH)]} ${cal.get(Calendar.YEAR)}")
        v.setOnClickPendingIntent(R.id.title, modePi(ctx))
        v.setOnClickPendingIntent(R.id.cal_prev, navPi(ctx, -1))
        v.setOnClickPendingIntent(R.id.cal_next, navPi(ctx, 1))
        v.setOnClickPendingIntent(R.id.cal_today, navPi(ctx, 0))
        return v
    }

    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == ACTION_NAV) {
            val sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val delta = intent.getIntExtra(EXTRA_DELTA, 0)
            val next = if (delta == 0) 0 else sp.getInt(KEY_OFFSET, 0) + delta
            sp.edit().putInt(KEY_OFFSET, next).commit()
            refreshAll(ctx)
            return
        }
        if (intent.action == ACTION_MODE) {
            val sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            sp.edit().putBoolean(KEY_YEAR_MODE, !sp.getBoolean(KEY_YEAR_MODE, false)).apply()
            val mgr = AppWidgetManager.getInstance(ctx)
            onUpdate(ctx, mgr, mgr.getAppWidgetIds(ComponentName(ctx, CalendarWidget::class.java)))
            return
        }
        super.onReceive(ctx, intent)
    }

    private fun navPi(ctx: Context, delta: Int): PendingIntent {
        val i = Intent(ctx, CalendarWidget::class.java).apply {
            action = ACTION_NAV
            putExtra(EXTRA_DELTA, delta)
            data = android.net.Uri.parse("habitcal://nav/$delta")
        }
        return PendingIntent.getBroadcast(ctx, 2900 + delta + 5, i,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun modePi(ctx: Context): PendingIntent {
        val i = Intent(ctx, MonthPickerActivity::class.java).apply {
            action = "com.habitracker.app.widgets.PICK_MONTH"
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NO_HISTORY)
        }
        return PendingIntent.getActivity(ctx, 2950, i,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun build(ctx: Context): RemoteViews {
        val v = RemoteViews(ctx.packageName, R.layout.widget_calendar)
        val sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val offset = sp.getInt(KEY_OFFSET, 0)
        val yearMode = false
        val step = if (yearMode) 12 else 1

        val now = Calendar.getInstance()
        val todayDay = now.get(Calendar.DAY_OF_MONTH)
        val todayMonth = now.get(Calendar.MONTH)
        val todayYear = now.get(Calendar.YEAR)

        val cal = Calendar.getInstance()
        cal.set(Calendar.DAY_OF_MONTH, 1)
        cal.add(Calendar.MONTH, offset)
        val year = cal.get(Calendar.YEAR)
        val month = cal.get(Calendar.MONTH)
        val totalDays = cal.getActualMaximum(Calendar.DAY_OF_MONTH)
        val firstDow = cal.get(Calendar.DAY_OF_WEEK) - 1
        val isThisMonth = year == todayYear && month == todayMonth

        // Tap the title to open the month/year picker pop-up.
        v.setTextViewText(R.id.title, if (yearMode) "« ${MONTHS[month].substring(0, 3)} $year »" else "${MONTHS[month]} $year")
        v.setTextViewText(R.id.cal_prev, if (yearMode) "«" else "‹")
        v.setTextViewText(R.id.cal_next, if (yearMode) "»" else "›")
        v.setOnClickPendingIntent(R.id.title, modePi(ctx))
        v.setTextViewText(R.id.cal_today, "Today · $todayDay ${MONTHS[todayMonth].substring(0, 3)}")
        v.setOnClickPendingIntent(R.id.cal_prev, navPi(ctx, -step))
        v.setOnClickPendingIntent(R.id.cal_next, navPi(ctx, step))
        v.setOnClickPendingIntent(R.id.cal_today, navPi(ctx, 0))

        val notesArr = WidgetData.getJsonArray(ctx, "calendar_notes")
        val noteSet = HashSet<String>()
        for (i in 0 until notesArr.length()) noteSet.add(notesArr.optString(i))
        val ym = String.format(java.util.Locale.US, "%04d-%02d-", year, month + 1)

        // Grow text with the widget; hide the footer when it is small.
        val cellSp = when {
            heightDp == 0 -> 12f
            heightDp < 200 -> 9f
            heightDp < 260 -> 11f
            heightDp < 340 -> 13f
            heightDp < 440 -> 15f
            else -> 17f
        }
        v.setViewVisibility(R.id.footer, if (heightDp in 1..219) View.GONE else View.VISIBLE)
        v.setViewVisibility(R.id.cal_today, if (heightDp in 1..179) View.GONE else View.VISIBLE)
        // 5-row months drop the 6th row so the rest stretch to fill the space.
        v.setViewVisibility(R.id.crow6, if (firstDow + totalDays <= 35) View.GONE else View.VISIBLE)

        var hasNoteThisMonth = false
        for (i in 1..42) {
            val cellId = ctx.resources.getIdentifier("c$i", "id", ctx.packageName)
            if (cellId == 0) continue
            val day = i - firstDow
            if (day in 1..totalDays) {
                v.setViewVisibility(cellId, View.VISIBLE)
                v.setTextViewTextSize(cellId, android.util.TypedValue.COMPLEX_UNIT_SP, cellSp)
                val dateStr = ym + String.format(java.util.Locale.US, "%02d", day)
                val hasNote = noteSet.contains(dateStr)
                if (hasNote) hasNoteThisMonth = true
                v.setTextViewText(cellId, if (hasNote) "$day\n•" else day.toString())
                if (isThisMonth && day == todayDay) {
                    v.setInt(cellId, "setBackgroundResource", R.drawable.widget_cal_today)
                    v.setTextColor(cellId, 0xFFFFFFFF.toInt())
                } else {
                    v.setInt(cellId, "setBackgroundResource", R.drawable.widget_cal_day)
                    v.setTextColor(cellId, 0xFFE7E9EE.toInt())
                }
                v.setOnClickPendingIntent(cellId, notePi(ctx, i, dateStr))
            } else {
                v.setViewVisibility(cellId, View.INVISIBLE)
            }
        }
        v.setTextViewText(
            R.id.footer,
            if (yearMode) "Arrows change year · tap the title for months"
            else if (hasNoteThisMonth) "• has a note · tap the title to pick a month"
            else "Tap a day to add a note · tap the title to pick a month"
        )
        return v
    }

    /** Opens the small note editor dialog for the tapped day. */
    private fun notePi(ctx: Context, cell: Int, dateStr: String): PendingIntent {
        val i = Intent(ctx, NoteEditorActivity::class.java).apply {
            action = "com.habitracker.app.widgets.EDIT_NOTE.$dateStr"
            putExtra(NoteEditorActivity.EXTRA_DATE, dateStr)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        return PendingIntent.getActivity(
            ctx, 3000 + cell, i,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
    }
}
