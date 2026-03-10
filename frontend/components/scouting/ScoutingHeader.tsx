import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Pressable, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { Badge, BadgeText } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { ChevronLeft, Pause, Play } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { RobotAction } from '@/types/scouting';
import { ACTION_COLORS } from './actionColors';
import { VStack } from '../ui/vstack';

interface ScoutingHeaderProps {
  matchType: string;
  matchNumber: number;
  teamNumber: number;
  currentAction: RobotAction;
  currentPhase: 'auto' | 'hold' | 'teleop';
  displayCountdown: string;
  sessionRunning: boolean;
  isPaused?: boolean;
  onPause?: () => void;
  onResume?: () => void;
}

const HOLD_DURATION_MS = 1000;

export function ScoutingHeader({
  matchType,
  matchNumber,
  teamNumber,
  currentAction,
  currentPhase,
  displayCountdown,
  sessionRunning,
  isPaused,
  onPause,
  onResume,
}: ScoutingHeaderProps) {
  const router = useRouter();
  const [holdProgress, setHoldProgress] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef<number>(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for the action badge
  useEffect(() => {
    if (!sessionRunning) return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();

    return () => pulse.stop();
  }, [sessionRunning, currentAction]);

  const startHold = useCallback(() => {
    holdStartRef.current = Date.now();
    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      const progress = Math.min(elapsed / HOLD_DURATION_MS, 1);
      setHoldProgress(progress);

      if (progress >= 1) {
        clearInterval(holdTimerRef.current!);
        holdTimerRef.current = null;
        if (router.canGoBack()) {
          router.back();
        } else {
          router.navigate('/');
        }
      }
    }, 16);
  }, [router]);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldProgress(0);
  }, []);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearInterval(holdTimerRef.current);
      }
    };
  }, []);

  const actionColor = ACTION_COLORS[currentAction];
  const phaseLabel =
    currentPhase === 'auto'
      ? 'Auto'
      : currentPhase === 'hold'
        ? 'Hold'
        : 'Teleop';

  return (
    <HStack className='w-full grid grid-cols-3 px-3 py-2 items-center'>
      {/* Hold-to-exit button */}
      <Pressable
        onPressIn={startHold}
        onPressOut={cancelHold}
        style={
          {
            WebkitUserSelect: 'none',
            userSelect: 'none',
            WebkitTouchCallout: 'none',
          } as any
        }
      >
        <Box
          className='relative overflow-hidden rounded-md border border-outline-300'
          style={
            {
              width: 100,
              height: 36,
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitTouchCallout: 'none',
            } as any
          }
        >
          {/* Progress fill */}
          <Box
            className='absolute top-0 left-0 bottom-0 bg-error-500/30'
            style={{ width: `${holdProgress * 100}%` as any }}
          />
          <HStack className='flex-1 items-center justify-center gap-1 pr-1 z-10'>
            <Icon
              as={ChevronLeft}
              size='xs'
              className='text-typography-700 rotate-x-180'
            />
            <Text
              className='text-xs font-semibold text-typography-700'
              style={
                {
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                } as any
              }
            >
              Hold to Exit
            </Text>
          </HStack>
        </Box>
      </Pressable>

      {/* Action badge */}
      <VStack className='justify-center items-center'>
        <Text size='2xs' className='text-typography-500 text-center capitalize'>
          {matchType} {matchNumber} · Team {teamNumber}
        </Text>
        <Animated.View style={{ opacity: sessionRunning ? pulseAnim : 1 }}>
          <Badge
            size='md'
            variant='solid'
            style={{ backgroundColor: actionColor.bg }}
            className='text-center'
          >
            <BadgeText
              style={{ color: actionColor.text }}
              className='text-center'
            >
              {currentAction.charAt(0).toUpperCase() + currentAction.slice(1)}
            </BadgeText>
          </Badge>
        </Animated.View>{' '}
      </VStack>

      {/* Timer + match info */}
      <HStack space='sm' className='items-center justify-end'>
        {onPause && onResume && (sessionRunning || isPaused) && (
          <Button
            size='md'
            variant='outline'
            action='secondary'
            onPress={isPaused ? onResume : onPause}
            className='rounded-full p-0 aspect-square'
          >
            <Icon
              as={isPaused ? Play : Pause}
              size='md'
              className='text-typography-700 max-w-5 max-h-5'
            />
          </Button>
        )}
        <Badge
          size='lg'
          variant='outline'
          action={
            currentPhase === 'auto'
              ? 'warning'
              : currentPhase === 'hold'
                ? 'muted'
                : 'info'
          }
        >
          <BadgeText>
            {phaseLabel} {displayCountdown}
          </BadgeText>
        </Badge>
      </HStack>
    </HStack>
  );
}
