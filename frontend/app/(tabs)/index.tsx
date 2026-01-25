import { Center } from '@/components/ui/center';
import { Heading } from '@/components/ui/heading';
import { AdaptiveSafeArea } from '@/components/adaptive-safe-area';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { useApp } from '@/utils/AppContext';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { Badge, BadgeText } from '@/components/ui/badge';
import { Box } from '@/components/ui/box';
import { Card } from '@/components/ui/card';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView } from 'react-native';
import { Bolt, NotebookTabs } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';

export default function HomeScreen() {
  const {
    competitionCode,
    serverStatus,
    ping,
    isOnline,
    checkServerConnection,
  } = useApp();
  const router = useRouter();

  return (
    <AdaptiveSafeArea>
      <Box className="px-4 pt-4 flex-1 max-w-2xl self-center w-full">
        <HStack className="items-center justify-between mb-2">
          <Heading size="2xl">Home</Heading>
          <HStack className="gap-1">
            <Center>
              <ConnectionStatus
                ping={ping}
                isOnline={isOnline}
                serverStatus={serverStatus}
                onPress={checkServerConnection}
                size="lg"
              />
            </Center>
            <Badge size="lg" variant="solid" action="info">
              <BadgeText>{competitionCode || 'N/A'}</BadgeText>
            </Badge>
          </HStack>
        </HStack>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          className="flex-1"
        >
          <VStack space="lg" className="grid grid-cols-2 gap-2">
            <Pressable>
              <Card variant="filled" className="p-4">
                <HStack className="items-center justify-between">
                  <Heading size="md">Tutorials</Heading>
                  <Icon as={NotebookTabs} size="lg" />
                </HStack>
              </Card>
            </Pressable>
            <Pressable onPress={() => router.push('/settings')}>
              <Card variant="filled" className="p-4">
                <HStack className="items-center justify-between">
                  <Heading size="md">Settings</Heading>
                  <Icon as={Bolt} size="lg" />
                </HStack>
              </Card>
            </Pressable>
          </VStack>
        </ScrollView>
      </Box>
    </AdaptiveSafeArea>
  );
}
