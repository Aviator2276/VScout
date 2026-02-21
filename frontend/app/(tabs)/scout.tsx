import React from 'react';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { Header } from '@/components/Header';
import { Center } from '@/components/ui/center';

export default function ScoutingScreen() {
  return (
    <AdaptiveSafeArea>
      <Header title='Scouting' isMainScreen />
      <Box className='flex-1 max-w-2xl self-center w-full pt-4'>
        <Center className='flex-1 px-4'>
          <Text className='text-center text-typography-500'>
            Scouting screen coming soon
          </Text>
        </Center>
      </Box>
    </AdaptiveSafeArea>
  );
}
