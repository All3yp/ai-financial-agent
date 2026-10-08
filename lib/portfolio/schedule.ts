export interface PortfolioMonitoringSchedule {
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  timezone: string;
  dayOfWeek: number;
  dayOfMonth: number;
}

const weekdayNumbers: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function dueMonitoringOccurrence(
  schedule: PortfolioMonitoringSchedule,
  instant: Date,
): string | null {
  if (!Number.isFinite(instant.getTime())) return null;
  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: schedule.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(instant)
        .filter(({ type }) => type !== 'literal')
        .map(({ type, value }) => [type, value]),
    );
  } catch {
    return null;
  }

  const localTime = `${parts.hour}:${parts.minute}`;
  if (localTime !== schedule.time) return null;
  const weekday = weekdayNumbers[parts.weekday];
  if (weekday === undefined) return null;
  if (schedule.frequency === 'weekly' && weekday !== schedule.dayOfWeek) {
    return null;
  }
  if (
    schedule.frequency === 'monthly' &&
    Number(parts.day) !== schedule.dayOfMonth
  ) {
    return null;
  }

  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  return `${schedule.frequency}:${localDate}`;
}
