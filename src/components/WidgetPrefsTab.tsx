import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import {
  WIDGET_PREFS_KEY,
  WIDGET_IDS,
  WIDGET_LABELS,
  WIDGET_SHOWS,
  readWidgetPrefs,
  writeWidgetPrefs,
  type WidgetId,
  type WidgetPrefs,
} from "@/lib/widgetPrefs";
import type { Habit } from "@/types/habit";
import type { Task } from "@/types/task";

interface WidgetPrefsTabProps {
  habits: Habit[];
  tasks: Task[];
}

const EMPTY: WidgetPrefs = { habits: [], tasks: [], perWidget: {} };

/**
 * Lets the user choose which habits and tasks appear on the home-screen
 * widgets — either everywhere ("All widgets") or on one widget at a time.
 */
export const WidgetPrefsTab = ({ habits, tasks }: WidgetPrefsTabProps) => {
  const [prefs, setPrefs] = useState<WidgetPrefs>(EMPTY);
  const [scope, setScope] = useState<"all" | WidgetId>("all");

  useEffect(() => {
    setPrefs(readWidgetPrefs());
  }, []);

  const persist = (next: WidgetPrefs) => {
    setPrefs(next);
    writeWidgetPrefs(next);
    window.dispatchEvent(new CustomEvent(WIDGET_PREFS_KEY));
  };

  const current =
    scope === "all" ? { habits: prefs.habits, tasks: prefs.tasks } : prefs.perWidget[scope] ?? { habits: [], tasks: [] };

  const toggle = (kind: "habits" | "tasks", id: string) => {
    const list = current[kind];
    const nextList = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
    if (scope === "all") {
      persist({ ...prefs, [kind]: nextList });
    } else {
      persist({
        ...prefs,
        perWidget: { ...prefs.perWidget, [scope]: { ...current, [kind]: nextList } },
      });
    }
  };

  const shows = scope === "all" ? { habits: true, tasks: true } : WIDGET_SHOWS[scope];
  const hiddenGlobally = (kind: "habits" | "tasks", id: string) =>
    scope !== "all" && prefs[kind].includes(id);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <LayoutGrid className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-medium">Home screen widgets</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Turn something off to hide it from your widgets. It stays in the app.
      </p>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Applies to</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={scope === "all" ? "default" : "outline"}
            onClick={() => setScope("all")}
          >
            All widgets
          </Button>
          {WIDGET_IDS.map(id => (
            <Button
              key={id}
              size="sm"
              variant={scope === id ? "default" : "outline"}
              onClick={() => setScope(id)}
            >
              {WIDGET_LABELS[id]}
            </Button>
          ))}
        </div>
      </div>

      {scope !== "all" && !shows.habits && !shows.tasks && (
        <p className="text-sm text-muted-foreground">This widget doesn't list habits or tasks.</p>
      )}

      {shows.habits && (
        <div className="space-y-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Habits</Label>
          {habits.length === 0 && <p className="text-sm text-muted-foreground">No habits this month.</p>}
          {habits.map(h => (
            <div key={h.id} className="flex items-center justify-between gap-3">
              <span className="text-sm truncate">
                {h.name}
                {hiddenGlobally("habits", h.id) && (
                  <span className="ml-2 text-xs text-muted-foreground">hidden everywhere</span>
                )}
              </span>
              <Switch
                checked={!current.habits.includes(h.id) && !hiddenGlobally("habits", h.id)}
                disabled={hiddenGlobally("habits", h.id)}
                onCheckedChange={() => toggle("habits", h.id)}
              />
            </div>
          ))}
        </div>
      )}

      {shows.tasks && (
        <div className="space-y-3">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tasks</Label>
          {tasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks this month.</p>}
          {tasks.slice(0, 40).map(t => (
            <div key={t.id} className="flex items-center justify-between gap-3">
              <span className="text-sm truncate">
                {t.title}
                {hiddenGlobally("tasks", t.id) && (
                  <span className="ml-2 text-xs text-muted-foreground">hidden everywhere</span>
                )}
              </span>
              <Switch
                checked={!current.tasks.includes(t.id) && !hiddenGlobally("tasks", t.id)}
                disabled={hiddenGlobally("tasks", t.id)}
                onCheckedChange={() => toggle("tasks", t.id)}
              />
            </div>
          ))}
        </div>
      )}

      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          persist(EMPTY);
          toast.success("All items shown on widgets again");
        }}
      >
        Show everything
      </Button>
    </div>
  );
};
