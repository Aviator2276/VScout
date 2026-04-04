import React from 'react';
import { Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { Header } from '@/components/Header';
import { Center } from '@/components/ui/center';
import { Icon } from '@/components/ui/icon';
import { Handshake } from 'lucide-react-native';

export default function ScoutingScreen() {
  const router = useRouter();

  return (
    <AdaptiveSafeArea>
      <Header title='Scouting' isMainScreen />
      <Box className='flex-1 max-w-2xl self-center w-full'>
        <ScrollView
          showsVerticalScrollIndicator={false}
          className='flex-1 px-4 pt-4'
        >
          <VStack className='gap-2'>
            <Pressable onPress={() => router.push('/alliance-selection')}>
              <Card variant='filled' className='p-4'>
                <HStack className='items-center justify-between'>
                  <Heading size='md'>Alliance Selection</Heading>
                  <Icon as={Handshake} size='lg' />
                </HStack>
              </Card>
            </Pressable>
            <Center className='py-8'>
              <Text className='text-center text-sm text-typography-400'>
                More scouting tools coming soon
              </Text>
            </Center>
          </VStack>
        </ScrollView>
      </Box>
    </AdaptiveSafeArea>
  );
}
