// Business-hours filter — marks activities that fall outside an employee's
// configured working window so they can be reported separately instead of
// dragging down productivity numbers.
//
// Employees can set:
//   - timezone                  (IANA, e.g. "Asia/Kolkata")
//   - business_hours_start      ("HH:MM")
//   - business_hours_end        ("HH:MM", exclusive)
//   - business_hours_days       ("1,2,3,4,5" — ISO weekday, Mon=1..Sun=7)
//
// If any of those are unset we treat the employee as 24/7 (the current
// default — important for solopreneurs who don't want activity dropped).
//
// The filter adds a synthetic `outsideBusinessHours: true` flag to each
// matching activity. Downstream (computeProductivityStats in shared) uses
// this to keep totals separate.

import { resolveTimezone } from './timezone.js';

export interface BusinessHoursConfig {
  timezone?: string | null;
  start?: string | null;         // "HH:MM"
  end?: string | null;           // "HH:MM"
  days?: string | null;          // "1,2,3,4,5"
}

export interface EmployeeLike {
  timezone?: string | null;
  business_hours_start?: string | null;
  business_hours_end?: string | null;
  business_hours_days?: string | null;
  // tolerate camelCase too
  businessHoursStart?: string | null;
  businessHoursEnd?: string | null;
  businessHoursDays?: string | null;
}

export function hasBusinessHours(e: EmployeeLike | null | undefined): boolean {
  if (!e) return false;
  const start = e.business_hours_start || e.businessHoursStart;
  const end = e.business_hours_end || e.businessHoursEnd;
  const days = e.business_hours_days || e.businessHoursDays;
  return !!(start && end && days);
}

function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Decide if a given UTC timestamp falls inside the employee's business hours.
 * Returns true if inside (or if the employee has no business hours at all).
 */
export function isInsideBusinessHours(
  timestampUtc: string,
  employee: EmployeeLike | null | undefined,
  fallbackTimezone: string
): boolean {
  if (!hasBusinessHours(employee)) return true;

  const tz = resolveTimezone(employee?.timezone || fallbackTimezone);
  const start = parseHHMM((employee?.business_hours_start || employee?.businessHoursStart) as string);
  const end = parseHHMM((employee?.business_hours_end || employee?.businessHoursEnd) as string);
  const daysRaw = (employee?.business_hours_days || employee?.businessHoursDays) as string;
  const days = new Set(
    daysRaw
      .split(',')
      .map(s => Number(s.trim()))
      .filter(n => n >= 1 && n <= 7)
  );
  if (start == null || end == null || days.size === 0) return true;

  const d = new Date(timestampUtc);
  if (isNaN(d.getTime())) return true; // be forgiving

  // Extract weekday + hour + minute in the employee's timezone.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(d);

  const weekdayMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7
  };
  const weekdayStr = parts.find(p => p.type === 'weekday')?.value || '';
  const weekday = weekdayMap[weekdayStr] || 0;
  if (!days.has(weekday)) return false;

  const hour = Number(parts.find(p => p.type === 'hour')?.value || '0') % 24;
  const minute = Number(parts.find(p => p.type === 'minute')?.value || '0');
  const minutesOfDay = hour * 60 + minute;

  if (start === end) return false; // zero-length window
  if (start < end) {
    return minutesOfDay >= start && minutesOfDay < end;
  }
  // Overnight shift, e.g. 22:00 → 06:00
  return minutesOfDay >= start || minutesOfDay < end;
}

/**
 * Annotate an array of activities in-place-ish: returns a new array where each
 * activity has an `outsideBusinessHours` boolean based on the employee's
 * configured hours. The original objects are not mutated.
 */
export function annotateOutsideHours<T extends { timestamp: string }>(
  activities: T[],
  employee: EmployeeLike | null | undefined,
  orgTimezone: string
): Array<T & { outsideBusinessHours: boolean }> {
  if (!hasBusinessHours(employee)) {
    return activities.map(a => ({ ...a, outsideBusinessHours: false }));
  }
  return activities.map(a => ({
    ...a,
    outsideBusinessHours: !isInsideBusinessHours(a.timestamp, employee, orgTimezone)
  }));
}
