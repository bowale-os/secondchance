import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSession } from '../src/session/SessionContext';
import { colors } from '../src/theme';

export default function Index() {
  const { ready, active } = useSession();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream }}>
        <ActivityIndicator size="large" color={colors.moss} accessibilityLabel="Loading" />
      </View>
    );
  }
  return <Redirect href={active ? '/home' : '/login'} />;
}
