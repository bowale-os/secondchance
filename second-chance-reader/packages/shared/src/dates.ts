// Deterministic date math: turns what the AI read ("within 72 hours of release") into a
// real date. Never done by the model. Lives in shared so the app can re-run it the moment
// a resident enters their release date, without another trip to the server.
import type { ActionItem, DocType, DueDate } from './types';
import type { RawAction, RawDue } from './schema';
import { LEGAL_DOC_TYPES, URGENT_WINDOW_DAYS } from './constants';

export interface DateAnchors {
  documentDate?: string | null;
  releaseDate?: string | null;
  receivedDate?: string | null;
}

type Lang = 'en' | 'es';

const DAY_MS = 86_400_000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, days: number) {
  return toIso(new Date(toDate(iso).getTime() + days * DAY_MS));
}

/**
 * Adds business days, skipping Saturdays and Sundays. Holidays are NOT skipped, so a
 * deadline can only come out earlier than the real one, never later. Early is safe.
 */
export function addBusinessDays(iso: string, days: number) {
  let d = toDate(iso);
  let left = days;
  while (left > 0) {
    d = new Date(d.getTime() + DAY_MS);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return toIso(d);
}

export function daysBetween(fromIso: string, toIsoDate: string) {
  return Math.round((toDate(toIsoDate).getTime() - toDate(fromIso).getTime()) / DAY_MS);
}

const MONTHS: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
};

export function shortDate(iso: string, lang: Lang = 'en') {
  const d = toDate(iso);
  const m = MONTHS[lang][d.getUTCMonth()];
  return lang === 'es' ? `${d.getUTCDate()} ${m}` : `${m} ${d.getUTCDate()}`;
}

const ANCHOR_WORDS: Record<Lang, Record<NonNullable<RawDue['anchor']>, string>> = {
  en: { release_date: 'your release', document_date: 'the date on the paper', received_date: 'the day you got the paper' },
  es: { release_date: 'su salida', document_date: 'la fecha del papel', received_date: 'el día que recibió el papel' },
};

const NEEDS: Record<Lang, Record<NonNullable<RawDue['anchor']>, string>> = {
  en: { release_date: 'Add your release date to get the exact day', document_date: 'The paper has no date. Ask your case manager for the exact day', received_date: 'Add the day you got this paper to get the exact day' },
  es: { release_date: 'Agregue su fecha de salida para saber el día exacto', document_date: 'El papel no tiene fecha. Pregunte a su administrador de caso el día exacto', received_date: 'Agregue el día que recibió el papel para saber el día exacto' },
};

function offsetWords(raw: RawDue, lang: Lang) {
  const es = lang === 'es';
  if (raw.offsetDays != null && raw.businessDays) return es ? `${raw.offsetDays} días hábiles` : `${raw.offsetDays} business days`;
  if (raw.offsetDays != null) return es ? `${raw.offsetDays} días` : `${raw.offsetDays} days`;
  return es ? `${raw.offsetHours} horas` : `${raw.offsetHours} hours`;
}

export function resolveDue(raw: RawDue, anchors: DateAnchors, lang: Lang = 'en'): DueDate {
  const base: DueDate = { type: raw.type, text: raw.text ?? undefined };

  if (raw.type === 'exact') return { ...base, resolvedDate: raw.exactDate ?? null };
  if (raw.type !== 'relative' || !raw.anchor) return { ...base, type: raw.type === 'relative' ? 'none' : raw.type, resolvedDate: null };

  const due: DueDate = {
    ...base, anchor: raw.anchor,
    offsetHours: raw.offsetHours ?? undefined,
    offsetDays: raw.offsetDays ?? undefined,
    businessDays: raw.businessDays ?? undefined,
  };
  const start = { release_date: anchors.releaseDate, document_date: anchors.documentDate, received_date: anchors.receivedDate }[raw.anchor];
  if (!start) return { ...due, resolvedDate: null, explanation: NEEDS[lang][raw.anchor] };

  let resolved: string | null = null;
  if (raw.offsetDays != null) {
    resolved = raw.businessDays ? addBusinessDays(start, raw.offsetDays) : addDays(start, raw.offsetDays);
  } else if (raw.offsetHours != null) {
    // Whole days only, rounded down: 36 hours after Oct 9 shows Oct 10, the earlier day.
    resolved = addDays(start, Math.floor(raw.offsetHours / 24));
  }
  if (!resolved) return { ...due, resolvedDate: null };

  const after = lang === 'es' ? 'después de' : 'after';
  const on = lang === 'es' ? 'el' : 'on';
  return {
    ...due,
    resolvedDate: resolved,
    explanation: `${offsetWords(raw, lang)} ${after} ${ANCHOR_WORDS[lang][raw.anchor]} ${on} ${shortDate(start, lang)} = ${shortDate(resolved, lang)}`,
  };
}

export interface FinalizeOptions {
  anchors: DateAnchors;
  docType: DocType;
  /** The resident's local date, ISO. */
  today: string;
  language?: string;
}

/** Urgent: due within 7 days (or overdue), or on a parole / probation / court paper. */
export function isUrgent(due: DueDate, docType: DocType, today: string) {
  if (LEGAL_DOC_TYPES.includes(docType)) return true;
  return !!due.resolvedDate && daysBetween(today, due.resolvedDate) <= URGENT_WINDOW_DAYS;
}

/**
 * Raw AI actions → app actions: resolves dates, raises priority where the rules say
 * urgent (never lowers what the model flagged), and orders urgent first, then soonest.
 */
export function finalizeActions(raw: RawAction[], opts: FinalizeOptions): ActionItem[] {
  const lang: Lang = opts.language === 'es' ? 'es' : 'en';
  const items = raw.map(r => {
    const due = resolveDue(r.due, opts.anchors, lang);
    const priority: ActionItem['priority'] = isUrgent(due, opts.docType, opts.today) ? 'urgent' : r.priority;
    return {
      order: r.order,
      title: r.title,
      details: r.details,
      due,
      location: r.location ?? undefined,
      contact: r.contact
        ? { name: r.contact.name ?? undefined, phone: r.contact.phone ?? undefined, email: r.contact.email ?? undefined }
        : undefined,
      bring: r.bring.length ? r.bring : undefined,
      priority,
      consequence: r.consequence ?? undefined,
      sourceQuote: r.sourceQuote,
      sourcePage: r.sourcePage,
      confidence: r.confidence,
      completed: false,
    };
  });

  const rank = { urgent: 0, normal: 1, low: 2 } as const;
  items.sort((a, b) => rank[a.priority] - rank[b.priority]
    || (a.due.resolvedDate ?? '9999').localeCompare(b.due.resolvedDate ?? '9999')
    || a.order - b.order);

  return items.map((a, i) => ({ ...a, id: `a${i + 1}`, order: i + 1 }));
}

/** Re-resolve saved relative dates once a resident adds a missing date (e.g. their release date). */
export function reresolveActions(actions: ActionItem[], opts: FinalizeOptions): ActionItem[] {
  const lang: Lang = opts.language === 'es' ? 'es' : 'en';
  return actions.map(a => {
    if (a.due.type !== 'relative') return a;
    const raw: RawDue = {
      type: 'relative', text: a.due.text ?? null, exactDate: null, anchor: a.due.anchor ?? null,
      offsetHours: a.due.offsetHours ?? null, offsetDays: a.due.offsetDays ?? null,
      businessDays: a.due.businessDays ?? null,
    };
    const due = resolveDue(raw, opts.anchors, lang);
    return { ...a, due, priority: isUrgent(due, opts.docType, opts.today) ? 'urgent' : a.priority };
  });
}
