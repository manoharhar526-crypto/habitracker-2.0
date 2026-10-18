package com.habitracker.app.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import com.habitracker.app.R

class TaskReportsWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) {
            val v = RemoteViews(ctx.packageName, R.layout.widget_task_reports)
            v.setTextViewText(R.id.title, "Task Reports")
            v.setTextViewText(R.id.subtitle, "This month")
            fillCard(v, "daily", WidgetData.getInt(ctx, "task_rep_daily_done"), WidgetData.getInt(ctx, "task_rep_daily_total"))
            fillCard(v, "weekly", WidgetData.getInt(ctx, "task_rep_weekly_done"), WidgetData.getInt(ctx, "task_rep_weekly_total"))
            fillCard(v, "monthly", WidgetData.getInt(ctx, "task_rep_monthly_done"), WidgetData.getInt(ctx, "task_rep_monthly_total"))
            v.setOnClickPendingIntent(R.id.root, HabitToggleReceiver.refreshPi(ctx))
            mgr.updateAppWidget(id, v)
        }
    }

    private fun fillCard(v: RemoteViews, prefix: String, done: Int, total: Int) {
        val pct = if (total > 0) (done * 100 / total) else 0
        val pctId = v.javaClass.classLoader?.let { null } // no-op; keep IDs resolved below
        val ids = when (prefix) {
            "daily" -> Pair(R.id.daily_pct, R.id.daily_meta)
            "weekly" -> Pair(R.id.weekly_pct, R.id.weekly_meta)
            else -> Pair(R.id.monthly_pct, R.id.monthly_meta)
        }
        v.setTextViewText(ids.first, "$pct%")
        v.setTextViewText(ids.second, "$done of $total completed")
    }
}
