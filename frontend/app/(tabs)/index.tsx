import { Heading } from '@/components/ui/heading';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Box } from '@/components/ui/box';
import { Card } from '@/components/ui/card';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import {
  Bolt,
  NotebookTabs,
  NotepadText,
} from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Header } from '@/components/Header';
import { RecordsSheet } from '@/components/RecordsSheet';
import { RecordCard } from '@/components/RecordCard';
import { useState, useMemo } from 'react';
import { Text } from '@/components/ui/text';
import { useRecords } from '@/hooks/useRecords';

export default function HomeScreen() {
  const [showRecords, setShowRecords] = useState(false);
  const router = useRouter();
  const { records } = useRecords();

  // Get the latest 3 records
  const latestRecords = useMemo(() => records.slice(0, 3), [records]);

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
                  {latestRecords.length > 0 ? (
                    <View className='relative'>
                      {latestRecords.map((record, index) => (
                        <View
                          key={record.id}
                          style={
                            index === latestRecords.length - 1 &&
                            latestRecords.length === 3
                              ? { opacity: 0.4 }
                              : undefined
                          }
                          className='only:mb-0 mb-2'
                        >
                          <RecordCard record={record} compact />
                        </View>
                      ))}
                    </View>
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
