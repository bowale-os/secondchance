/**
 * Schedules live in one zone (backend LOCAL_TIMEZONE), whatever the browser's zone is,
 * so a case worker travelling or on a misconfigured laptop still enters 2 PM Atlanta time.
 */
export const SCHEDULE_TZ = "America/New_York";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHEDULE_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** ISO instant -> { date: "2026-10-12", time: "14:00" } in schedule time. */
export function toLocalParts(iso: string): { date: string; time: string } {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Form values -> naive ISO the backend reads as schedule time. */
export function fromLocalParts(date: string, time: string): string {
  return `${date}T${time}:00`;
}

export function todayLocal(): string {
  return toLocalParts(new Date().toISOString()).date;
}

const timeFmt = new Intl.DateTimeFormat(undefined, { timeZone: SCHEDULE_TZ, hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat(undefined, { timeZone: SCHEDULE_TZ, weekday: "short", month: "short", day: "numeric" });

export const formatTime = (iso: string): string => timeFmt.format(new Date(iso));
export const formatDay = (iso: string): string => dayFmt.format(new Date(iso));
