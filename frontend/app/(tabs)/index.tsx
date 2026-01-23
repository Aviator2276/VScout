import { Center } from '@/components/ui/center';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { AdaptiveSafeArea } from '@/components/adaptive-safe-area';
import { VStack } from '@/components/ui/vstack';
import { Button, ButtonText } from '@/components/ui/button';

export default function HomeScreen() {
  return (
    <AdaptiveSafeArea>
      <Center className="h-full">
        <VStack space="lg" className="items-center">
          <Heading size="3xl">Home</Heading>
          <Text className="p-4">Welcome to VibeScout</Text>
        </VStack>
      </Center>
    </AdaptiveSafeArea>
  );
}
