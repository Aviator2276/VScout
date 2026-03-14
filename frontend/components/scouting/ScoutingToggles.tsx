import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View } from 'react-native';
import { HStack } from '@/components/ui/hstack';
import { Button, ButtonText } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Ban, ArrowUpFromLine, Shield, Undo2 } from 'lucide-react-native';
import { VStack } from '../ui/vstack';
import { Text } from '@/components/ui/text';
import { Box } from '../ui/box';

interface ScoutingTogglesProps {
  isDisabled: boolean;
  isClimbing: boolean;
  isDefending: boolean;
  onToggleDisabled: () => void;
  onToggleClimbing: () => void;
  onToggleDefending: () => void;
  onMarkMissed: () => boolean;
  onUndoMissed: () => void;
  onClearMissedPulse: () => void;
  sessionRunning: boolean;
}

const UNDO_DURATION_MS = 1000;

export function ScoutingToggles({
  isDisabled,
  isClimbing,
  isDefending,
  onToggleDisabled,
  onToggleClimbing,
  onToggleDefending,
  onMarkMissed,
  onUndoMissed,
  onClearMissedPulse,
  sessionRunning,
}: ScoutingTogglesProps) {
  const [undoActive, setUndoActive] = useState(false);
  const [undoProgress, setUndoProgress] = useState(0);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoRafRef = useRef<number | null>(null);
  const undoStartRef = useRef<number>(0);

  const clearUndoTimer = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (undoRafRef.current) {
      cancelAnimationFrame(undoRafRef.current);
      undoRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearUndoTimer();
  }, [clearUndoTimer]);

  const animateProgress = useCallback(() => {
    const elapsed = Date.now() - undoStartRef.current;
    const progress = Math.min(elapsed / UNDO_DURATION_MS, 1);
    setUndoProgress(progress);
    if (progress < 1) {
      undoRafRef.current = requestAnimationFrame(animateProgress);
    }
  }, []);

  const handleMissedPress = useCallback(() => {
    const success = onMarkMissed();
    if (!success) return;

    setUndoActive(true);
    setUndoProgress(0);
    undoStartRef.current = Date.now();

    // Start progress animation
    undoRafRef.current = requestAnimationFrame(animateProgress);

    // Auto-finalize after 2 seconds
    undoTimerRef.current = setTimeout(() => {
      setUndoActive(false);
      setUndoProgress(0);
      clearUndoTimer();
      onClearMissedPulse();
    }, UNDO_DURATION_MS);
  }, [onMarkMissed, animateProgress, clearUndoTimer, onClearMissedPulse]);

  const handleUndoPress = useCallback(() => {
    clearUndoTimer();
    onUndoMissed();
    setUndoActive(false);
    setUndoProgress(0);
  }, [onUndoMissed, clearUndoTimer]);

  return (
    <VStack space='md' className='justify-center'>
      <HStack className='absolute self-center w-full grid grid-cols-2'>
        <Text className='text-2xs text-typography-400 text-center mb-0'>
          Toggle ⇕
        </Text>
        <Text className='text-2xs text-typography-400 text-center mb-0'>
          Tap ↑ Hold ↓
        </Text>
      </HStack>

      <HStack space='md' className='grid grid-cols-2 mb-1'>
        <Button
          size='lg'
          variant={isDisabled ? 'solid' : 'outline'}
          action={isDisabled ? 'negative' : 'secondary'}
          onPress={onToggleDisabled}
          disabled={!sessionRunning}
          className={`flex-1 ${!sessionRunning ? 'opacity-40' : ''}`}
        >
          <ButtonText>{isDisabled ? 'Disabled' : 'Disable'}</ButtonText>
        </Button>

        {undoActive ? (
          <Button
            size='lg'
            variant='solid'
            action='secondary'
            onPress={handleUndoPress}
            className='flex-1 overflow-hidden'
            style={{ position: 'relative' }}
          >
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${(1 - undoProgress) * 100}%` as any,
                backgroundColor: 'rgba(244, 63, 94, 0.3)',
                zIndex: 0,
              }}
            />
            <ButtonText style={{ zIndex: 1 }}>Undo</ButtonText>
          </Button>
        ) : (
          <Button
            size='lg'
            variant='outline'
            action='secondary'
            onPress={handleMissedPress}
            disabled={!sessionRunning}
            className={`flex-1 ${!sessionRunning ? 'opacity-40' : ''}`}
            style={{ borderColor: '#f43f5e' }}
          >
            <ButtonText style={{ color: '#f43f5e' }}>Missed</ButtonText>
          </Button>
        )}
      </HStack>

      <HStack space='md' className='grid grid-cols-2'>
        <Button
          size='lg'
          variant={isClimbing ? 'solid' : 'outline'}
          action={isClimbing ? 'primary' : 'secondary'}
          onPress={onToggleClimbing}
          disabled={!sessionRunning || isDisabled}
          className={`flex-1 ${!sessionRunning || isDisabled ? 'opacity-40' : ''}`}
          style={isClimbing ? { backgroundColor: '#3b82f6' } : undefined}
        >
          <ButtonText className={isClimbing ? 'text-typography-0' : ''}>
            Climb
          </ButtonText>
        </Button>

        <Button
          size='lg'
          variant={isDefending ? 'solid' : 'outline'}
          action={isDefending ? 'primary' : 'secondary'}
          onPressIn={() => {
            if (!isDefending) onToggleDefending();
          }}
          onPressOut={() => {
            if (isDefending) onToggleDefending();
          }}
          disabled={!sessionRunning || isDisabled}
          className={`flex-1 ${!sessionRunning || isDisabled ? 'opacity-40' : ''}`}
          style={isDefending ? { backgroundColor: '#f59e0b' } : undefined}
        >
          <ButtonText className={isDefending ? 'text-typography-0' : ''}>
            Defending
          </ButtonText>
        </Button>
      </HStack>
    </VStack>
  );
}
