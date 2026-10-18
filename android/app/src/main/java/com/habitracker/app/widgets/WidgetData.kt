package com.habitracker.app.widgets

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/**
 * Reads data written by the web app via @capacitor/preferences.
 *
 * IMPORTANT: the web app writes with the DEFAULT Capacitor Preferences group,
 * which maps to the SharedPreferences file "CapacitorStorage". A previous
 * version used a custom group ("HabitrackerWidget"); we still read that file
 * as a fallback so old installs keep working.
 */
object WidgetData {
    const val PREFS = "CapacitorStorage"
    private const val LEGACY_PREFS = "HabitrackerWidget"

    const val KEY_WEEK_OFFSET = "widget_week_offset"
    const val KEY_SKIP_HABIT = "widget_skip_habit_idx"
    const val KEY_PENDING_SKIPS = "pending_skips"
    const val KEY_PENDING_TOGGLES = "pending_toggles"
    const val KEY_NAV_DATE = "widget_nav_date"

    fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun legacy(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(LEGACY_PREFS, Context.MODE_PRIVATE)

    fun getString(ctx: Context, key: String, default: String = ""): String {
        val v = prefs(ctx).getString(key, null)
        if (!v.isNullOrEmpty()) return v
        val l = legacy(ctx).getString(key, null)
        return if (!l.isNullOrEmpty()) l else default
    }

    fun putString(ctx: Context, key: String, value: String) {
        // apply(): the in-memory value is visible instantly to every reader and
        // the disk write happens in the background, so a tap never blocks on
        // a dozen flash writes when the phone wakes from a long sleep.
        prefs(ctx).edit().putString(key, value).apply()
    }

    fun getInt(ctx: Context, key: String, default: Int = 0): Int =
        getString(ctx, key, default.toString()).trim().toIntOrNull() ?: default

    fun getJsonArray(ctx: Context, key: String): JSONArray {
        val raw = getString(ctx, key, "[]")
        return try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
    }

    /** Header subtitle: month name, or a hint when the app has never synced. */
    fun subtitle(ctx: Context): String {
        if (getString(ctx, "widget_new_month", "") == "1") return "New month · open app to add new habits"
        val m = getString(ctx, "calendar_month", "")
        return if (m.isNotEmpty()) m else "Open app to sync"
    }

    /** Month(s) of the week currently shown in the weekly widget. */
    fun weekSubtitle(ctx: Context): String {
        if (getString(ctx, "widget_new_month", "") == "1" && weekOffset(ctx) == 0) return subtitle(ctx)
        if (!hasData(ctx)) return "Open app to sync"
        val start = weekStart(ctx)
        val end = (start.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, 6) }
        val full = SimpleDateFormat("MMMM yyyy", Locale.US)
        if (start.get(Calendar.MONTH) == end.get(Calendar.MONTH)) return full.format(start.time)
        val sm = SimpleDateFormat("MMM", Locale.US)
        return if (start.get(Calendar.YEAR) == end.get(Calendar.YEAR))
            sm.format(start.time) + " – " + sm.format(end.time) + " " + end.get(Calendar.YEAR)
        else sm.format(start.time) + " " + start.get(Calendar.YEAR) + " – " + sm.format(end.time) + " " + end.get(Calendar.YEAR)
    }

    /** True when the app has synced data to native storage at least once. */
    fun hasData(ctx: Context): Boolean =
        getString(ctx, "last_sync", "").isNotEmpty()

    // ── Dates ───────────────────────────────────────────────────────────────
    private val fmt get() = SimpleDateFormat("yyyy-MM-dd", Locale.US)

    fun dateStr(cal: Calendar): String = fmt.format(cal.time)

    fun today(): Calendar = Calendar.getInstance()

    fun todayStr(): String = dateStr(Calendar.getInstance())

    /**
     * Start (Sunday) of the week currently shown by the Monthly Tracking Grid.
     * Offset 0 = week containing today; the widget's ‹ › buttons shift it.
     * When the real week rolls over, offset 0 automatically follows.
     */
    fun weekStart(ctx: Context): Calendar {
        val cal = Calendar.getInstance()
        cal.add(Calendar.DAY_OF_MONTH, -(cal.get(Calendar.DAY_OF_WEEK) - 1))
        cal.add(Calendar.DAY_OF_MONTH, weekOffset(ctx) * 7)
        cal.set(Calendar.HOUR_OF_DAY, 12)
        return cal
    }

    fun weekOffset(ctx: Context): Int = getInt(ctx, KEY_WEEK_OFFSET, 0)

    fun setWeekOffset(ctx: Context, value: Int) =
        putString(ctx, KEY_WEEK_OFFSET, value.toString())

