// Arrows in a cross with Reset in the middle (left), + and – stacked (right).
// Every button is at least 56 × 56 with a text label; one press = one step.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import { AppText } from '../../components/AppText';
import type { PanDirection } from '../geo/viewMath';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  canPan: Record<PanDirection, boolean>;
  canZoomIn: boolean;
  canZoomOut: boolean;
  atStart: boolean;
  onPan: (d: PanDirection) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

export function ControlPad({ canPan, canZoomIn, canZoomOut, atStart, onPan, onZoomIn, onZoomOut, onReset }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.cross}>
        <View style={styles.line}><Btn icon="caret-up" label="Move up" onPress={() => onPan('up')} disabled={!canPan.up} /></View>
        <View style={styles.line}>
          <Btn icon="caret-back" label="Move left" onPress={() => onPan('left')} disabled={!canPan.left} />
          <Btn icon="home" label="Reset" onPress={onReset} disabled={atStart} />
          <Btn icon="caret-forward" label="Move right" onPress={() => onPan('right')} disabled={!canPan.right} />
        </View>
        <View style={styles.line}><Btn icon="caret-down" label="Move down" onPress={() => onPan('down')} disabled={!canPan.down} /></View>
      </View>

      <View style={styles.zoom}>
        <Btn icon="add" label="Zoom in" spoken={canZoomIn ? 'Zoom in' : "Can't zoom in further"} onPress={onZoomIn} disabled={!canZoomIn} />
        <Btn icon="remove" label="Zoom out" spoken={canZoomOut ? 'Zoom out' : "Can't zoom out further"} onPress={onZoomOut} disabled={!canZoomOut} />
      </View>
    </View>
  );
}

function Btn({ icon, label, spoken, onPress, disabled }: {
  icon: IconName; label: string; spoken?: string; onPress: () => void; disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={spoken ?? label}
      accessibilityState={{ disabled }} style={[styles.btn, disabled && styles.off]}>
      <Ionicons name={icon} size={26} color={disabled ? colors.olive : colors.onMoss} />
      <AppText variant="small" style={[styles.label, disabled && { color: colors.ink }]} numberOfLines={2}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 6, gap: 8 },
  cross: { alignItems: 'center' },
  line: { flexDirection: 'row' },
  zoom: { gap: 6 },
  btn: {
    minWidth: 64, minHeight: 56, borderRadius: 12, backgroundColor: colors.moss, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, paddingVertical: 4, margin: 2,
  },
  off: { backgroundColor: colors.line },
  label: { color: colors.onMoss, fontSize: 12, lineHeight: 14, textAlign: 'center', fontWeight: '700' },
});
