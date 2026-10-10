// My Documents: "Upcoming" merges every open step across all papers into one dated list;
// "All Papers" lists papers newest first, with search.
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DOC_TYPE_LABELS, type DocType, type StoredDocument } from '@scr/shared';
import { useActiveSession } from '../../src/session/SessionContext';
import type { UpcomingItem } from '../../src/storage/DocumentRepository';
import { localToday } from '../../src/api/processStream';
import { friendlyDate } from '../../src/text/format';
import { Screen } from '../../src/components/Screen';
import { AppText } from '../../src/components/AppText';
import { Tabs } from '../../src/components/Tabs';
import { Field } from '../../src/components/Field';
import { ActionCard, speakAction } from '../../src/components/ActionCard';
import { confirm } from '../../src/components/confirm';
import { colors, sizes } from '../../src/theme';

export const DOC_TYPE_ICONS: Record<DocType, React.ComponentProps<typeof Ionicons>['name']> = {
  parole_conditions: 'shield-checkmark', probation: 'shield', court_order: 'hammer', benefits: 'cash',
  housing: 'home', employment: 'briefcase', medical: 'medkit', id: 'card', child_support: 'people', other: 'document-text',
};

type Tab = 'upcoming' | 'all';

export default function Documents() {
  const { storage, settings } = useActiveSession();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [docs, setDocs] = useState<StoredDocument[]>([]);
  const [search, setSearch] = useState('');
  const today = localToday();

  const load = useCallback(async () => {
    setUpcoming(await storage.documents.upcoming());
    setDocs((await storage.documents.list({ search: search || undefined, limit: 200 })).items);
  }, [storage, search]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function remove(d: StoredDocument) {
    const yes = await confirm('Delete this paper?', `"${d.title}" and its to-do list will be removed from this device.`, 'Delete');
    if (!yes) return;
    await storage.documents.remove(d.id);
    await load();
  }

  const speak = tab === 'upcoming'
    ? upcoming.length ? `Upcoming steps. ${upcoming.map(a => speakAction(a, today, settings.language)).join(' ')}` : 'Nothing coming up.'
    : `All papers. ${docs.map(d => d.title).join('. ')}`;

  return (
    <Screen title="My Documents" speak={speak} back>
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'upcoming', label: `Upcoming (${upcoming.length})`, icon: 'calendar' },
        { key: 'all', label: 'All Papers', icon: 'folder-open' },
      ]} />

      {tab === 'upcoming' && (upcoming.length === 0
        ? <AppText variant="label">Nothing coming up. Papers you read will show their steps here.</AppText>
        : upcoming.map(a => (
          <Pressable key={`${a.docId}:${a.id}`} onPress={() => router.push(`/results/${a.docId}`)}
            accessibilityHint="Opens the paper this step is from">
            <ActionCard action={a} docTitle={a.docTitle} flags={[]} today={today} language={settings.language}
              onToggle={done => storage.documents.setActionCompleted(a.docId, a.id, done).then(load)} />
          </Pressable>
        )))}

      {tab === 'all' && (
        <View style={{ gap: sizes.gap }}>
          <Field label="Search your papers" value={search} onChangeText={setSearch} placeholder="Word, name, or type" returnKeyType="search" />
          {docs.length === 0 && <AppText variant="label">{search ? 'No papers match that.' : 'No papers yet.'}</AppText>}
          {docs.map(d => {
            const open = d.actions.filter(a => !a.completed);
            const urgent = open.filter(a => a.priority === 'urgent').length;
            return (
              <View key={d.id} style={styles.row}>
                <Pressable style={styles.rowMain} onPress={() => router.push(`/results/${d.id}`)} accessibilityRole="button"
                  accessibilityLabel={`${d.title}, ${DOC_TYPE_LABELS[d.docType]}, ${open.length} steps left`}>
                  <Ionicons name={DOC_TYPE_ICONS[d.docType]} size={32} color={colors.moss} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText variant="label">{d.title}</AppText>
                    <AppText variant="muted">
                      {DOC_TYPE_LABELS[d.docType]} · Read {friendlyDate(localToday(new Date(d.createdAt)))} · {open.length} {open.length === 1 ? 'step' : 'steps'} left
                    </AppText>
                    {urgent > 0 && <AppText variant="label" style={{ fontSize: 16 }}>⚠ {urgent} urgent</AppText>}
                  </View>
                </Pressable>
                <Pressable onPress={() => remove(d)} accessibilityRole="button" accessibilityLabel={`Delete ${d.title}`} style={styles.del}>
                  <Ionicons name="trash" size={24} color={colors.ink} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: sizes.radius, borderWidth: 1, borderColor: colors.line },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 72 },
  del: { width: 56, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: colors.line },
});
