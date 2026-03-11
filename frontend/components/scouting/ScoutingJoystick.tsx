import React, { useCallback } from 'react';
import { View } from 'react-native';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import Joystick, { Direction, DirectionCount, IJoystickChangeValue } from 'rc-joystick';
import { RobotAction } from '@/types/scouting';

interface ScoutingJoystickProps {
  disabled: boolean;
  onActionChange: (action: RobotAction) => void;
  size?: number;
}

const DIRECTION_MAP: Record<string, RobotAction> = {
  [Direction.Center]: 'traversing',
  [Direction.Top]: 'shooting',
  [Direction.Bottom]: 'outtake',
  [Direction.Left]: 'intake',
  [Direction.Right]: 'herding',
};

export function ScoutingJoystick({
  disabled,
  onActionChange,
  size,
}: ScoutingJoystickProps) {
  const baseRadius = size ? Math.round(size / 2) : 80;
  const controllerRadius = Math.round(baseRadius * 0.475);
  const deadbandPx = Math.round(baseRadius * 0.19);

  const handleChange = useCallback(
    (val: IJoystickChangeValue) => {
      if (val.distance < deadbandPx) {
        onActionChange('traversing');
      } else {
        const action = DIRECTION_MAP[val.direction] || 'traversing';
        onActionChange(action);
      }
    },
    [onActionChange, deadbandPx],
  );

  const handleActiveChange = useCallback(
    (active: boolean) => {
      if (!active) onActionChange('traversing');
    },
    [onActionChange],
  );

  return (
    <Box className='items-center' style={{ position: 'relative' as any }}>
      {/* Direction labels */}
      <Text
        className={`text-xs font-semibold mb-1 ${disabled ? 'text-typography-300' : 'text-emerald-500'}`}
        style={{ zIndex: 10 }}
      >
        Shooting
      </Text>
      <Box className='flex-row items-center'>
        <View
          className='w-[60px] h-[60px] justify-center items-center'
          style={{
            transform: [{ rotate: '-90deg' }, { translateY: 16 }],
            zIndex: 10,
          }}
        >
          <Text
            className={`text-xs font-semibold ${disabled ? 'text-typography-300' : 'text-purple-500'}`}
          >
            Intake
          </Text>
        </View>
        <Box style={{ opacity: disabled ? 0.4 : 1 }}>
          <Joystick
            baseRadius={baseRadius}
            controllerRadius={controllerRadius}
            directionCount={DirectionCount.Five}
            insideMode
            autoReset
            disabled={disabled}
            onChange={handleChange}
            onActiveChange={handleActiveChange}
            throttle={50}
          />
        </Box>
        <View
          className='w-[60px] justify-center items-center'
          style={{
            transform: [{ rotate: '90deg' }, { translateY: 16 }],
            zIndex: 10,
          }}
        >
          <Text
            className={`text-xs font-semibold ${disabled ? 'text-typography-300' : 'text-orange-500'}`}
          >
            Herding
          </Text>
        </View>
      </Box>
      <Text
        className={`text-xs font-semibold mt-1 ${disabled ? 'text-typography-300' : 'text-pink-500'}`}
        style={{ zIndex: 10 }}
      >
        Outtake
      </Text>
    </Box>
  );
}
