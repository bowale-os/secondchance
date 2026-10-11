// One quick question, only when needed: the release date, asked once and remembered,
// so "within 72 hours of release" becomes a real date. Skippable.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { LANGUAGES } from '@scr/shared';
import { useActiveSession } from '../../src/session/SessionContext';
import { useCapture } from '../../src/capture/CaptureContext';
import { friendlyDate } from '../../src/text/format';
import { Screen } from '../../src/components/Screen';
import { AppText } from '../../src/components/AppText';
import { BigButton } from '../../src/components/BigButton';
import { DatePick } from '../../src/components/DatePick';
import { colors, sizes } from '../../src/theme';

export default function Confirm() {
  const { settings, updateSettings } = useActiveSession();
  const { pages } = useCapture();
  const [asking, setAsking] = useState(settings.releaseDate === null);
  const [skipped, setSkipped] = useState(false);

  if (!pages.length) return <Redirect href="/home" />;

  const count = `${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`;
  const showQuestion = asking && !skipped;

  return (
    <Screen
      title="Almost ready"
      speak={showQuestion
        ? `You have ${count}. One quick question: when were you released? This helps us turn deadlines like "within 72 hours of release" into real dates. You can skip this.`
        : `You have ${count}. Tap Read my paper.`}
      back
      footer={!showQuestion && <BigButton big icon="sparkles" label="Read my paper" onPress={() => router.replace('/processing')} />}
    >
      <AppText variant="label">You have {count} ready.</AppText>

      {showQuestion ? (
        <View style={styles.card}>
          <AppText variant="heading">When were you released?</AppText>
          <AppText variant="muted">
            Some papers say things like "within 72 hours of release." Your release date lets us show the real day. We only ask once.
          </AppText>
          <DatePick onPick={async iso => { await updateSettings({ releaseDate: iso }); setAsking(false); }} />
          <BigButton icon="play-skip-forward" label="Skip for now" kind="secondary" onPress={() => setSkipped(true)} />
        </View>
      ) : (
        <View style={styles.card}>
          <AppText>
            {settings.releaseDate ? `Your release date: ${friendlyDate(settings.releaseDate)}, ${settings.releaseDate.slice(0, 4)}` : 'No release date added.'}
          </AppText>
          <BigButton icon="create" label={settings.releaseDate ? 'Change release date' : 'Add release date'}
            kind="secondary" onPress={() => { setSkipped(false); setAsking(true); }} />
        </View>
      )}

      <View style={styles.card}>
        <AppText variant="label">Show my results in</AppText>
        <View style={styles.row}>
          {LANGUAGES.map(l => (
            <View key={l.code} style={{ flex: 1 }}>
              <BigButton label={l.label} kind={settings.language === l.code ? 'primary' : 'secondary'}
                onPress={() => updateSettings({ language: l.code })} />
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: sizes.radius, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', gap: 10 },
});
