import { Heading } from '@/components/ui/heading';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Box } from '@/components/ui/box';
import { Card } from '@/components/ui/card';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView } from 'react-native';
import { Bolt, NotebookTabs } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Header } from '@/components/Header';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <AdaptiveSafeArea>
      <Box className="flex-1 max-w-2xl self-center w-full">
        <Header title="Home" isMainScreen />
        <ScrollView
          showsVerticalScrollIndicator={false}
          className="flex-1 px-4"
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
