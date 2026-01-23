import { Stack, useRouter, useSegments } from 'expo-router';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { useEffect, useState } from 'react';
import { getCompetitionCode } from '@/utils/storage';
import '../global.css';

export default function AppLayout() {
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    checkOnboarding();
  }, []);

  useEffect(() => {
    if (!isReady) return;

    const inOnboarding = segments[0] === 'onboarding';

    getCompetitionCode().then((code) => {
      if (!code && !inOnboarding) {
        router.replace('/onboarding');
      } else if (code && inOnboarding) {
        router.replace('/(tabs)');
      }
    });
  }, [isReady, segments]);

  async function checkOnboarding() {
    try {
      const code = await getCompetitionCode();
      if (!code) {
        router.replace('/onboarding');
      }
    } catch (error) {
      console.error('Failed to check onboarding status:', error);
    } finally {
      setIsReady(true);
    }
  }

  return (
    <GluestackUIProvider mode="dark">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GluestackUIProvider>
  );
}