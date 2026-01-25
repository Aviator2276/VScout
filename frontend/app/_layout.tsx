import { Stack } from 'expo-router';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { AppProvider } from '@/utils/AppContext';
import '@/utils/db';
import '../global.css';

export default function AppLayout() {
  return (
    <GluestackUIProvider mode="dark">
      <AppProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </AppProvider>
    </GluestackUIProvider>
  );
}
