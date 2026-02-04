import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { VStack } from '@/components/ui/vstack';
import { Box } from '@/components/ui/box';
import { Header } from '@/components/Header';

export default function RecordsScreen() {
  return (
    <AdaptiveSafeArea>
      <Box className="flex-1 max-w-2xl self-center w-full">
        <Header title="Records" isMainScreen />
        <VStack space="md" className="px-4">
        </VStack>
      </Box>
    </AdaptiveSafeArea>
  );
}
