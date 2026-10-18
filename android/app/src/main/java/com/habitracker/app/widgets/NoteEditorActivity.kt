package com.habitracker.app.widgets

import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import com.habitracker.app.R
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Small dialog-style screen opened by the Calendar widget when a day is tapped.
 * Lets the user write / edit / delete that day's note without opening the app.
 *
 * Writes are queued into `pending_notes` (drained by the web app on next launch)
 * and applied optimistically to `calendar_notes_map` + `calendar_notes` so the
 * widget reflects the change immediately.
 */
class NoteEditorActivity : Activity() {
    private var date: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_note_editor)

        date = intent.getStringExtra(EXTRA_DATE) ?: WidgetData.todayStr()

        val titleField = findViewById<EditText>(R.id.note_title)
        val bodyField = findViewById<EditText>(R.id.note_body)
        findViewById<TextView>(R.id.note_date).text = prettyDate(date)

        val existing = noteFor(date)
        if (existing != null) {
            titleField.setText(existing.optString("title"))
            bodyField.setText(existing.optString("body"))
        }

        findViewById<Button>(R.id.btn_save).setOnClickListener {
            val t = titleField.text.toString().trim()
            val b = bodyField.text.toString().trim()
            if (t.isEmpty() && b.isEmpty()) {
                Toast.makeText(this, "Write something first", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            queue(t, b, false)
            applyLocally(t, b, false)
            done("Note saved")
        }

        findViewById<Button>(R.id.btn_delete).setOnClickListener {
            queue("", "", true)
            applyLocally("", "", true)
            done("Note deleted")
        }

        findViewById<Button>(R.id.btn_cancel).setOnClickListener { finish() }
    }

    private fun done(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        WidgetData.refreshAll(this)
        finish()
    }

    private fun prettyDate(d: String): String = try {
        val parsed: Date = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(d)!!
        SimpleDateFormat("EEEE, d MMMM yyyy", Locale.US).format(parsed)
    } catch (_: Exception) { d }

    private fun noteMap(): JSONObject {
        val raw = WidgetData.getString(this, "calendar_notes_map", "{}")
        return try { JSONObject(raw) } catch (_: Exception) { JSONObject() }
    }

    private fun noteFor(d: String): JSONObject? = noteMap().optJSONObject(d)

    /** Queue the change for the web app to persist. */
    private fun queue(title: String, body: String, deleted: Boolean) {
        val raw = WidgetData.getString(this, KEY_PENDING_NOTES, "[]")
        val arr = try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
        arr.put(JSONObject().apply {
            put("date", date)
            put("title", title)
            put("body", body)
            put("deleted", deleted)
            put("ts", System.currentTimeMillis())
        })
        WidgetData.putString(this, KEY_PENDING_NOTES, arr.toString())
    }

    /** Optimistic cache update so the widget repaints correctly right away. */
    private fun applyLocally(title: String, body: String, deleted: Boolean) {
        val map = noteMap()
        if (deleted) map.remove(date) else map.put(
            date,
            JSONObject().apply { put("title", title); put("body", body) }
        )
        WidgetData.putString(this, "calendar_notes_map", map.toString())

        val dates = WidgetData.getJsonArray(this, "calendar_notes")
        val out = JSONArray()
        for (i in 0 until dates.length()) {
            val v = dates.optString(i)
            if (v != date) out.put(v)
        }
        if (!deleted) out.put(date)
        WidgetData.putString(this, "calendar_notes", out.toString())
    }

    companion object {
        const val EXTRA_DATE = "note_date"
        const val KEY_PENDING_NOTES = "pending_notes"
    }
}
