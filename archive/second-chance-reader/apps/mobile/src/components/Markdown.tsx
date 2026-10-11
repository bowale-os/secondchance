// Renders the simple version: "## " headings, "- " bullets, and paragraphs. That is all
// the simplify step is asked to produce, so a full markdown library isn't needed.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { LinkedText } from './LinkedText';

type Block = { kind: 'heading' | 'bullet' | 'para'; text: string };

export function parseMarkdown(md: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\*\*|__/g, '').trimEnd();
    if (!line.trim()) continue;
    const h = line.match(/^#{1,6}\s+(.*)/);
    const b = line.match(/^\s*[-*•]\s+(.*)/);
    if (h) blocks.push({ kind: 'heading', text: h[1] });
    else if (b) blocks.push({ kind: 'bullet', text: b[1] });
    else blocks.push({ kind: 'para', text: line.trim() });
  }
  return blocks;
}

export function Markdown({ text, flagged = [] }: { text: string; flagged?: string[] }) {
  return (
    <View style={styles.wrap}>
      {parseMarkdown(text).map((b, i) => {
        if (b.kind === 'heading') return <AppText key={i} variant="heading" accessibilityRole="header" style={i ? styles.gapTop : undefined}>{b.text}</AppText>;
        if (b.kind === 'bullet') {
          return (
            <View key={i} style={styles.bullet}>
              <AppText>•</AppText>
              <View style={{ flex: 1 }}><LinkedText text={b.text} flagged={flagged} /></View>
            </View>
          );
        }
        return <LinkedText key={i} text={b.text} flagged={flagged} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  gapTop: { marginTop: 12 },
  bullet: { flexDirection: 'row', gap: 10, paddingLeft: 4 },
});
