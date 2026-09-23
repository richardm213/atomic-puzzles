import "./Calendar.css";

import {
  faArrowDown,
  faArrowUp,
  faArrowUpRightFromSquare,
  faChevronLeft,
  faChevronRight,
  faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useState } from "react";

import { Seo } from "../../components/Seo/Seo";
import {
  arenasForDate,
  formatDateKey,
  nextMonthlyArena,
  nextShieldArena,
  type ScheduledAtomicArena,
  shiftDateKey,
  timePartsInZone,
} from "../../lib/calendar/atomicArenaSchedule";
import { appAssetPath } from "../../utils/appAssetPath";

const HOUR_HEIGHT = 90;
const LICHESS_ARENAS_URL = "https://lichess.org/tournament";

const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const dateFromKey = (dateKey: string) => {
  const [year = 1970, month = 1, day = 1] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
};

const selectedDateFormatter = new Intl.DateTimeFormat("en", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const compactDateFormatter = new Intl.DateTimeFormat("en", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const durationLabel = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
};

const hourLabel = (hour: number) => `${hour % 12 || 12}${hour < 12 ? "am" : "pm"}`;

const arenaTimeLabel = (date: Date, timeZone: string) => {
  const { hour, minute } = timePartsInZone(date, timeZone);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")}${hour < 12 ? "am" : "pm"}`;
};

const controlClass = (timeControl: string) => {
  if (timeControl === "3+2") return "blitz";
  if (timeControl === "3+0") return "superblitz";
  if (timeControl === "1+2") return "hippo";
  if (timeControl === "½+0") return "hyper";
  return "bullet";
};

const LichessAtomicIcon = () => (
  <span className="lichessAtomicGlyph" aria-hidden="true">
    &#xe01c;
  </span>
);

const ArenaBlock = ({
  arena,
  timeZone,
  displayStartMinute,
  displayDurationMinutes,
}: {
  arena: ScheduledAtomicArena;
  timeZone: string;
  displayStartMinute: number;
  displayDurationMinutes: number;
}) => {
  const time = arenaTimeLabel(arena.startsAt, timeZone);
  const special = arena.frequency !== "hourly";

  return (
    <a
      className={`calendarArena calendarArena-${arena.frequency} calendarArena-${controlClass(arena.timeControl)}`}
      href={LICHESS_ARENAS_URL}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        top: `${displayStartMinute * (HOUR_HEIGHT / 60)}px`,
        height: `${Math.max(displayDurationMinutes * (HOUR_HEIGHT / 60), 30)}px`,
      }}
      aria-label={`${arena.name}, ${time}, ${arena.timeControl}, ${durationLabel(arena.durationMinutes)}. Open Lichess arenas in a new tab`}
    >
      <span className="calendarArenaIcon" aria-hidden="true">
        {arena.frequency === "shield" ? (
          <FontAwesomeIcon icon={faShieldHalved} />
        ) : (
          <LichessAtomicIcon />
        )}
      </span>
      <span className="calendarArenaBody">
        <strong>{arena.name}</strong>
        <span>
          {time} · {durationLabel(arena.durationMinutes)}
        </span>
      </span>
      <span className="calendarArenaControl">{arena.timeControl}</span>
      {special && (
        <FontAwesomeIcon
          className="calendarArenaExternal"
          icon={faArrowUpRightFromSquare}
          aria-hidden="true"
        />
      )}
    </a>
  );
};

const UpcomingArena = ({
  frequency,
  startsAt,
  timeZone,
  onJump,
}: {
  frequency: "shield" | "monthly";
  startsAt: Date;
  timeZone: string;
  onJump: (dateKey: string) => void;
}) => {
  const date = new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(startsAt);

  return (
    <button
      className={`calendarUpcoming calendarUpcoming-${frequency}`}
      type="button"
      onClick={() => onJump(formatDateKey(startsAt, timeZone))}
    >
      <span className="calendarUpcomingIcon" aria-hidden="true">
        {frequency === "shield" ? (
          <img
            src={appAssetPath("/images/arenas/atomic-shield.png")}
            alt=""
            width="40"
            height="40"
          />
        ) : (
          <LichessAtomicIcon />
        )}
      </span>
      <span>
        <strong>Next {frequency}</strong>
        <time dateTime={startsAt.toISOString()}>{date}</time>
      </span>
    </button>
  );
};

