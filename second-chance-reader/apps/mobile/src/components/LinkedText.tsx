// Text where phone numbers can be tapped to call, addresses open maps, and values that
// didn't match the original paper are marked "double-check".
import React from 'react';
import { Linking, Platform, type TextStyle } from 'react-native';
import { colors } from '../theme';
import { linkify, mapsUrl } from '../text/linkify';
import { AppText } from './AppText';

interface Props {
  text: string;
  flagged?: string[];
  variant?: React.ComponentProps<typeof AppText>['variant'];
  style?: TextStyle;
}

export function LinkedText({ text, flagged = [], variant = 'body', style }: Props) {
  return (
    <AppText variant={variant} style={style}>
      {linkify(text, flagged).map((seg, i) => {
        switch (seg.kind) {
          case 'phone':
            return (
              <AppText key={i} variant={variant} style={[style, link]} accessibilityRole="link"
                accessibilityHint="Calls this number" onPress={() => Linking.openURL(`tel:${seg.tel}`)}>
                {seg.text}
              </AppText>
            );
          case 'address':
            return (
              <AppText key={i} variant={variant} style={[style, link]} accessibilityRole="link"
                accessibilityHint="Opens this address in maps" onPress={() => Linking.openURL(mapsUrl(seg.text, Platform.OS))}>
                {seg.text}
              </AppText>
            );
          case 'flagged':
            return (
              <AppText key={i} variant={variant} style={[style, flaggedStyle]}
                accessibilityLabel={`${seg.text}, double-check this on your paper`}>
                {seg.text} (double-check)
              </AppText>
            );
          default:
            return seg.text;
        }
      })}
    </AppText>
  );
}

const link: TextStyle = { color: colors.moss, textDecorationLine: 'underline', fontWeight: '700' };
const flaggedStyle: TextStyle = {
  backgroundColor: colors.warnBg, textDecorationLine: 'underline', textDecorationStyle: 'dashed',
  textDecorationColor: colors.caramel, fontWeight: '700',
};
