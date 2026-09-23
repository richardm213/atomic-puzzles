export type ArenaFrequency = "hourly" | "daily" | "weekly" | "monthly" | "shield" | "yearly";

export type ScheduledAtomicArena = {
  id: string;
  frequency: ArenaFrequency;
  name: string;
  startsAt: Date;
  durationMinutes: number;
  timeControl: string;
};

type HourlyTemplate = {
  hour: number;
  minute?: number;
  durationMinutes: number;
  timeControl: string;
};

const hourlyTemplates: HourlyTemplate[] = [
  { hour: 1, durationMinutes: 57, timeControl: "3+0" },
  { hour: 2, durationMinutes: 57, timeControl: "3+2" },
  { hour: 4, durationMinutes: 57, timeControl: "1+2" },
  { hour: 5, durationMinutes: 57, timeControl: "3+2" },
  { hour: 7, durationMinutes: 27, timeControl: "1+0" },
  { hour: 7, minute: 30, durationMinutes: 27, timeControl: "½+0" },
  { hour: 8, durationMinutes: 57, timeControl: "3+0" },
  { hour: 10, durationMinutes: 27, timeControl: "1+0" },
  { hour: 10, minute: 30, durationMinutes: 27, timeControl: "0+2" },
  { hour: 11, durationMinutes: 27, timeControl: "1+0" },
  { hour: 11, minute: 30, durationMinutes: 27, timeControl: "0+2" },
  { hour: 13, durationMinutes: 57, timeControl: "3+0" },
  { hour: 14, durationMinutes: 57, timeControl: "3+2" },
  { hour: 16, durationMinutes: 57, timeControl: "1+2" },
  { hour: 17, durationMinutes: 57, timeControl: "3+2" },
  { hour: 19, durationMinutes: 27, timeControl: "1+0" },
  { hour: 19, minute: 30, durationMinutes: 27, timeControl: "½+0" },
  { hour: 20, durationMinutes: 57, timeControl: "3+0" },
  { hour: 22, durationMinutes: 27, timeControl: "1+0" },
  { hour: 22, minute: 30, durationMinutes: 27, timeControl: "0+2" },
  { hour: 23, durationMinutes: 27, timeControl: "1+0" },
  { hour: 23, minute: 30, durationMinutes: 27, timeControl: "0+2" },
];

const frequencyPriority: Record<ArenaFrequency, number> = {
  hourly: 10,
  daily: 20,
  weekly: 40,
  monthly: 50,
  shield: 51,
  yearly: 70,
};

const utcDate = (year: number, month: number, day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(year, month, day, hour, minute));

const daysInUtcMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

export const formatDateKey = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export const shiftDateKey = (dateKey: string, amount: number) => {
  const [year = 1970, month = 1, day = 1] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + amount));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
};

export const monthlyAtomicDate = (year: number, month: number) => {
  const lastDay = daysInUtcMonth(year, month);
  const lastDate = new Date(Date.UTC(year, month, lastDay));
  const daysSinceMonday = (lastDate.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(year, month, lastDay - daysSinceMonday + 5, 19));
};

export const shieldAtomicDate = (year: number, month: number) => {
  const firstDate = new Date(Date.UTC(year, month, 1));
  const daysSinceMonday = (firstDate.getUTCDay() + 6) % 7;
  const firstTournamentMonday = 1 + (7 - daysSinceMonday);
  return new Date(Date.UTC(year, month, firstTournamentMonday + 18, 16));
};

export const yearlyAtomicDate = (year: number) => {
  const juneFirst = new Date(Date.UTC(year, 5, 1));
  const isoDay = juneFirst.getUTCDay() || 7;
  const tournamentMonday = 1 + (15 - isoDay);
  return new Date(Date.UTC(year, 5, tournamentMonday + 1, 17));
};

const arena = (
  frequency: ArenaFrequency,
  startsAt: Date,
  durationMinutes: number,
  timeControl: string,
): ScheduledAtomicArena => ({
  id: `${frequency}-${startsAt.toISOString()}`,
  frequency,
  name: `${frequency.charAt(0).toUpperCase()}${frequency.slice(1)} Atomic Arena`,
  startsAt,
  durationMinutes,
  timeControl,
});

