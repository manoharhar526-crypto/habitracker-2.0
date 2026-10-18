package com.habitracker.app.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.habitracker.app.R
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/**
 * Habit Skip Days — one habit at a time (‹ › cycles habits), full-month grid.
 * Tapping any day up to today toggles that habit's skip day, exactly like the
 * app's skip calendar. Skipped days don't count against completion rate.
 *
 * Data source: `month_grid` (per-habit `days` + `skipped` day numbers).
 */
class SkipDaysWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) mgr.updateAppWidget(id, build(ctx, heightDp(mgr, id)))
    }

    /** Re-render on resize so a bigger widget shows more chips. */
    override fun onAppWidgetOptionsChanged(ctx: Context, mgr: AppWidgetManager, id: Int, opts: android.os.Bundle) {
        mgr.updateAppWidget(id, build(ctx, heightDp(mgr, id)))
    }

    private fun heightDp(mgr: AppWidgetManager, id: Int): Int =
        mgr.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0)

    private fun build(ctx: Context, heightDp: Int = 0): RemoteViews {
        val v = RemoteViews(ctx.packageName, R.layout.widget_skip_days)
        // More space → more content: no chips when small, 1 row medium, 2 rows tall.
        // More space → more chip rows: 0 when small, up to 8 rows (32 chips) when tall.
        // More space → more chip rows: none when small, up to 16 rows (64 chips) when tall.
        val chipRows = if (heightDp == 0) 4 else ((heightDp - 280) / 30).coerceIn(0, 16)
        // Tiny widget: drop the hint and shrink cells so the month still fits.
        val compact = heightDp in 1..199
        v.setViewVisibility(R.id.hint, if (heightDp == 0 || heightDp >= 260) View.VISIBLE else View.GONE)
        val cellSp = when { compact -> 8f; heightDp in 1..279 -> 10f; heightDp >= 420 -> 13f; else -> 11f }
        v.setTextViewText(R.id.title, "Habit Skip Days")
        v.setTextViewText(R.id.subtitle, WidgetData.subtitle(ctx))

        val habits = WidgetData.getJsonArray(ctx, "month_grid")
        val idx = if (habits.length() == 0) 0
            else WidgetData.getInt(ctx, WidgetData.KEY_SKIP_HABIT, 0)
                .coerceIn(0, habits.length() - 1)
        val habit: JSONObject? = habits.optJSONObject(idx)
        val habitId = habit?.optString("id") ?: ""

        val habitSkipCount = habit?.optJSONArray("skipped")?.length() ?: 0
        val habitName = habit?.optString("name")?.ifBlank { "No habits" } ?: "Open app to sync"
        v.setTextViewText(
            R.id.skip_habit,
            if (habitSkipCount > 0) "$habitName  ⊘$habitSkipCount" else habitName
        )
        if (habits.length() > 0) {
            v.setTextViewText(R.id.subtitle, "${idx + 1}/${habits.length()}" +
                if (habitSkipCount > 0) " · ⊘ $habitSkipCount skipped" else "")
        }
        v.setOnClickPendingIntent(
            R.id.skip_prev,
            HabitToggleReceiver.pi(ctx, 201, HabitToggleReceiver.OP_SKIP_HABIT, delta = -1)
        )
        v.setOnClickPendingIntent(
            R.id.skip_next,
            HabitToggleReceiver.pi(ctx, 202, HabitToggleReceiver.OP_SKIP_HABIT, delta = 1)
        )
        v.setOnClickPendingIntent(R.id.title, HabitToggleReceiver.refreshPi(ctx))

        // Habit chips (like the app): 8 per page, the page follows the selected habit.
        val chipIds = (1..64).map { ctx.resources.getIdentifier("chip$it", "id", ctx.packageName) }
        val perPage = chipRows * 4
        val chipSp = when { heightDp >= 600 -> 13f; heightDp >= 420 -> 12f; heightDp in 1..279 -> 9f; else -> 10f }
        val pageStart = if (perPage == 0) 0 else (idx / perPage) * perPage
        for (c in chipIds.indices) {
            val id = chipIds[c]; if (id == 0) continue
            val hi = pageStart + c
            val h = if (hi < habits.length()) habits.optJSONObject(hi) else null
            if (h == null || c >= perPage) { v.setViewVisibility(id, View.GONE); continue }
            v.setViewVisibility(id, View.VISIBLE)
            val n = h.optJSONArray("skipped")?.length() ?: 0
            val name = h.optString("name").ifBlank { "Habit" }
            v.setTextViewText(id, if (n > 0) "$name ⊘$n" else name)
            v.setTextViewTextSize(id, android.util.TypedValue.COMPLEX_UNIT_SP, chipSp)
            val sel = hi == idx
            v.setInt(id, "setBackgroundResource", if (sel) R.drawable.widget_skip_chip else R.drawable.widget_pill)
            v.setTextColor(id, if (sel) 0xFF0B0C0F.toInt() else 0xFFB8BCC4.toInt())
            v.setOnClickPendingIntent(id,
                HabitToggleReceiver.pi(ctx, 2100 + hi, HabitToggleReceiver.OP_SKIP_HABIT, delta = hi - idx))
        }
        for (r in 1..16) {
            val rowId = ctx.resources.getIdentifier("chip_row$r", "id", ctx.packageName)
            if (rowId == 0) continue
            val show = chipRows >= r && habits.length() - pageStart > (r - 1) * 4
            v.setViewVisibility(rowId, if (show) View.VISIBLE else View.GONE)
        }

        val cal = Calendar.getInstance()
        val today = cal.get(Calendar.DAY_OF_MONTH)
        val year = cal.get(Calendar.YEAR)
        val month = cal.get(Calendar.MONTH)
        val totalDays = cal.getActualMaximum(Calendar.DAY_OF_MONTH)
        cal.set(year, month, 1)
        val firstDow = cal.get(Calendar.DAY_OF_WEEK) - 1
        val ym = String.format("%04d-%02d-", year, month + 1)

        val skipped = HashSet<Int>()
        habit?.optJSONArray("skipped")?.let { for (i in 0 until it.length()) skipped.add(it.optInt(i)) }
        val done = HashSet<Int>()
        habit?.optJSONArray("days")?.let { for (i in 0 until it.length()) done.add(it.optInt(i)) }

        for (i in 1..42) {
            val cellId = ctx.resources.getIdentifier("s$i", "id", ctx.packageName)
            if (cellId == 0) continue
            val day = i - firstDow
            if (day !in 1..totalDays) {
                v.setViewVisibility(cellId, View.INVISIBLE)
                continue
            }
            v.setViewVisibility(cellId, View.VISIBLE)
            val date = ym + String.format("%02d", day)
            val isSkip = skipped.contains(day)
            val isFuture = day > today

            val isDone = done.contains(day)
            v.setTextViewText(cellId, when {
                compact -> if (isDone) "✓" else if (isSkip) "⊘" else day.toString()
                isDone -> "$day\n✓"
                isSkip -> "$day\n⊘"
                else -> day.toString()
            })
            v.setTextViewTextSize(cellId, android.util.TypedValue.COMPLEX_UNIT_SP, cellSp)
            val bg = when {
                isDone -> R.drawable.widget_skip_done
                isSkip -> R.drawable.widget_cell_skip
                day == today -> R.drawable.widget_cell_today
                isFuture -> R.drawable.widget_cell_future
                else -> R.drawable.widget_cell
            }
            v.setInt(cellId, "setBackgroundResource", bg)
            v.setTextColor(
                cellId,
                when {
                    isDone -> 0xFF0B0C0F.toInt()
                    isSkip -> 0xFFF97316.toInt()
                    day == today -> 0xFFFFFFFF.toInt()
                    isFuture -> 0xFF4B5058.toInt()
                    else -> 0xFFE7E9EE.toInt()
                }
            )

            // Same rules as the app: no future days, completed days must be unchecked first.
            val op = if (!isFuture && !isDone && habitId.isNotEmpty())
                HabitToggleReceiver.OP_SKIP else HabitToggleReceiver.OP_REFRESH
            v.setOnClickPendingIntent(
                cellId,
                HabitToggleReceiver.pi(ctx, 2000 + day, op, habitId = habitId, date = date, day = day)
            )
        }
        return v
    }
}

