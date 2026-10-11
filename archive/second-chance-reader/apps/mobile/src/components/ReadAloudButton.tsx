// The speaker button that sits in the same top-right corner on every screen.
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, sizes } from '../theme';
import { toggleSpeak } from '../tts/speech';
import { AppText } from './AppText';

export function ReadAloudButton({ text, language = 'en' }: { text: string; language?: string }) {
  return (
    <Pressable
      onPress={() => void toggleSpeak(text, language)}
      accessibilityRole="button"
      accessibilityLabel="Read this screen out loud"
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.8 }]}
    >
      <Ionicons name="volume-high" size={26} color={colors.onMoss} />
      <AppText variant="small" style={styles.label}>Read</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minWidth: sizes.touch + 24, minHeight: sizes.touch, borderRadius: sizes.radius, backgroundColor: colors.moss,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12,
  },
  label: { color: colors.onMoss, fontWeight: '700' },
});
