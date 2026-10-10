// Results: Listen · Simple Version · To-Do List. The To-Do tab opens first if anything is
// urgent. "Double-check this" notes are shown right where they apply. Every result ends
// with the reminder that this is a helper, not legal advice.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DISCLAIMER, reresolveActions, type StoredDocument } from '@scr/shared';
import { useActiveSession } from '../../../src/session/SessionContext';
import { localToday } from '../../../src/api/processStream';
import { SPEEDS, SentencePlayer, speakableText, splitSentences, stopSpeaking } from '../../../src/tts/speech';
import { Screen } from '../../../src/components/Screen';
import { AppText } from '../../../src/components/AppText';
import { BigButton } from '../../../src/components/BigButton';
import { Tabs } from '../../../src/components/Tabs';
import { Markdown } from '../../../src/components/Markdown';
import { FlagNote } from '../../../src/components/FlagNote';
import { ActionCard, speakAction } from '../../../src/components/ActionCard';
import { DatePick } from '../../../src/components/DatePick';
import { colors, sizes } from '../../../src/theme';

type Tab = 'listen' | 'simple' | 'todo';

export default function Results() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { storage, updateSettings } = useActiveSession();
  const [doc, setDoc] = useState<StoredDocument | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab | null>(null);
  const today = localToday();

  useEffect(() => {
    storage.documents.get(id).then(d => {
      setDoc(d);
      if (d) setTab(t => t ?? (d.actions.some(a => a.priority === 'urgent' && !a.completed) ? 'todo' : 'simple'));
    });
  }, [id, storage]);

  useEffect(() => () => { void stopSpeaking(); }, []);

  const save = useCallback(async (next: StoredDocument) => setDoc(await storage.documents.save(next)), [storage]);

  if (doc === undefined || !tab) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.cream }} size="large" color={colors.moss} />;
  if (doc === null) return <Redirect href="/documents" />;

  const lang = doc.language === 'es' ? 'es' : 'en';
  const docFlags = doc.flags.filter(f => !f.actionId);
  const needsReleaseDate = doc.actions.some(a => a.due.type === 'relative' && a.due.anchor === 'release_date' && !a.due.resolvedDate);
  const openSteps = doc.actions.filter(a => !a.completed).length;

  async function addReleaseDate(iso: string) {
    await updateSettings({ releaseDate: iso });
    await save({
      ...doc!,
      actions: reresolveActions(doc!.actions, {
        anchors: { releaseDate: iso, documentDate: doc!.documentDate }, docType: doc!.docType, today, language: lang,
      }),
    });
  }

  const speakForTab = tab === 'todo'
    ? `${doc.title}. To-do list. ${openSteps} steps left. ${doc.actions.filter(a => !a.completed).map(a => speakAction(a, today, lang)).join(' ')} ${DISCLAIMER}`
    : `${doc.title}. ${speakableText(doc.simplified.markdown)} ${DISCLAIMER}`;

  return (
    <Screen
      title={doc.title}
      speak={speakForTab}
      back={() => router.replace('/home')}
      footer={<AppText variant="small" style={{ color: colors.olive }} accessibilityRole="text">{DISCLAIMER}</AppText>}
    >
      <Tabs<Tab>
        value={tab}
        onChange={t => { void stopSpeaking(); setTab(t); }}
        tabs={[
          { key: 'listen', label: 'Listen', icon: 'headset' },
          { key: 'simple', label: 'Simple Version', icon: 'reader' },
          { key: 'todo', label: `To-Do (${openSteps})`, icon: 'checkbox' },
        ]}
      />

      {docFlags.length > 0 && <FlagNote flags={docFlags} />}

      {tab === 'listen' && <ListenTab text={speakableText(doc.simplified.markdown)} language={lang} />}
      {tab === 'simple' && <SimpleTab doc={doc} flagged={docFlags.map(f => f.value).filter((v): v is string => !!v)} />}
      {tab === 'todo' && (
        <View style={{ gap: sizes.gap }}>
          {needsReleaseDate && (
            <View style={styles.ask}>
              <AppText variant="label">Some dates count from your release date.</AppText>
              <AppText>Add it to see the real day for each step.</AppText>
              <DatePick onPick={addReleaseDate} />
            </View>
          )}
          {doc.actions.length === 0 && <AppText>This paper doesn't ask you to do anything.</AppText>}
          {doc.actions.map(a => (
            <ActionCard
              key={a.id}
              action={a}
              flags={doc.flags.filter(f => f.actionId === a.id)}
              today={today}
              language={lang}
              onToggle={done => storage.documents.setActionCompleted(doc.id, a.id, done).then(d => d && setDoc(d))}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function SimpleTab({ doc, flagged }: { doc: StoredDocument; flagged: string[] }) {
  const [showOriginal, setShowOriginal] = useState(false);
  return (
    <View style={{ gap: sizes.gap }}>
      <View style={styles.card}><Markdown text={doc.simplified.markdown} flagged={flagged} /></View>

      {doc.simplified.glossary.length > 0 && (
        <View style={styles.card}>
          <AppText variant="heading" accessibilityRole="header">Words to know</AppText>
          {doc.simplified.glossary.map(g => (
            <AppText key={g.term}><AppText variant="label">{g.term}: </AppText>{g.meaning}</AppText>
          ))}
        </View>
      )}

      <BigButton icon={showOriginal ? 'eye-off' : 'document-text'} kind="secondary"
        label={showOriginal ? 'Hide the original words' : 'Show the original words'} onPress={() => setShowOriginal(s => !s)} />
      {showOriginal && (
        <View style={styles.card}>
          <AppText variant="muted">Exactly what the paper says, as we read it:</AppText>
          <AppText selectable>{doc.extractedText}</AppText>
        </View>
      )}
    </View>
  );
}

function ListenTab({ text, language }: { text: string; language: string }) {
  const sentences = useMemo(() => splitSentences(text), [text]);
  const [state, setState] = useState({ index: 0, playing: false });
  const [rate, setRate] = useState(1);
  const player = useRef<SentencePlayer | null>(null);

  useEffect(() => {
    player.current = new SentencePlayer(sentences, language, setState);
    return () => player.current?.dispose();
  }, [sentences, language]);

  return (
    <View style={{ gap: sizes.gap }}>
      <View style={styles.controls}>
        <CtlBtn icon="play-back" label="Back 10 seconds" onPress={() => player.current?.back()} />
        <CtlBtn big icon={state.playing ? 'pause' : 'play'} label={state.playing ? 'Pause' : 'Play'}
          onPress={() => (state.playing ? player.current?.pause() : player.current?.play())} />
      </View>
      <View style={styles.speeds} accessibilityRole="radiogroup" accessibilityLabel="Reading speed">
        <AppText variant="label">Speed</AppText>
        {SPEEDS.map(s => (
          <Pressable key={s} onPress={() => { setRate(s); player.current?.setRate(s); }} accessibilityRole="radio"
            accessibilityState={{ checked: rate === s }} accessibilityLabel={`Speed ${s}`} style={[styles.speed, rate === s && styles.speedOn]}>
            <AppText variant="label" style={{ color: rate === s ? colors.onMoss : colors.ink }}>{s}x</AppText>
          </Pressable>
        ))}
      </View>
      <View style={styles.card}>
        <AppText variant="muted">Tap any sentence to start there.</AppText>
        {sentences.map((s, i) => (
          <Pressable key={i} onPress={() => player.current?.jump(i)} accessibilityRole="button" accessibilityHint="Reads from this sentence">
            <AppText style={i === state.index && (state.playing || i > 0) ? styles.current : undefined}>{s}</AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function CtlBtn({ icon, label, onPress, big }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; big?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={[styles.ctl, big && styles.ctlBig]}>
      <Ionicons name={icon} size={big ? 40 : 28} color={colors.onMoss} />
      <AppText variant="small" style={{ color: colors.onMoss, fontWeight: '700' }}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: sizes.radius, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.line },
  ask: { backgroundColor: colors.warnBg, borderLeftWidth: 6, borderLeftColor: colors.caramel, borderRadius: sizes.radius, padding: 16, gap: 10 },
  controls: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  ctl: { flex: 1, minHeight: 72, borderRadius: sizes.radius, backgroundColor: colors.moss, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 8 },
  ctlBig: { flex: 1.4, minHeight: 96 },
  speeds: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  speed: { minWidth: sizes.touch + 12, minHeight: sizes.touch, borderRadius: 10, borderWidth: 2, borderColor: colors.moss, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  speedOn: { backgroundColor: colors.moss },
  current: { backgroundColor: colors.warnBg, fontWeight: '700' },
});
