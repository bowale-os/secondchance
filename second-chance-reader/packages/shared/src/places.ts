// Resource Map data: places people leaving prison most often need, in the core five
// counties of metro Atlanta. Shared by the app and (later) the places backend.

export type County = 'fulton' | 'dekalb' | 'cobb' | 'gwinnett' | 'clayton';

export const COUNTY_LABELS: Record<County, string> = {
  fulton: 'Fulton', dekalb: 'DeKalb', cobb: 'Cobb', gwinnett: 'Gwinnett', clayton: 'Clayton',
};

export interface Category {
  id: string;            // 'courts', 'probation_parole', 'id_license', ...
  label: string;         // 'Courts'
  label_es?: string;
  icon: string;          // icon name from the app's icon set
  colorToken: string;    // theme color name, never a raw hex in the data
  order: number;
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;   // 0 = Sunday

export interface HoursPeriod {
  day: Weekday;
  open: string;          // '08:00' (24-hour, Atlanta time)
  close: string;         // '16:30'
}

export interface HoursException {
  date: string;          // '2026-11-26'
  closed: boolean;
  periods?: HoursPeriod[];
  note?: string;         // 'Thanksgiving'
}

export type PlaceStatus = 'open' | 'temporarily_closed' | 'permanently_closed';

export interface Place {
  id: string;
  name: string;
  categoryId: string;
  buildingType: string;           // 'County courthouse', 'State office', 'Nonprofit office'
  location: { lat: number; lng: number };
  address: { street: string; city: string; state: 'GA'; zip: string };
  county: County;
  phone?: string;
  hours: HoursPeriod[];           // several periods per day allowed (lunch closures)
  hoursExceptions: HoursException[];
  hoursNote?: string;             // 'Walk-ins until 3:00 PM'
  services: string[];             // short plain phrases: 'Pay fines', 'Replace a lost ID'
  whatToBring?: string[];
  languages?: string[];           // ['en', 'es']
  wheelchairAccessible?: boolean;
  status: PlaceStatus;
  statusNote?: string;            // why it is temporarily closed, if known
  lastVerified: string;           // '2026-09-30'
  isSample?: boolean;             // true for the bundled sample data
  updatedAt: string;
}

// ── Open now ────────────────────────────────────────────────────────────────

export const ATLANTA_TZ = 'America/New_York';
export const CLOSING_SOON_MINUTES = 30;
/** Older than this, the info card adds "Call ahead to confirm." */
export const STALE_AFTER_DAYS = 90;

export type OpenState = 'open' | 'closing_soon' | 'closed';

export interface OpenStatus {
  state: OpenState;
  /** Plain words for the card and for read-aloud, e.g. "Open until 4:30 PM". */
  label: string;
  /** Holiday or other note for today, e.g. "Thanksgiving". */
  note?: string;
}

/** Date, weekday, and minutes since midnight in Atlanta, whatever the device's time zone. */
export function atlantaClock(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ATLANTA_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(now).map(p => [p.type, p.value]),
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday) as Weekday;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** "08:00" → "8:00 AM", "16:30" → "4:30 PM", "12:00" → "12:00 PM". */
export function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 && h < 24 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Opening periods for one date: a holiday exception wins over the weekly hours. */
export function periodsOn(place: Place, date: string, weekday: Weekday) {
  const ex = place.hoursExceptions.find(e => e.date === date);
  if (ex) return { periods: ex.closed ? [] : (ex.periods ?? []), note: ex.note };
  return { periods: place.hours.filter(p => p.day === weekday), note: undefined };
}

/** "8:00 AM – 12:00 PM, 1:00 PM – 4:30 PM", or "Closed". */
export function hoursText(periods: HoursPeriod[]) {
  if (!periods.length) return 'Closed';
  return [...periods]
    .sort((a, b) => toMinutes(a.open) - toMinutes(b.open))
    .map(p => `${formatTime(p.open)} – ${formatTime(p.close)}`)
    .join(', ');
}

/**
 * Open, closing soon (within 30 minutes), or closed, in Atlanta time. Checks the place's
 * status first, then any holiday exception for today, then the weekly hours.
 */
export function isOpenNow(place: Place, now: Date): OpenStatus {
  if (place.status !== 'open') {
    return { state: 'closed', label: place.status === 'temporarily_closed' ? 'Temporarily closed' : 'Closed for good', note: place.statusNote };
  }
  const clock = atlantaClock(now);
  const { periods, note } = periodsOn(place, clock.date, clock.weekday);
  const sorted = [...periods].sort((a, b) => toMinutes(a.open) - toMinutes(b.open));

  for (const p of sorted) {
    const open = toMinutes(p.open);
    const close = toMinutes(p.close);
    if (clock.minutes >= open && clock.minutes < close) {
      const left = close - clock.minutes;
      return left <= CLOSING_SOON_MINUTES
        ? { state: 'closing_soon', label: `Closing soon, at ${formatTime(p.close)}`, note }
        : { state: 'open', label: `Open until ${formatTime(p.close)}`, note };
    }
  }

  const later = sorted.find(p => toMinutes(p.open) > clock.minutes);
  return {
    state: 'closed',
    label: later ? `Closed now. Opens at ${formatTime(later.open)}` : 'Closed now',
    note,
  };
}

/** Days since the place info was last checked. */
export function daysSinceVerified(place: Place, now: Date) {
  const today = atlantaClock(now).date;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${place.lastVerified}T00:00:00Z`)) / 86_400_000);
}

export function isStale(place: Place, now: Date) {
  return daysSinceVerified(place, now) > STALE_AFTER_DAYS;
}
