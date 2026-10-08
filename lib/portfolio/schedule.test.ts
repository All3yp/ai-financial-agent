import assert from 'node:assert/strict';
import test from 'node:test';
import { dueMonitoringOccurrence } from './schedule';

test('daily schedules use the configured local time across UTC offsets', () => {
  assert.equal(
    dueMonitoringOccurrence(
      {
        frequency: 'daily',
        time: '09:30',
        timezone: 'America/New_York',
        dayOfWeek: 1,
        dayOfMonth: 1,
      },
      new Date('2026-01-05T14:30:00.000Z'),
    ),
    'daily:2026-01-05',
  );
  assert.equal(
    dueMonitoringOccurrence(
      {
        frequency: 'daily',
        time: '09:30',
        timezone: 'America/New_York',
        dayOfWeek: 1,
        dayOfMonth: 1,
      },
      new Date('2026-01-05T14:45:00.000Z'),
    ),
    null,
  );
});

test('daily schedules follow daylight-saving offsets and skip a nonexistent local time', () => {
  const schedule = {
    frequency: 'daily' as const,
    time: '09:00',
    timezone: 'America/New_York',
    dayOfWeek: 1,
    dayOfMonth: 1,
  };
  assert.equal(
    dueMonitoringOccurrence(schedule, new Date('2026-01-05T14:00:00.000Z')),
    'daily:2026-01-05',
  );
  assert.equal(
    dueMonitoringOccurrence(schedule, new Date('2026-07-06T13:00:00.000Z')),
    'daily:2026-07-06',
  );
  assert.equal(
    dueMonitoringOccurrence(
      { ...schedule, time: '02:30' },
      new Date('2026-03-08T07:30:00.000Z'),
    ),
    null,
  );
});

test('weekly and monthly schedule selectors are enforced using local calendar dates', () => {
  const weekly = {
    frequency: 'weekly' as const,
    time: '09:00',
    timezone: 'Europe/Lisbon',
    dayOfWeek: 1,
    dayOfMonth: 1,
  };
  assert.equal(
    dueMonitoringOccurrence(weekly, new Date('2026-10-05T08:00:00.000Z')),
    'weekly:2026-10-05',
  );
  assert.equal(
    dueMonitoringOccurrence(weekly, new Date('2026-10-06T08:00:00.000Z')),
    null,
  );

  const monthly = {
    frequency: 'monthly' as const,
    time: '09:00',
    timezone: 'UTC',
    dayOfWeek: 1,
    dayOfMonth: 15,
  };
  assert.equal(
    dueMonitoringOccurrence(monthly, new Date('2026-10-15T09:00:00.000Z')),
    'monthly:2026-10-15',
  );
  assert.equal(
    dueMonitoringOccurrence(monthly, new Date('2026-11-15T09:00:00.000Z')),
    'monthly:2026-11-15',
  );
});

test('invalid timezones and instants are not due', () => {
  assert.equal(
    dueMonitoringOccurrence(
      {
        frequency: 'daily',
        time: '09:00',
        timezone: 'not/a-zone',
        dayOfWeek: 1,
        dayOfMonth: 1,
      },
      new Date(),
    ),
    null,
  );
  assert.equal(
    dueMonitoringOccurrence(
      {
        frequency: 'daily',
        time: '09:00',
        timezone: 'UTC',
        dayOfWeek: 1,
        dayOfMonth: 1,
      },
      new Date(Number.NaN),
    ),
    null,
  );
});
