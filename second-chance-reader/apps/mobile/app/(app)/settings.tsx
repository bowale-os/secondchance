import React, { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { LANGUAGES } from '@scr/shared';
import { useActiveSession } from '../../src/session/SessionContext';
import { LoginFailedError, LockedOutError } from '../../src/storage/ProfileManager';
import { InvalidPinError } from '../../src/storage/KeyVault';
import { friendlyDate } from '../../src/text/format';
import { Screen } from '../../src/components/Screen';
import { AppText } from '../../src/components/AppText';
import { BigButton } from '../../src/components/BigButton';
import { Field } from '../../src/components/Field';
import { DatePick } from '../../src/components/DatePick';
import { confirm } from '../../src/components/confirm';
import { colors, sizes } from '../../src/theme';

export default function Settings() {
  const { profile, settings, updateSettings, storage, changePin, deleteProfile, logout } = useActiveSession();
  const [editingRelease, setEditingRelease] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pins, setPins] = useState({ current: '', next: '', again: '' });
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function savePin() {
    setPinMsg(null);
    if (pins.next !== pins.again) { setPinMsg("The new PINs don't match."); return; }
    setBusy(true);
    try {
      await changePin(pins.current, pins.next);
      setPins({ current: '', next: '', again: '' });
      setPinOpen(false);
      setPinMsg('Your PIN is changed. Use the new one next time.');
    } catch (e) {
      setPinMsg(e instanceof InvalidPinError ? 'A PIN must be 4 to 6 numbers.'
        : e instanceof LockedOutError ? 'Too many tries. Please wait, then try again.'
        : e instanceof LoginFailedError ? 'Your current PIN is not right.'
        : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocs() {
    if (!(await confirm('Delete all your papers?', 'Every paper and to-do list you saved will be removed from this device. This cannot be undone.', 'Delete all'))) return;
    await storage.documents.deleteEverything();
    router.replace('/home');
  }

  async function deleteMe() {
    if (!(await confirm('Delete your profile?', 'Your name, PIN, and every paper you saved will be removed from this device. This cannot be undone.', 'Delete profile'))) return;
    await deleteProfile();
  }

  return (
    <Screen title="Settings" speak="Settings. Change your language, text size, release date, or PIN. You can also log out or delete your papers." back>
      <Section title={`Logged in as ${profile.displayName}`}>
        <BigButton icon="log-out" label="Log out" kind="secondary" onPress={logout} />
      </Section>

      <Section title="Show results in">
        <View style={styles.row}>
          {LANGUAGES.map(l => (
            <View key={l.code} style={{ flex: 1 }}>
              <BigButton label={l.label} kind={settings.language === l.code ? 'primary' : 'secondary'} onPress={() => updateSettings({ language: l.code })} />
            </View>
          ))}
        </View>
      </Section>

      <Section title="Reading">
        <Toggle label="Large text" value={settings.largeText} onChange={v => updateSettings({ largeText: v })} />
        <Toggle label="Log me out after 5 minutes of no use" hint="Keep this on if other people use this device."
          value={settings.autoLogout} onChange={v => updateSettings({ autoLogout: v })} />
      </Section>

      <Section title="Release date">
        <AppText>{settings.releaseDate ? `${friendlyDate(settings.releaseDate)}, ${settings.releaseDate.slice(0, 4)}` : 'Not added.'}</AppText>
        {editingRelease
          ? <DatePick onPick={async iso => { await updateSettings({ releaseDate: iso }); setEditingRelease(false); }} />
          : <BigButton icon="create" label={settings.releaseDate ? 'Change' : 'Add'} kind="secondary" onPress={() => setEditingRelease(true)} />}
      </Section>

      <Section title="PIN">
        {pinOpen ? (
          <>
            <Field label="Current PIN" pin value={pins.current} onChangeText={t => setPins({ ...pins, current: t.replace(/\D/g, '') })} />
            <Field label="New PIN" pin value={pins.next} onChangeText={t => setPins({ ...pins, next: t.replace(/\D/g, '') })} />
            <Field label="New PIN again" pin value={pins.again} onChangeText={t => setPins({ ...pins, again: t.replace(/\D/g, '') })} />
            <BigButton icon="key" label="Save new PIN" onPress={savePin} busy={busy}
              disabled={pins.current.length < 4 || pins.next.length < 4 || pins.again.length < 4} />
            <BigButton icon="close" label="Cancel" kind="secondary" onPress={() => { setPinOpen(false); setPinMsg(null); }} />
          </>
        ) : <BigButton icon="key" label="Change my PIN" kind="secondary" onPress={() => setPinOpen(true)} />}
        {pinMsg && <AppText variant="label" accessibilityRole="alert">{pinMsg}</AppText>}
      </Section>

      <Section title="Delete">
        <BigButton icon="trash" label="Delete all my papers" kind="danger" onPress={deleteDocs} />
        <BigButton icon="person-remove" label="Delete my profile" kind="danger" onPress={deleteMe} />
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <AppText variant="heading" accessibilityRole="header">{title}</AppText>
      {children}
    </View>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1 }}>
        <AppText variant="label">{label}</AppText>
        {hint && <AppText variant="muted">{hint}</AppText>}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label}
        trackColor={{ true: colors.moss, false: colors.line }} thumbColor={colors.surface}
        // Web-only props: without them react-native-web draws its default teal.
        {...({ activeThumbColor: colors.surface, activeTrackColor: colors.moss } as object)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: sizes.radius, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: 'row', gap: 10 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: sizes.touch },
});
