import { Card } from "@/components/ui/card";
import { Sparkles, CalendarCheck, Bell } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyHabitsStateProps {
  /** The "Add Habit" button, so the first action sits right here. */
  action?: ReactNode;
}

const tips = [
  { icon: CalendarCheck, text: "Tick a day in the grid to mark it done" },
  { icon: Sparkles, text: "Mark holidays as N/A so they don't hurt your rate" },
  { icon: Bell, text: "Turn on reminders in Settings to stay on track" },
];

export const EmptyHabitsState = ({ action }: EmptyHabitsStateProps) => (
  <Card className="border-border border-dashed p-6 sm:p-10 text-center animate-fade-in">
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
      <Sparkles className="h-5 w-5 text-foreground" />
    </div>
    <h2 className="text-lg sm:text-xl font-semibold">Create your first habit</h2>
    <p className="mt-1.5 text-sm text-muted-foreground max-w-sm mx-auto">
      Pick something small you want to do most days — reading, workout, water.
      You can add more any time.
    </p>

    {action && <div className="mt-5 flex justify-center">{action}</div>}

    <ul className="mt-6 space-y-2 text-left max-w-xs mx-auto">
      {tips.map(tip => (
        <li key={tip.text} className="flex items-start gap-2 text-xs text-muted-foreground">
          <tip.icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>{tip.text}</span>
        </li>
      ))}
    </ul>
  </Card>
);
