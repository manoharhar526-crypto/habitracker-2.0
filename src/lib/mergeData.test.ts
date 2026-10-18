import { describe, it, expect } from "vitest";
import { mergeSnapshots } from "./mergeData";
import type { Habit } from "@/types/habit";

const h = (id: string, completedDays: string[]): Habit =>
  ({ id, name: id, month: "2026-10", completedDays, skippedDays: [], order: 0 } as unknown as Habit);

describe("mergeSnapshots", () => {
  it("un-ticking on the newer device sticks", () => {
    const m = mergeSnapshots(
      { habits: [h("a", ["2026-10-01"])], tasks: [], calendarNotes: [], savedAt: "2026-10-02T00:00:00Z" },
      { habits: [h("a", ["2026-10-01", "2026-10-02"])], tasks: [], calendarNotes: [], savedAt: "2026-10-01T00:00:00Z" },
    );
    expect(m.habits[0].completedDays).toEqual(["2026-10-01"]);
  });

  it("a deleted habit does not come back from an older copy", () => {
    const m = mergeSnapshots(
      { habits: [], tasks: [], calendarNotes: [], savedAt: "2026-10-02T00:00:00Z",
        deleted: { habits: { a: "2026-10-02T00:00:00Z" } } },
      { habits: [h("a", [])], tasks: [], calendarNotes: [], savedAt: "2026-10-01T00:00:00Z" },
    );
    expect(m.habits).toHaveLength(0);
  });

  it("keeps habits that only exist on one side", () => {
    const m = mergeSnapshots(
      { habits: [h("a", [])], tasks: [], calendarNotes: [], savedAt: "2026-10-01T00:00:00Z" },
      { habits: [h("b", [])], tasks: [], calendarNotes: [], savedAt: "2026-10-02T00:00:00Z" },
    );
    expect(m.habits.map(x => x.id).sort()).toEqual(["a", "b"]);
  });
});
