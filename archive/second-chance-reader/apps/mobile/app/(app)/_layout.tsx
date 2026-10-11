// Everything in (app)/ needs someone logged in; otherwise go to the login screen.
import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../src/session/SessionContext';
import { colors } from '../../src/theme';

export default function AppLayout() {
  const { active } = useSession();
  if (!active) return <Redirect href="/login" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }} />;
}
