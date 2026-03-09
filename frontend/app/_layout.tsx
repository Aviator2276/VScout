import { Stack } from 'expo-router';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { AppProvider, useApp } from '@/contexts/AppContext';
import { VideoDownloadProvider } from '@/contexts/VideoDownloadContext';
import '@/utils/db';
import '../global.css';

function ThemedApp() {
  const { theme } = useApp();

  return (
    <GluestackUIProvider mode={theme}>
      <Stack screenOptions={{ headerShown: false }}>
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
