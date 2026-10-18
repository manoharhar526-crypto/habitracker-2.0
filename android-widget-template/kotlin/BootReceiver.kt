package com.habitracker.app.widgets

import android.app.PendingIntent
import android.app.AlarmManager
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.SystemClock

/**
 * Fires once when the device finishes booting. Forces all Habitracker
 * widgets to redraw immediately (so users see fresh data after restart)
 * and re-arms the periodic AlarmManager refresh.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON") {
            WidgetRefreshScheduler.scheduleAll(ctx)
            WidgetRefreshScheduler.refreshAllNow(ctx)
        }
    }
}
