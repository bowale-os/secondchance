import '../src/polyfills';   // first: encryption needs secure random numbers
import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../src/session/SessionContext';
import { CaptureProvider } from '../src/capture/CaptureContext';
import { colors } from '../src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <CaptureProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }} />
        </CaptureProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
