import { Center } from '@/components/ui/center';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { AdaptiveSafeArea } from '@/components/adaptive-safe-area';

export default function ScoutingScreen() {
  return (
    <AdaptiveSafeArea>
      <Center className="p-4 flex-1 max-w-2xl self-center w-full">
        <Heading size="3xl">Scouting</Heading>
        <Text className="p-4">Scout teams and players</Text>
      </Center>
    </AdaptiveSafeArea>
  );
}
