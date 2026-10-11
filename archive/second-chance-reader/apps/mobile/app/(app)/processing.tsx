// Plain progress steps while the paper is read; each ticks off as its result arrives.
// When everything is in, the paper is saved on the device and the results open.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { ProgressStage } from '@scr/shared';
import { useActiveSession } from '../../src/session/SessionContext';
import { useCapture } from '../../src/capture/CaptureContext';
import { localToday, processDocument } from '../../src/api/processStream';
import { ResultCollector, saveProcessedDocument } from '../../src/documents/buildDocument';
import { Screen } from '../../src/components/Screen';
import { AppText } from '../../src/components/AppText';
import { BigButton } from '../../src/components/BigButton';
import { colors, sizes } from '../../src/theme';

const STEPS: { label: string; startsAt: ProgressStage; doneAt: ProgressStage }[] = [
  { label: 'Reading your page…', startsAt: 'reading', doneAt: 'extracted' },
  { label: 'Figuring out what this paper is…', startsAt: 'extracted', doneAt: 'classified' },
  { label: 'Making it simpler…', startsAt: 'simplifying', doneAt: 'simplified' },
  { label: 'Finding your to-do list…', startsAt: 'finding_actions', doneAt: 'actions' },
  { label: 'Saving it on this device…', startsAt: 'done', doneAt: 'done' },
];

export default function Processing() {
  const { profile, storage, settings } = useActiveSession();
  const capture = useCapture();
  const [seen, setSeen] = useState<Set<ProgressStage>>(new Set());
  const [saved, setSaved] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const [retake, setRetake] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

  useEffect(() => {
    if (!capture.pages.length || started.current === attempt) return;
    started.current = attempt;   // one request per attempt
    const abort = new AbortController();
    const result = new ResultCollector();
    const uploads = capture.pages.map(({ name, mimeType, dataBase64 }) => ({ name, mimeType, dataBase64 }));

    processDocument(
      { files: uploads, language: settings.language, today: localToday(), releaseDate: settings.releaseDate, receivedDate: localToday() },
      e => {
        if (abort.signal.aborted) return;
        result.add(e);
        setSeen(s => new Set(s).add(e.stage));
        if (e.stage === 'classified') setTitle(e.meta.title);
        if (e.stage === 'retake_suggested') setRetake(e.pages);
        if (e.stage === 'error') setError(e.message);
        if (e.stage === 'done') {
          saveProcessedDocument(storage, profile.id, result, uploads, settings.language)
            .then(doc => {
              setSaved(true);
              capture.clear();
              router.replace(`/results/${doc.id}`);
            })
            .catch(() => setError("We read your paper but couldn't save it on this device. Please try again."));
        }
      },
      { signal: abort.signal },
    );
    return () => {
      abort.abort();
      started.current = -1;   // if React re-runs this effect, start the request again
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (!capture.pages.length && !saved) return <Redirect href="/home" />;

  const stepState = (i: number) => {
    const s = STEPS[i];
    if (s.doneAt === 'done' ? saved : seen.has(s.doneAt)) return 'done';
    return seen.has(s.startsAt) || (i === 0 && !error) ? 'active' : 'waiting';
  };

  return (
    <Screen
      title={error ? 'That didn’t work' : 'Reading your paper'}
      speak={error ?? 'Reading your paper. This takes about a minute. Your results will open when they are ready.'}
      back={error ? true : undefined}
    >
      {title && <AppText variant="heading">{title}</AppText>}

      <View style={styles.steps} accessibilityLiveRegion="polite">
        {STEPS.map((s, i) => {
          const st = stepState(i);
          return (
            <View key={s.label} style={styles.step}>
              {st === 'done' && <Ionicons name="checkmark-circle" size={30} color={colors.moss} accessibilityLabel="Done" />}
              {st === 'active' && !error && <ActivityIndicator color={colors.moss} style={{ width: 30 }} />}
              {(st === 'waiting' || (st === 'active' && error)) && <Ionicons name="ellipse-outline" size={30} color={colors.line} />}
              <AppText variant={st === 'waiting' ? 'muted' : 'label'}>{st === 'done' ? s.label.replace('…', '') : s.label}</AppText>
            </View>
          );
        })}
      </View>

      {retake.length > 0 && !error && (
        <View style={styles.note}>
          <AppText variant="label">
            {retake.length === 1 ? `Page ${retake[0]} was` : `Pages ${retake.join(', ')} were`} hard to read.
          </AppText>
          <AppText>We'll keep going. Check those parts against your paper, or take the photo again later.</AppText>
        </View>
      )}

      {error && (
        <View style={{ gap: 12 }}>
          <View style={styles.note} accessibilityRole="alert"><AppText variant="label">{error}</AppText></View>
          <BigButton big icon="refresh" label="Try again" onPress={() => { setError(null); setSeen(new Set()); setRetake([]); setAttempt(a => a + 1); }} />
          <BigButton icon="home" label="Start over" kind="secondary" onPress={() => { capture.clear(); router.replace('/home'); }} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  steps: { backgroundColor: colors.surface, borderRadius: sizes.radius, padding: 16, gap: 16, borderWidth: 1, borderColor: colors.line },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36 },
  note: { backgroundColor: colors.warnBg, borderLeftWidth: 6, borderLeftColor: colors.caramel, borderRadius: sizes.radius, padding: 14, gap: 6 },
});
