package com.habitracker.app.widgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import com.habitracker.app.R
import java.util.Calendar

/**
 * Year Card — full-year contribution grid (weeks as columns, Sun→Sat rows).
 *
 * Data: "year_levels" is one char per day of "year_card_year" from Jan 1:
 *   '.' nothing tracked, 'x' excused (rest/N/A/freeze), '0'..'4' share done.
 * Today's cell is always computed live from today_done/today_total, which the
 * tap receiver updates instantly — so the card reacts to every tick.
 * Drawn as a bitmap sized to the widget, so it fills any resize.
 */
class YearCardWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        for (id in ids) {
            try { mgr.updateAppWidget(id, build(ctx, mgr, id)) } catch (_: Exception) { }
        }
    }

    override fun onAppWidgetOptionsChanged(ctx: Context, mgr: AppWidgetManager, id: Int, o: Bundle) {
        try { mgr.updateAppWidget(id, build(ctx, mgr, id)) } catch (_: Exception) { }
    }

    private fun build(ctx: Context, mgr: AppWidgetManager, id: Int): RemoteViews {
        val v = RemoteViews(ctx.packageName, R.layout.widget_year_card)
        v.setOnClickPendingIntent(R.id.root, HabitToggleReceiver.refreshPi(ctx))
        val cal = Calendar.getInstance()
        val year = cal.get(Calendar.YEAR)
        val todayIdx = cal.get(Calendar.DAY_OF_YEAR) - 1
        v.setTextViewText(R.id.title, "$year")

        val syncedYear = WidgetData.getInt(ctx, "year_card_year", 0)
        // A new year with the app still closed starts blank (honest, never invented).
        val levels = if (syncedYear == year) WidgetData.getString(ctx, "year_levels", "") else ""
        val doneBase = if (syncedYear == year) WidgetData.getInt(ctx, "year_done_base", 0) else 0
        val expBase = if (syncedYear == year) WidgetData.getInt(ctx, "year_expected_base", 0) else 0
        val tDone = WidgetData.getInt(ctx, "today_done", 0)
        val tTotal = WidgetData.getInt(ctx, "today_total", 0)
        val liveToday = WidgetData.getString(ctx, "today_date", "") == WidgetData.todayStr()

        if (!WidgetData.hasData(ctx)) {
            v.setViewVisibility(R.id.empty, View.VISIBLE)
            v.setViewVisibility(R.id.grid, View.GONE)
            v.setTextViewText(R.id.stats, "")
            return v
        }
        v.setViewVisibility(R.id.empty, View.GONE)
        v.setViewVisibility(R.id.grid, View.VISIBLE)

        val done = doneBase + (if (liveToday) tDone else 0)
        val exp = expBase + (if (liveToday) tTotal else 0)
        val pct = if (exp > 0) minOf(100, done * 100 / exp) else 0

        val opts = mgr.getAppWidgetOptions(id)
        val wDp = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 0).takeIf { it > 0 }
            ?: opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 300).coerceAtLeast(60)
        val hDp = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0).takeIf { it > 0 } ?: 150
        v.setTextViewText(R.id.stats, if (wDp < 160) "$pct%" else "✓ $done · $pct%")

        val density = ctx.resources.displayMetrics.density
        // Space left after padding + header.
        val w = ((wDp - 24) * density).toInt().coerceIn(40, 1400)
        val h = ((hDp - 24 - 26) * density).toInt().coerceIn(30, 1400)

        val jan1 = Calendar.getInstance().apply { set(year, 0, 1) }
        val firstDow = jan1.get(Calendar.DAY_OF_WEEK) - 1
        val daysInYear = jan1.getActualMaximum(Calendar.DAY_OF_YEAR)
        val weeks = (firstDow + daysInYear + 6) / 7

        // Adaptive bands: split the year into 1-4 stacked rows, whichever gives the biggest cells.
        val labelH = 11f * density
        val bandGap = 4f * density
        var bands = 1; var cell = 0f
        for (k in 1..4) {
            val wpb = (weeks + k - 1) / k
            val cs = minOf(w.toFloat() / wpb, (h - k * labelH - (k - 1) * bandGap) / (7f * k))
            if (cs > cell * 1.08f) { cell = cs; bands = k }
        }
        val wpb = (weeks + bands - 1) / bands
        val bandH = labelH + cell * 7 + bandGap
        val gap = (cell * 0.2f).coerceAtLeast(1f)
        val ox = (w - cell * wpb) / 2f
        val oy = ((h - bandH * bands + bandGap) / 2f).coerceAtLeast(0f)
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        val r = RectF()
        val radius = cell * 0.25f
        val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE; color = 0xFFFFFFFF.toInt()
            strokeWidth = (cell * 0.14f).coerceAtLeast(1.5f)
        }

        for (i in 0 until daysInYear) {
            val pos = firstDow + i
            val col = pos / 7; val row = pos % 7
            val band = col / wpb; val lc = col % wpb
            val ch = when {
                i == todayIdx && liveToday ->
                    if (tTotal <= 0) '.' else { val q = tDone.toFloat() / tTotal
                        when { q <= 0f -> '0'; q < 0.34f -> '1'; q < 0.67f -> '2'; q < 1f -> '3'; else -> '4' } }
                i > todayIdx -> 'f'
                i < levels.length -> levels[i]
                else -> '.'
            }
            p.color = when (ch) {
                '4' -> 0xFFFFFFFF.toInt()
                '3' -> 0xFFBDBDBD.toInt()
                '2' -> 0xFF8A8A8A.toInt()
                '1' -> 0xFF575757.toInt()
                '0' -> 0xFF2A2A2A.toInt()
                'x' -> 0xFF3A3A3A.toInt()
                'f' -> 0xFF141414.toInt()
                else -> 0xFF1F1F1F.toInt()
            }
            val x = ox + lc * cell; val y = oy + band * bandH + labelH + row * cell
            r.set(x, y, x + cell - gap, y + cell - gap)
            c.drawRoundRect(r, radius, radius, p)
            if (i == todayIdx) c.drawRoundRect(r, radius, radius, ring)
        }
        p.color = 0xFF9E9E9E.toInt(); p.textSize = 9f * density
        val long = arrayOf("Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec")
        val m = Calendar.getInstance()
        var lastEnd = -1f; var lastBand = -1
        for (mi in 0..11) {
            m.set(year, mi, 1)
            val col = (firstDow + m.get(Calendar.DAY_OF_YEAR) - 1) / 7
            val band = col / wpb
            val label = if (cell * 4.3f >= p.measureText("Mar")) long[mi] else long[mi].substring(0, 1)
            val x = ox + (col % wpb) * cell
            if (band != lastBand) lastEnd = -1f
            if (x < lastEnd) continue
            c.drawText(label, x, oy + band * bandH + labelH - 3f * density, p)
            lastEnd = x + p.measureText(label) + 3f * density; lastBand = band
        }
        v.setImageViewBitmap(R.id.grid, bmp)
        return v
    }
}
