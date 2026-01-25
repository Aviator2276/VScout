import { Stack } from 'expo-router';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { AppProvider, useApp } from '@/utils/AppContext';
import '@/utils/db';
import '../global.css';

function ThemedApp() {
  const { theme } = useApp();
  
  return (
    <GluestackUIProvider mode={theme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GluestackUIProvider>
  );
}

export default function AppLayout() {
  return (
    <GluestackUIProvider mode="system">
      <AppProvider>
        <ThemedApp />
      </AppProvider>
    </GluestackUIProvider>
  );
}
