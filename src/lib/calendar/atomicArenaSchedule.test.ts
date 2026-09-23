import { describe, expect, it } from "vitest";

import {
  arenasForDate,
  monthlyAtomicDate,
  nextMonthlyArena,
  nextShieldArena,
  nextWeeklyArena,
  shieldAtomicDate,
} from "./atomicArenaSchedule";

describe("atomic arena schedule", () => {
  it("builds the published September 2026 special dates", () => {
    expect(shieldAtomicDate(2026, 8).toISOString()).toBe("2026-09-25T16:00:00.000Z");
    expect(monthlyAtomicDate(2026, 8).toISOString()).toBe("2026-10-03T19:00:00.000Z");
  });

  it("finds the next shield and weekly arenas", () => {
    const now = new Date("2026-09-22T20:00:00Z");
    expect(nextShieldArena(now).toISOString()).toBe("2026-09-25T16:00:00.000Z");
    expect(nextMonthlyArena(now).toISOString()).toBe("2026-10-03T19:00:00.000Z");
    expect(nextWeeklyArena(now).toISOString()).toBe("2026-09-26T19:00:00.000Z");
  });

  it("uses the correct hourly time controls", () => {
    const events = arenasForDate("2026-09-22", "UTC");
    const hourly = events.filter((event) => event.frequency === "hourly");
    expect(hourly).toHaveLength(22);
    expect(hourly.find((event) => event.startsAt.getUTCHours() === 2)?.timeControl).toBe("3+2");
    expect(
      hourly.find(
        (event) => event.startsAt.getUTCHours() === 10 && event.startsAt.getUTCMinutes() === 30,
      )?.timeControl,
    ).toBe("0+2");
  });

  it("suppresses lower-priority arenas during a shield", () => {
    const events = arenasForDate("2026-09-25", "UTC");
    expect(events.some((event) => event.frequency === "shield")).toBe(true);
    expect(
      events.some(
        (event) =>
          event.frequency !== "shield" &&
          event.startsAt.getUTCHours() >= 16 &&
          event.startsAt.getUTCHours() < 22,
      ),
    ).toBe(false);
  });
});
