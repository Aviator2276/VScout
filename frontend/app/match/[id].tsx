import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, ActivityIndicator } from 'react-native';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Card } from '@/components/ui/card';
import { Badge, BadgeText } from '@/components/ui/badge';
import { Button, ButtonText } from '@/components/ui/button';
import { Center } from '@/components/ui/center';
import { Match } from '@/types/match';
import { getMatches } from '@/api/matches';
import { Box } from '@/components/ui/box';
import { Header } from '@/components/Header';
import {
  Table,
  TableBody,
  TableData,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { calculateAllianceClimbPoints } from '@/utils/climbPoints';

type TabType = 'overview' | 'scores';

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    loadMatchDetails();
  }, [id]);

  async function loadMatchDetails() {
    try {
      setLoading(true);
      setError(null);
      const matches = await getMatches();
      const foundMatch = matches.find((m) => m.match_number.toString() === id);

      if (foundMatch) {
        setMatch(foundMatch);
      } else {
        setError('Match not found');
      }
    } catch (err) {
      console.error('Failed to load match details:', err);
      setError('Failed to load match details');
    } finally {
      setLoading(false);
    }
  }

  const formatMatchTime = (timestamp: number): string => {
    if (!timestamp) return 'TBD';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDuration = (start: number, end: number): string => {
    if (!start || !end) return 'N/A';
    const duration = Math.floor((end - start) / 60);
    return `${duration} min`;
  };

  if (loading) {
    return (
      <AdaptiveSafeArea>
        <Center className='flex-1'>
          <ActivityIndicator size='large' />
        </Center>
      </AdaptiveSafeArea>
    );
  }

  if (error || !match) {
    return (
      <AdaptiveSafeArea>
        <Center className='flex-1 p-4'>
          <Text className='text-error-500 text-center mb-4'>
            {error || 'Match not found'}
          </Text>
          <Button onPress={() => router.push('/(tabs)')}>
            <ButtonText>Go Home</ButtonText>
          </Button>
        </Center>
      </AdaptiveSafeArea>
    );
  }

  const blueTeams = [match.blue_team_1, match.blue_team_2, match.blue_team_3];
  const redTeams = [match.red_team_1, match.red_team_2, match.red_team_3];

  const isMatchCompleted = (): boolean => {
    if (!match.end_match_time) return false;
    const currentTime = Math.floor(Date.now() / 1000);
    return match.end_match_time < currentTime;
  };

  return (
    <AdaptiveSafeArea>
      <Box className='max-w-2xl self-center w-full'>
        <Header
          title={'Match ' + match.match_number}
          isMainScreen={false}
          showBackButton
        />

        <ScrollView className='flex-1 px-4 pb-4'>
          <>
            {/* Match Info */}
            <Card variant='outline' className='p-4 mb-2'>
              <VStack space='md'>
                <Heading size='2xl' className='capitalize'>
                  {match.match_type} Match #{match.match_number}
                </Heading>
                <VStack space='xs'>
                  <HStack className='justify-between'>
                    <Text className='text-typography-700'>Set Number:</Text>
                    <Text className='font-semibold'>{match.set_number}</Text>
                  </HStack>
                  <HStack className='justify-between'>
                    <Text className='text-typography-700'>Competition:</Text>
                    <Text className='font-semibold'>
                      {match.competition.code}
                    </Text>
                  </HStack>
                  <HStack className='justify-between'>
                    <Text className='text-typography-700'>Start Time:</Text>
                    <Badge
                      size='sm'
                      variant='solid'
                      action={match.has_played ? 'success' : 'muted'}
                    >
                      <BadgeText>
                        {match.has_played
                          ? 'Done'
                          : match.predicted_match_time
                            ? formatMatchTime(match.predicted_match_time)
                            : match.start_match_time
                              ? formatMatchTime(match.start_match_time)
                              : 'TBD'}
                      </BadgeText>
                    </Badge>
                  </HStack>
                </VStack>
              </VStack>
            </Card>

            {/* Scout Button */}
            <Button size='lg' action='primary' className='mb-2'>
              <ButtonText>Scout Match</ButtonText>
            </Button>

            {/* Teams */}
            <Card variant='outline' className='p-1 mb-2'>
              <HStack space='xs' className='w-full'>
                <VStack space='xs' className='w-full'>
                  <Text className='font-semibold text-center text-blue-500'>
                    Blue Alliance
                  </Text>
                  {blueTeams.map((team, index) => (
                    <HStack
                      key={`blue-${index}`}
                      className='grid grid-cols-4 items-center p-1 bg-blue-500/20 rounded'
                    >
                      <Text className='col-span-1 font-medium'>
                        {team.number}
                      </Text>
                      <Text className='col-span-3 text-xs text-right text-typography-600 truncate'>
                        {team.name}
                      </Text>
                    </HStack>
                  ))}
                </VStack>
                <VStack space='xs' className='w-full'>
                  <Text className='font-semibold text-center text-red-500'>
                    Red Alliance
                  </Text>
                  {redTeams.map((team, index) => (
                    <HStack
                      key={`red-${index}`}
                      className='grid grid-cols-4 items-center p-1 bg-red-500/20 rounded'
                    >
                      <Text className='col-span-1 font-medium'>
                        {team.number}
                      </Text>
                      <Text className='col-span-3 text-xs text-right text-typography-600 truncate'>
                        {team.name}
                      </Text>
                    </HStack>
                  ))}
                </VStack>
              </HStack>
            </Card>
          </>

          {/* Tab Navigation */}
          <HStack className=' mb-2 p-1 rounded bg-secondary-100'>
            <Button
              size='xs'
              variant={activeTab === 'overview' ? 'solid' : 'link'}
              action='secondary'
              className='w-1/2'
              onPress={() => setActiveTab('overview')}
            >
              <Text className='text-center font-semibold'>Match Overview</Text>
            </Button>
            <Button
              size='xs'
              variant={activeTab === 'scores' ? 'solid' : 'link'}
              action='secondary'
              className='w-1/2'
              onPress={() => setActiveTab('scores')}
            >
              <Text className='text-center font-semibold'>Team Scores</Text>
            </Button>
          </HStack>
          {activeTab === 'overview' && (
            <>
              <Card variant='outline' className='p-4 mb-2'>
                <VStack space='md'>
                  <Heading size='lg'>Score Breakdown</Heading>
                  <Table className='w-full !text-center text-xs'>
                    <TableHeader>
                      <TableRow>
                        <TableHead className='text-center'>Blue</TableHead>
                        <TableHead className='text-center'>Score</TableHead>
                        <TableHead className='text-center'>Red</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableData className='text-center bg-blue-500/20'>
                          {match.blue_1_auto_fuel +
                            match.blue_2_auto_fuel +
                            match.blue_3_auto_fuel}
                        </TableData>
                        <TableData className='text-center text-sm'>
                          Auto Fuel
                        </TableData>
                        <TableData className='text-center bg-red-500/20'>
                          {match.red_1_auto_fuel +
                            match.red_2_auto_fuel +
                            match.red_3_auto_fuel}
                        </TableData>
                      </TableRow>
                      <TableRow>
                        <TableData className='text-center bg-blue-500/20'>
                          {match.blue_1_teleop_fuel +
                            match.blue_2_teleop_fuel +
                            match.blue_3_teleop_fuel}
                        </TableData>
                        <TableData className='text-center text-sm'>
                          Teleop Fuel
                        </TableData>
                        <TableData className='text-center bg-red-500/20'>
                          {match.red_1_teleop_fuel +
                            match.red_2_teleop_fuel +
                            match.red_3_teleop_fuel}
                        </TableData>
                      </TableRow>
                      <TableRow>
                        <TableData className='text-center bg-blue-500/20'>
                          {match.total_blue_fuels}
                        </TableData>
                        <TableData className='text-center text-sm'>
                          Total Fuel
                        </TableData>
                        <TableData className='text-center bg-red-500/20'>
                          {match.total_red_fuels}
                        </TableData>
                      </TableRow>

                      <TableRow>
                        <TableData className='text-center bg-blue-500/20'>
                          {calculateAllianceClimbPoints([
                            {
                              level: 0,
                              isAutonomous: match.blue_1_auto_climb,
                            },
                            {
                              level: 0,
                              isAutonomous: match.blue_2_auto_climb,
                            },
                            {
                              level: 0,
                              isAutonomous: match.blue_3_auto_climb,
                            },
                          ])}
                        </TableData>
                        <TableData className='text-center text-sm'>
                          Auto Climb
                        </TableData>
                        <TableData className='text-center bg-red-500/20'>
                          {calculateAllianceClimbPoints([
                            {
                              level: 0,
                              isAutonomous: match.red_1_auto_climb,
                            },
                            {
                              level: 0,
                              isAutonomous: match.red_2_auto_climb,
                            },
                            {
                              level: 0,
                              isAutonomous: match.red_3_auto_climb,
                            },
                          ])}
                        </TableData>
                      </TableRow>
                      <TableRow>
                        <TableData className='text-center bg-blue-500/20'>
                          {calculateAllianceClimbPoints([
                            {
                              level: match.blue_1_climb,
                              isAutonomous: false,
                            },
                            {
                              level: match.blue_2_climb,
                              isAutonomous: false,
                            },
                            {
                              level: match.blue_3_climb,
                              isAutonomous: false,
                            },
                          ])}
                        </TableData>
                        <TableData className='text-center text-sm'>
                          Endgame Climb
                        </TableData>
                        <TableData className='text-center bg-red-500/20'>
                          {calculateAllianceClimbPoints([
                            {
                              level: match.red_1_climb,
                              isAutonomous: false,
                            },
                            {
                              level: match.red_2_climb,
                              isAutonomous: false,
                            },
                            {
                              level: match.red_3_climb,
                              isAutonomous: false,
                            },
                          ])}
                        </TableData>
                      </TableRow>
                      <TableRow>
                        <TableData className='text-center text-sm bg-blue-500/20'>
                          {match.blue_total_score}
                        </TableData>
                        <TableData className='text-center text-sm'>
                          Total Score
                        </TableData>
                        <TableData className='text-center text-sm bg-red-500/20'>
                          {match.red_total_score}
                        </TableData>
                      </TableRow>
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableHead className='text-center text-sm bg-blue-500/20'>
                          {match.blue_ranking_points}
                        </TableHead>
                        <TableHead className='text-center text-sm'>
                          Ranking Points
                        </TableHead>
                        <TableHead className='text-center text-sm bg-red-500/20'>
                          {match.red_ranking_points}
                        </TableHead>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </VStack>
              </Card>
            </>
          )}
          {activeTab === 'scores' && (
            <>
              {/* Fuel Statistics */}
              <Card variant='outline' className='p-4 mb-2'>
                <VStack space='md'>
                  <Heading size='lg'>Fuel Breakdown</Heading>

                  <VStack space='sm'>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Total Blue Fuels:
                      </Text>
                      <Text className='font-semibold text-blue-500'>
                        {match.total_blue_fuels}
                      </Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Total Red Fuels:
                      </Text>
                      <Text className='font-semibold text-red-500'>
                        {match.total_red_fuels}
                      </Text>
                    </HStack>
                  </VStack>

                  {/* Auto Fuel */}
                  <VStack space='xs'>
                    <Text className='font-semibold'>Autonomous Fuel</Text>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Blue 1:
                      </Text>
                      <Text>{match.blue_1_auto_fuel}</Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Blue 2:
                      </Text>
                      <Text>{match.blue_2_auto_fuel}</Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Blue 3:
                      </Text>
                      <Text>{match.blue_3_auto_fuel}</Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Red 1:
                      </Text>
                      <Text>{match.red_1_auto_fuel}</Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Red 2:
                      </Text>
                      <Text>{match.red_2_auto_fuel}</Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Red 3:
                      </Text>
                      <Text>{match.red_3_auto_fuel}</Text>
                    </HStack>
                  </VStack>

                  {/* Teleop Fuel */}
                  <VStack space='xs'>
                    <Text className='font-semibold'>Teleop Fuel</Text>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Blue 1:
                      </Text>
                      <Text>{match.blue_1_teleop_fuel}</Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Blue 2:
                      </Text>
                      <Text>{match.blue_2_teleop_fuel}</Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Blue 3:
                      </Text>
                      <Text>{match.blue_3_teleop_fuel}</Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Red 1:
                      </Text>
                      <Text>{match.red_1_teleop_fuel}</Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Red 2:
                      </Text>
                      <Text>{match.red_2_teleop_fuel}</Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Red 3:
                      </Text>
                      <Text>{match.red_3_teleop_fuel}</Text>
                    </HStack>
                  </VStack>

                  {/* Fuel Scored */}
                  <VStack space='xs'>
                    <Text className='font-semibold'>Fuel Scored</Text>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Blue 1:
                      </Text>
                      <Text>{match.blue_1_fuel_scored}</Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Blue 2:
                      </Text>
                      <Text>{match.blue_2_fuel_scored}</Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Blue 3:
                      </Text>
                      <Text>{match.blue_3_fuel_scored}</Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Red 1:
                      </Text>
                      <Text>{match.red_1_fuel_scored}</Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Red 2:
                      </Text>
                      <Text>{match.red_2_fuel_scored}</Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Red 3:
                      </Text>
                      <Text>{match.red_3_fuel_scored}</Text>
                    </HStack>
                  </VStack>
                </VStack>
              </Card>

              {/* Climb Statistics */}
              <Card variant='outline' className='p-4 mb-2'>
                <VStack space='md'>
                  <Heading size='lg'>Climb Breakdown</Heading>

                  <VStack space='xs'>
                    <Text className='font-semibold text-blue-500'>
                      Blue Alliance
                    </Text>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Team {blueTeams[0].number}:
                      </Text>
                      <Badge
                        variant='solid'
                        action={
                          match.blue_1_climb !== 'None' ? 'success' : 'muted'
                        }
                      >
                        <BadgeText>{match.blue_1_climb}</BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Team {blueTeams[1].number}:
                      </Text>
                      <Badge
                        variant='solid'
                        action={
                          match.blue_2_climb !== 'None' ? 'success' : 'muted'
                        }
                      >
                        <BadgeText>{match.blue_2_climb}</BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Team {blueTeams[2].number}:
                      </Text>
                      <Badge
                        variant='solid'
                        action={
                          match.blue_3_climb !== 'None' ? 'success' : 'muted'
                        }
                      >
                        <BadgeText>{match.blue_3_climb}</BadgeText>
                      </Badge>
                    </HStack>
                  </VStack>

                  <VStack space='xs'>
                    <Text className='font-semibold text-red-500'>
                      Red Alliance
                    </Text>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Team {redTeams[0].number}:
                      </Text>
                      <Badge
                        variant='solid'
                        action={
                          match.red_1_climb !== 'None' ? 'success' : 'muted'
                        }
                      >
                        <BadgeText>{match.red_1_climb}</BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Team {redTeams[1].number}:
                      </Text>
                      <Badge
                        variant='solid'
                        action={
                          match.red_2_climb !== 'None' ? 'success' : 'muted'
                        }
                      >
                        <BadgeText>{match.red_2_climb}</BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-sm text-typography-600'>
                        Team {redTeams[2].number}:
                      </Text>
                      <Badge
                        variant='solid'
                        action={
                          match.red_3_climb !== 'None' ? 'success' : 'muted'
                        }
                      >
                        <BadgeText>{match.red_3_climb}</BadgeText>
                      </Badge>
                    </HStack>
                  </VStack>
                </VStack>
              </Card>
            </>
          )}
        </ScrollView>
      </Box>
    </AdaptiveSafeArea>
  );
}
