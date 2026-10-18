package com.habitracker.app.widgets

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Single broadcast entry point for every interactive widget tap.
 *
 * Operations (`EXTRA_OP`):
 *  • OP_TOGGLE     — flip habit completion for a date (today or earlier)
 *  • OP_SKIP       — flip a per-habit skip day (marks the day N/A)
 *  • OP_WEEK       — shift the Monthly Tracking Grid week window (±1, 0 = today)
 *  • OP_SKIP_HABIT — cycle the habit shown by the Habit Skip Days widget
 *  • OP_REFRESH    — re-render widgets in place (never opens the app)
 *
 * Toggles are queued in SharedPreferences and drained by the web app, while the
 * cached widget JSON is flipped optimistically so the tap feels instant.
 */
class HabitToggleReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        WidgetData.rollIfNewMonth(ctx)
        val op = intent.getStringExtra(EXTRA_OP) ?: OP_TOGGLE
        val habitId = intent.getStringExtra(EXTRA_HABIT_ID)
        var date = intent.getStringExtra(EXTRA_DATE)
        var day = intent.getIntExtra(EXTRA_DAY, -1)
        // Widget drawn days ago: its "today" cell now means the real today.
        if (intent.getBooleanExtra(EXTRA_IS_TODAY, false) && date != WidgetData.todayStr()) {
            date = WidgetData.todayStr()
            day = java.util.Calendar.getInstance().get(java.util.Calendar.DAY_OF_MONTH)
        }

        when (op) {
            OP_WEEK -> {
                val delta = intent.getIntExtra(EXTRA_DELTA, 0)
                val next = if (delta == 0) 0 else
                    (WidgetData.weekOffset(ctx) + delta).coerceIn(-26, 26)
                WidgetData.setWeekOffset(ctx, next)
            }

            OP_SKIP_HABIT -> {
                val delta = intent.getIntExtra(EXTRA_DELTA, 1)
                val count = WidgetData.getJsonArray(ctx, "month_grid").length()
                if (count > 0) {
                    val cur = WidgetData.getInt(ctx, WidgetData.KEY_SKIP_HABIT, 0)
                    val next = ((cur + delta) % count + count) % count
                    WidgetData.putString(ctx, WidgetData.KEY_SKIP_HABIT, next.toString())
                }
            }

            OP_TOGGLE -> {
                if (habitId.isNullOrBlank() || date.isNullOrBlank() || day < 0 || !WidgetData.isTickable(date)) {
                    WidgetData.refreshAll(ctx); return
                }
                if (day == 0) {
                    // Yesterday that belongs to last month.
                    if (WidgetData.togglePrev(ctx, habitId, date)) {
                        WidgetData.queueToggle(ctx, habitId, date)
                        WidgetData.recomputeDerived(ctx, 0)
                    }
                } else if (!WidgetData.hasDay(ctx, habitId, day, "skipped")) {
                    WidgetData.queueToggle(ctx, habitId, date)
                    val wasDone = WidgetData.hasDay(ctx, habitId, day, "days")
                    WidgetData.optimisticToggle(ctx, habitId, day, "days")
                    WidgetData.recomputeDerived(ctx, if (wasDone) -1 else 1)
                }
            }

            OP_SKIP -> {
                if (habitId.isNullOrBlank() || date.isNullOrBlank() || day <= 0) {
                    WidgetData.refreshAll(ctx); return
                }
                // A ticked day can't be skipped — untick it first.
                if (!WidgetData.hasDay(ctx, habitId, day, "days")) {
                    WidgetData.queueSkip(ctx, habitId, date)
                    val wasSkipped = WidgetData.hasDay(ctx, habitId, day, "skipped")
                    WidgetData.optimisticToggle(ctx, habitId, day, "skipped")
                    // Skipping removes a day from the honest denominator; un-skipping adds it back.
                    WidgetData.recomputeDerived(ctx, 0, if (wasSkipped) 1 else -1)
                }
            }

            else -> {
                // OP_REFRESH / unknown: never launch the app, just re-render in place.
                if (!date.isNullOrBlank()) WidgetData.putString(ctx, WidgetData.KEY_NAV_DATE, date)
            }
        }

        WidgetData.refreshAll(ctx)
    }

    companion object {
        const val ACTION = "com.habitracker.app.widgets.TOGGLE_HABIT"
        const val EXTRA_OP = "op"
        const val EXTRA_HABIT_ID = "habitId"
        const val EXTRA_DATE = "date"
        const val EXTRA_DAY = "day"
        const val EXTRA_DELTA = "delta"
        const val EXTRA_TOGGLEABLE = "toggleable"
        const val EXTRA_IS_TODAY = "isToday"

        const val OP_TOGGLE = "toggle"
        const val OP_SKIP = "skip"
        const val OP_WEEK = "week"
        const val OP_SKIP_HABIT = "skipHabit"
        const val OP_REFRESH = "refresh"

        /** In-place refresh tap — widgets never launch the app. */
        fun refreshPi(ctx: Context): PendingIntent = pi(ctx, 900, OP_REFRESH)

        /** Direct PendingIntent for non-collection widgets. */
        fun pi(
            ctx: Context,
            requestCode: Int,
            op: String,
            habitId: String? = null,
            date: String? = null,
            day: Int = -1,
            delta: Int = 0
        ): PendingIntent {
            val i = Intent(ctx, HabitToggleReceiver::class.java).apply {
                action = "$ACTION.$op.$requestCode"
                putExtra(EXTRA_OP, op)
                putExtra(EXTRA_HABIT_ID, habitId)
                putExtra(EXTRA_DATE, date)
                putExtra(EXTRA_DAY, day)
                putExtra(EXTRA_DELTA, delta)
            }
            return PendingIntent.getBroadcast(
                ctx, requestCode, i,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
        }
    }
}
