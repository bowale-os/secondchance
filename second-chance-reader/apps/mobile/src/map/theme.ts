// Resource Map colors. Category colors were picked by a search for ten hues that full-color
// readers can tell apart (worst pair OKLab ΔE 15.4), checked with the data-viz palette
// validator. Ten hues can't all stay apart for color-blind readers, so color is never the
// only signal: every pin carries its category icon, has a dark outline, and the legend
// names each category.
import { colors } from '../theme';

export const CATEGORY_COLORS: Record<string, string> = {
  courts: '#044CB6',
  probation_parole: '#A2080C',
  id_license: '#1E85D4',
  benefits: '#C378EE',
  legal_help: '#92339B',
  health_recovery: '#089772',
  housing_shelter: '#E39F20',
  food: '#F86680',
  jobs_training: '#9E7B0B',
  libraries_computers: '#2BC5C7',
};

export const FALLBACK_CATEGORY_COLOR = colors.olive;

export const mapColors = {
  land: '#FBF1E8',          // inside the five counties
  outside: '#D9CFC4',       // grayed-out area beyond them
  countyLine: colors.moss,
  pinOutline: colors.ink,
  selected: colors.ink,
  cluster: colors.moss,
  clusterText: colors.onMoss,
  closedMark: '#6B6B6B',
};

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** White or dark-brown icon, whichever reads better on this pin color. */
export function iconColorOn(bg: string) {
  const L = luminance(bg);
  return contrast(1, L) >= contrast(luminance(colors.ink), L) ? '#FFFFFF' : colors.ink;
}

export const categoryColor = (id: string, token?: string) =>
  CATEGORY_COLORS[token ?? id] ?? CATEGORY_COLORS[id] ?? FALLBACK_CATEGORY_COLOR;
