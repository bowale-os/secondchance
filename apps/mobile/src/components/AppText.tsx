// All text goes through here so large-text mode scales everything at once.
import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { colors, sizes, LARGE_TEXT_SCALE } from '../theme';
import { useSession } from '../session/SessionContext';

type Variant = 'body' | 'small' | 'label' | 'heading' | 'title' | 'muted';

const VARIANTS: Record<Variant, TextStyle> = {
  body: { fontSize: sizes.body, lineHeight: sizes.body * 1.45, color: colors.ink },
  small: { fontSize: sizes.small, lineHeight: sizes.small * 1.4, color: colors.ink },
  muted: { fontSize: sizes.body, lineHeight: sizes.body * 1.45, color: colors.olive },
  label: { fontSize: sizes.label, lineHeight: sizes.label * 1.3, color: colors.ink, fontWeight: '600' },
  heading: { fontSize: sizes.heading, lineHeight: sizes.heading * 1.25, color: colors.ink, fontWeight: '700' },
  title: { fontSize: sizes.title, lineHeight: sizes.title * 1.2, color: colors.ink, fontWeight: '800' },
};

export function useTextScale() {
  return useSession().active?.settings.largeText ? LARGE_TEXT_SCALE : 1;
}

export function AppText({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
  const scale = useTextScale();
  const base = VARIANTS[variant];
  const scaled = scale === 1 ? base : {
    ...base, fontSize: base.fontSize! * scale, lineHeight: base.lineHeight! * scale,
  };
  return <Text {...props} style={[scaled, style]} />;
}