/**
 * Habit Analytics — up to 6 habit rows (name + %).
 */
class AnalyticsWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) {
            val v = RemoteViews(ctx.packageName, R.layout.widget_analytics)
            v.setTextViewText(R.id.title, "Habit Analytics")
            v.setTextViewText(R.id.subtitle, WidgetData.subtitle(ctx))
            val arr = WidgetData.getJsonArray(ctx, "analytics")
            val rows = listOf(R.id.a1, R.id.a2, R.id.a3, R.id.a4, R.id.a5, R.id.a6)
            val names = listOf(R.id.a1_name, R.id.a2_name, R.id.a3_name, R.id.a4_name, R.id.a5_name, R.id.a6_name)
            val pcts = listOf(R.id.a1_pct, R.id.a2_pct, R.id.a3_pct, R.id.a4_pct, R.id.a5_pct, R.id.a6_pct)
            for (i in rows.indices) {
                if (i < arr.length()) {
                    val o = arr.optJSONObject(i) ?: continue
                    v.setViewVisibility(rows[i], View.VISIBLE)
                    v.setTextViewText(names[i], o.optString("name"))
                    v.setTextViewText(pcts[i], "${o.optInt("pct")}%")
                } else v.setViewVisibility(rows[i], View.GONE)
            }
            v.setViewVisibility(R.id.empty, if (arr.length() == 0) View.VISIBLE else View.GONE)
            v.setOnClickPendingIntent(R.id.root, HabitToggleReceiver.refreshPi(ctx))
            mgr.updateAppWidget(id, v)
        }
    }
}

