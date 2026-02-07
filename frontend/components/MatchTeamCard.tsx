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
      router.push(`/(tabs)/team/${team.number}?from=match&matchId=${matchNumber}`);
    } else {
      router.push(`/(tabs)/team/${team.number}`);
    }
  };

  return (
    <Pressable onPress={handlePress}>
      <Card
        variant='outline'
        size='sm'
        className={`mb-2 p-3 ${allianceBorderColor} border-l-4`}
      >
        <VStack space='sm'>
          {/* Team Header */}
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
              <Text
                className='text-typography-600 truncate line-clamp-1'
                numberOfLines={1}
              >
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
                  action={alliance === 'blue' ? 'info' : 'error'}
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
        </VStack>
      </Card>
    </Pressable>
  );
}
