import type { Habit } from "@/types/habit";
import type { Task } from "@/types/task";
import { normalizeHabitDays } from "@/lib/habitUtils";
import { saveFile } from "@/lib/saveFile";
import { toast } from "sonner";
import { sealBackup } from "@/lib/backupFile";

const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Downloads run one after another (with a short gap) so browsers don't block extra files.
let queue: Promise<void> = Promise.resolve();
const download = (content: string, filename: string, mime: string) => {
  // BOM so Excel reads names in any language correctly.
  const blob = new Blob(["\uFEFF" + content], { type: `${mime};charset=utf-8` });
  queue = queue
    .then(() => saveFile(blob, filename))
    .catch(() => { toast.error(`Couldn't save ${filename}`); })
    .then(() => new Promise<void>(r => setTimeout(r, 600)));
};

const csvCell = (value: string | number) => {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/** Monthly calendar grid: one block per month, rows = habits, columns = days 1..N + totals. */
export const buildHabitsCsv = (habits: Habit[]): string => {
  const byMonth = new Map<string, Habit[]>();
  for (const raw of habits) {
    const h = normalizeHabitDays(raw);
    if (!h.month) continue;
    byMonth.set(h.month, [...(byMonth.get(h.month) ?? []), h]);
  }
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const rows: string[] = [];
  for (const month of [...byMonth.keys()].sort()) {
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const elapsed = month < todayKey ? daysInMonth : month === todayKey ? today.getDate() : 0;
    if (rows.length) rows.push("");
    rows.push(csvCell(`${MONTH_NAMES[m - 1]} ${y}`));
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    rows.push(["Habit", ...days.map(String), "Done", "Skipped", "Completion %"].map(csvCell).join(","));
    for (const h of byMonth.get(month)!) {
      const done = new Set(h.completedDays ?? []);
      const skip = new Set(h.skippedDays ?? []);
      const cells = days.map(d => {
        const key = `${month}-${String(d).padStart(2, "0")}`;
        return done.has(key) ? "✓" : skip.has(key) ? "N/A" : d <= elapsed ? "✗" : "";
      });
      const doneCount = cells.filter(c => c === "✓").length;
      const skipCount = cells.filter(c => c === "N/A").length;
      const due = Math.max(0, elapsed - [...skip].filter(k => Number(k.slice(8, 10)) <= elapsed).length);
      const pct = due ? `${Math.round((Math.min(doneCount, due) / due) * 100)}%` : "-";
      rows.push([h.name, ...cells, doneCount, skipCount, pct].map(csvCell).join(","));
    }
  }
  if (!rows.length) rows.push("No habits to export");
  rows.push("", csvCell("✓ = done · N/A = skipped · ✗ = not done · This spreadsheet is view-only; restore data with a Protected Backup (.htb)."));
  return rows.join("\n");
};

export const buildTasksCsv = (tasks: Task[]): string => {
  const rows: string[] = ["month,type,title,completed"];
  for (const task of tasks) {
    rows.push(
      [task.month ?? "", task.type ?? "", task.title, task.completed ? "yes" : "no"]
        .map(csvCell)
        .join(","),
    );
  }
  return rows.join("\n");
};

export const exportHabitsCsv = (habits: Habit[]) =>
  download(buildHabitsCsv(habits), `habits-${stamp()}.csv`, "text/csv");

export const exportTasksCsv = (tasks: Task[]) =>
  download(buildTasksCsv(tasks), `goals-${stamp()}.csv`, "text/csv");

export const exportEverythingJson = (habits: Habit[], tasks: Task[]) => {
  const name = `habitracker-${stamp()}.htb`;
  void sealBackup({ exportedAt: new Date().toISOString(), habits: habits.map(normalizeHabitDays), tasks })
    .then(blob => saveFile(blob, name))
    .catch(() => toast.error(`Couldn't save ${name}`));
};

// ── Notes ─────────────────────────────────────────────────────────────────────
export type NoteLike = { date: string; title: string; body?: string; notifyAt?: string };

export const buildNotesCsv = (notes: NoteLike[]): string => {
  const rows: string[] = ["date,title,body,reminder"];
  for (const n of [...notes].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([n.date, n.title, n.body ?? "", n.notifyAt ?? ""].map(csvCell).join(","));
  }
  return rows.join("\n");
};

// ── Selective export ──────────────────────────────────────────────────────────
export type ExportPart = "habits" | "tasks" | "notes";
export type ExportFormat = "csv" | "json";

const inMonth = (value: string | undefined, month: string | null) =>
  !month || (value ?? "").startsWith(month);

export type ExportSelection = {
  parts: ExportPart[];
  format: ExportFormat;
  /** "YYYY-MM" for one month, "YYYY" for a whole year, or null for everything. */
  month?: string | null;
  /** Limit to these habit names (empty/undefined = all). */
  habitNames?: string[];
  /** Limit to these task types (empty/undefined = all). */
  taskTypes?: string[];
  /** Only include completed / pending tasks. */
  taskStatus?: "all" | "done" | "pending";
  habits: Habit[];
  tasks: Task[];
  notes: NoteLike[];
};

/** Filters each dataset by period and filters, then downloads one file per chosen part (CSV) or a single JSON. */
export const exportSelection = ({
  parts, format, month = null, habitNames, taskTypes, taskStatus = "all", habits, tasks, notes,
}: ExportSelection): number => {
  const pickedHabits = habits
    .filter(h => inMonth(h.month, month))
    .filter(h => !habitNames?.length || habitNames.includes(h.name))
    .map(normalizeHabitDays);
  const pickedTasks = tasks
    .filter(t => inMonth(t.month ?? month ?? undefined, month))
    .filter(t => !taskTypes?.length || taskTypes.includes(t.type ?? "general"))
    .filter(t => taskStatus === "all" || (taskStatus === "done" ? t.completed : !t.completed));
  const pickedNotes = notes.filter(n => inMonth(n.date, month));

  const suffix = month ? `${month}` : "all";
  let files = 0;

  if (format === "json") {
    const payload: Record<string, unknown> = { exportedAt: new Date().toISOString(), scope: suffix };
    if (parts.includes("habits")) payload.habits = pickedHabits;
    if (parts.includes("tasks")) payload.tasks = pickedTasks;
    if (parts.includes("notes")) payload.calendarNotes = pickedNotes;
    const name = `habitracker-${suffix}-${stamp()}.htb`;
    void sealBackup(payload)
      .then(blob => saveFile(blob, name))
      .catch(() => toast.error(`Couldn't save ${name}`));
    return 1;
  }

  if (parts.includes("habits")) {
    download(buildHabitsCsv(pickedHabits), `habits-${suffix}-${stamp()}.csv`, "text/csv");
    files++;
  }
  if (parts.includes("tasks")) {
    download(buildTasksCsv(pickedTasks), `goals-${suffix}-${stamp()}.csv`, "text/csv");
    files++;
  }
  if (parts.includes("notes")) {
    download(buildNotesCsv(pickedNotes), `notes-${suffix}-${stamp()}.csv`, "text/csv");
    files++;
  }
  return files;
};

/** Months that contain any data, newest first — used to offer a month picker. */
export const listDataMonths = (habits: Habit[], tasks: Task[], notes: NoteLike[]): string[] => {
  const set = new Set<string>();
  habits.forEach(h => h.month && set.add(h.month));
  tasks.forEach(t => t.month && set.add(t.month));
  notes.forEach(n => n.date && set.add(n.date.slice(0, 7)));
  return Array.from(set).sort((a, b) => b.localeCompare(a));
};

