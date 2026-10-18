import { useState, useMemo } from "react";
import { CalendarNote } from "@/types/calendarNote";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Plus, X, Bell, BellOff, Pencil, Check, Search } from "lucide-react";
import { generateId } from "@/lib/habitUtils";
import { toast } from "sonner";
import { useToday } from "@/hooks/useToday";

interface CalendarViewProps {
  notes: CalendarNote[];
  onAddNote: (note: CalendarNote) => void;
  onDeleteNote: (id: string) => void;
  onEditNote: (id: string, updated: Partial<CalendarNote>) => void;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export const CalendarView = ({ notes, onAddNote, onDeleteNote, onEditNote }: CalendarViewProps) => {
  const today = useToday();
  const [viewMonth, setViewMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newTime, setNewTime] = useState("09:00");
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editTime, setEditTime] = useState("");
  // "days" = normal month grid, "months" = pick a month, "years" = pick a year
  const [picker, setPicker] = useState<"days" | "months" | "years">("days");
  const [yearPageStart, setYearPageStart] = useState(() => today.getFullYear() - 6);

  const [query, setQuery] = useState("");
  const [moods, setMoods] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("calendar-moods") || "{}"); } catch { return {}; }
  });
  const setMood = (date: string, emoji: string) => {
    setMoods(prev => {
      const next = { ...prev };
      if (next[date] === emoji) delete next[date]; else next[date] = emoji;
      localStorage.setItem("calendar-moods", JSON.stringify(next));
      return next;
    });
  };
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return notes
      .filter(n => n.title.toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q) || n.date.includes(q) ||
        new Date(n.date + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }).toLowerCase().includes(q))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [query, notes]);
  const openDate = (date: string) => {
    const d = new Date(date + "T00:00:00");
    setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelectedDate(date);
    setPicker("days");
    setQuery("");
  };

  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();

  const toDateStr = (day: number) =>
    `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const notesByDate = useMemo(() => {
    const map: Record<string, CalendarNote[]> = {};
    notes.forEach(n => {
      if (!map[n.date]) map[n.date] = [];
      map[n.date].push(n);
    });
    return map;
  }, [notes]);

  const selectedNotes = selectedDate ? (notesByDate[selectedDate] || []) : [];

  const handleAddNote = () => {
    if (!newTitle.trim() || !selectedDate) return;
    const note: CalendarNote = {
      id: generateId(),
      date: selectedDate,
      title: newTitle.trim(),
      body: newBody.trim() || undefined,
      notifyAt: notifyEnabled ? newTime : undefined,
    };
    onAddNote(note);
    toast.success(`Note added for ${selectedDate}${notifyEnabled ? ` · Reminder at ${newTime}` : ""}`);
    setNewTitle("");
    setNewBody("");
    setNewTime("09:00");
    setNotifyEnabled(true);
    setShowForm(false);
  };

  const startEdit = (note: CalendarNote) => {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditBody(note.body || "");
    setEditTime(note.notifyAt || "09:00");
  };

  const commitEdit = () => {
    if (!editingId || !editTitle.trim()) return;
    onEditNote(editingId, { title: editTitle.trim(), body: editBody.trim() || undefined, notifyAt: editTime || undefined });
    setEditingId(null);
    toast.success("Note updated");
  };

  const prevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  const nextMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));

  const goPrev = () => {
    if (picker === "days") prevMonth();
    else if (picker === "months") setViewMonth(new Date(viewMonth.getFullYear() - 1, viewMonth.getMonth(), 1));
    else setYearPageStart(yearPageStart - 12);
  };
  const goNext = () => {
    if (picker === "days") nextMonth();
    else if (picker === "months") setViewMonth(new Date(viewMonth.getFullYear() + 1, viewMonth.getMonth(), 1));
    else setYearPageStart(yearPageStart + 12);
  };

  const headerLabel =
    picker === "days"
      ? `${MONTHS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`
      : picker === "months"
      ? `${viewMonth.getFullYear()}`
      : `${yearPageStart} – ${yearPageStart + 11}`;

  const onHeaderTap = () => {
    if (picker === "days") setPicker("months");
    else if (picker === "months") {
      setYearPageStart(viewMonth.getFullYear() - 6);
      setPicker("years");
    } else setPicker("days");
  };

  const jumpToToday = () => {
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(todayStr);
    setPicker("days");
  };

  // Which months / years already have notes (little dot markers)
  const noteMonths = useMemo(() => new Set(notes.map(n => n.date.slice(0, 7))), [notes]);
  const noteYears = useMemo(() => new Set(notes.map(n => n.date.slice(0, 4))), [notes]);

  // Calendar grid
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search notes by word or date (e.g. gym, 2026-09, September)" className="pl-9 h-9 text-sm" />
      </div>
      {query.trim() && (
        <Card className="p-3 border-border space-y-1">
          {searchResults.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No matching notes.</p>
          ) : searchResults.map(n => (
            <button key={n.id} onClick={() => openDate(n.date)} className="w-full text-left rounded-md p-2 hover:bg-muted transition-colors">
              <div className="text-xs text-muted-foreground">{new Date(n.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</div>
              <div className="text-sm font-medium">{n.title}</div>
              {n.body && <div className="text-xs text-muted-foreground truncate">{n.body}</div>}
            </button>
          ))}
        </Card>
      )}
      <Card className="p-4 border-border">
        {/* Month / year nav — tap the title to switch between day, month and year views */}
        <div className="flex items-center justify-between mb-1">
          <Button variant="ghost" size="icon" onClick={goPrev} aria-label="Previous"><ChevronLeft className="w-4 h-4" /></Button>
          <button
            onClick={onHeaderTap}
            className="font-semibold text-base px-3 py-1 rounded-md hover:bg-muted transition-colors"
            aria-label="Change month or year"
          >
            {headerLabel}
          </button>
          <Button variant="ghost" size="icon" onClick={goNext} aria-label="Next"><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="flex justify-center mb-3">
          <Button
            size="sm"
            className="h-7 px-4 text-xs font-semibold rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
            onClick={jumpToToday}
          >
            Today · {today.getDate()} {MONTHS[today.getMonth()].slice(0, 3)}
          </Button>
        </div>

        {picker === "days" && (
          <>
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map(d => (
                <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {cells.map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} />;
                const dateStr = toDateStr(day);
                const hasNotes = (notesByDate[dateStr]?.length ?? 0) > 0;
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                return (
                  <button
                    key={dateStr}
                    onClick={() => { setSelectedDate(dateStr); setShowForm(false); }}
                    aria-current={isToday ? "date" : undefined}
                    className={`
                      relative flex flex-col items-center justify-center rounded-lg p-1.5 min-h-[40px] text-sm transition-colors touch-manipulation
                      ${isSelected ? "bg-primary text-primary-foreground" : isToday ? "bg-primary/25 text-primary font-bold" : "hover:bg-muted"}
                      ${isToday ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : ""}
                    `}
                  >
                    {moods[dateStr] && <span className="absolute top-0 right-0.5 text-[10px] leading-none">{moods[dateStr]}</span>}
                    <span>{day}</span>
                    {hasNotes && (
                      <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isSelected ? "bg-primary-foreground" : "bg-primary"}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {picker === "months" && (
          <div className="grid grid-cols-3 gap-2">
            {MONTHS.map((m, i) => {
              const key = `${viewMonth.getFullYear()}-${String(i + 1).padStart(2, "0")}`;
              const isCurrent = i === viewMonth.getMonth();
              const isThisMonth = today.getFullYear() === viewMonth.getFullYear() && today.getMonth() === i;
              return (
                <button
                  key={m}
                  onClick={() => { setViewMonth(new Date(viewMonth.getFullYear(), i, 1)); setPicker("days"); }}
                  className={`flex flex-col items-center justify-center rounded-lg py-3 text-sm transition-colors
                    ${isCurrent ? "bg-primary text-primary-foreground" : isThisMonth ? "bg-primary/20 text-primary font-bold" : "hover:bg-muted"}`}
                >
                  <span>{m.slice(0, 3)}</span>
                  {noteMonths.has(key) && (
                    <span className={`w-1.5 h-1.5 rounded-full mt-1 ${isCurrent ? "bg-primary-foreground" : "bg-primary"}`} />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {picker === "years" && (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 12 }, (_, i) => yearPageStart + i).map(y => {
              const isCurrent = y === viewMonth.getFullYear();
              const isThisYear = y === today.getFullYear();
              return (
                <button
                  key={y}
                  onClick={() => { setViewMonth(new Date(y, viewMonth.getMonth(), 1)); setPicker("months"); }}
                  className={`flex flex-col items-center justify-center rounded-lg py-3 text-sm transition-colors
                    ${isCurrent ? "bg-primary text-primary-foreground" : isThisYear ? "bg-primary/20 text-primary font-bold" : "hover:bg-muted"}`}
                >
                  <span>{y}</span>
                  {noteYears.has(String(y)) && (
                    <span className={`w-1.5 h-1.5 rounded-full mt-1 ${isCurrent ? "bg-primary-foreground" : "bg-primary"}`} />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Selected date panel */}
      {selectedDate && (
        <Card className="p-4 border-border space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </h3>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowForm(!showForm)}>
              <Plus className="w-3 h-3" /> Add Note
            </Button>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-muted-foreground mr-1">Mood:</span>
            {["😄","🙂","😐","😔","😡","😴","💪","🎉"].map(e => (
              <button key={e} onClick={() => setMood(selectedDate, e)} aria-label={`Mood ${e}`}
                className={`text-lg rounded-md px-1 transition-colors ${moods[selectedDate] === e ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-muted"}`}>{e}</button>
            ))}
          </div>

          {/* Add form */}
          {showForm && (
            <div className="space-y-2 border border-border rounded-lg p-3">
              <Input
                placeholder="Title (e.g. Go to gym, Take medicine...)"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="h-8 text-sm"
                autoFocus
                onKeyDown={e => { if (e.key === "Enter") handleAddNote(); if (e.key === "Escape") setShowForm(false); }}
              />
              <Textarea
                placeholder="Notes (optional)..."
                value={newBody}
                onChange={e => setNewBody(e.target.value)}
                className="text-sm resize-none min-h-[60px]"
              />
              <div className="flex items-center gap-2">
                <Button
                  variant={notifyEnabled ? "default" : "outline"}
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setNotifyEnabled(!notifyEnabled)}
                >
                  {notifyEnabled ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                  Remind me
                </Button>
                {notifyEnabled && (
                  <Input
                    type="time"
                    value={newTime}
                    onChange={e => setNewTime(e.target.value)}
                    className="h-7 text-xs w-28"
                  />
                )}
                <Button size="sm" className="h-7 text-xs ml-auto" onClick={handleAddNote}>Save</Button>
              </div>
            </div>
          )}

          {/* Notes list */}
          {selectedNotes.length === 0 && !showForm && (
            <p className="text-xs text-muted-foreground italic">No notes for this day. Tap "Add Note" to create one.</p>
          )}

          <div className="space-y-2">
            {selectedNotes.map(note => (
              <div key={note.id} className="border border-border rounded-lg p-3 space-y-1">
                {editingId === note.id ? (
                  <div className="space-y-2">
                    <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="h-8 text-sm" autoFocus />
                    <Textarea value={editBody} onChange={e => setEditBody(e.target.value)} className="text-sm resize-none min-h-[50px]" />
                    <div className="flex items-center gap-2">
                      <Bell className="w-3 h-3 text-muted-foreground" />
                      <Input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className="h-7 text-xs w-28" />
                      <Button size="sm" className="h-7 text-xs gap-1 ml-auto" onClick={commitEdit}><Check className="w-3 h-3" />Save</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm">{note.title}</span>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEdit(note)} aria-label="Edit note"><Pencil className="w-3 h-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { onDeleteNote(note.id); toast.success("Note deleted"); }} aria-label="Delete note"><X className="w-3 h-3" /></Button>
                      </div>
                    </div>
                    {note.body && <p className="text-xs text-muted-foreground">{note.body}</p>}
                    {note.notifyAt && (
                      <div className="flex items-center gap-1 text-xs text-primary">
                        <Bell className="w-3 h-3" /> Reminder at {note.notifyAt}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