const scheduleForUtcDay = (utcDay: Date): ScheduledAtomicArena[] => {
  const year = utcDay.getUTCFullYear();
  const month = utcDay.getUTCMonth();
  const day = utcDay.getUTCDate();
  const dateKey = `${year}-${month}-${day}`;
  const events = hourlyTemplates.map((template) =>
    arena(
      "hourly",
      utcDate(year, month, day, template.hour, template.minute),
      template.durationMinutes,
      template.timeControl,
    ),
  );

  events.push(arena("daily", utcDate(year, month, day, 18), 60, "3+0"));

  if (utcDay.getUTCDay() === 6) {
    events.push(arena("weekly", utcDate(year, month, day, 19), 180, "3+0"));
  }

  const monthlyCandidates = [
    monthlyAtomicDate(year, month),
    monthlyAtomicDate(year, month - 1),
  ];
  for (const date of monthlyCandidates) {
    if (`${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}` === dateKey) {
      events.push(arena("monthly", date, 210, "3+0"));
    }
  }

  const shield = shieldAtomicDate(year, month);
  if (`${shield.getUTCFullYear()}-${shield.getUTCMonth()}-${shield.getUTCDate()}` === dateKey) {
    events.push(arena("shield", shield, 360, "3+2"));
  }

  const yearly = yearlyAtomicDate(year);
  if (`${yearly.getUTCFullYear()}-${yearly.getUTCMonth()}-${yearly.getUTCDate()}` === dateKey) {
    events.push(arena("yearly", yearly, 300, "3+0"));
  }

  return events;
};

const eventsOverlap = (first: ScheduledAtomicArena, second: ScheduledAtomicArena) => {
  const firstStart = first.startsAt.getTime();
  const firstEnd = firstStart + first.durationMinutes * 60_000;
  const secondStart = second.startsAt.getTime();
  const secondEnd = secondStart + second.durationMinutes * 60_000;
  return firstStart < secondEnd && secondStart < firstEnd;
};

export const arenasForDate = (dateKey: string, timeZone: string) => {
  const [year = 1970, month = 1, day = 1] = dateKey.split("-").map(Number);
  const center = new Date(Date.UTC(year, month - 1, day));
  const candidates = [-1, 0, 1]
    .flatMap((offset) => {
      const utcDay = new Date(center);
      utcDay.setUTCDate(center.getUTCDate() + offset);
      return scheduleForUtcDay(utcDay);
    })
    .filter((event) => formatDateKey(event.startsAt, timeZone) === dateKey)
    .sort((left, right) => {
      const timeDifference = left.startsAt.getTime() - right.startsAt.getTime();
      return timeDifference || frequencyPriority[right.frequency] - frequencyPriority[left.frequency];
    });

  return candidates.filter(
    (event) =>
      !candidates.some(
        (other) =>
          frequencyPriority[other.frequency] > frequencyPriority[event.frequency] &&
          eventsOverlap(event, other),
      ),
  );
};

const nextMatchingDate = (
  now: Date,
  calculate: (year: number, month: number) => Date,
) => {
  for (let offset = 0; offset < 24; offset += 1) {
    const month = now.getUTCMonth() + offset;
    const year = now.getUTCFullYear() + Math.floor(month / 12);
    const candidate = calculate(year, ((month % 12) + 12) % 12);
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  throw new Error("Unable to find the next scheduled arena");
};

export const nextShieldArena = (now = new Date()) =>
  nextMatchingDate(now, (year, month) => shieldAtomicDate(year, month));

export const nextMonthlyArena = (now = new Date()) =>
  nextMatchingDate(now, (year, month) => monthlyAtomicDate(year, month));

export const nextWeeklyArena = (now = new Date()) => {
  const result = new Date(now);
  result.setUTCSeconds(0, 0);
  const daysUntilSaturday = (6 - result.getUTCDay() + 7) % 7;
  result.setUTCDate(result.getUTCDate() + daysUntilSaturday);
  result.setUTCHours(19, 0, 0, 0);
  if (result.getTime() <= now.getTime()) result.setUTCDate(result.getUTCDate() + 7);
  return result;
};

export const timePartsInZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(date);
  const value = (type: "hour" | "minute") =>
    Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  return { hour: value("hour") % 24, minute: value("minute") };
};
