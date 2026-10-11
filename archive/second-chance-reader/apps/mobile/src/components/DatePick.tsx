// Simple date entry that works the same on every platform: Today / Yesterday buttons,
// or type the date as month/day/year.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { addDays } from '@scr/shared';
import { localToday } from '../api/processStream';
import { parseUsDate } from '../text/format';
import { BigButton } from './BigButton';
import { Field } from './Field';
import { AppText } from './AppText';

export function DatePick({ onPick }: { onPick: (iso: string) => void }) {
  const today = localToday();
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);

  function submit() {
    const iso = parseUsDate(text);
    if (!iso || iso > today) { setBad(true); return; }
    onPick(iso);
  }

  if (typing) {
    return (
      <View style={styles.wrap}>
        <Field label="Date (month/day/year)" hint="For example 10/9/2026" value={text}
          onChangeText={t => { setText(t); setBad(false); }} keyboardType="numbers-and-punctuation" onSubmitEditing={submit} />
        {bad && <AppText variant="label" accessibilityRole="alert">Please type a date like 10/9/2026, not in the future.</AppText>}
        <BigButton icon="checkmark" label="Use this date" onPress={submit} disabled={!text.trim()} />
        <BigButton icon="close" label="Cancel" kind="secondary" onPress={() => setTyping(false)} />
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}><BigButton label="Today" kind="secondary" onPress={() => onPick(today)} /></View>
        <View style={{ flex: 1 }}><BigButton label="Yesterday" kind="secondary" onPress={() => onPick(addDays(today, -1))} /></View>
      </View>
      <BigButton icon="create" label="Type a date" kind="secondary" onPress={() => setTyping(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
});
