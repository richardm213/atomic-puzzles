import { render, within } from "@testing-library/react";

import { MonthlyAttemptsCalendar } from "./MonthlyAttemptsCalendar";

describe("MonthlyAttemptsCalendar", () => {
  const originalTimezone = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTimezone;
    vi.useRealTimers();
  });

  it("groups attempts by their UTC date instead of the viewer's local date", () => {
    process.env.TZ = "America/Los_Angeles";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));

    const { container } = render(
      <MonthlyAttemptsCalendar
        attempts={[
          {
            firstAttemptAt: "2026-10-02T06:30:00Z",
            firstAttemptDurationMs: null,
            puzzleCorrect: true,
          },
        ]}
      />,
    );

    const utcDay = container.querySelector('time[datetime="2026-10-02"]');
    expect(utcDay).not.toBeNull();
    expect(within(utcDay!.closest("td")!).getByText("1/1")).toBeVisible();
  });

  it("shows the median timed-attempt duration in the day hover text", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));

    const { container } = render(
      <MonthlyAttemptsCalendar
        attempts={[
          {
            firstAttemptAt: "2026-10-02T06:30:00Z",
            firstAttemptDurationMs: 10_000,
            puzzleCorrect: true,
          },
          {
            firstAttemptAt: "2026-10-02T18:30:00Z",
            firstAttemptDurationMs: 20_000,
            puzzleCorrect: false,
          },
        ]}
      />,
    );

    const day = container.querySelector('time[datetime="2026-10-02"]')?.closest("td");
    expect(day).toHaveAttribute("title", "1 correct out of 2 attempts · Median time 15s");
  });
});
