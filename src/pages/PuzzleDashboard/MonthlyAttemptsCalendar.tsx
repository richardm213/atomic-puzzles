import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMemo, useState } from "react";

type CalendarAttempt = {
  firstAttemptAt: string;
  puzzleCorrect: boolean;
};

type CalendarDay = {
  date: Date;
  dateKey: string;
  isInMonth: boolean;
};

const startOfMonth = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

export const utcDateKey = (date: Date): string =>
  [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");

const isSameMonth = (left: Date, right: Date): boolean =>
  left.getUTCFullYear() === right.getUTCFullYear() && left.getUTCMonth() === right.getUTCMonth();

const buildCalendarDays = (month: Date): CalendarDay[] => {
  const firstDay = startOfMonth(month);
  const daysInMonth = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const visibleDayCount = firstDay.getUTCDay() + daysInMonth > 35 ? 42 : 35;
  const calendarStart = new Date(
    Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth(), 1 - firstDay.getUTCDay()),
  );

  return Array.from({ length: visibleDayCount }, (_, index) => {
    const date = new Date(
      Date.UTC(
        calendarStart.getUTCFullYear(),
        calendarStart.getUTCMonth(),
        calendarStart.getUTCDate() + index,
      ),
    );
    return { date, dateKey: utcDateKey(date), isInMonth: isSameMonth(date, month) };
  });
};

const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
const performanceLegend = [
  { className: "performance1", label: "Very poor" },
  { className: "performance2", label: "Poor" },
  { className: "performance3", label: "Fair" },
  { className: "performance4", label: "Good" },
  { className: "performance5", label: "Perfect" },
] as const;

const performanceClass = (accuracy: number): string => {
  if (accuracy === 100) return "performance5";
  if (accuracy >= 75) return "performance4";
  if (accuracy >= 50) return "performance3";
  if (accuracy >= 25) return "performance2";
  return "performance1";
};

export const MonthlyAttemptsCalendar = ({ attempts }: { attempts: CalendarAttempt[] }) => {
  const today = useMemo(() => new Date(), []);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(today));
  const days = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        weekdayFormatter.format(new Date(Date.UTC(2026, 7, 2 + index))),
      ),
    [],
  );
  const attemptsByDay = useMemo(() => {
    const counts = new Map<string, { correct: number; total: number }>();

    attempts.forEach((attempt) => {
      const attemptedAt = new Date(attempt.firstAttemptAt);
      if (Number.isNaN(attemptedAt.getTime()) || !isSameMonth(attemptedAt, visibleMonth)) return;

      const key = utcDateKey(attemptedAt);
      const count = counts.get(key) ?? { correct: 0, total: 0 };
      count.total += 1;
      if (attempt.puzzleCorrect) count.correct += 1;
      counts.set(key, count);
    });

    return counts;
  }, [attempts, visibleMonth]);
  const monthSummary = useMemo(
    () =>
      [...attemptsByDay.values()].reduce(
        (summary, day) => ({
          correct: summary.correct + day.correct,
          total: summary.total + day.total,
        }),
        { correct: 0, total: 0 },
      ),
    [attemptsByDay],
  );
  const monthAccuracy =
    monthSummary.total > 0 ? Math.round((monthSummary.correct / monthSummary.total) * 100) : 0;
  const isCurrentMonth = isSameMonth(visibleMonth, today);
  const moveMonth = (offset: number): void => {
    setVisibleMonth(
      (current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + offset, 1)),
    );
  };

  return (
    <section className="dashboardCalendar" aria-labelledby="dashboard-calendar-heading">
      <div className="dashboardCalendarHeading">
        <div className="dashboardCalendarTitle">
          <h3 id="dashboard-calendar-heading">{monthFormatter.format(visibleMonth)}</h3>
          <span>
            {monthSummary.total === 0
              ? "No attempts"
              : `${monthSummary.total} attempt${monthSummary.total === 1 ? "" : "s"} · ${monthAccuracy}% correct`}
          </span>
        </div>
        <div className="dashboardCalendarNavigation" aria-label="Calendar month">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">
            <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
          </button>
          {!isCurrentMonth ? (
            <button
              type="button"
              className="dashboardCalendarToday"
              onClick={() => setVisibleMonth(startOfMonth(today))}
            >
              Today
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => moveMonth(1)}
            aria-label="Next month"
            disabled={isCurrentMonth}
          >
            <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="dashboardCalendarLegend" aria-label="Performance color scale">
        <span>Performance</span>
        <ol>
          {performanceLegend.map((item) => (
            <li key={item.className}>
              <i className={item.className} aria-hidden="true" />
              <span>{item.label}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="dashboardCalendarTableWrap">
        <table className="dashboardCalendarTable">
          <caption>
            Daily puzzle attempts grouped by UTC day for {monthFormatter.format(visibleMonth)}
          </caption>
          <thead>
            <tr>
              {weekdayLabels.map((weekday) => (
                <th key={weekday} scope="col">
                  {weekday}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: days.length / 7 }, (_, weekIndex) => (
              <tr key={weekIndex}>
                {days.slice(weekIndex * 7, weekIndex * 7 + 7).map((day) => {
                  const count = attemptsByDay.get(day.dateKey);
                  const accuracy = count ? Math.round((count.correct / count.total) * 100) : 0;
                  const resultClass = count?.total ? ` ${performanceClass(accuracy)}` : "";

                  return (
                    <td
                      key={day.dateKey}
                      className={`${day.isInMonth ? "" : "outsideMonth"}${resultClass}`}
                      title={
                        count
                          ? `${count.correct} correct out of ${count.total} attempts`
                          : undefined
                      }
                    >
                      {day.isInMonth ? (
                        <>
                          <time dateTime={day.dateKey}>{day.date.getUTCDate()}</time>
                          {count ? (
                            <span className="dashboardCalendarDayScore">
                              <strong>
                                {count.correct}/{count.total}
                              </strong>
                              <small>{accuracy}% correct</small>
                            </span>
                          ) : null}
                          <span className="dashboardCalendarDateLabel">
                            {fullDateFormatter.format(day.date)}
                          </span>
                        </>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
