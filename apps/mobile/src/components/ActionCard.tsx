// One step on the to-do list: what to do, when, where, what to bring, who to call,
// the sentence on the paper it came from, and a Done box that can be un-ticked.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ActionItem, Flag } from '@scr/shared';
import { colors, sizes } from '../theme';
import { dueWords, friendlyDate } from '../text/format';
import { AppText } from './AppText';
import { LinkedText } from './LinkedText';
import { FlagNote } from './FlagNote';

interface Props {
  action: ActionItem;
  flags: Flag[];
  today: string;
  language: 'en' | 'es';
  onToggle: (done: boolean) => void;
  docTitle?: string;
}

export function dueLine(a: ActionItem, today: string, language: 'en' | 'es') {
  if (a.due.resolvedDate) return `${friendlyDate(a.due.resolvedDate, language)} · ${dueWords(a.due.resolvedDate, today)}`;
  if (a.due.type === 'relative') return a.due.text ?? 'Date needed';
  return 'No date on the paper';
}

/** What the read-aloud button says for this step. */
export function speakAction(a: ActionItem, today: string, language: 'en' | 'es') {
  return [
    a.priority === 'urgent' ? 'Urgent.' : '',
    `${a.title}.`,
    `${dueLine(a, today, language)}.`,
    a.details,
    a.location ? `Where: ${a.location}.` : '',
    a.bring?.length ? `Bring: ${a.bring.join(', ')}.` : '',
    a.consequence ?? '',
  ].filter(Boolean).join(' ');
}

export function ActionCard({ action: a, flags, today, language, onToggle, docTitle }: Props) {
  const urgent = a.priority === 'urgent' && !a.completed;
  const flagged = flags.map(f => f.value).filter((v): v is string => !!v);
  return (
    <View style={[styles.card, urgent && styles.urgent, a.completed && styles.done]}>
      {urgent && (
        <View style={styles.badge}>
          <Ionicons name="warning" size={20} color={colors.caramel} />
          <AppText variant="label" style={{ fontSize: 18 }}>Urgent</AppText>
        </View>
      )}
      {docTitle && <AppText variant="muted">From: {docTitle}</AppText>}

      <View style={styles.titleRow}>
        <AppText variant="heading" style={[{ flex: 1 }, a.completed && styles.strike]}>{a.title}</AppText>
        <Pressable
          onPress={() => onToggle(!a.completed)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: a.completed }}
          accessibilityLabel={a.completed ? `Mark "${a.title}" not done` : `Mark "${a.title}" done`}
          style={[styles.check, a.completed && styles.checked]}
        >
          <Ionicons name={a.completed ? 'checkmark' : 'square-outline'} size={28} color={a.completed ? colors.onMoss : colors.moss} />
          <AppText variant="small" style={{ color: a.completed ? colors.onMoss : colors.ink, fontWeight: '700' }}>
            {a.completed ? 'Done' : 'Mark done'}
          </AppText>
        </Pressable>
      </View>

      <Row icon="calendar" text={dueLine(a, today, language)} flagged={flagged} strong />
      {a.due.explanation && <AppText variant="muted">{a.due.explanation}</AppText>}
      {!!a.details && <LinkedText text={a.details} flagged={flagged} />}
      {a.location && <Row icon="location" label="Where" text={a.location} flagged={flagged} />}
      {a.bring?.length ? <Row icon="bag-handle" label="Bring" text={a.bring.join(', ')} flagged={flagged} /> : null}
      {a.contact && (a.contact.name || a.contact.phone) && (
        <Row icon="call" label="Contact" text={[a.contact.name, a.contact.phone, a.contact.email].filter(Boolean).join(' · ')} flagged={flagged} />
      )}
      {a.consequence && <Row icon="alert-circle" label="If you don't" text={a.consequence} flagged={flagged} />}

      <FlagNote flags={flags} />

      <View style={styles.source}>
        <AppText variant="small" style={{ color: colors.olive, fontWeight: '700' }}>From your paper, page {a.sourcePage}:</AppText>
        <AppText variant="small" style={{ fontStyle: 'italic' }}>“{a.sourceQuote}”</AppText>
      </View>
    </View>
  );
}

function Row({ icon, label, text, flagged, strong }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; label?: string; text: string; flagged: string[]; strong?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={22} color={colors.moss} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <LinkedText text={label ? `${label}: ${text}` : text} flagged={flagged} variant={strong ? 'label' : 'body'} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: sizes.radius, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.line },
  urgent: { borderLeftWidth: 8, borderLeftColor: colors.caramel, backgroundColor: colors.warnBg },
  done: { opacity: 0.75 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  strike: { textDecorationLine: 'line-through' },
  check: {
    minHeight: sizes.touch, minWidth: sizes.touch, borderRadius: 10, borderWidth: 2, borderColor: colors.moss,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, paddingHorizontal: 8,
  },
  checked: { backgroundColor: colors.moss },
  row: { flexDirection: 'row', gap: 10 },
  source: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, gap: 2 },
});
