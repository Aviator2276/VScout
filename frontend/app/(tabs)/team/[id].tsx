import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, ActivityIndicator } from 'react-native';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Card } from '@/components/ui/card';
import { Badge, BadgeIcon, BadgeText } from '@/components/ui/badge';
import { Button, ButtonText } from '@/components/ui/button';
import { Center } from '@/components/ui/center';
import { TeamInfo } from '@/types/team';
import { getTeamInfo, getTeamName } from '@/api/teams';
import { Box } from '@/components/ui/box';
import { Header } from '@/components/Header';
import {
  Binoculars,
  CircleGauge,
  CircleQuestionMark,
  Dice4,
  Forklift,
  Move,
  MoveVertical,
  Target,
  TriangleAlert,
  Truck,
} from 'lucide-react-native';

type TabType = 'overview' | 'prescout';

export default function TeamDetailScreen() {
  const { id, from, matchId } = useLocalSearchParams<{ id: string; from?: string; matchId?: string }>();
  const router = useRouter();
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const getBackRoute = () => {
    if (from === 'match' && matchId) {
      return `/(tabs)/match/${matchId}`;
    }
    return '/(tabs)/teams';
  };

  useEffect(() => {
    loadTeamDetails();
  }, [id]);

  async function loadTeamDetails() {
    try {
      setLoading(true);
      setError(null);
      const teamNumber = parseInt(id || '0', 10);

      if (!teamNumber) {
        setError('Invalid team number');
        return;
      }

      const [teamInfo, name] = await Promise.all([
        getTeamInfo(teamNumber),
        getTeamName(teamNumber),
      ]);

      if (teamInfo) {
        setTeam(teamInfo);
        setTeamName(name);
      } else {
        setError('Team not found');
      }
    } catch (err) {
      console.error('Failed to load team details:', err);
      setError('Failed to load team details');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <AdaptiveSafeArea>
        <Center className='flex-1'>
          <ActivityIndicator size='large' />
        </Center>
      </AdaptiveSafeArea>
    );
  }

  if (error || !team) {
    return (
      <AdaptiveSafeArea>
        <Center className='flex-1 p-4'>
          <Text className='text-error-500 text-center mb-4'>
            {error || 'Team not found'}
          </Text>
          <Button onPress={() => router.push('/(tabs)')}>
            <ButtonText>Go Home</ButtonText>
          </Button>
        </Center>
      </AdaptiveSafeArea>
    );
  }

  return (
    <AdaptiveSafeArea>
      <Box className='max-w-2xl self-center w-full'>
        <Header
          title={`Team ${team.team_number}`}
          isMainScreen={false}
          showBackButton
          fallbackRoute={getBackRoute()}
        />

        <ScrollView className='flex-1 px-4 pb-4'>
          <Card
            variant='outline'
            className='p-4 mb-2 aspect-square justify-evenly items-center'
          >
            A Beautiful Robot Image
          </Card>
          {/* Team Info */}
          <Card variant='outline' className='p-4 mb-2'>
            <VStack space='md'>
              <HStack className='items-center gap-2'>
                <Heading size='2xl'>{team.team_number}</Heading>
                <Text className='text-lg text-typography-600'>{teamName}</Text>
              </HStack>
              <VStack space='xs'>
                <HStack className='justify-between'>
                  <Text className='text-typography-700'>Competition:</Text>
                  <Text className='font-semibold'>{team.competition.name}</Text>
                </HStack>
                <HStack className='justify-between'>
                  <Text className='text-typography-700'>Rank:</Text>
                  <Badge size='lg' variant='solid' action='info'>
                    <BadgeText>#{team.rank}</BadgeText>
                  </Badge>
                </HStack>
                <HStack className='justify-between'>
                  <Text className='text-typography-700'>Record:</Text>
                  <Text className='font-semibold text-amber-600 dark:text-amber-400'>
                    {team.win}-{team.lose}-{team.tie}
                  </Text>
                </HStack>
                <HStack className='justify-between'>
                  <Text className='text-typography-700'>Ranking Points:</Text>
                  <Text className='font-semibold'>{team.ranking_points}</Text>
                </HStack>
              </VStack>
            </VStack>
          </Card>

          {/* Tab Navigation */}
          <HStack className='mb-2 p-1 rounded bg-secondary-100'>
            <Button
              size='xs'
              variant={activeTab === 'overview' ? 'solid' : 'link'}
              action='secondary'
              className='w-1/2'
              onPress={() => setActiveTab('overview')}
            >
              <Text className='text-center font-semibold'>Statistics</Text>
            </Button>
            <Button
              size='xs'
              variant={activeTab === 'prescout' ? 'solid' : 'link'}
              action='secondary'
              className='w-1/2'
              onPress={() => setActiveTab('prescout')}
            >
              <Text className='text-center font-semibold'>Prescout Info</Text>
            </Button>
          </HStack>

          {activeTab === 'overview' && (
            <>
              {/* Overview Stats */}
              <Card variant='outline' className='p-4 mb-2'>
                <VStack space='md'>
                  <HStack className='justify-between'>
                    <Heading size='lg'>Overview</Heading>
                    <Badge
                      size='lg'
                      variant='solid'
                      action='success'
                      className='justify-center items-center'
                    >
                      <BadgeIcon as={CircleGauge}></BadgeIcon>
                      <BadgeText className='capitalize ml-1'>
                        Consistency:{' '}
                        {Math.round(parseFloat(team.consistency_rating) * 100)}%
                      </BadgeText>
                    </Badge>
                  </HStack>

                  <VStack space='xs'>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>Accuracy:</Text>
                      <Text className='font-semibold'>
                        {Math.round(parseFloat(team.accuracy) * 100)}%
                      </Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Average Auto Fuel:
                      </Text>
                      <Text className='font-semibold'>
                        {Math.round(parseFloat(team.avg_auto_fuel) * 10) / 10} ±{' '}
                        {Math.round(parseFloat(team.avg_auto_fuel_sd) * 10) /
                          10}
                      </Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>Average Fuel:</Text>
                      <Text className='font-semibold'>
                        {Math.round(parseFloat(team.avg_fuel_scored) * 10) / 10}{' '}
                        ± {Math.round(parseFloat(team.avg_fuel_sd) * 10) / 10}
                      </Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Average Fuel Shuttle:
                      </Text>
                      <Text className='font-semibold'>
                        {Math.round(parseFloat(team.avg_shuttle) * 10) / 10}
                      </Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Average Climb Level:
                      </Text>
                      <Text className='font-semibold'>
                        L
                        {Math.round(parseFloat(team.avg_climb_points) * 10) /
                          10}{' '}
                        ±{' '}
                        {Math.round(parseFloat(team.avg_climb_points_sd) * 10) /
                          10}
                      </Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Average Points Contributed:
                      </Text>
                      <Badge size='md' variant='solid' action='info'>
                        <BadgeText>
                          {Math.round(
                            parseFloat(team.avg_points_contributed) * 10,
                          ) / 10}
                        </BadgeText>
                      </Badge>
                    </HStack>
                  </VStack>
                </VStack>
              </Card>
            </>
          )}

          {activeTab === 'prescout' && (
            <>
              {/* Robot Info */}

              <Card variant='outline' className='p-4 mb-2'>
                <VStack space='md'>
                  <HStack className='justify-between'>
                    <Heading size='lg'>Robot Info</Heading>
                    <Badge
                      size='lg'
                      variant='solid'
                      action={team.prescout_drivetrain ? 'success' : 'error'}
                      className='justify-center items-center'
                    >
                      <BadgeIcon
                        as={
                          team.prescout_drivetrain ? Binoculars : TriangleAlert
                        }
                      ></BadgeIcon>
                      <BadgeText className='capitalize ml-1'>
                        {team.prescout_drivetrain ? 'Scouted' : 'Not Scouted'}
                      </BadgeText>
                    </Badge>
                  </HStack>
                  <VStack space='xs'>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>Drivetrain:</Text>
                      <Badge size='lg' variant='solid' action='muted'>
                        <BadgeIcon
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
                        <BadgeText className='capitalize ml-1'>
                          {team.prescout_drivetrain || 'Unknown'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>Intake Type:</Text>
                      <Badge
                        size='lg'
                        variant='solid'
                        action='muted'
                        className='justify-center items-center bg-amber-500/40'
                      >
                        <BadgeIcon as={Forklift}></BadgeIcon>
                        <BadgeText className='capitalize ml-1'>
                          {team.prescout_intake_type || 'Unknown'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>Hopper Size:</Text>
                      <Badge
                        size='lg'
                        variant='solid'
                        action='muted'
                        className='justify-center items-center bg-purple-500/40'
                      >
                        <BadgeIcon as={Truck}></BadgeIcon>
                        <BadgeText className='capitalize ml-1'>
                          {team.prescout_hopper_size || 'Unknown'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>Range:</Text>
                      <Badge
                        size='lg'
                        variant='solid'
                        action='muted'
                        className='justify-center items-center bg-rose-500/40'
                      >
                        <BadgeIcon as={Target}></BadgeIcon>
                        <BadgeText className='capitalize ml-1'>
                          {team.prescout_range || 'Unknown'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                  </VStack>
                  <Heading size='lg'>Shooter Rotation</Heading>
                  <VStack space='xs'>
                    <HStack className='justify-evenly'>
                      <HStack className='gap-1'>
                        <Text className='text-typography-700'>Turret:</Text>
                        <Badge
                          variant='solid'
                          action={
                            team.prescout_rotate_yaw ? 'success' : 'muted'
                          }
                        >
                          <BadgeText>
                            {team.prescout_rotate_yaw ? 'Yes' : 'No'}
                          </BadgeText>
                        </Badge>
                      </HStack>
                      <HStack className='gap-1'>
                        <Text className='text-typography-700'>Hood:</Text>
                        <Badge
                          variant='solid'
                          action={
                            team.prescout_rotate_pitch ? 'success' : 'muted'
                          }
                        >
                          <BadgeText>
                            {team.prescout_rotate_pitch ? 'Yes' : 'No'}
                          </BadgeText>
                        </Badge>
                      </HStack>
                    </HStack>
                  </VStack>
                </VStack>
              </Card>

              {/* Comments */}
              {team.prescout_additional_comments && (
                <Card variant='outline' className='p-4 mb-2'>
                  <VStack space='md'>
                    <Heading size='lg'>Additional Comments</Heading>
                    <Text className='text-typography-700'>
                      {team.prescout_additional_comments}
                    </Text>
                  </VStack>
                </Card>
              )}
              <Button size='lg' action='primary' className='mb-2'>
                <ButtonText>Prescout Team</ButtonText>
              </Button>
            </>
          )}
        </ScrollView>
      </Box>
    </AdaptiveSafeArea>
  );
}
