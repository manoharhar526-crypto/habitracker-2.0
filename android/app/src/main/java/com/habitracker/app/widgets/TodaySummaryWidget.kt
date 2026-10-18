package com.habitracker.app.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import com.habitracker.app.R

/**
 * Compact 2x2 "Today" widget: completion percentage for today, the
 * done/total habit count and the current best streak.
 *
 * Tapping it refreshes in place (never opens the app). When the app has
 * never synced, a hint replaces the numbers instead of showing zeros.
 */
class TodaySummaryWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) mgr.updateAppWidget(id, build(ctx))
    }

    private fun build(ctx: Context): RemoteViews {
        val v = RemoteViews(ctx.packageName, R.layout.widget_today_summary)
        val hasData = WidgetData.hasData(ctx)

        if (!hasData) {
            v.setViewVisibility(R.id.stats, View.GONE)
            v.setViewVisibility(R.id.empty, View.VISIBLE)
            v.setTextViewText(R.id.subtitle, "")
        } else {
            val done = WidgetData.getInt(ctx, "today_done", 0)
            val total = WidgetData.getInt(ctx, "today_total", 0)
            val pct = WidgetData.getInt(ctx, "today_pct", 0)
            val streak = WidgetData.getInt(ctx, "today_streak", 0)

            v.setViewVisibility(R.id.stats, View.VISIBLE)
            v.setViewVisibility(R.id.empty, View.GONE)
            val allDone = total > 0 && done >= total
            v.setTextViewText(R.id.pct, if (allDone) "All Done 🎉" else "$pct%")
            v.setTextViewText(R.id.count, "$done of $total habits")
            v.setTextViewText(R.id.streak, "🔥 $streak day streak")
            v.setTextViewText(R.id.subtitle, WidgetData.todayStr().substring(5))
            v.setTextColor(
                R.id.pct,
                when {
                    allDone -> 0xFFFACC15.toInt()
                    pct >= 80 -> 0xFFFFFFFF.toInt()
                    pct >= 40 -> 0xFFE7E9EE.toInt()
                    else -> 0xFF8B8F98.toInt()
                }
            )
        }

        v.setOnClickPendingIntent(R.id.root, HabitToggleReceiver.refreshPi(ctx))
        return v
    }
}
