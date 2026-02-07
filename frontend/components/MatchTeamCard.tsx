import React from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Badge, BadgeText, BadgeIcon } from '@/components/ui/badge';
import { Heading } from '@/components/ui/heading';
import { Divider } from '@/components/ui/divider';
import { Team } from '@/types/match';
import { ShieldPlus } from 'lucide-react-native';
import { calculateClimbPoints } from '@/utils/climbPoints';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from './ui/charts';
import { CartesianGrid, Line, LineChart, XAxis } from 'recharts';

export interface MatchTeamStats {
  team: Team;
  alliance: 'blue' | 'red';
  position: 1 | 2 | 3;
  autoFuel: number;
  teleopFuel: number;
  totalFuelScored: number;
  autoClimb: boolean;
  climbLevel: string;
  totalAllianceScore: number;
}

interface MatchTeamCardProps {
  stats: MatchTeamStats;
  matchNumber?: number;
}

export function MatchTeamCard({ stats, matchNumber }: MatchTeamCardProps) {
  const router = useRouter();
  const {
    team,
    alliance,
    position,
    autoFuel,
    teleopFuel,
    totalFuelScored,
    autoClimb,
    climbLevel,
    totalAllianceScore,
  } = stats;

  const allianceColor =
    alliance === 'blue' ? 'bg-blue-500/20' : 'bg-red-500/20';
  const allianceBorderColor =
    alliance === 'blue' ? 'border-blue-500' : 'border-red-500';

  const handlePress = () => {
    if (matchNumber) {
      router.push(
        `/(tabs)/team/${team.number}?from=match&matchId=${matchNumber}`,
      );
    } else {
      router.push(`/(tabs)/team/${team.number}`);
    }
  };

  // Using Tailwind amber-500 and emerald-500 colors to match Gluestack theme
  const fuelColor = '#f59e0b'; // amber-500
  const climbColor = '#10b981'; // emerald-500

  const chartConfig = {
    fuel: {
      label: 'Fuel',
      color: fuelColor,
    },
    climb: {
      label: 'Climb Level',
      color: climbColor,
    },
  } satisfies ChartConfig;

  const chartData = [
    { time: 0, fuel: 0, climb: 1 },
    { time: 10, fuel: 0, climb: 0 },
    { time: 20, fuel: 20, climb: 0 },
    { time: 30, fuel: 34, climb: 0 },
    { time: 40, fuel: 12, climb: 0 },
    { time: 50, fuel: 45, climb: 0 },
    { time: 60, fuel: 2, climb: 3 },
  ];

  return (
    <Card
      variant='outline'
      size='sm'
      className={`mb-2 p-3 ${allianceBorderColor} border-l-4`}
    >
      <VStack space='sm'>
        <Pressable onPress={handlePress}>
          <HStack className='justify-between items-center'>
            <HStack space='sm' className='items-center'>
              <Badge
                size='sm'
                variant='solid'
                action={alliance === 'blue' ? 'info' : 'error'}
              >
                <BadgeText>{position}</BadgeText>
              </Badge>
              <Heading size='md'>{team.number}</Heading>
              <Text className='text-typography-600 truncate line-clamp-1'>
                {team.name || 'Unknown Team'}
              </Text>
            </HStack>
            <HStack className='gap-1'>
              <Badge
                size='sm'
                variant='solid'
                action='success'
                className='justify-center items-center'
              >
                <BadgeIcon as={ShieldPlus}></BadgeIcon>
                <BadgeText className='capitalize ml-1'>
                  {Math.round(
                    ((calculateClimbPoints(climbLevel) +
                      calculateClimbPoints('', autoClimb) +
                      totalFuelScored) /
                      totalAllianceScore) *
                      100,
                  ) || 0}
                  {'% '}
                  Contributed
                </BadgeText>
              </Badge>
            </HStack>
          </HStack>
        </Pressable>

        <Divider />
        <HStack className='justify-between'>
          <VStack space='xs'>
            <Text className='text-sm font-semibold text-typography-700'>
              Fuel Scored
            </Text>
            <HStack className='justify-between'>
              <HStack space='md'>
                <VStack className='items-center'>
                  <Text className='text-xs text-typography-500'>Auto</Text>
                  <Text className='font-semibold'>{autoFuel}</Text>
                </VStack>
                <VStack className='items-center'>
                  <Text className='text-xs text-typography-500'>Teleop</Text>
                  <Text className='font-semibold'>{teleopFuel}</Text>
                </VStack>
                <VStack className='items-center'>
                  <Text className='text-xs text-typography-500'>Total</Text>
                  <Text className='font-semibold'>{totalFuelScored}</Text>
                </VStack>
              </HStack>
            </HStack>
          </VStack>
          {/* Climb Stats */}
          <VStack space='xs'>
            <Text className='text-sm font-semibold text-typography-700'>
              Climb Scored
            </Text>
            <VStack space='xs'>
              <HStack space='xs' className='gap-1 items-center'>
                <Text className='text-xs text-typography-500'>Auto:</Text>
                <Badge
                  size='sm'
                  variant='solid'
                  action={autoClimb ? 'success' : 'warning'}
                >
                  <BadgeText>{autoClimb ? 'Yes' : 'No'}</BadgeText>
                </Badge>
              </HStack>
              <HStack space='xs' className='gap-1 items-center'>
                <Text className='text-xs text-typography-500'>Endgame:</Text>
                <Badge
                  size='sm'
                  variant='solid'
                  action={climbLevel !== 'None' ? 'success' : 'warning'}
                >
                  <BadgeText>{climbLevel || 'None'}</BadgeText>
                </Badge>
              </HStack>
            </VStack>
          </VStack>
          <VStack space='xs'>
            <HStack space='xs' className='gap-1 justify-between items-center'>
              <Text className='text-xs text-typography-500'>Fuel:</Text>
              <Badge size='sm' variant='solid' action='muted'>
                <BadgeText>{totalFuelScored}</BadgeText>
              </Badge>
            </HStack>
            <HStack space='xs' className='gap-1 justify-between items-center'>
              <Text className='text-xs text-typography-500'>Climb:</Text>
              <Badge size='sm' variant='solid' action='muted'>
                <BadgeText>
                  {calculateClimbPoints(climbLevel) +
                    calculateClimbPoints('', autoClimb)}
                </BadgeText>
              </Badge>
            </HStack>
            <HStack space='xs' className='gap-1 justify-between items-center'>
              <Text className='text-xs text-typography-500'>Total:</Text>
              <Badge
                size='sm'
                variant='solid'
                action='muted'
                className={allianceColor}
              >
                <BadgeText>
                  {calculateClimbPoints(climbLevel) +
                    calculateClimbPoints('', autoClimb) +
                    totalFuelScored}
                </BadgeText>
              </Badge>
            </HStack>
          </VStack>
        </HStack>
        <HStack>
          <ChartContainer config={chartConfig} className='min-h-[200px] w-full'>
            <LineChart accessibilityLayer data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey='time'
                tickLine={false}
                tickMargin={10}
                axisLine={false}
              />
              <ChartTooltip 
                cursor={false}
                content={<ChartTooltipContent hideLabel />} 
              />
              <Line 
                dataKey='fuel' 
                type="monotone"
                stroke={fuelColor}
                strokeWidth={2}
                dot={false}
              />
              <Line 
                dataKey='climb' 
                type="monotone"
                stroke={climbColor}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </HStack>
      </VStack>
    </Card>
  );
}
