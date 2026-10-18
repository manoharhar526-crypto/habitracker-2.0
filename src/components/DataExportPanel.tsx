import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet, FileJson, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { loadCalendarNotes } from "@/lib/appStorage";
import {
  exportSelection, listDataMonths,
  type ExportFormat, type ExportPart,
} from "@/lib/exportUtils";
import type { Habit } from "@/types/habit";
import type { Task } from "@/types/task";

const PART_LABELS: Record<ExportPart, string> = {
  habits: "Habits & daily marks",
  tasks: "Goals & tasks",
  notes: "Calendar notes",
};

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const prettyMonth = (key: string) => {
  const [y, m] = key.split("-");
  const idx = Number(m) - 1;
  return MONTH_NAMES[idx] ? `${MONTH_NAMES[idx]} ${y}` : key;
};

interface DataExportPanelProps {
  habits: Habit[];
  tasks: Task[];
}

const TASK_TYPES = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "general", label: "General" },
];

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "rounded-full border px-2.5 py-1 text-xs transition-colors touch-manipulation",
      active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
    )}
  >
    {children}
  </button>
);

export const DataExportPanel = ({ habits, tasks }: DataExportPanelProps) => {
  const { user } = useAuth();
  const notes = useMemo(() => loadCalendarNotes(user?.id), [user?.id]);

  const [parts, setParts] = useState<ExportPart[]>(["habits", "tasks", "notes"]);
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [month, setMonth] = useState<string>("");
  const [habitNames, setHabitNames] = useState<string[]>([]);
  const [taskTypes, setTaskTypes] = useState<string[]>([]);
  const [taskStatus, setTaskStatus] = useState<"all" | "done" | "pending">("all");

  const months = useMemo(() => listDataMonths(habits, tasks, notes), [habits, tasks, notes]);
  const years = useMemo(() => Array.from(new Set(months.map(m => m.slice(0, 4)))), [months]);
  const allHabitNames = useMemo(
    () => Array.from(new Set(habits.map(h => h.name))).sort((a, b) => a.localeCompare(b)),
    [habits]
  );

  const togglePart = (part: ExportPart) =>
    setParts(prev => (prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part]));
  const toggleIn = (setter: React.Dispatch<React.SetStateAction<string[]>>, v: string) =>
    setter(prev => (prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]));

  const quick = (part: ExportPart) => run({ parts: [part], format, month: month || null });

  const run = (override?: { parts?: ExportPart[]; format?: ExportFormat; month?: string | null; all?: boolean }) => {
    const usedParts = override?.parts ?? parts;
    if (usedParts.length === 0) {
      toast.error("Pick at least one thing to export");
      return;
    }
    const files = exportSelection({
      parts: usedParts,
      format: override?.format ?? format,
      month: override?.month !== undefined ? override.month : (month || null),
      habitNames: override?.all ? [] : habitNames,
      taskTypes: override?.all ? [] : taskTypes,
      taskStatus: override?.all ? "all" : taskStatus,
      habits,
      tasks,
      notes,
    });
    toast.success(files > 1 ? `${files} files downloaded` : "Download started");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Download className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-medium">Export Data</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Download everything at once, or just the parts, habits, task types and period you need.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button
          className="col-span-2 gap-2"
          onClick={() => run({ parts: ["habits", "tasks", "notes"], format: "json", month: null, all: true })}
        >
          <PackageOpen className="w-4 h-4" />
          Protected Backup (.htb)
        </Button>
        <Button
          variant="outline"
          className="col-span-2 gap-2"
          onClick={() => run({ parts: ["habits", "tasks", "notes"], format: "csv", month: null, all: true })}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Everything as spreadsheets
        </Button>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
        <p className="text-xs font-medium text-muted-foreground">Or choose exactly what you want:</p>

        <div className="space-y-2">
          {(Object.keys(PART_LABELS) as ExportPart[]).map(part => {
            const active = parts.includes(part);
            return (
              <div key={part} className="flex gap-2">
                <button
                  type="button"
                  onClick={() => togglePart(part)}
                  className={cn(
                    "flex-1 flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-left transition-colors touch-manipulation",
                    active ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-muted"
                  )}
                >
                  <span className={cn(
                    "w-4 h-4 rounded-sm border flex items-center justify-center text-[10px] flex-shrink-0",
                    active ? "bg-primary border-primary text-primary-foreground" : "border-border"
                  )}>
                    {active ? "✓" : ""}
                  </span>
                  {PART_LABELS[part]}
                </button>
                <Button variant="ghost" size="icon" aria-label={`Export only ${PART_LABELS[part]}`} onClick={() => quick(part)}>
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Period</Label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={month}
            onChange={e => setMonth(e.target.value)}
          >
            <option value="">All time</option>
            {years.length > 0 && (
              <optgroup label="Whole year">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </optgroup>
            )}
            {months.length > 0 && (
              <optgroup label="Single month">
                {months.map(m => <option key={m} value={m}>{prettyMonth(m)}</option>)}
              </optgroup>
            )}
          </select>
        </div>

        {parts.includes("habits") && allHabitNames.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs">Habits {habitNames.length === 0 && <span className="text-muted-foreground">(all)</span>}</Label>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {allHabitNames.map(n => (
                <Chip key={n} active={habitNames.includes(n)} onClick={() => toggleIn(setHabitNames, n)}>{n}</Chip>
              ))}
            </div>
          </div>
        )}

        {parts.includes("tasks") && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Task types {taskTypes.length === 0 && <span className="text-muted-foreground">(all)</span>}</Label>
              <div className="flex flex-wrap gap-1.5">
                {TASK_TYPES.map(t => (
                  <Chip key={t.id} active={taskTypes.includes(t.id)} onClick={() => toggleIn(setTaskTypes, t.id)}>{t.label}</Chip>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Task status</Label>
              <div className="flex flex-wrap gap-1.5">
                {(["all", "done", "pending"] as const).map(s => (
                  <Chip key={s} active={taskStatus === s} onClick={() => setTaskStatus(s)}>
                    {s === "all" ? "All" : s === "done" ? "Completed" : "Not done"}
                  </Chip>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="space-y-1">
          <Label className="text-xs">Format</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={format === "csv" ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setFormat("csv")}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Spreadsheet
            </Button>
            <Button
              variant={format === "json" ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setFormat("json")}
            >
              <FileJson className="w-3.5 h-3.5" />
              Protected Backup (.htb)
            </Button>
          </div>
        </div>

        <Button variant="secondary" className="w-full gap-2" onClick={() => run()}>
          <Download className="w-4 h-4" />
          Download selection
        </Button>
      </div>
    </div>
  );
};
