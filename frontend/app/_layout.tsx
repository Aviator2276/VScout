import { Stack, useRouter, useSegments } from 'expo-router';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { useEffect, useState } from 'react';
import { getCompetitionCode } from '@/utils/storage';
import '../global.css';

export default function AppLayout() {
  return (
    <GluestackUIProvider mode="dark">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GluestackUIProvider>
  );
}
