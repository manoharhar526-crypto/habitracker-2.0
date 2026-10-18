package com.habitracker.app.widgets

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock

/**
 * Schedules a 15-minute repeating AlarmManager broadcast that fires
 * APPWIDGET_UPDATE intents for every Habitracker widget provider.
 *
 * This is belt-and-suspenders on top of `android:updatePeriodMillis` —
 * the system can defer the built-in scheduler under doze, so we keep
 * our own inexact alarm running so widgets refresh even when the
 * Capacitor WebView is fully closed.
 */
object WidgetRefreshScheduler {
    private const val INTERVAL_MS = 15L * 60L * 1000L  // 15 minutes
    private const val ACTION = "com.habitracker.app.REFRESH_WIDGETS"
    private const val ACTION_MIDNIGHT = "com.habitracker.app.MIDNIGHT_WIDGETS"

    private val PROVIDERS = arrayOf(
        MonthGridWidget::class.java,
        YearCardWidget::class.java,
        SkipDaysWidget::class.java,
        AnalyticsWidget::class.java,
        CalendarWidget::class.java,
        AllTimeStatsWidget::class.java,
        HabitReportsWidget::class.java,
        TaskReportsWidget::class.java,
        TodaySummaryWidget::class.java
    )

    fun scheduleAll(ctx: Context) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(ctx, WidgetAlarmReceiver::class.java).setAction(ACTION)
        val flags = if (Build.VERSION.SDK_INT >= 23)
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        else
            PendingIntent.FLAG_UPDATE_CURRENT
        val pi = PendingIntent.getBroadcast(ctx, 4242, intent, flags)
        am.cancel(pi)
        am.setInexactRepeating(
            AlarmManager.ELAPSED_REALTIME,
            SystemClock.elapsedRealtime() + INTERVAL_MS,
            INTERVAL_MS,
            pi
        )
        scheduleMidnight(ctx)
    }

    /** Repaints every widget synchronously, on this thread, before returning. */
    fun refreshAllNow(ctx: Context) {
        WidgetData.rollIfNewMonth(ctx)
        val mgr = AppWidgetManager.getInstance(ctx)
        for (cls in PROVIDERS) {
            try {
                val ids = mgr.getAppWidgetIds(ComponentName(ctx, cls))
                if (ids.isEmpty()) continue
                val provider = cls.getDeclaredConstructor().newInstance() as android.appwidget.AppWidgetProvider
                provider.onUpdate(ctx, mgr, ids)
                if (cls == MonthGridWidget::class.java) {
                    mgr.notifyAppWidgetViewDataChanged(ids, com.habitracker.app.R.id.list)
                }
            } catch (_: Exception) {
                // Last resort: ask the provider to repaint itself.
                try {
                    val ids = mgr.getAppWidgetIds(ComponentName(ctx, cls))
                    ctx.sendBroadcast(Intent(ctx, cls)
                        .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids))
                } catch (_: Exception) { }
            }
        }
    }

    /** Wakes up just after midnight (even in doze) so the widget shows the new day. */
    fun scheduleMidnight(ctx: Context) {
        try {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(ctx, WidgetAlarmReceiver::class.java).setAction(ACTION_MIDNIGHT)
            val flags = if (Build.VERSION.SDK_INT >= 23)
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            else PendingIntent.FLAG_UPDATE_CURRENT
            val pi = PendingIntent.getBroadcast(ctx, 4243, intent, flags)
            val cal = java.util.Calendar.getInstance().apply {
                add(java.util.Calendar.DAY_OF_MONTH, 1)
                set(java.util.Calendar.HOUR_OF_DAY, 0)
                set(java.util.Calendar.MINUTE, 0)
                set(java.util.Calendar.SECOND, 5)
                set(java.util.Calendar.MILLISECOND, 0)
            }
            am.cancel(pi)
            if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pi)
            else am.set(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pi)
        } catch (_: Exception) { }
    }
}

class WidgetAlarmReceiver : android.content.BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        WidgetRefreshScheduler.refreshAllNow(ctx)
        // Re-arm the midnight wake-up (also covers date/time/timezone changes).
        WidgetRefreshScheduler.scheduleMidnight(ctx)
    }
}
