import { Center } from '@/components/ui/center';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { AdaptiveSafeArea } from '@/components/adaptive-safe-area';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { Badge, BadgeText } from '@/components/ui/badge';
import { useApp } from '@/utils/AppContext';

export default function ScoutingScreen() {
  const {
    competitionCode,
    serverStatus,
    ping,
    isOnline,
    checkServerConnection,
  } = useApp();
  return (
    <AdaptiveSafeArea>
      <Box className="px-4 pt-4 flex-1 max-w-2xl self-center w-full">
        <VStack space="md">
          <HStack className="items-center justify-between">
            <Heading size="2xl">Records</Heading>
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
        </VStack>
      </Box>
      <Center className="p-4 flex-1 max-w-2xl self-center w-full">
        <Heading size="3xl">Scouting</Heading>
        <Text className="p-4">Scout teams and players</Text>
      </Center>
    </AdaptiveSafeArea>
  );
}
