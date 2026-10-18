import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, PlusCircle, Sparkles } from "lucide-react";

interface CopyHabitsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previousMonthName: string;
  currentMonthName: string;
  previousHabitNames: string[];
  incompleteTasks: { id: string; title: string }[];
  onCopy: (copyTasks: boolean) => void;
  onSkip: () => void;
  /** User wants different habits this month — open the add-habit flow. */
  onNewHabits?: () => void;
}

export const CopyHabitsDialog = ({
  open,
  onOpenChange,
  previousMonthName,
  currentMonthName,
  previousHabitNames,
  incompleteTasks,
  onCopy,
  onSkip,
  onNewHabits,
}: CopyHabitsDialogProps) => {
  const hasTasks = incompleteTasks.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New month: {currentMonthName}</DialogTitle>
          <DialogDescription>
            You had {previousHabitNames.length} habit{previousHabitNames.length !== 1 ? "s" : ""} in {previousMonthName}. Copy the same habits to this month? Your home screen widgets will show them right away.
          </DialogDescription>
        </DialogHeader>

        {previousHabitNames.length > 0 && (
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1 max-h-48 overflow-y-auto">
            <p className="text-xs font-medium text-muted-foreground mb-2">Habits to copy:</p>
            {previousHabitNames.map((name, i) => (
              <div key={i} className="text-sm text-foreground">• {name}</div>
            ))}
          </div>
        )}

        {hasTasks && (
          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {incompleteTasks.length} incomplete task{incompleteTasks.length !== 1 ? "s" : ""} from {previousMonthName}:
            </p>
            {incompleteTasks.slice(0, 4).map((t, i) => (
              <div key={i} className="text-sm text-foreground">• {t.title}</div>
            ))}
            {incompleteTasks.length > 4 && (
              <div className="text-xs text-muted-foreground">+{incompleteTasks.length - 4} more</div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={() => onCopy(true)} className="gap-2">
            <Copy className="w-4 h-4" />
            Yes, copy same habits{hasTasks ? " + tasks" : ""}
          </Button>
          {hasTasks && (
            <Button variant="outline" onClick={() => onCopy(false)} className="gap-2 text-sm">
              <Copy className="w-4 h-4" />
              Copy habits only
            </Button>
          )}
          {onNewHabits && (
            <Button variant="outline" onClick={onNewHabits} className="gap-2">
              <Sparkles className="w-4 h-4" />
              I have new habits
            </Button>
          )}
          <Button variant="ghost" onClick={onSkip} className="gap-2">
            <PlusCircle className="w-4 h-4" />
            Start fresh
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
