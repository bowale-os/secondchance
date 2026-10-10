// Splits text into plain pieces and tappable pieces: phone numbers (tap to call),
// street addresses (tap to open maps), and flagged values (shown as "double-check").

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'phone'; text: string; tel: string }
  | { kind: 'address'; text: string }
  | { kind: 'flagged'; text: string };

const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/g;
const STREET = '(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Pkwy|Parkway|Hwy|Highway)';
const ADDRESS = new RegExp(
  `\\b\\d{1,5}\\s+(?:[A-Z][\\w.'-]*\\s+){1,4}${STREET}\\b\\.?` +
  `(?:,?\\s*(?:Room|Suite|Ste|Apt|Unit|#)\\s*[\\w-]+)?` +
  `(?:,\\s*[A-Z][a-zA-Z.]+(?:\\s[A-Z][a-zA-Z.]+)*)?(?:,\\s*[A-Z]{2})?(?:\\s+\\d{5})?`,
  'g',
);

interface Match { start: number; end: number; seg: Segment }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function linkify(text: string, flaggedValues: string[] = []): Segment[] {
  const matches: Match[] = [];
  const collect = (re: RegExp, make: (m: string) => Segment) => {
    for (const m of text.matchAll(re)) matches.push({ start: m.index!, end: m.index! + m[0].length, seg: make(m[0]) });
  };
  // Flagged values first, so a wrong number is marked rather than made tappable.
  for (const v of flaggedValues.filter(Boolean)) collect(new RegExp(escape(v), 'g'), t => ({ kind: 'flagged', text: t }));
  collect(PHONE, t => ({ kind: 'phone', text: t, tel: t.replace(/[^\d+]/g, '') }));
  collect(ADDRESS, t => ({ kind: 'address', text: t }));

  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Segment[] = [];
  let pos = 0;
  for (const m of matches) {
    if (m.start < pos) continue;   // overlaps an earlier match
    if (m.start > pos) out.push({ kind: 'text', text: text.slice(pos, m.start) });
    out.push(m.seg);
    pos = m.end;
  }
  if (pos < text.length) out.push({ kind: 'text', text: text.slice(pos) });
  return out;
}

/** A maps link that opens the phone's own maps app. */
export function mapsUrl(address: string, os: string) {
  const q = encodeURIComponent(address);
  if (os === 'ios') return `maps:?q=${q}`;
  if (os === 'android') return `geo:0,0?q=${q}`;
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