export const CalendarPage = () => {
  const timeZone = localTimeZone;
  const [now, setNow] = useState(() => new Date());
  const [dateKey, setDateKey] = useState(() => formatDateKey(now, timeZone));
  const [hoursBack, setHoursBack] = useState(0);
  const todayKey = formatDateKey(now, timeZone);
  const isToday = dateKey === todayKey;
  const nowTime = timePartsInZone(now, timeZone);
  const rollingStartMinute = nowTime.hour * 60;
  const windowStartMinute = isToday ? Math.max(0, rollingStartMinute - hoursBack * 60) : 0;
  const windowDurationMinutes = 24 * 60;
  const windowEndMinute = windowStartMinute + windowDurationMinutes;
  const nextDateKey = shiftDateKey(dateKey, 1);
  const events = useMemo(
    () => [
      ...arenasForDate(dateKey, timeZone),
      ...(windowEndMinute > 24 * 60 ? arenasForDate(nextDateKey, timeZone) : []),
    ],
    [dateKey, nextDateKey, timeZone, windowEndMinute],
  );
  const nextShield = useMemo(() => nextShieldArena(), []);
  const nextMonthly = useMemo(() => nextMonthlyArena(), []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const jumpTo = (nextDate: string) => {
    setDateKey(nextDate);
    setHoursBack(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const visibleEvents = events.flatMap((event) => {
    const eventDateKey = formatDateKey(event.startsAt, timeZone);
    const dayOffset = eventDateKey === nextDateKey ? 24 * 60 : 0;
    const eventTime = timePartsInZone(event.startsAt, timeZone);
    const eventStart = dayOffset + eventTime.hour * 60 + eventTime.minute;
    const eventEnd = eventStart + event.durationMinutes;
    const visibleStart = Math.max(eventStart, windowStartMinute);
    const visibleEnd = Math.min(eventEnd, windowEndMinute);
    if (visibleEnd <= visibleStart) return [];
    return [
      {
        arena: event,
        displayStartMinute: visibleStart - windowStartMinute,
        displayDurationMinutes: visibleEnd - visibleStart,
      },
    ];
  });

  const timelineHours = windowDurationMinutes / 60;
  const timelineHeight = timelineHours * HOUR_HEIGHT;
  const nowMinute = nowTime.hour * 60 + nowTime.minute;
  const showNowLine = isToday && nowMinute >= windowStartMinute && nowMinute < windowEndMinute;

  const shiftWindow = (direction: "earlier" | "later") => {
    const left = window.scrollX;
    const top = window.scrollY;
    setHoursBack((current) => {
      if (direction === "later") return Math.max(0, current - 6);
      return Math.min(nowTime.hour, current + 6);
    });
    window.requestAnimationFrame(() => {
      window.scrollTo({ left, top, behavior: "auto" });
    });
  };

  return (
    <div className="sitePage calendarPage">
      <Seo
        title="Atomic arena calendar"
        description="Daily schedule for official Lichess Atomic arenas."
        path="/calendar"
      />

      <header className="calendarHeader">
        <h1>Atomic arena calendar</h1>
        <div className="calendarUpcomingGrid">
          <UpcomingArena
            frequency="shield"
            startsAt={nextShield}
            timeZone={timeZone}
            onJump={jumpTo}
          />
          <UpcomingArena
            frequency="monthly"
            startsAt={nextMonthly}
            timeZone={timeZone}
            onJump={jumpTo}
          />
        </div>
      </header>

      <section className="calendarSchedule" aria-labelledby="calendar-day-heading">
        <div className="calendarToolbar">
          <button
            className="calendarDayStep"
            type="button"
            aria-label="Previous day"
            onClick={() => jumpTo(shiftDateKey(dateKey, -1))}
          >
            <FontAwesomeIcon icon={faChevronLeft} aria-hidden="true" />
          </button>

          <div className="calendarDayTitle">
            <h2 id="calendar-day-heading">
              <span className="calendarDateFull">
                {selectedDateFormatter.format(dateFromKey(dateKey))}
              </span>
              <span className="calendarDateCompact">
                {compactDateFormatter.format(dateFromKey(dateKey))}
              </span>
            </h2>
            <button type="button" onClick={() => jumpTo(formatDateKey(new Date(), timeZone))}>
              Today
            </button>
          </div>

          <button
            className="calendarDayStep"
            type="button"
            aria-label="Next day"
            onClick={() => jumpTo(shiftDateKey(dateKey, 1))}
          >
            <FontAwesomeIcon icon={faChevronRight} aria-hidden="true" />
          </button>

          <div className="calendarJumpControls">
            <label>
              <span>Date</span>
              <input
                id="calendar-date"
                type="date"
                value={dateKey}
                onChange={(event) => event.target.value && jumpTo(event.target.value)}
              />
            </label>
          </div>
        </div>

        {isToday && (
          <div className="calendarTimeShiftControls" aria-label="Move calendar time window">
            <button
              className="calendarTimeShiftButton"
              type="button"
              aria-label="Show the previous 6 hours"
              title="Previous 6 hours"
              disabled={windowStartMinute === 0}
              onClick={() => shiftWindow("earlier")}
            >
              <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
            </button>
            <button
              className="calendarTimeShiftButton"
              type="button"
              aria-label="Show the next 6 hours"
              title="Next 6 hours"
              disabled={hoursBack === 0}
              onClick={() => shiftWindow("later")}
            >
              <FontAwesomeIcon icon={faArrowDown} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="calendarTimeline" style={{ height: `${timelineHeight}px` }}>
          <div className="calendarHourLabels" aria-hidden="true">
            {Array.from({ length: timelineHours }, (_, hourOffset) => {
              const absoluteMinute = windowStartMinute + hourOffset * 60;
              const hour = Math.floor(absoluteMinute / 60) % 24;
              return (
                <span key={hourOffset} style={{ top: `${hourOffset * HOUR_HEIGHT}px` }}>
                  {hourLabel(hour)}
                </span>
              );
            })}
          </div>
          <div className="calendarCanvas">
            {Array.from({ length: timelineHours }, (_, hourOffset) => (
              <span
                className="calendarHourRule"
                aria-hidden="true"
                key={hourOffset}
                style={{ top: `${hourOffset * HOUR_HEIGHT}px` }}
              />
            ))}
            {showNowLine && (
              <span
                className="calendarNowLine"
                style={{ top: `${(nowMinute - windowStartMinute) * (HOUR_HEIGHT / 60)}px` }}
              >
                <span>Now</span>
              </span>
            )}
            {visibleEvents.map(({ arena, displayStartMinute, displayDurationMinutes }) => (
              <ArenaBlock
                key={arena.id}
                arena={arena}
                timeZone={timeZone}
                displayStartMinute={displayStartMinute}
                displayDurationMinutes={displayDurationMinutes}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
