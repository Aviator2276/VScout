import { Heading } from '@/components/ui/heading';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Box } from '@/components/ui/box';
import { Card } from '@/components/ui/card';
import { useRouter, useFocusEffect } from 'expo-router';
import { Pressable, ScrollView } from 'react-native';
import {
  Bolt,
  NotebookTabs,
  NotepadText,
  Scale,
  WandSparkles,
} from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Header } from '@/components/Header';
import { RecordsSheet } from '@/components/RecordsSheet';
import { RecordCard } from '@/components/RecordCard';
import { useState, useCallback } from 'react';
import { getAllRecords, UnifiedRecord } from '@/api/records';
import { Text } from '@/components/ui/text';

export default function HomeScreen() {
  const [showRecords, setShowRecords] = useState(false);
  const [latestRecord, setLatestRecord] = useState<UnifiedRecord | null>(null);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      loadLatestRecord();
    }, []),
  );

  async function loadLatestRecord() {
    try {
      const records = await getAllRecords();
      if (records.length > 0) {
        setLatestRecord(records[0]);
      } else {
        setLatestRecord(null);
      }
    } catch (err) {
      console.error('Failed to load latest record:', err);
    }
  }

  return (
    <AdaptiveSafeArea>
      <Box className='flex-1 max-w-2xl self-center w-full'>
        <Header title='Home' isMainScreen />
        <ScrollView
          showsVerticalScrollIndicator={false}
          className='flex-1 px-4'
        >
          <VStack className='gap-2'>
            <VStack space='lg' className='grid grid-cols-2 gap-2'>
              <Pressable>
                <Card variant='filled' className='p-4'>
                  <HStack className='items-center justify-between'>
                    <Heading size='md'>Tutorials</Heading>
                    <Icon as={NotebookTabs} size='lg' />
                  </HStack>
                </Card>
              </Pressable>
              <Pressable onPress={() => router.push('/settings')}>
                <Card variant='filled' className='p-4'>
                  <HStack className='items-center justify-between'>
                    <Heading size='md'>Settings</Heading>
                    <Icon as={Bolt} size='lg' />
                  </HStack>
                </Card>
              </Pressable>
            </VStack>
            <Pressable onPress={() => setShowRecords(true)}>
              <Card variant='filled' className='p-4'>
                <VStack space='sm'>
                  <HStack className='items-center justify-between'>
                    <Heading size='md'>Latest Uploads</Heading>
                    <Icon as={NotepadText} size='md' />
                  </HStack>
                  {latestRecord ? (
                    <RecordCard record={latestRecord} compact />
                  ) : (
                    <Text className='text-typography-500 text-xs'>
                      No records yet
                    </Text>
                  )}
                </VStack>
              </Card>
            </Pressable>
          </VStack>
        </ScrollView>
      </Box>
      <RecordsSheet
        isOpen={showRecords}
        onClose={() => setShowRecords(false)}
      />
    </AdaptiveSafeArea>
  );
}
