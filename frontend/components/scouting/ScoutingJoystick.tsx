import React, { useCallback } from 'react';
import { View } from 'react-native';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import Joystick, { Direction, DirectionCount, IJoystickChangeValue } from 'rc-joystick';
import { RobotAction } from '@/types/scouting';

interface ScoutingJoystickProps {
  disabled: boolean;
  onActionChange: (action: RobotAction) => void;
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
}: ScoutingJoystickProps) {
  // Deadband: joystick must travel this many pixels from center to register a direction
  // Max travel in insideMode = baseRadius - controllerRadius = 80 - 38 = 42px
  const DEADBAND_PX = 15;

  const handleChange = useCallback(
    (val: IJoystickChangeValue) => {
      if (val.distance < DEADBAND_PX) {
        onActionChange('traversing');
      } else {
        const action = DIRECTION_MAP[val.direction] || 'traversing';
        onActionChange(action);
      }
    },
    [onActionChange],
  );

  const handleActiveChange = useCallback(
    (active: boolean) => {
      if (!active) onActionChange('traversing');
    },
    [onActionChange],
  );

  return (
    <Box className='w-full items-center'>
      {/* Direction labels */}
      <Text
        className={`text-xs font-semibold mb-1 ${disabled ? 'text-typography-300' : 'text-emerald-500'}`}
      >
        Shooting
      </Text>
      <Box className='flex-row items-center'>
        <View
          className='w-[60px] h-[60px] justify-center items-center'
          style={{
            transform: [{ rotate: '-90deg' }, { translateY: 16 }],
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
            baseRadius={80}
            controllerRadius={38}
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
      >
        Outtake
      </Text>
    </Box>
  );
}
