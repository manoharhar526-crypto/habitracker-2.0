package com.habitracker.app.widgets

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.habitracker.app.R
import org.json.JSONArray
import java.util.Calendar

/**
 * Rows for the Weekly Tracking widget: one habit per row, seven large day
 * cells (Sun→Sat) for the week currently selected in the widget header.
 *
 * Cell states: completed (filled), skipped (amber), today (ring),
 * missed (dim), future (very dim & not tappable).
 * Tapping any day up to today toggles completion instantly.
 */
class MonthGridRemoteViewsService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        MonthGridFactory(applicationContext)
}

private class MonthGridFactory(private val ctx: Context) : RemoteViewsService.RemoteViewsFactory {

    private val cellIds = intArrayOf(
        R.id.cell_1, R.id.cell_2, R.id.cell_3, R.id.cell_4, R.id.cell_5, R.id.cell_6, R.id.cell_7
    )

    private var habits: JSONArray = JSONArray()
    private var dates: List<Triple<String, Int, Boolean>> = emptyList() // date, dayNum, isPast/today
    private var todayStr: String = ""
    private var yesterdayStr: String = ""

    override fun onCreate() {}

    override fun onDataSetChanged() {
        habits = WidgetData.getJsonArray(ctx, "month_grid")
        todayStr = WidgetData.todayStr()
        yesterdayStr = WidgetData.dateStr(Calendar.getInstance().apply { add(Calendar.DAY_OF_MONTH, -1) })
        val start = WidgetData.weekStart(ctx)
        val out = mutableListOf<Triple<String, Int, Boolean>>()
        for (i in 0 until 7) {
            val c = start.clone() as Calendar
            c.add(Calendar.DAY_OF_MONTH, i)
            val ds = WidgetData.dateStr(c)
            out.add(Triple(ds, c.get(Calendar.DAY_OF_MONTH), ds <= todayStr))
        }
        dates = out
    }

    override fun onDestroy() {}

    override fun getCount(): Int = habits.length()

    override fun getViewAt(position: Int): RemoteViews {
        val v = RemoteViews(ctx.packageName, R.layout.widget_month_grid_row)
        val o = habits.optJSONObject(position) ?: return v
        val habitId = o.optString("id")
        v.setTextViewText(R.id.habit_name, o.optString("name"))

        val done = HashSet<Int>()
        o.optJSONArray("days")?.let { for (i in 0 until it.length()) done.add(it.optInt(i)) }
        val skipped = HashSet<Int>()
        o.optJSONArray("skipped")?.let { for (i in 0 until it.length()) skipped.add(it.optInt(i)) }

        val currentMonth = todayStr.substring(0, 7)

        val prev = o.optJSONObject("prev")
        val hist = o.optJSONObject("hist")

        for (i in cellIds.indices) {
            val (date, dayNum, _) = dates[i]
            val id = cellIds[i]
            val inMonth = date.startsWith(currentMonth)
            // Yesterday in the previous month (1st of the month): use the exported "prev" state.
            val usePrev = !inMonth && date == yesterdayStr
            val h = if (inMonth) "" else (hist?.optString(date, "") ?: "")
            val isDone = if (inMonth) done.contains(dayNum) else h == "d"
            val isSkip = !isDone && (if (inMonth) skipped.contains(dayNum) else h == "s")
            val isToday = date == todayStr
            // Only today and yesterday can be ticked; skipped days must be un-skipped first.
            val inWindow = date == todayStr || date == yesterdayStr
            val tappable = inWindow && !isSkip && (inMonth || usePrev)
            val isFuture = date > todayStr

            v.setTextViewText(id, if (isDone) "✓" else if (isSkip) "⊘" else dayNum.toString())

            val bg = when {
                isDone -> R.drawable.widget_cell_done
                isSkip -> R.drawable.widget_cell_skip
                isToday -> R.drawable.widget_cell_today
                isFuture || !inWindow -> R.drawable.widget_cell_future
                else -> R.drawable.widget_cell
            }
            v.setInt(id, "setBackgroundResource", bg)
            v.setTextColor(
                id,
                when {
                    isDone -> 0xFF0B0D10.toInt()
                    isSkip -> 0xFFF97316.toInt()
                    isFuture || !inWindow -> 0xFF4b5058.toInt()
                    else -> 0xFFE7E9EE.toInt()
                }
            )

            val fill = Intent().apply {
                putExtra(HabitToggleReceiver.EXTRA_OP,
                    // Always send a toggle; the receiver re-checks today/yesterday at tap time,
                    // so a widget left untouched overnight still ticks on the first touch.
                    HabitToggleReceiver.OP_TOGGLE)
                putExtra(HabitToggleReceiver.EXTRA_HABIT_ID, habitId)
                putExtra(HabitToggleReceiver.EXTRA_DATE, date)
                putExtra(HabitToggleReceiver.EXTRA_DAY, if (usePrev) 0 else dayNum)
                putExtra(HabitToggleReceiver.EXTRA_TOGGLEABLE, tappable)
                // Marks the cell that was "today" when drawn, so a stale widget
                // left for days still ticks the real today on the first tap.
                putExtra(HabitToggleReceiver.EXTRA_IS_TODAY, isToday)
            }
            v.setOnClickFillInIntent(id, fill)
        }
        return v
    }

    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 1
    override fun getItemId(position: Int): Long = position.toLong()
    override fun hasStableIds(): Boolean = true
}
