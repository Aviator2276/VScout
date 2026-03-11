import React from 'react';
import { HStack } from '@/components/ui/hstack';
import { Button, ButtonText } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Ban, ArrowUpFromLine, Shield } from 'lucide-react-native';
import { VStack } from '../ui/vstack';
import { Text } from '@/components/ui/text';

interface ScoutingTogglesProps {
  isDisabled: boolean;
  isClimbing: boolean;
  isDefending: boolean;
  onToggleDisabled: () => void;
  onToggleClimbing: () => void;
  onToggleDefending: () => void;
  sessionRunning: boolean;
}

export function ScoutingToggles({
  isDisabled,
  isClimbing,
  isDefending,
  onToggleDisabled,
  onToggleClimbing,
  onToggleDefending,
  sessionRunning,
}: ScoutingTogglesProps) {
  return (
    <VStack space='md' className='justify-center'>
      <Text className='absolute text-2xs text-typography-400 text-center mb-0 self-center'>
        Tap to toggle
      </Text>
      <HStack space='md'>
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
            {isClimbing ? 'Climbing' : 'Climb'}
          </ButtonText>
        </Button>
      </HStack>

      <Button
        size='lg'
        variant={isDefending ? 'solid' : 'outline'}
        action={isDefending ? 'primary' : 'secondary'}
        onPress={onToggleDefending}
        disabled={!sessionRunning || isDisabled}
        className={`${!sessionRunning || isDisabled ? 'opacity-40' : ''}`}
        style={isDefending ? { backgroundColor: '#f59e0b' } : undefined}
      >
        <Icon
          as={Shield}
          size='sm'
          className={`mr-1 ${isDefending ? 'text-typography-0' : 'text-typography-700'}`}
        />
        <ButtonText className={isDefending ? 'text-typography-0' : ''}>
          Defending
        </ButtonText>
      </Button>
    </VStack>
  );
}
