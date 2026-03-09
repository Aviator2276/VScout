import React, { useMemo } from 'react';
import { ScrollView } from 'react-native';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Button, ButtonText } from '@/components/ui/button';
import { Heading } from '@/components/ui/heading';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Save, RotateCcw, Trash2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { RobotAction, RobotActionRecord } from '@/types/scouting';
import { ACTION_COLORS, ACTION_LABELS } from './actionColors';
import { MatchTimeline } from './MatchTimeline';

interface ScoutingEndScreenProps {
  matchType: string;
  matchNumber: number;
  teamNumber: number;
  recordData: RobotActionRecord;
  actionLog: { matchTimeSec: number; action: RobotAction }[];
  onSave: () => Promise<void>;
  onRestart: () => void;
}

const ALL_ACTIONS: RobotAction[] = [
  'traversing',
  'shooting',
  'defending',
  'intake',
  'outtake',
  'climbing',
  'disabled',
];

export function ScoutingEndScreen({
  matchType,
  matchNumber,
  teamNumber,
  recordData,
  actionLog,
  onSave,
  onRestart,
}: ScoutingEndScreenProps) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);

  const stats = useMemo(() => {
    const totals: Record<RobotAction, number> = {
      traversing: 0,
      shooting: 0,
      defending: 0,
      intake: 0,
      outtake: 0,
      climbing: 0,
      disabled: 0,
    };

    for (const seg of recordData.auto) {
      totals[seg.action] += seg.duration;
    }
    for (const seg of recordData.tele) {
      totals[seg.action] += seg.duration;
    }

    return totals;
  }, [recordData]);

  const totalDuration = useMemo(() => {
    return Object.values(stats).reduce((sum, v) => sum + v, 0);
  }, [stats]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave();
      router.back();
    } catch (err) {
      console.error('Failed to save scouting data:', err);
      setSaving(false);
    }
  }

  function handleDiscard() {
    router.back();
  }

  return (
    <Box className='flex-1 bg-background-0'>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16 }}>
        <VStack space='lg' className='max-w-lg self-center w-full flex-1'>
          <Heading size='xl' className='text-center capitalize'>
            Scouting Complete
          </Heading>
          <Text className='text-typography-500 text-center capitalize'>
            {matchType} {matchNumber} · Team {teamNumber}
          </Text>

          {/* Timeline */}
          <Card variant='outline' className='p-2'>
            <Text className='text-xs font-semibold text-typography-500 mb-1 px-1'>
              Match Timeline
            </Text>
            <MatchTimeline
              actionLog={actionLog}
              elapsedMatchSec={0}
              isFinished
            />
          </Card>

          {/* Stats */}
          <Card variant='outline' className='p-4'>
            <Text className='font-semibold mb-3'>Action Summary</Text>
            <VStack space='sm'>
              {ALL_ACTIONS.map((action) => {
                const duration = stats[action];
                const pct = totalDuration > 0 ? (duration / totalDuration) * 100 : 0;
                if (duration === 0) return null;

                return (
                  <HStack key={action} className='items-center justify-between'>
                    <HStack className='items-center gap-2'>
                      <Box
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          backgroundColor: ACTION_COLORS[action].bg,
                        }}
                      />
                      <Text className='text-sm'>{ACTION_LABELS[action]}</Text>
                    </HStack>
                    <Text className='text-sm text-typography-500'>
                      {duration.toFixed(1)}s ({pct.toFixed(0)}%)
                    </Text>
                  </HStack>
                );
              })}
            </VStack>
          </Card>

          {/* Actions */}
          <VStack space='sm' className='mt-auto pt-4'>
            <Button
              size='lg'
              action='positive'
              onPress={handleSave}
              disabled={saving}
            >
              <Icon as={Save} size='md' className='mr-2 text-typography-0' />
              <ButtonText>{saving ? 'Saving...' : 'Save & Upload'}</ButtonText>
            </Button>
            <Button
              size='lg'
              variant='outline'
              action='secondary'
              onPress={onRestart}
            >
              <Icon as={RotateCcw} size='md' className='mr-2 text-typography-700' />
              <ButtonText>Restart</ButtonText>
            </Button>
            <Button
              size='lg'
              variant='outline'
              action='negative'
              onPress={handleDiscard}
            >
              <Icon as={Trash2} size='md' className='mr-2' />
              <ButtonText>Discard</ButtonText>
            </Button>
          </VStack>
        </VStack>
      </ScrollView>
    </Box>
  );
}
