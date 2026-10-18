import { describe, it, expect, beforeEach } from "vitest";
import {
  loadAppStorage,
  saveAppStorage,
  loadSettings,
  saveSettings,
  loadCalendarNotes,
  saveCalendarNotes,
  clearAllStorage,
} from "./appStorage";

beforeEach(() => {
  window.localStorage.clear();
});

describe("appStorage — app data", () => {
  it("returns null when nothing is stored", () => {
    expect(loadAppStorage("user1")).toBeNull();
  });

  it("round-trips habits + tasks per user", () => {
    saveAppStorage(
      {
        habits: [{ id: "h", name: "Read", completedDays: ["2026-06-01"], month: "2026-06", order: 0 } as any],
        tasks:  [{ id: "t", title: "Buy milk", completed: false, type: "general" } as any],
        currentMonth: new Date(2026, 5, 1),
      },
      "user1"
    );
    const loaded = loadAppStorage("user1");
    expect(loaded?.habits[0].name).toBe("Read");
    expect(loaded?.tasks[0].title).toBe("Buy milk");
    expect(loaded?.currentMonth.getMonth()).toBe(5);
  });

  it("isolates data between users", () => {
    saveAppStorage({ habits: [], tasks: [{ id: "a", title: "A", completed: false, type: "general" } as any], currentMonth: new Date() }, "u1");
    saveAppStorage({ habits: [], tasks: [{ id: "b", title: "B", completed: false, type: "general" } as any], currentMonth: new Date() }, "u2");
    expect(loadAppStorage("u1")?.tasks[0].title).toBe("A");
    expect(loadAppStorage("u2")?.tasks[0].title).toBe("B");
  });
});

describe("appStorage — settings", () => {
  it("returns defaults when unset", () => {
    const s = loadSettings("u");
    expect(s.morningTime).toBe("06:00");
    expect(s.frozenDates).toEqual([]);
  });

  it("round-trips settings", () => {
    saveSettings(
      {
        reminderEnabled: true,
        morningTime: "07:30",
        eveningTime: "19:00",
        nightTime: "23:00",
        frozenDates: ["2026-06-01"],
        timezone: "Asia/Kolkata",
      },
      "u"
    );
    const s = loadSettings("u");
    expect(s.reminderEnabled).toBe(true);
    expect(s.morningTime).toBe("07:30");
    expect(s.frozenDates).toEqual(["2026-06-01"]);
    expect(s.timezone).toBe("Asia/Kolkata");
  });
});

describe("appStorage — calendar notes", () => {
  it("starts empty and round-trips", () => {
    expect(loadCalendarNotes("u")).toEqual([]);
    saveCalendarNotes([{ id: "n", date: "2026-06-01", title: "Hi" }], "u");
    expect(loadCalendarNotes("u")[0].title).toBe("Hi");
  });
});

describe("appStorage — clearAllStorage", () => {
  it("clears all per-user keys", () => {
    saveAppStorage({ habits: [], tasks: [], currentMonth: new Date() }, "u");
    saveSettings({ ...loadSettings("u"), reminderEnabled: true }, "u");
    saveCalendarNotes([{ id: "n", date: "2026-06-01", title: "Hi" }], "u");
    clearAllStorage("u");
    expect(loadAppStorage("u")).toBeNull();
    expect(loadSettings("u").reminderEnabled).toBe(false);
    expect(loadCalendarNotes("u")).toEqual([]);
  });
});
