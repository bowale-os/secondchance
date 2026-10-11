// Details for a tapped pin. Closes only with its Close button. Several places in one
// building are listed one after another.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  COUNTY_LABELS, atlantaClock, hoursText, isOpenNow, isStale, periodsOn,
  type Category, type Place, type Weekday,
} from '@scr/shared';
import { colors, sizes } from '../../theme';
import { AppText } from '../../components/AppText';
import { BigButton } from '../../components/BigButton';
import { ReadAloudButton } from '../../components/ReadAloudButton';
import { friendlyDate } from '../../text/format';
import { categoryColor, iconColorOn } from '../theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function placeAddress(p: Place) {
  return `${p.address.street}, ${p.address.city}, GA ${p.address.zip}`;
}

/** Everything the read-aloud button says about one place. */
export function speakPlace(p: Place, category: Category | undefined, now: Date) {
  const open = isOpenNow(p, now);
  const today = atlantaClock(now);
  return [
    `${p.name}. ${category?.label ?? ''}. ${p.buildingType}.`,
    `${open.label}${open.note ? `, ${open.note}` : ''}.`,
    `Today's hours: ${hoursText(periodsOn(p, today.date, today.weekday).periods)}.`,
    `Address: ${placeAddress(p)}, ${COUNTY_LABELS[p.county]} County.`,
    p.phone ? `Phone: ${p.phone}.` : '',
    p.services.length ? `Services: ${p.services.join(', ')}.` : '',
    p.whatToBring?.length ? `Bring: ${p.whatToBring.join(', ')}.` : '',
    isStale(p, now) ? 'This information may be out of date. Call ahead to confirm.' : '',
  ].filter(Boolean).join(' ');
}

export function PlaceInfoCard({ places, categories, now, onClose }: {
  places: Place[]; categories: Category[]; now: Date; onClose: () => void;
}) {
  const catById = new Map(categories.map(c => [c.id, c]));
  return (
    <View style={styles.card} nativeID="place-card" accessibilityLabel="Place details">
      {places.map(p => <PlaceDetails key={p.id} place={p} category={catById.get(p.categoryId)} now={now} />)}
      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <ReadAloudButton text={places.map(p => speakPlace(p, catById.get(p.categoryId), now)).join(' ')} />
        </View>
        <View style={{ flex: 2 }}><BigButton icon="close" label="Close" onPress={onClose} /></View>
      </View>
    </View>
  );
}

function PlaceDetails({ place: p, category, now }: { place: Place; category?: Category; now: Date }) {
  const [allHours, setAllHours] = useState(false);
  const open = isOpenNow(p, now);
  const today = atlantaClock(now);
  const bg = categoryColor(p.categoryId, category?.colorToken);
  const upcoming = p.hoursExceptions.filter(e => e.date >= today.date).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);

  return (
    <View style={styles.place}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: bg }]}>
          <MaterialCommunityIcons name={(category?.icon ?? 'map-marker') as IconName} size={26} color={iconColorOn(bg)} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{p.name}</AppText>
          <AppText variant="muted">{category?.label} — {p.buildingType}</AppText>
        </View>
      </View>

      <View style={[styles.status, open.state === 'closed' ? styles.closed : open.state === 'closing_soon' ? styles.soon : styles.open]}>
        <AppText variant="label">{open.label}{open.note ? ` (${open.note})` : ''}</AppText>
      </View>
      {p.status === 'open' && <AppText>Today: {hoursText(periodsOn(p, today.date, today.weekday).periods)}</AppText>}
      {p.hoursNote && <AppText>{p.hoursNote}</AppText>}

      <BigButton kind="secondary" icon={allHours ? 'chevron-up' : 'time'} label={allHours ? 'Hide hours' : 'See all hours'} onPress={() => setAllHours(v => !v)} />
      {allHours && (
        <View style={styles.box}>
          {([1, 2, 3, 4, 5, 6, 0] as Weekday[]).map(d => (
            <AppText key={d}><AppText variant="label">{DAY_NAMES[d]}: </AppText>{hoursText(p.hours.filter(h => h.day === d))}</AppText>
          ))}
          {upcoming.length > 0 && <AppText variant="label" style={{ marginTop: 6 }}>Coming closures</AppText>}
          {upcoming.map(e => (
            <AppText key={e.date}>{friendlyDate(e.date)}: {e.closed ? 'Closed' : hoursText(e.periods ?? [])}{e.note ? ` (${e.note})` : ''}</AppText>
          ))}
        </View>
      )}

      <AppText selectable>{placeAddress(p)}</AppText>
      <AppText variant="muted">{COUNTY_LABELS[p.county]} County{p.wheelchairAccessible ? ' · Wheelchair accessible' : ''}</AppText>
      {p.phone && <AppText selectable>Phone: {p.phone}</AppText>}

      {p.services.length > 0 && (
        <View style={styles.box}>
          <AppText variant="label">Services</AppText>
          {p.services.map(s => <AppText key={s}>• {s}</AppText>)}
        </View>
      )}
      {p.whatToBring?.length ? <AppText><AppText variant="label">Bring: </AppText>{p.whatToBring.join(', ')}</AppText> : null}

      <AppText variant="muted">Last checked {friendlyDate(p.lastVerified)}, {p.lastVerified.slice(0, 4)}</AppText>
      {isStale(p, now) && <AppText variant="label">This may be out of date. Call ahead to confirm.</AppText>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cream, borderRadius: sizes.radius, borderWidth: 2, borderColor: colors.ink, padding: 14, gap: 14,
  },
  place: { gap: 8 },
  head: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.ink },
  status: { borderRadius: 10, padding: 8, borderLeftWidth: 6 },
  open: { backgroundColor: '#E3EDD9', borderLeftColor: colors.moss },
  soon: { backgroundColor: colors.warnBg, borderLeftColor: colors.caramel },
  closed: { backgroundColor: '#E8E2DC', borderLeftColor: '#6B6B6B' },
  box: { backgroundColor: colors.surface, borderRadius: 10, padding: 10, gap: 2 },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
});
