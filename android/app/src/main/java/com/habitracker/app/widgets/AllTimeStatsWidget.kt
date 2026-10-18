package com.habitracker.app.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.habitracker.app.R

class AllTimeStatsWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) {
            val v = RemoteViews(ctx.packageName, R.layout.widget_all_time_stats)
            v.setTextViewText(R.id.title, "All-Time Statistics")
            v.setTextViewText(R.id.subtitle, "")
            v.setTextViewText(R.id.stat1_num, WidgetData.getInt(ctx, "alltime_months").toString())
            v.setTextViewText(R.id.stat2_num, WidgetData.getInt(ctx, "alltime_completions").toString())
            v.setTextViewText(R.id.stat3_num, "${WidgetData.getInt(ctx, "alltime_rate")}%")
            v.setTextViewText(R.id.stat4_num, "${WidgetData.getInt(ctx, "alltime_streak")}d")
            val best = WidgetData.getString(ctx, "alltime_best", "—")
            v.setTextViewText(R.id.best_habit_name, if (best.isBlank()) "—" else best)
            v.setTextViewText(R.id.best_habit_sub, "Most completions this year")
            v.setOnClickPendingIntent(R.id.root, HabitToggleReceiver.refreshPi(ctx))
            mgr.updateAppWidget(id, v)
        }
    }
}
