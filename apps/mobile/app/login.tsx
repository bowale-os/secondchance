// First use: privacy notice, then name + PIN to set up. After that: name + PIN to log in.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSession } from '../src/session/SessionContext';
import { Screen } from '../src/components/Screen';
import { AppText } from '../src/components/AppText';
import { Field } from '../src/components/Field';
import { BigButton } from '../src/components/BigButton';
import {
  InvalidNameError, LockedOutError, LoginFailedError, NameAndPinTakenError,
} from '../src/storage/ProfileManager';
import { InvalidPinError } from '../src/storage/KeyVault';
import { colors, sizes } from '../src/theme';

const PRIVACY_NOTICE =
  'Your papers stay private. They are saved only on this device, locked with your name and PIN. ' +
  'Staff cannot see them. When you read a paper, it is sent over the internet to an AI service ' +
  'that reads it. Our server does not save it. This app is a helper, not legal advice. ' +
  // TODO(launch): once the AI provider's zero-data-retention agreement is confirmed, say so here.
  'Write your PIN down somewhere safe. If you forget it, nobody can open your saved papers, not even staff.';

function errorMessage(e: unknown) {
  if (e instanceof LockedOutError) {
    const s = Math.ceil(e.retryAfterMs / 1000);
    return `Too many tries. Please wait ${s >= 90 ? `${Math.ceil(s / 60)} minutes` : `${s} seconds`}, then try again.`;
  }
  if (e instanceof LoginFailedError) {
    return e.attemptsLeft !== undefined && e.attemptsLeft <= 2
      ? `That name and PIN don't match. ${e.attemptsLeft} ${e.attemptsLeft === 1 ? 'try' : 'tries'} left before a short wait.`
      : "That name and PIN don't match. Check your spelling and try again.";
  }
  if (e instanceof NameAndPinTakenError) return e.message;
  if (e instanceof InvalidNameError) return 'Please type your name.';
  if (e instanceof InvalidPinError) return 'Your PIN must be 4 to 6 numbers.';
  return 'Something went wrong. Please try again.';
}

export default function Login() {
  const { ready, active, hasProfiles, login, createProfile } = useSession();
  const [mode, setMode] = useState<'login' | 'create'>('login');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (ready && !hasProfiles) setMode('create'); }, [ready, hasProfiles]);

  if (active) return <Redirect href="/home" />;
  if (!ready) return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.moss} />;

  const creating = mode === 'create';

  async function submit() {
    setError(null);
    if (creating && pin !== pin2) { setError("The two PINs don't match. Please type them again."); return; }
    setBusy(true);
    try {
      await (creating ? createProfile(name, pin) : login(name, pin));
    } catch (e) {
      setError(errorMessage(e));
      setPin('');
      setPin2('');
    } finally {
      setBusy(false);
    }
  }

  const switchTo = (m: 'login' | 'create') => { setMode(m); setError(null); setPin(''); setPin2(''); };

  return (
    <Screen
      title={creating ? 'Welcome' : 'Log in'}
      speak={creating
        ? `Welcome to Second Chance Reader. ${PRIVACY_NOTICE} To start, type your name, then pick a PIN of 4 to 6 numbers.`
        : 'Log in. Type your name and your PIN.'}
    >
      {creating && (
        <View style={styles.notice}>
          <AppText variant="label">Before you start</AppText>
          <AppText>{PRIVACY_NOTICE}</AppText>
        </View>
      )}

      <Field label="Your name" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name"
        textContentType="name" returnKeyType="next" placeholder="First and last name" />
      <Field label={creating ? 'Pick a PIN (4 to 6 numbers)' : 'Your PIN'} pin value={pin}
        onChangeText={t => setPin(t.replace(/\D/g, ''))} onSubmitEditing={creating ? undefined : submit} />
      {creating && (
        <Field label="Type the same PIN again" pin value={pin2}
          onChangeText={t => setPin2(t.replace(/\D/g, ''))} onSubmitEditing={submit} />
      )}

      {error && (
        <View style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <AppText variant="label">{error}</AppText>
        </View>
      )}

      <BigButton
        big
        icon={creating ? 'checkmark-circle' : 'log-in'}
        label={creating ? 'I agree. Set me up' : 'Log in'}
        onPress={submit}
        busy={busy}
        disabled={!name.trim() || pin.length < 4 || (creating && pin2.length < 4)}
      />
      {busy && <AppText variant="muted">Unlocking your papers. This can take a few seconds…</AppText>}

      <Pressable onPress={() => switchTo(creating ? 'login' : 'create')} accessibilityRole="button" style={styles.switch}>
        <AppText variant="label" style={styles.switchText}>
          {creating ? 'I already have a name and PIN' : "I'm new here, or I forgot my PIN"}
        </AppText>
      </Pressable>
      {!creating && (
        <AppText variant="muted">
          Forgot your PIN? Set up again with your name and a new PIN. Your old papers can't be opened without the old PIN.
        </AppText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: colors.surface, borderRadius: sizes.radius, padding: 16, gap: 8, borderWidth: 1, borderColor: colors.line },
  error: { backgroundColor: colors.warnBg, borderLeftWidth: 6, borderLeftColor: colors.caramel, borderRadius: sizes.radius, padding: 14 },
  switch: { minHeight: sizes.touch, justifyContent: 'center' },
  switchText: { color: colors.moss, textDecorationLine: 'underline' },
});
