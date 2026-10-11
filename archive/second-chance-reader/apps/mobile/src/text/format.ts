// Friendly date wording for screens and speech.
import { daysBetween } from '@scr/shared';

const WEEKDAYS = { en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] };
const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
};

/** "Tue, Oct 13" */
export function friendlyDate(iso: string, lang: 'en' | 'es' = 'en') {
  const d = new Date(`${iso}T00:00:00Z`);
  const wd = WEEKDAYS[lang][d.getUTCDay()];
  const m = MONTHS[lang][d.getUTCMonth()];
  return lang === 'es' ? `${wd} ${d.getUTCDate()} ${m}` : `${wd}, ${m} ${d.getUTCDate()}`;
}

/** "Due today", "Due tomorrow", "Due in 4 days", "Overdue by 2 days". */
export function dueWords(iso: string, today: string) {
  const n = daysBetween(today, iso);
  if (n < 0) return `Overdue by ${-n} day${n === -1 ? '' : 's'}`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `Due in ${n} days`;
}

/** Parses "10/9/2026" or "10-09-2026" (month first) into ISO, or null. */
export function parseUsDate(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const [mo, d, y] = [+m[1], +m[2], +m[3]];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || y < 1950 || y > 2100) return null;
  return date.toISOString().slice(0, 10);
}
