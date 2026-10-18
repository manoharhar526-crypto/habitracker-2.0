/**
 * YearCard.tsx — a full-year, GitHub-contribution-style grid of every habit,
 * exportable as a shareable image.
 *
 * Honesty rules baked in:
 *  • A day with no habits at all is blank, not a miss and not a win.
 *  • Rest days, N/A days and frozen days are drawn as "excused", never as done.
 *  • The headline percentage uses the same honest denominator as the app.
 */
import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import type { Habit } from "@/types/habit";
import { isExcusedDay, normalizeHabitDays, toDateStr } from "@/lib/habitUtils";

interface YearCardProps {
  habits: Habit[];
  frozenDates?: string[];
  username?: string;
}

type DayCell = {
  date: string;
  /** -1 = nothing tracked, 0 = excused, otherwise 0..1 share completed. */
  ratio: number;
  tracked: boolean;
  excused: boolean;
  done: number;
  total: number;
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const levelClass = (c: DayCell): string => {
  if (!c.tracked) return "bg-muted/30";
  if (c.excused) return "bg-muted";
  if (c.ratio <= 0) return "bg-muted/60";
  if (c.ratio < 0.34) return "bg-foreground/25";
  if (c.ratio < 0.67) return "bg-foreground/45";
  if (c.ratio < 1) return "bg-foreground/70";
  return "bg-foreground";
};

export const YearCard = ({ habits, frozenDates = [], username }: YearCardProps) => {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const gridRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const { cells, stats } = useMemo(() => {
    const clean = habits.map(normalizeHabitDays);
    const byMonth = new Map<string, Habit[]>();
    for (const h of clean) {
      const list = byMonth.get(h.month) ?? [];
      list.push(h);
      byMonth.set(h.month, list);
    }

    const out: DayCell[] = [];
    let doneTotal = 0;
    let expectedTotal = 0;
    let perfectDays = 0;
    let trackedDays = 0;

    const cursor = new Date(year, 0, 1, 12);
    const endOfYear = new Date(year, 11, 31, 12);
    while (cursor <= endOfYear) {
      const date = toDateStr(cursor);
      const monthHabits = byMonth.get(date.substring(0, 7)) ?? [];
      let done = 0;
      let expected = 0;
      for (const h of monthHabits) {
        if (h.completedDays.includes(date)) { done++; expected++; continue; }
        if (isExcusedDay(h, date, frozenDates)) continue;
        expected++;
      }
      const tracked = monthHabits.length > 0;
      const excused = tracked && expected === 0 && done === 0;
      const ratio = expected > 0 ? done / expected : done > 0 ? 1 : 0;

      out.push({ date, ratio, tracked, excused, done, total: expected });
      doneTotal += done;
      expectedTotal += expected;
      if (tracked) trackedDays++;
      if (expected > 0 && done === expected) perfectDays++;
      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      cells: out,
      stats: {
        completions: doneTotal,
        rate: expectedTotal > 0 ? Math.round((doneTotal / expectedTotal) * 100) : 0,
        perfectDays,
        trackedDays,
      },
    };
  }, [habits, frozenDates, year]);

  // Lay the year out in GitHub style: columns are weeks, rows are weekdays.
  const weeks = useMemo(() => {
    const cols: (DayCell | null)[][] = [];
    let col: (DayCell | null)[] = [];
    const firstDow = new Date(year, 0, 1).getDay();
    for (let i = 0; i < firstDow; i++) col.push(null);
    for (const cell of cells) {
      col.push(cell);
      if (col.length === 7) { cols.push(col); col = []; }
    }
    if (col.length) {
      while (col.length < 7) col.push(null);
      cols.push(col);
    }
    return cols;
  }, [cells, year]);

  const monthMarkers = useMemo(() => {
    const marks: { label: string; col: number }[] = [];
    weeks.forEach((week, i) => {
      for (const cell of week) {
        if (!cell) continue;
        const [, m, d] = cell.date.split("-").map(Number);
        if (d <= 7 && !marks.some(x => x.label === MONTH_LABELS[m - 1])) {
          marks.push({ label: MONTH_LABELS[m - 1], col: i });
        }
        break;
      }
    });
    return marks;
  }, [weeks]);

  /**
   * Paints the same grid onto a canvas, reading the real rendered colours out
   * of the DOM so the exported image always matches the theme on screen.
   */
  const renderCanvas = (): HTMLCanvasElement | null => {
    const root = gridRef.current;
    if (!root) return null;

    const css = getComputedStyle(root);
    const surface = css.backgroundColor;
    const textColor = css.color;

    const SIZE = 11;
    const GAP = 3;
    const PAD = 36;
    const HEADER = 96;
    const FOOTER = 44;
    const gridW = weeks.length * (SIZE + GAP) - GAP;
    const width = gridW + PAD * 2;
    const height = HEADER + 7 * (SIZE + GAP) - GAP + FOOTER + PAD;

    const scale = Math.min(3, window.devicePixelRatio || 2);
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.scale(scale, scale);

    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = textColor;
    ctx.font = "600 22px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(`${year} in habits`, PAD, 42);

    ctx.globalAlpha = 0.6;
    ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(
      `${stats.completions} completions · ${stats.rate}% · ${stats.perfectDays} perfect days`,
      PAD,
      64,
    );
    ctx.globalAlpha = 1;

    // Colours are read back from the live cells so themes stay in sync.
    const colorFor = (cell: DayCell): string => {
      const el = root.querySelector<HTMLElement>(`[data-date="${cell.date}"]`);
      return el ? getComputedStyle(el).backgroundColor : surface;
    };

    weeks.forEach((week, x) => {
      week.forEach((cell, y) => {
        if (!cell) return;
        ctx.fillStyle = colorFor(cell);
        const px = PAD + x * (SIZE + GAP);
        const py = HEADER + y * (SIZE + GAP);
        ctx.beginPath();
        ctx.roundRect(px, py, SIZE, SIZE, 2.5);
        ctx.fill();
      });
    });

    ctx.fillStyle = textColor;
    ctx.globalAlpha = 0.55;
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    monthMarkers.forEach(m => {
      ctx.fillText(m.label, PAD + m.col * (SIZE + GAP), HEADER - 8);
    });
    const footerY = HEADER + 7 * (SIZE + GAP) + 22;
    ctx.fillText(username ? `${username} · Habitracker` : "Habitracker", PAD, footerY);
    ctx.globalAlpha = 1;

    return canvas;
  };

  const withCanvas = async (fn: (blob: Blob) => Promise<void> | void) => {
    setBusy(true);
    try {
      const canvas = renderCanvas();
      if (!canvas) throw new Error("no canvas");
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("no blob");
      await fn(blob);
    } catch {
      toast.error("Could not create the image");
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = () =>
    withCanvas(async blob => {
      const { saveFile } = await import("@/lib/saveFile");
      await saveFile(blob, `habits-${year}.png`);
      toast.success("Saved your year card");
    });

  const handleShare = () =>
    withCanvas(async blob => {
      const file = new File([blob], `habits-${year}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: `${year} in habits` });
        return;
      }
      handleDownload();
    });

  const currentYear = new Date().getFullYear();

  return (
    <Card className="border-border overflow-hidden">
      <div className="p-3 sm:p-4 border-b border-border flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-sm sm:text-base">Year Card</h2>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {stats.completions} completions · {stats.rate}% · {stats.perfectDays} perfect days
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setYear(y => y - 1)} aria-label="Previous year">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium w-12 text-center">{year}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setYear(y => Math.min(currentYear, y + 1))}
            disabled={year >= currentYear}
            aria-label="Next year"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div ref={gridRef} className="bg-card text-foreground p-3 sm:p-4 overflow-x-auto">
        <div className="inline-block min-w-max">
          <div className="flex gap-[3px] mb-1 ml-0">
            {weeks.map((_, i) => {
              const mark = monthMarkers.find(m => m.col === i);
              return (
                <span key={i} className="w-[11px] text-[9px] text-muted-foreground whitespace-nowrap">
                  {mark ? mark.label : ""}
                </span>
              );
            })}
          </div>
          <div className="flex gap-[3px]">
            {weeks.map((week, x) => (
              <div key={x} className="flex flex-col gap-[3px]">
                {week.map((cell, y) =>
                  cell ? (
                    <span
                      key={cell.date}
                      data-date={cell.date}
                      title={
                        cell.tracked
                          ? `${cell.date} — ${cell.done}/${cell.total || cell.done} done`
                          : `${cell.date} — nothing tracked`
                      }
                      className={`w-[11px] h-[11px] rounded-[2px] ${levelClass(cell)}`}
                    />
                  ) : (
                    <span key={`${x}-${y}`} className="w-[11px] h-[11px]" />
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-3 sm:p-4 border-t border-border flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={handleShare} disabled={busy} className="gap-1.5">
          <Share2 className="w-4 h-4" /> Share
        </Button>
        <Button size="sm" variant="outline" onClick={handleDownload} disabled={busy} className="gap-1.5">
          <Download className="w-4 h-4" /> Save image
        </Button>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
          Less
          <span className="w-[11px] h-[11px] rounded-[2px] bg-muted/60" />
          <span className="w-[11px] h-[11px] rounded-[2px] bg-foreground/25" />
          <span className="w-[11px] h-[11px] rounded-[2px] bg-foreground/45" />
          <span className="w-[11px] h-[11px] rounded-[2px] bg-foreground/70" />
          <span className="w-[11px] h-[11px] rounded-[2px] bg-foreground" />
          More
        </span>
      </div>
    </Card>
  );
};
