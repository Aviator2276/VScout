import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, ActivityIndicator, Pressable } from 'react-native';
import {
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicator,
  ActionsheetDragIndicatorWrapper,
} from '@/components/ui/actionsheet';
import { Switch } from '@/components/ui/switch';
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
import { MatchTeamCard } from '@/components/MatchTeamCard';
import {
  Popover,
  PopoverArrow,
  PopoverBackdrop,
  PopoverBody,
  PopoverContent,
} from '@/components/ui/popover';
import { TriangleAlert } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
import { useAssets } from 'expo-asset';

type TabType = 'overview' | 'scores';

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [isScoutSheetOpen, setIsScoutSheetOpen] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [testImage, testError] = useAssets([
    require('/assets/images/test.png'),
  ]);

  const speedOptions = [1, 1.25, 1.5, 1.75, 2];

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
      <Header
        title={'Match ' + match.match_number}
        isMainScreen={false}
        showBackButton
        fallbackRoute='/(tabs)/matches'
      />
      <Box className='max-w-2xl self-center w-full'>
        <ScrollView className='flex-1 px-4 pb-4 pt-2'>
          {testImage ? (
            <Card
              variant='outline'
              className='w-lvw aspect-video p-0 -ml-4 mb-2 overflow-hidden'
            >
              <Image
                source={{ uri: testImage[0].uri }}
                alt='Match video'
                className='w-lvw h-full'
              />
            </Card>
          ) : (
            <Card
              variant='outline'
              className='w-lvw aspect-video p-0 -ml-4 mb-2'
            >
              <Center className='items-center justify-center h-full'>
                Video Not Available
              </Center>
            </Card>
          )}
          <Card variant='outline' className='p-2 mb-2'>
            <VStack space='md'>
              <Heading size='2xl' className='capitalize'>
                {match.match_type} #{match.match_number}
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
            <HStack space='xs' className='w-full'>
              <VStack space='xs' className='w-full'>
                <Text className='font-semibold text-center text-blue-500'>
                  Blue Alliance
                </Text>
                {blueTeams.map((team, index) => (
                  <Pressable
                    key={`blue-${index}`}
                    onPress={() =>
                      router.push(
                        `/(tabs)/team/${team.number}?from=match&matchId=${match.match_number}`,
                      )
                    }
                  >
                    <HStack className='grid grid-cols-4 items-center p-1 bg-blue-500/20 rounded'>
                      <Text className='col-span-1 font-medium'>
                        {team.number}
                      </Text>
                      <Text className='col-span-3 text-xs text-right text-typography-600 truncate'>
                        {team.name}
                      </Text>
                    </HStack>
                  </Pressable>
                ))}
              </VStack>
              <VStack space='xs' className='w-full'>
                <Text className='font-semibold text-center text-red-500'>
                  Red Alliance
                </Text>
                {redTeams.map((team, index) => (
                  <Pressable
                    key={`red-${index}`}
                    onPress={() =>
                      router.push(
                        `/(tabs)/team/${team.number}?from=match&matchId=${match.match_number}`,
                      )
                    }
                  >
                    <HStack className='grid grid-cols-4 items-center p-1 bg-red-500/20 rounded'>
                      <Text className='col-span-1 font-medium'>
                        {team.number}
                      </Text>
                      <Text className='col-span-3 text-xs text-right text-typography-600 truncate'>
                        {team.name}
                      </Text>
                    </HStack>
                  </Pressable>
                ))}
              </VStack>
            </HStack>
          </Card>

          {/* Scout Button */}
          <Button
            size='lg'
            action='primary'
            className='mb-2'
            onPress={() => setIsScoutSheetOpen(true)}
          >
            <ButtonText>Scout Match</ButtonText>
          </Button>

          {/* Scout Match Actionsheet */}
          <Actionsheet
            isOpen={isScoutSheetOpen}
            onClose={() => setIsScoutSheetOpen(false)}
          >
            <ActionsheetBackdrop />
            <ActionsheetContent className='p-4'>
              <ActionsheetDragIndicatorWrapper>
                <ActionsheetDragIndicator />
              </ActionsheetDragIndicatorWrapper>
              <VStack space='lg' className='w-full max-w-md self-center py-4'>
                <Heading size='xl' className='text-center capitalize'>
                  Scout {match.match_type} {match.match_number}
                </Heading>
                <Card variant='outline' className='p-4 border-warning-500'>
                  <HStack className='items-center justify-between gap-2'>
                    <Icon
                      as={TriangleAlert}
                      size='lg'
                      className='w-12 text-warning-500'
                    />
                    <Text className='text-warning-500'>
                      Match timer will start immediately after clicking start.
                    </Text>
                  </HStack>
                </Card>

                {/* Live/Video Mode Switch */}
                <Card variant='outline' className='p-4'>
                  <HStack className='justify-between items-center'>
                    <VStack>
                      <Text className='font-semibold'>Scout Live</Text>
                      <Text className='text-typography-500 text-sm'>
                        {isLiveMode
                          ? 'Scout in real-time'
                          : 'Scout from recording'}
                      </Text>
                    </VStack>
                    <HStack space='sm' className='items-center'>
                      <Switch
                        value={isLiveMode}
                        onValueChange={setIsLiveMode}
                      />
                    </HStack>
                  </HStack>
                </Card>

                {/* Playback Speed */}
                <Popover
                  placement='top'
                  size='xs'
                  isOpen={isLiveMode ? undefined : false}
                  trigger={(triggerProps) => (
                    <Pressable {...triggerProps}>
                      <Card variant='outline' className='p-4'>
                        <VStack space='sm'>
                          <VStack className='flex-1'>
                            <Text
                              className={`font-semibold ${isLiveMode ? 'text-typography-400' : ''}`}
                            >
                              Playback Speed
                            </Text>
                            <Text
                              className={`font-sm ${isLiveMode ? 'text-typography-200' : 'text-typography-500'}`}
                            >
                              Cannot change during scouting
                            </Text>
                          </VStack>

                          <HStack
                            space='xs'
                            className='flex-wrap justify-between'
                          >
                            {speedOptions.map((speed) => (
                              <Button
                                key={speed}
                                size='sm'
                                variant={
                                  playbackSpeed === speed && !isLiveMode
                                    ? 'solid'
                                    : 'outline'
                                }
                                action={
                                  playbackSpeed === speed && !isLiveMode
                                    ? 'primary'
                                    : 'secondary'
                                }
                                onPress={() =>
                                  !isLiveMode && setPlaybackSpeed(speed)
                                }
                                className={`min-w-[50px] ${isLiveMode ? 'opacity-40' : ''}`}
                                disabled={isLiveMode}
                              >
                                <ButtonText
                                  className={
                                    isLiveMode ? 'text-typography-400' : ''
                                  }
                                >
                                  {speed}x
                                </ButtonText>
                              </Button>
                            ))}
                          </HStack>
                        </VStack>
                      </Card>
                    </Pressable>
                  )}
                >
                  {isLiveMode && (
                    <>
                      <PopoverBackdrop />
                      <PopoverContent>
                        <PopoverArrow />
                        <PopoverBody>
                          <Text className='text-typography-900'>
                            Speed controls are only available in video mode
                          </Text>
                        </PopoverBody>
                      </PopoverContent>
                    </>
                  )}
                </Popover>

                <Popover
                  placement='top'
                  size='xs'
                  isOpen={isLiveMode ? undefined : false}
                  trigger={(triggerProps) => (
                    <Pressable {...triggerProps}>
                      <Card variant='outline' className='p-4'>
                        <HStack className='justify-between items-center'>
                          <VStack className='flex-1'>
                            <Text
                              className={`font-semibold ${isLiveMode ? 'text-typography-400' : ''}`}
                            >
                              Match Video
                            </Text>
                            <Text
                              className={`font-sm ${isLiveMode ? 'text-typography-200' : 'text-typography-500'}`}
                            >
                              Download video for scouting
                            </Text>
                          </VStack>
                          <Button
                            size='sm'
                            variant='outline'
                            action='secondary'
                            className={`min-w-[50px] ${isLiveMode ? 'opacity-40' : ''}`}
                            disabled={isLiveMode}
                            onPress={() => {
                              // TODO: Implement video download functionality
                              console.log(
                                'Download video for match',
                                match.match_number,
                              );
                            }}
                          >
                            <ButtonText>Download</ButtonText>
                          </Button>
                        </HStack>
                      </Card>
                    </Pressable>
                  )}
                >
                  {isLiveMode && (
                    <>
                      <PopoverBackdrop />
                      <PopoverContent>
                        <PopoverArrow />
                        <PopoverBody>
                          <Text className='text-typography-900'>
                            Video downloads are only available in video mode
                          </Text>
                        </PopoverBody>
                      </PopoverContent>
                    </>
                  )}
                </Popover>
                <Button
                  size='lg'
                  action='positive'
                  onPress={() => {
                    setIsScoutSheetOpen(false);
                    // TODO: Navigate to scouting screen
                    // router.push(`/(tabs)/match/scout/${match.match_number}?mode=${isLiveMode ? 'live' : 'video'}&speed=${playbackSpeed}`);
                  }}
                >
                  <ButtonText>Start Scouting</ButtonText>
                </Button>

                <Button
                  size='md'
                  variant='outline'
                  action='secondary'
                  onPress={() => setIsScoutSheetOpen(false)}
                >
                  <ButtonText>Cancel</ButtonText>
                </Button>
              </VStack>
            </ActionsheetContent>
          </Actionsheet>

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
                          {match.blue_penalties}
                        </TableData>
                        <TableData className='text-center text-sm'>
                          Penalties
                        </TableData>
                        <TableData className='text-center text-sm bg-red-500/20'>
                          {match.red_penalties}
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
              <MatchTeamCard
                stats={{
                  team: match.blue_team_1,
                  alliance: 'blue',
                  position: 1,
                  autoFuel: match.blue_1_auto_fuel,
                  teleopFuel: match.blue_1_teleop_fuel,
                  totalFuelScored: match.blue_1_fuel_scored,
                  autoClimb: match.blue_1_auto_climb,
                  climbLevel: match.blue_1_climb,
                  totalAllianceScore: match.blue_total_score,
                }}
                matchNumber={match.match_number}
              />
              <MatchTeamCard
                stats={{
                  team: match.blue_team_2,
                  alliance: 'blue',
                  position: 2,
                  autoFuel: match.blue_2_auto_fuel,
                  teleopFuel: match.blue_2_teleop_fuel,
                  totalFuelScored: match.blue_2_fuel_scored,
                  autoClimb: match.blue_2_auto_climb,
                  climbLevel: match.blue_2_climb,
                  totalAllianceScore: match.blue_total_score,
                }}
                matchNumber={match.match_number}
              />
              <MatchTeamCard
                stats={{
                  team: match.blue_team_3,
                  alliance: 'blue',
                  position: 3,
                  autoFuel: match.blue_3_auto_fuel,
                  teleopFuel: match.blue_3_teleop_fuel,
                  totalFuelScored: match.blue_3_fuel_scored,
                  autoClimb: match.blue_3_auto_climb,
                  climbLevel: match.blue_3_climb,
                  totalAllianceScore: match.blue_total_score,
                }}
                matchNumber={match.match_number}
              />
              <MatchTeamCard
                stats={{
                  team: match.red_team_1,
                  alliance: 'red',
                  position: 1,
                  autoFuel: match.red_1_auto_fuel,
                  teleopFuel: match.red_1_teleop_fuel,
                  totalFuelScored: match.red_1_fuel_scored,
                  autoClimb: match.red_1_auto_climb,
                  climbLevel: match.red_1_climb,
                  totalAllianceScore: match.blue_total_score,
                }}
                matchNumber={match.match_number}
              />
              <MatchTeamCard
                stats={{
                  team: match.red_team_2,
                  alliance: 'red',
                  position: 2,
                  autoFuel: match.red_2_auto_fuel,
                  teleopFuel: match.red_2_teleop_fuel,
                  totalFuelScored: match.red_2_fuel_scored,
                  autoClimb: match.red_2_auto_climb,
                  climbLevel: match.red_2_climb,
                  totalAllianceScore: match.blue_total_score,
                }}
                matchNumber={match.match_number}
              />
              <MatchTeamCard
                stats={{
                  team: match.red_team_3,
                  alliance: 'red',
                  position: 3,
                  autoFuel: match.red_3_auto_fuel,
                  teleopFuel: match.red_3_teleop_fuel,
                  totalFuelScored: match.red_3_fuel_scored,
                  autoClimb: match.red_3_auto_climb,
                  climbLevel: match.red_3_climb,
                  totalAllianceScore: match.blue_total_score,
                }}
                matchNumber={match.match_number}
              />
            </>
          )}
        </ScrollView>
      </Box>
    </AdaptiveSafeArea>
  );
}
