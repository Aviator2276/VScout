import { Stack } from 'expo-router';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { CompetitionProvider } from '@/utils/CompetitionContext';
import '@/utils/db';
import '../global.css';

export default function AppLayout() {
  return (
    <GluestackUIProvider mode="dark">
      <CompetitionProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </CompetitionProvider>
    </GluestackUIProvider>
  );
}
