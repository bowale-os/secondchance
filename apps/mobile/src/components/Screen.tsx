// Page frame used by every screen: back button, title, and the read-aloud button in
// the same corner; scrolling content; no time limits and no swipe-only gestures.
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors, sizes } from '../theme';
import { AppText } from './AppText';
import { ReadAloudButton } from './ReadAloudButton';
import { useSession } from '../session/SessionContext';

interface Props {
  title: string;
  /** What the speaker button reads. Defaults to the title. */
  speak?: string;
  back?: boolean | (() => void);
  scroll?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function Screen({ title, speak, back, scroll = true, footer, children }: Props) {
  const { touch, active } = useSession();
  const language = active?.settings.language ?? 'en';
  const goBack = typeof back === 'function' ? back : () => (router.canGoBack() ? router.back() : router.replace('/home'));
  const Body = scroll ? ScrollView : View;

  return (
    <SafeAreaView
      style={styles.safe}
      // Any touch counts as activity for the 5-minute auto logout.
      onStartShouldSetResponderCapture={() => { touch(); return false; }}
    >
      <View style={styles.header}>
        {back ? (
          <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel="Go back" style={styles.back}>
            <Ionicons name="arrow-back" size={28} color={colors.ink} />
            <AppText variant="label">Back</AppText>
          </Pressable>
        ) : <View style={styles.backSpacer} />}
        <AppText variant="heading" style={styles.title} accessibilityRole="header" numberOfLines={2}>{title}</AppText>
        <ReadAloudButton text={speak ?? title} language={language} />
      </View>
      <Body style={styles.body} contentContainerStyle={scroll ? styles.content : undefined}>
        {scroll ? children : <View style={[styles.content, { flex: 1 }]}>{children}</View>}
      </Body>
      {footer && <View style={styles.footer}>{footer}</View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: sizes.touch, paddingRight: 6 },
  backSpacer: { width: 4 },
  title: { flex: 1 },
  body: { flex: 1 },
  content: { padding: 16, gap: sizes.gap, maxWidth: 720, width: '100%', alignSelf: 'center' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.line, gap: 10 },
});