/**
 * Habit Summary — 3 top stat cards + up to 4 habit rows.
 */
class HabitReportsWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) {
            val v = RemoteViews(ctx.packageName, R.layout.widget_habit_reports)
            v.setTextViewText(R.id.title, "Habit Summary")
            v.setTextViewText(R.id.subtitle, WidgetData.subtitle(ctx))

            val reports = WidgetData.getJsonArray(ctx, "habit_reports")
            val total = reports.length()
            val best = bestBy(reports, "rate")
            val streak = WidgetData.getInt(ctx, "alltime_streak")

            v.setTextViewText(R.id.sum1_num, total.toString())
            v.setTextViewText(R.id.sum1_sub, "this month")
            v.setTextViewText(R.id.sum2_num, best?.optString("name")?.ifBlank { "—" } ?: "—")
            v.setTextViewText(R.id.sum2_sub, best?.let { "${it.optInt("rate")}% rate" } ?: "")
            v.setTextViewText(R.id.sum3_num, "${streak}d")
            v.setTextViewText(R.id.sum3_sub, "longest")

            val rowIds = listOf(R.id.hrow1, R.id.hrow2, R.id.hrow3, R.id.hrow4)
            val nameIds = listOf(R.id.hrow1_name, R.id.hrow2_name, R.id.hrow3_name, R.id.hrow4_name)
            val metaIds = listOf(R.id.hrow1_meta, R.id.hrow2_meta, R.id.hrow3_meta, R.id.hrow4_meta)
            for (i in rowIds.indices) {
                if (i < reports.length()) {
                    val o = reports.optJSONObject(i) ?: continue
                    v.setViewVisibility(rowIds[i], View.VISIBLE)
                    v.setTextViewText(nameIds[i], o.optString("name"))
                    v.setTextViewText(metaIds[i], "${o.optInt("completed")}/${o.optInt("total")} · ${o.optInt("rate")}%")
                } else v.setViewVisibility(rowIds[i], View.GONE)
            }
            v.setViewVisibility(R.id.empty, if (reports.length() == 0) View.VISIBLE else View.GONE)
            v.setOnClickPendingIntent(R.id.root, HabitToggleReceiver.refreshPi(ctx))
            mgr.updateAppWidget(id, v)
        }
    }

    private fun bestBy(arr: JSONArray, field: String): JSONObject? {
        var best: JSONObject? = null; var max = -1
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val v = o.optInt(field)
            if (v > max) { max = v; best = o }
        }
        return best
    }
}
