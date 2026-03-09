import React from 'react';
import { HStack } from '@/components/ui/hstack';
import { Button, ButtonText } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Ban, ArrowUpFromLine } from 'lucide-react-native';
import { VStack } from '../ui/vstack';

interface ScoutingTogglesProps {
  isDisabled: boolean;
  isClimbing: boolean;
  onToggleDisabled: () => void;
  onToggleClimbing: () => void;
  sessionRunning: boolean;
}

export function ScoutingToggles({
  isDisabled,
  isClimbing,
  onToggleDisabled,
  onToggleClimbing,
  sessionRunning,
}: ScoutingTogglesProps) {
  return (
    <VStack space='md' className='justify-center'>
      <Button
        size='lg'
        variant={isDisabled ? 'solid' : 'outline'}
        action={isDisabled ? 'negative' : 'secondary'}
        onPress={onToggleDisabled}
        disabled={!sessionRunning}
        className={`min-w-[120px] ${!sessionRunning ? 'opacity-40' : ''}`}
      >
        <Icon
          as={Ban}
          size='sm'
          className={`mr-1 ${isDisabled ? 'text-typography-0' : 'text-typography-700'}`}
        />
        <ButtonText>{isDisabled ? 'Disabled ✓' : 'Disabled'}</ButtonText>
      </Button>

      <Button
        size='lg'
        variant={isClimbing ? 'solid' : 'outline'}
        action={isClimbing ? 'primary' : 'secondary'}
        onPress={onToggleClimbing}
        disabled={!sessionRunning || isDisabled}
        className={`min-w-[120px] ${!sessionRunning || isDisabled ? 'opacity-40' : ''}`}
        style={isClimbing ? { backgroundColor: '#3b82f6' } : undefined}
      >
        <Icon
          as={ArrowUpFromLine}
          size='sm'
          className={`mr-1 ${isClimbing ? 'text-typography-0' : 'text-typography-700'}`}
        />
        <ButtonText className={isClimbing ? 'text-typography-0' : ''}>
          {isClimbing ? 'Climbing ✓' : 'Climb'}
        </ButtonText>
      </Button>
    </VStack>
  );
}
