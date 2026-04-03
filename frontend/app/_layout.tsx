import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { AppProvider, useApp } from '@/contexts/AppContext';
import { VideoDownloadProvider } from '@/contexts/VideoDownloadContext';
import { ActivityIndicator, View } from 'react-native';
import '@/utils/db';
import '../global.css';

function ThemedApp() {
  const { theme, onboardingComplete } = useApp();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (onboardingComplete === null) return; // still loading

    const onOnboarding = segments[0] === 'onboarding';

    if (!onboardingComplete && !onOnboarding) {
      router.replace('/onboarding');
    } else if (onboardingComplete && onOnboarding) {
      router.replace('/(tabs)');
    }
  }, [onboardingComplete, segments]);

  // Show loading while onboarding state is being read
  if (onboardingComplete === null) {
    return (
      <GluestackUIProvider mode={theme}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size='large' />
        </View>
      </GluestackUIProvider>
    );
  }

  return (
    <GluestackUIProvider mode={theme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name='onboarding' options={{ animation: 'none' }} />
        <Stack.Screen name='(tabs)' />
        <Stack.Screen name='scout-live' options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name='scout-video' options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </GluestackUIProvider>
  );
}

export default function AppLayout() {
  return (
    <GluestackUIProvider mode='system'>
      <AppProvider>
        <VideoDownloadProvider>
          <ThemedApp />
        </VideoDownloadProvider>
      </AppProvider>
    </GluestackUIProvider>
  );
}
