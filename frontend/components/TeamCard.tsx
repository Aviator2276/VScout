import React, { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { TeamInfo } from '@/types/team';
import { Badge, BadgeIcon, BadgeText } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipText } from '@/components/ui/tooltip';
import { getTeamName } from '@/api/teams';
import {
  Move,
  MoveVertical,
  Truck,
  Dice4,
  Volleyball,
  CircleQuestionMark,
} from 'lucide-react-native';

interface TeamCardProps {
  team: TeamInfo;
  searchQuery?: string;
}

export function TeamCard({ team, searchQuery = '' }: TeamCardProps) {
  const router = useRouter();
  const [teamName, setTeamName] = useState<string | null>(null);

  useEffect(() => {
    getTeamName(team.team_number).then(setTeamName);
  }, [team.team_number]);

  const isHighlighted = (): boolean => {
    if (!searchQuery.trim()) {
      return false;
    }
    return team.team_number.toString().includes(searchQuery.trim());
  };

  const handleCardPress = () => {
    router.push(`/team/${team.team_number}`);
  };

  return (
    <Pressable onPress={handleCardPress}>
      <Card
        variant='outline'
        size='md'
        className={`mb-3 p-4 ${isHighlighted() ? 'border-amber-400 border-2' : ''}`}
      >
        <HStack className='items-center justify-between'>
          <VStack className='w-full'>
            <HStack space='sm' className='items-center pb-2 justify-between'>
              <HStack space='sm' className='items-center'>
                <Text className='text-lg font-bold text-typography-900'>
                  {team.team_number}
                </Text>
                <Text className='text-md text-typography-600 overflow-hidden max-w-48'>
                  {teamName}
                </Text>
              </HStack>
              <Text className='text-md text-typography-600'>
                RP {team.ranking_points}
              </Text>
            </HStack>
            <HStack space='sm' className='items-center w-full'>
              <Badge size='lg' variant='solid' action='muted'>
                <BadgeText>#{team.rank}</BadgeText>
              </Badge>
              <Text className='text-sm text-amber-600 dark:text-amber-500'>
                {team.win}-{team.lose}-{team.tie}
              </Text>
              <HStack className='flex-1 w-full justify-end gap-1'>
                <Tooltip
                  placement='bottom'
                  trigger={(triggerProps) => (
                    <Pressable
                      {...triggerProps}
                      onLongPress={triggerProps.onPress}
                    >
                      <Badge
                        size='lg'
                        variant='solid'
                        action='muted'
                        className='w-18 justify-center items-center bg-amber-500/40'
                      >
                        <BadgeIcon as={Volleyball}></BadgeIcon>
                        <BadgeText className='ml-1'>
                          {team.avg_fuel_scored}
                        </BadgeText>
                      </Badge>
                    </Pressable>
                  )}
                >
                  <TooltipContent>
                    <TooltipText>Average Fuel Scored</TooltipText>
                  </TooltipContent>
                </Tooltip>
                <Tooltip
                  placement='bottom'
                  trigger={(triggerProps) => (
                    <Pressable
                      {...triggerProps}
                      onLongPress={triggerProps.onPress}
                    >
                      <Badge
                        size='lg'
                        variant='solid'
                        action='muted'
                        className='justify-center items-center bg-emerald-500/40'
                      >
                        <BadgeText>
                          L{Math.round(team.avg_climb_points * 10) / 10}
                        </BadgeText>
                      </Badge>
                    </Pressable>
                  )}
                >
                  <TooltipContent>
                    <TooltipText>Average Climb Points</TooltipText>
                  </TooltipContent>
                </Tooltip>
                <Tooltip
                  placement='bottom'
                  trigger={(triggerProps) => (
                    <Pressable
                      {...triggerProps}
                      onLongPress={triggerProps.onPress}
                    >
                      <Badge
                        size='lg'
                        variant='solid'
                        action='muted'
                        className='justify-center items-center bg-purple-500/40'
                      >
                        <BadgeIcon as={Truck}></BadgeIcon>
                        <BadgeText className='ml-1'>
                          {team.prescout_hopper_size}
                        </BadgeText>
                      </Badge>
                    </Pressable>
                  )}
                >
                  <TooltipContent>
                    <TooltipText>Hopper Size</TooltipText>
                  </TooltipContent>
                </Tooltip>
                <Tooltip
                  placement='bottom'
                  trigger={(triggerProps) => (
                    <Pressable
                      {...triggerProps}
                      onLongPress={triggerProps.onPress}
                    >
                      <Badge
                        size='lg'
                        variant='solid'
                        action='muted'
                        className='justify-center items-center h-7'
                      >
                        <BadgeIcon
                          size='lg'
                          as={
                            team.prescout_drivetrain === 'swerve'
                              ? Dice4
                              : team.prescout_drivetrain === 'mecanum'
                                ? Move
                                : team.prescout_drivetrain === 'tank'
                                  ? MoveVertical
                                  : CircleQuestionMark
                          }
                        ></BadgeIcon>
                      </Badge>
                    </Pressable>
                  )}
                >
                  <TooltipContent>
                    <TooltipText>
                      {team.prescout_drivetrain
                        ? `${team.prescout_drivetrain.charAt(0).toUpperCase() + team.prescout_drivetrain.slice(1)} Drivetrain`
                        : 'Unknown Drivetrain'}
                    </TooltipText>
                  </TooltipContent>
                </Tooltip>
              </HStack>
            </HStack>
          </VStack>
        </HStack>
      </Card>
    </Pressable>
  );
}
