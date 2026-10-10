// Three big buttons and the next thing due.
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { ACCEPTED_MIME_TYPES } from '@scr/shared';
import { useActiveSession } from '../../src/session/SessionContext';
import { useCapture } from '../../src/capture/CaptureContext';
import { prepareFile, UnsupportedFileError } from '../../src/capture/prepare';
import type { UpcomingItem } from '../../src/storage/DocumentRepository';
import { localToday } from '../../src/api/processStream';
import { dueLine } from '../../src/components/ActionCard';
import { Screen } from '../../src/components/Screen';
import { AppText } from '../../src/components/AppText';
import { BigButton } from '../../src/components/BigButton';
import { colors, sizes } from '../../src/theme';

export default function Home() {
  const { profile, storage, settings, logout } = useActiveSession();
  const capture = useCapture();
  const [next, setNext] = useState<UpcomingItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = localToday();

  useFocusEffect(useCallback(() => {
    storage.documents.upcoming().then(items => setNext(items[0] ?? null));
  }, [storage]));

  async function upload() {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: [...ACCEPTED_MIME_TYPES, 'image/*'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    setBusy(true);
    try {
      const pages = [];
      for (const a of res.assets) pages.push(await prepareFile(a));
      capture.clear();
      capture.add(pages);
      router.push('/confirm');
    } catch (e) {
      setError(e instanceof UnsupportedFileError ? e.message : "We couldn't open that file. Try taking a photo instead.");
    } finally {
      setBusy(false);
    }
  }

  const nextText = next ? `Next: ${next.title}. ${dueLine(next, today, settings.language)}.` : 'Nothing due right now.';

  return (
    <Screen
      title={`Hi, ${profile.displayName.split(' ')[0]}`}
      speak={`Hi ${profile.displayName}. ${nextText} You can take a photo of a paper, upload a file, or open your documents.`}
    >
      <BigButton big icon="camera" label="Take a Photo" onPress={() => { capture.clear(); router.push('/capture'); }} />
      <BigButton big icon="document-attach" label="Upload a File" onPress={upload} busy={busy} />
      <BigButton big icon="folder-open" label="My Documents" kind="secondary" onPress={() => router.push('/documents')} />

      {error && <View style={styles.error} accessibilityRole="alert"><AppText variant="label">{error}</AppText></View>}

      <View style={[styles.next, next?.priority === 'urgent' && styles.nextUrgent]}>
        <Ionicons name={next ? 'calendar' : 'checkmark-circle'} size={30} color={next?.priority === 'urgent' ? colors.caramel : colors.moss} />
        <View style={{ flex: 1, gap: 2 }}>
          {next ? (
            <>
              <AppText variant="label">Next: {next.title}</AppText>
              <AppText>{dueLine(next, today, settings.language)}</AppText>
              <AppText variant="muted">From: {next.docTitle}</AppText>
            </>
          ) : <AppText variant="label">Nothing due right now.</AppText>}
        </View>
      </View>
      {next && <BigButton icon="list" label="See all upcoming steps" kind="secondary" onPress={() => router.push('/documents')} />}

      <View style={styles.bottom}>
        <View style={{ flex: 1 }}><BigButton icon="settings" label="Settings" kind="secondary" onPress={() => router.push('/settings')} /></View>
        <View style={{ flex: 1 }}><BigButton icon="log-out" label="Log out" kind="secondary" onPress={logout} /></View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  next: {
    flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.surface, borderRadius: sizes.radius,
    padding: 16, borderWidth: 1, borderColor: colors.line, marginTop: 8,
  },
  nextUrgent: { backgroundColor: colors.warnBg, borderLeftWidth: 8, borderLeftColor: colors.caramel },
  error: { backgroundColor: colors.warnBg, borderLeftWidth: 6, borderLeftColor: colors.caramel, borderRadius: sizes.radius, padding: 14 },
  bottom: { flexDirection: 'row', gap: 12, marginTop: 16 },
});
