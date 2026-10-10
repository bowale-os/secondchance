import { describe, expect, it } from 'vitest';
import { atlantaClock, formatTime, hoursText, isOpenNow, isStale, type Place } from './places';

const weekdays = (open: string, close: string) =>
  ([1, 2, 3, 4, 5] as const).map(day => ({ day, open, close }));

const place = (over: Partial<Place> = {}): Place => ({
  id: 'p1', name: 'SAMPLE — Courthouse', categoryId: 'courts', buildingType: 'County courthouse',
  location: { lat: 33.749, lng: -84.388 },
  address: { street: '100 Sample St', city: 'Atlanta', state: 'GA', zip: '30303' },
  county: 'fulton', hours: weekdays('08:00', '16:30'),
  hoursExceptions: [{ date: '2026-11-26', closed: true, note: 'Thanksgiving' }],
  services: ['Pay fines'], status: 'open', lastVerified: '2026-10-01', updatedAt: '2026-10-01T12:00:00Z',
  ...over,
});

// October 2026 is daylight time in Atlanta (UTC-4); late November is standard time (UTC-5).
const edt = (date: string, time: string) => new Date(`${date}T${time}:00-04:00`);
const est = (date: string, time: string) => new Date(`${date}T${time}:00-05:00`);

describe('atlantaClock', () => {
  it('reads Atlanta time whatever the device time zone', () => {
    // 2:30 AM UTC on Tue Oct 13 is still Mon Oct 12 in Atlanta.
    expect(atlantaClock(new Date('2026-10-13T02:30:00Z'))).toEqual({ date: '2026-10-12', weekday: 1, minutes: 22 * 60 + 30 });
  });
});

describe('isOpenNow', () => {
  it('is open during hours and says until when', () => {
    expect(isOpenNow(place(), edt('2026-10-12', '10:00'))).toEqual({ state: 'open', label: 'Open until 4:30 PM', note: undefined });
  });

  it('says closing soon in the last 30 minutes', () => {
    expect(isOpenNow(place(), edt('2026-10-12', '16:05')).state).toBe('closing_soon');
    expect(isOpenNow(place(), edt('2026-10-12', '16:30')).state).toBe('closed');
  });

  it('says when it opens later today', () => {
    expect(isOpenNow(place(), edt('2026-10-12', '07:15')).label).toBe('Closed now. Opens at 8:00 AM');
    expect(isOpenNow(place(), edt('2026-10-12', '17:00')).label).toBe('Closed now');
  });

  it('handles a lunch closure', () => {
    const p = place({ hours: [...weekdays('08:00', '12:00'), ...weekdays('13:00', '16:30')] });
    expect(isOpenNow(p, edt('2026-10-12', '12:30')).label).toBe('Closed now. Opens at 1:00 PM');
    expect(isOpenNow(p, edt('2026-10-12', '13:10')).state).toBe('open');
  });

  it('is closed on weekends', () => {
    expect(isOpenNow(place(), edt('2026-10-10', '10:00')).state).toBe('closed');
  });

  it('is closed on holidays, with the reason', () => {
    expect(isOpenNow(place(), est('2026-11-26', '10:00'))).toEqual({ state: 'closed', label: 'Closed now', note: 'Thanksgiving' });
  });

  it('stays right after the clocks change', () => {
    expect(isOpenNow(place(), est('2026-11-02', '08:30')).state).toBe('open');
    expect(isOpenNow(place(), est('2026-11-02', '07:30')).state).toBe('closed');
  });

  it('respects temporary closures', () => {
    const p = place({ status: 'temporarily_closed', statusNote: 'Water damage repairs' });
    expect(isOpenNow(p, edt('2026-10-12', '10:00'))).toEqual({ state: 'closed', label: 'Temporarily closed', note: 'Water damage repairs' });
  });
});

describe('formatting', () => {
  it('formats times and hours in plain words', () => {
    expect(formatTime('00:30')).toBe('12:30 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
    expect(formatTime('16:30')).toBe('4:30 PM');
    expect(hoursText([{ day: 1, open: '13:00', close: '16:30' }, { day: 1, open: '08:00', close: '12:00' }]))
      .toBe('8:00 AM – 12:00 PM, 1:00 PM – 4:30 PM');
    expect(hoursText([])).toBe('Closed');
  });
});

describe('isStale', () => {
  it('flags info not checked in over 90 days', () => {
    expect(isStale(place({ lastVerified: '2026-07-01' }), edt('2026-10-12', '10:00'))).toBe(true);
    expect(isStale(place({ lastVerified: '2026-08-01' }), edt('2026-10-12', '10:00'))).toBe(false);
  });
});
