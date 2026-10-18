package com.habitracker.app.widgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.habitracker.app.R

/**
 * Weekly Tracking widget (collection).
 *
 * One row per habit, seven large day cells for the selected week.
 * The ‹ › pills shift the week window; "Today" jumps back to the current week.
 * When the real week rolls over, offset 0 automatically follows it.
 */
class MonthGridWidget : AppWidgetProvider() {

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) mgr.updateAppWidget(id, buildViews(ctx, id))
        if (ids.isNotEmpty()) mgr.notifyAppWidgetViewDataChanged(ids, R.id.list)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val mgr = AppWidgetManager.getInstance(context)
        val ids = mgr.getAppWidgetIds(ComponentName(context, MonthGridWidget::class.java))
        if (ids.isNotEmpty()) {
            for (id in ids) mgr.updateAppWidget(id, buildViews(context, id))
            mgr.notifyAppWidgetViewDataChanged(ids, R.id.list)
        }
    }

    private fun buildViews(ctx: Context, appWidgetId: Int): RemoteViews {
        val v = RemoteViews(ctx.packageName, R.layout.widget_month_grid)

        v.setTextViewText(R.id.subtitle, WidgetData.weekSubtitle(ctx))
        v.setTextViewText(R.id.week_label, WidgetData.weekLabel(ctx))

        // Wire the ListView to our RemoteViewsService (per-widget-id intent)
        val svc = Intent(ctx, MonthGridRemoteViewsService::class.java).apply {
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            putExtra("offset", WidgetData.weekOffset(ctx))
        }
        svc.data = Uri.parse(svc.toUri(Intent.URI_INTENT_SCHEME))
        v.setRemoteAdapter(R.id.list, svc)
        v.setEmptyView(R.id.list, R.id.empty)

        // Cell taps — MonthGridRemoteViewsService fills in the extras (must be MUTABLE).
        val templateIntent = Intent(ctx, HabitToggleReceiver::class.java).apply {
            action = HabitToggleReceiver.ACTION
        }
        val templatePi = PendingIntent.getBroadcast(
            ctx, 0, templateIntent,
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        v.setPendingIntentTemplate(R.id.list, templatePi)

        // Week navigation
        v.setOnClickPendingIntent(
            R.id.week_prev,
            HabitToggleReceiver.pi(ctx, 101, HabitToggleReceiver.OP_WEEK, delta = -1)
        )
        v.setOnClickPendingIntent(
            R.id.week_next,
            HabitToggleReceiver.pi(ctx, 102, HabitToggleReceiver.OP_WEEK, delta = 1)
        )
        v.setOnClickPendingIntent(
            R.id.week_today,
            HabitToggleReceiver.pi(ctx, 103, HabitToggleReceiver.OP_WEEK, delta = 0)
        )

        // Header taps → open app
        v.setOnClickPendingIntent(R.id.title, HabitToggleReceiver.refreshPi(ctx))
        v.setOnClickPendingIntent(R.id.subtitle, HabitToggleReceiver.refreshPi(ctx))

        return v
    }
}
