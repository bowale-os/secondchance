// Plain code, not AI: every date, dollar amount, phone number, and case number in the
// simplified text and the action list must appear on the original paper. Anything that
// doesn't is flagged "Double-check this" rather than shown as fact. Every action must also
// point to a real sentence on the paper.
import type { ActionItem, Flag, SimplifiedDocument } from '@scr/shared';

const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null;

function monthIndex(word: string) {
  const w = word.toLowerCase().replace('.', '');
  const es = MONTHS_ES.indexOf(w === 'setiembre' ? 'septiembre' : w);
  if (es >= 0) return es + 1;
  const en = MONTHS_EN.indexOf(w.slice(0, 3));
  return en >= 0 && /^[a-z]+$/.test(w) ? en + 1 : 0;
}

const MONTH_WORD = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?';
const MONTH_ES = `(${MONTHS_ES.join('|')}|setiembre)`;

/** A date found in text: full ISO date, or month-day only when no year is written. */
interface FoundDate { value: string; iso: string | null; monthDay: string }

export function findDates(text: string): FoundDate[] {
  const out: FoundDate[] = [];
  const add = (value: string, y: number | null, m: number, d: number) => {
    const md = iso(2000, m, d);
    if (!md) return;
    out.push({ value, iso: y ? iso(y, m, d) : null, monthDay: md.slice(5) });
  };
  const patterns: [RegExp, (m: RegExpExecArray) => void][] = [
    [new RegExp(`\\b${MONTH_WORD}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'gi'),
      m => add(m[0], m[3] ? +m[3] : null, monthIndex(m[1]), +m[2])],
    [new RegExp(`\\b(\\d{1,2})\\s+${MONTH_WORD}(?:,?\\s+(\\d{4}))?`, 'gi'),
      m => add(m[0], m[3] ? +m[3] : null, monthIndex(m[2]), +m[1])],
    [new RegExp(`\\b(\\d{1,2})\\s+de\\s+${MONTH_ES}(?:\\s+(?:de|del)\\s+(\\d{4}))?`, 'gi'),
      m => add(m[0], m[3] ? +m[3] : null, monthIndex(m[2]), +m[1])],
    [/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g, m => add(m[0], +m[3], +m[1], +m[2])],   // US M/D/YYYY
    [/\b(\d{4})-(\d{2})-(\d{2})\b/g, m => add(m[0], +m[1], +m[2], +m[3])],
  ];
  for (const [re, handle] of patterns) for (const m of text.matchAll(re)) handle(m as RegExpExecArray);
  return out;
}

export function findPhones(text: string) {
  return [...text.matchAll(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/g)]
    .map(m => ({ value: m[0].trim(), key: m[0].replace(/\D/g, '').slice(-10) }));
}

export function findMoney(text: string) {
  return [...text.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/g)]
    .map(m => ({ value: m[0], key: `${m[1].replace(/,/g, '')}.${m[2] ?? '00'}` }));
}

/**
 * Case and account numbers: capital letters and digits joined by dashes (2026-CR-0412), or
 * 5+ digit runs. Capitals only, so ordinary words like "10-day" aren't mistaken for one.
 */
export function findCaseNumbers(text: string) {
  const found = [
    ...text.matchAll(/\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g),
    ...text.matchAll(/(?<![\d-])\d{5,}(?![\d-])/g),
  ];
  return found.map(m => ({ value: m[0], key: m[0].toUpperCase() }));
}

const normalizeQuote = (s: string) => s
  .toLowerCase()
  .replace(/(\.\.\.|…)\s*$/, '')
  .replace(/[“”"'‘’]/g, '')
  .replace(/[^\p{L}\p{N}$]+/gu, ' ')
  .trim();

function indexOriginal(original: string) {
  const dates = findDates(original);
  return {
    isoDates: new Set(dates.map(d => d.iso).filter(Boolean)),
    yearlessMonthDays: new Set(dates.filter(d => !d.iso).map(d => d.monthDay)),
    allMonthDays: new Set(dates.map(d => d.monthDay)),
    phones: new Set(findPhones(original).map(p => p.key)),
    money: new Set(findMoney(original).map(m => m.key)),
    caseNumbers: new Set(findCaseNumbers(original).map(c => c.key)),
    quoteText: normalizeQuote(original),
  };
}

type Index = ReturnType<typeof indexOriginal>;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];
/** 2026-10-30 → "October 30, 2026" */
const humanDate = (iso: string) => `${MONTH_NAMES[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}, ${iso.slice(0, 4)}`;

/** Values in a piece of generated text that are not on the original paper. */
function unverifiedValues(text: string, idx: Index): string[] {
  const missing = new Set<string>();
  for (const d of findDates(text)) {
    const ok = d.iso ? idx.isoDates.has(d.iso) || idx.yearlessMonthDays.has(d.monthDay) : idx.allMonthDays.has(d.monthDay);
    if (!ok) missing.add(d.value);
  }
  for (const p of findPhones(text)) if (!idx.phones.has(p.key)) missing.add(p.value);
  for (const m of findMoney(text)) if (!idx.money.has(m.key)) missing.add(m.value);
  for (const c of findCaseNumbers(text)) {
    if (!idx.caseNumbers.has(c.key) && !idx.phones.has(c.key.replace(/\D/g, '').slice(-10))) missing.add(c.value);
  }
  return [...missing];
}

export function verify(original: string, simplified: SimplifiedDocument, actions: ActionItem[]): Flag[] {
  const idx = indexOriginal(original);
  const flags: Flag[] = [];
  const flagValue = (value: string, actionId?: string) =>
    flags.push({ kind: 'unverified_value', value, actionId, detail: `"${value}" is not on the original paper. Double-check this.` });

  const simplifiedText = [simplified.markdown, ...simplified.glossary.map(g => `${g.term} ${g.meaning}`)].join('\n');
  for (const v of unverifiedValues(simplifiedText, idx)) flagValue(v);

  for (const a of actions) {
    const text = [a.title, a.details, a.location, a.consequence, a.contact?.phone, ...(a.bring ?? [])]
      .filter(Boolean).join('\n');
    for (const v of unverifiedValues(text, idx)) flagValue(v, a.id);

    if (a.due.type === 'exact' && a.due.resolvedDate) {
      const md = a.due.resolvedDate.slice(5);
      if (!idx.isoDates.has(a.due.resolvedDate) && !idx.yearlessMonthDays.has(md)) {
        flagValue(humanDate(a.due.resolvedDate), a.id);   // "October 30, 2026", not 2026-10-30
      }
    }

    const quote = normalizeQuote(a.sourceQuote);
    if (!quote || !idx.quoteText.includes(quote)) {
      flags.push({
        kind: 'unverified_source', actionId: a.id,
        detail: "We couldn't find where this step is on the paper. Double-check this.",
      });
    }
  }
  return flags;
}