    /** "Sep 1 – 7" style label for the shown week. */
    fun weekLabel(ctx: Context): String {
        val start = weekStart(ctx)
        val end = (start.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, 6) }
        val mFmt = SimpleDateFormat("MMM", Locale.US)
        val a = mFmt.format(start.time) + " " + start.get(Calendar.DAY_OF_MONTH)
        val b = if (start.get(Calendar.MONTH) == end.get(Calendar.MONTH))
            end.get(Calendar.DAY_OF_MONTH).toString()
        else
            mFmt.format(end.time) + " " + end.get(Calendar.DAY_OF_MONTH)
        return "$a – $b"
    }

    data class Item(val id: String, val title: String, val completed: Boolean)

    fun parseItems(arr: JSONArray, titleKey: String = "title"): List<Item> {
        val out = mutableListOf<Item>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            out.add(
                Item(
                    id = o.optString("id"),
                    title = o.optString(titleKey, o.optString("name", "")),
                    completed = o.optBoolean("completed", false)
                )
            )
        }
        return out
    }

    /** Opens the app (used for row/whole-widget clicks). */
    fun openAppIntent(ctx: Context): PendingIntent {
        val i = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
            ?: Intent(Intent.ACTION_MAIN)
        return PendingIntent.getActivity(
            ctx, 0, i,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
    }

    /**
     * Queues a pending toggle (habitId + date) into `pending_toggles`.
     * The web app drains this list on startup and applies the toggles.
     */
    fun queueToggle(ctx: Context, habitId: String, date: String) {
        queueInto(ctx, KEY_PENDING_TOGGLES, habitId, date)
    }

    /** Queues a pending skip-day toggle into `pending_skips`. */
    fun queueSkip(ctx: Context, habitId: String, date: String) {
        queueInto(ctx, KEY_PENDING_SKIPS, habitId, date)
    }

    private fun queueInto(ctx: Context, key: String, habitId: String, date: String) {
        val raw = getString(ctx, key, "[]")
        val arr = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
        arr.put(JSONObject().apply {
            put("habitId", habitId)
            put("date", date)
            put("ts", System.currentTimeMillis())
        })
        putString(ctx, key, arr.toString())
    }

    /**
     * Optimistically flip the given day in the cached `month_grid` JSON so the
     * widget reflects the tap immediately. `field` is "days" or "skipped".
     */
    fun optimisticToggle(ctx: Context, habitId: String, day: Int, field: String) {
        val raw = getString(ctx, "month_grid", "[]")
        val arr = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (o.optString("id") != habitId) continue
            val days = o.optJSONArray(field) ?: JSONArray()
            val set = mutableListOf<Int>()
            for (j in 0 until days.length()) set.add(days.optInt(j))
            if (set.contains(day)) set.remove(day) else set.add(day)
            o.put(field, JSONArray(set))
            break
        }
        putString(ctx, "month_grid", arr.toString())
    }

    /** Only today and yesterday can be ticked from a widget. */
    fun isTickable(date: String): Boolean {
        val y = dateStr(Calendar.getInstance().apply { add(Calendar.DAY_OF_MONTH, -1) })
        return date == todayStr() || date == y
    }

    /** True if [day] is in the habit's [field] list ("days" or "skipped"). */
    fun hasDay(ctx: Context, habitId: String, day: Int, field: String): Boolean {
        val arr = getJsonArray(ctx, "month_grid")
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (o.optString("id") != habitId) continue
            val d = o.optJSONArray(field) ?: return false
            for (j in 0 until d.length()) if (d.optInt(j) == day) return true
        }
        return false
    }

    /** Flips the previous-month "yesterday" state; returns false if it's skipped. */
    fun togglePrev(ctx: Context, habitId: String, date: String): Boolean {
        val arr = getJsonArray(ctx, "month_grid")
        var ok = false
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val p = o.optJSONObject("prev")
            if (o.optString("id") != habitId && p?.optString("id") != habitId) continue
            val hist = o.optJSONObject("hist") ?: JSONObject().also { o.put("hist", it) }
            val cur = hist.optString(date, "")
            if (cur == "s") return false
            if (cur == "d") hist.remove(date) else hist.put(date, "d")
            if (p != null && p.optString("date") == date) p.put("done", cur != "d")
            ok = true
        }
        if (ok) putString(ctx, "month_grid", arr.toString())
        return ok
    }

    fun optimisticToggleMonthGrid(ctx: Context, habitId: String, day: Int) =
        optimisticToggle(ctx, habitId, day, "days")

    /**
     * Recomputes every summary number (Today, Habit Summary, Analytics,
     * All-Time) from the freshly-flipped `month_grid`, so all widgets agree
     * the instant a habit is ticked — even with the app closed.
     * [completionDelta] is +1/-1 when a done tick changed, else 0.
     */
    fun recomputeDerived(ctx: Context, completionDelta: Int = 0, possibleDelta: Int = 0) {
        try {
            val grid = getJsonArray(ctx, "month_grid")
            val cal = Calendar.getInstance()
            val todayNum = cal.get(Calendar.DAY_OF_MONTH)
            val totalDays = cal.getActualMaximum(Calendar.DAY_OF_MONTH)
            val rates = HashMap<String, Int>()
            val counts = HashMap<String, Int>()
            var doneToday = 0
            var maxStreak = 0
            var maxBest = 0
            for (i in 0 until grid.length()) {
                val o = grid.optJSONObject(i) ?: continue
                val days = toSet(o.optJSONArray("days"))
                // Same rule as the app's monthly rate: whole month, N/A and rest days left out.
                val excused = toSet(o.optJSONArray("skipped"))
                var expected = 0
                for (d in 1..totalDays) if (d in days || d !in excused) expected++
                // Live streak: baseline up to yesterday, +1 when today is ticked.
                val live = o.optInt("base", 0) + (if (todayNum in days) 1 else 0)
                maxStreak = maxOf(maxStreak, live)
                maxBest = maxOf(maxBest, o.optInt("best", 0), live)
                val done = days.size
                val rate = if (expected > 0) minOf(100, Math.round(done * 100f / expected)) else 0
                rates[o.optString("name")] = rate
                counts[o.optString("name")] = done
                if (todayNum in days) doneToday++
            }
            val total = grid.length()
            putString(ctx, "today_done", doneToday.toString())
            putString(ctx, "today_total", total.toString())
            if (grid.length() > 0 && grid.optJSONObject(0)?.has("base") == true) {
                putString(ctx, "today_streak", maxStreak.toString())
                val base = getInt(ctx, "alltime_best_base", 0)
                putString(ctx, "alltime_streak", maxOf(base, maxBest).toString())
            }
            putString(ctx, "today_pct", (if (total > 0) Math.round(doneToday * 100f / total) else 0).toString())

            val reports = getJsonArray(ctx, "habit_reports")
            for (i in 0 until reports.length()) {
                val o = reports.optJSONObject(i) ?: continue
                val n = o.optString("name")
                counts[n]?.let { o.put("completed", it) }
                rates[n]?.let { o.put("rate", it) }
                o.put("total", totalDays)
            }
            putString(ctx, "habit_reports", reports.toString())

            val an = getJsonArray(ctx, "analytics")
            val list = mutableListOf<JSONObject>()
            for (i in 0 until an.length()) an.optJSONObject(i)?.let { o ->
                rates[o.optString("name")]?.let { o.put("pct", it) }; list.add(o)
            }
            list.sortByDescending { it.optInt("pct") }
            putString(ctx, "analytics", JSONArray(list).toString())

            if (completionDelta != 0) {
                val c = (getInt(ctx, "alltime_completions", 0) + completionDelta).coerceAtLeast(0)
                putString(ctx, "alltime_completions", c.toString())
            }
            val possible = (getInt(ctx, "alltime_possible", 0) + possibleDelta).coerceAtLeast(0)
            if (possibleDelta != 0) putString(ctx, "alltime_possible", possible.toString())
            if (possible > 0) {
                val c = getInt(ctx, "alltime_completions", 0)
                putString(ctx, "alltime_rate", minOf(100, Math.round(c * 100f / possible)).toString())
            }
        } catch (_: Exception) { /* never break a tap */ }
    }

    private fun toSet(a: JSONArray?): Set<Int> {
        val s = HashSet<Int>(); if (a != null) for (j in 0 until a.length()) s.add(a.optInt(j)); return s
    }

    /**
     * The app may stay closed for weeks or a whole year. When the real month is
     * newer than the month the app last synced, carry the same habits into the
     * new month with empty days, so widgets stay correct and tappable. Taps are
     * queued with real dates; the app files them into the right month on open.
     */
    fun rollIfNewMonth(ctx: Context) {
        try {
            val now = todayStr().substring(0, 7)
            var synced = getString(ctx, "grid_month", "")
            if (synced.isEmpty()) synced = getString(ctx, "today_date", "").take(7)
            if (synced.length != 7 || synced >= now) return
            val cal = Calendar.getInstance()
            val totalDays = cal.getActualMaximum(Calendar.DAY_OF_MONTH)
            val grid = getJsonArray(ctx, "month_grid")
            for (i in 0 until grid.length()) {
                val o = grid.optJSONObject(i) ?: continue
                o.put("days", JSONArray()); o.put("skipped", JSONArray()); o.put("frozen", JSONArray())
                o.put("total", totalDays); o.put("base", 0); o.remove("prev")
            }
            putString(ctx, "month_grid", grid.toString())
            putString(ctx, "grid_month", now)
            putString(ctx, "today_date", todayStr())
            putString(ctx, "calendar_month", SimpleDateFormat("MMMM yyyy", Locale.US).format(cal.time))
            putString(ctx, "widget_new_month", "1")
            recomputeDerived(ctx)
        } catch (_: Exception) { }
    }

    /** Repaints every Habitracker widget right away. */
    fun refreshAll(ctx: Context) = WidgetRefreshScheduler.refreshAllNow(ctx)
}
