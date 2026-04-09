import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
  ScrollView,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
} from 'react-native';
import { Match } from '@/types/match';
import { db } from '@/utils/db';
import { TeamMatchCard } from '@/components/TeamMatchCard';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Card } from '@/components/ui/card';
import { Badge, BadgeIcon, BadgeText } from '@/components/ui/badge';
import { Button, ButtonText, ButtonIcon } from '@/components/ui/button';
import { Center } from '@/components/ui/center';
import { TeamInfo, TeamComment } from '@/types/team';
import { getTeamInfo, getTeamName, updateTeamPrescout } from '@/api/teams';
import {
  fetchTeamComments,
  getCachedTeamComments,
  deleteTeamComment,
} from '@/api/teamComments';
import { updateCommentTagsForTeam } from '@/api/commentTags';
import { Box } from '@/components/ui/box';
import { Header } from '@/components/Header';
import {
  Binoculars,
  ChevronDown,
  CircleGauge,
  CircleQuestionMark,
  Contact,
  Dice4,
  EyeOff,
  Forklift,
  Goal,
  MessageSquare,
  Move,
  MoveVertical,
  Send,
  Truck,
} from 'lucide-react-native';
import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionTitleText,
  AccordionIcon,
  AccordionContent,
} from '@/components/ui/accordion';
import { Image } from '@/components/ui/image';
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { TeamPictureCamera } from '@/components/TeamPictureCamera';
import { TeamFuelChart } from '@/components/TeamFuelChart';
import { PitMap } from '@/components/PitMap';
import { useApp } from '@/contexts/AppContext';
import {
  Actionsheet,
  ActionsheetBackdrop,
  ActionsheetContent,
  ActionsheetDragIndicator,
  ActionsheetDragIndicatorWrapper,
} from '@/components/ui/actionsheet';
import { Input, InputField, InputSlot, InputIcon } from '@/components/ui/input';
import { Textarea, TextareaInput } from '@/components/ui/textarea';

type TabType = 'overview' | 'prescout' | 'matches' | 'map';

export default function TeamDetailScreen() {
  const { id, from, matchId } = useLocalSearchParams<{
    id: string;
    from?: string;
    matchId?: string;
  }>();
  const router = useRouter();
  const { competitionCode } = useApp();
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showPrescoutAlert, setShowPrescoutAlert] = useState(false);
  const [showCameraView, setShowCameraView] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  const [teamMatches, setTeamMatches] = useState<Match[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [comments, setComments] = useState<TeamComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [isDeletingComment, setIsDeletingComment] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<number | null>(null);
  const commentsScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (comments.length > 0 && commentsScrollRef.current) {
      setTimeout(() => {
        commentsScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [comments]);

  const getBackRoute = () => {
    if (from === 'match' && matchId) {
      return `/(tabs)/match/${matchId}`;
    }
    if (from === 'alliance-selection') {
      return '/alliance-selection';
    }
    return '/(tabs)/teams';
  };

  useFocusEffect(
    useCallback(() => {
      loadTeamDetails();
      loadTeamMatches();
    }, [id]),
  );

  async function loadTeamMatches() {
    try {
      setMatchesLoading(true);
      const teamNumber = parseInt(id || '0', 10);
      if (!teamNumber || !competitionCode) return;

      const allMatches = await db.matches
        .where('competitionCode')
        .equals(competitionCode)
        .toArray();

      const filtered = allMatches.filter(
        (m) =>
          m.blue_team_1.number === teamNumber ||
          m.blue_team_2.number === teamNumber ||
          m.blue_team_3.number === teamNumber ||
          m.red_team_1.number === teamNumber ||
          m.red_team_2.number === teamNumber ||
          m.red_team_3.number === teamNumber,
      );

      filtered.sort((a, b) => a.match_number - b.match_number);
      setTeamMatches(filtered);
    } catch (err) {
      console.error('Failed to load team matches:', err);
    } finally {
      setMatchesLoading(false);
    }
  }

  async function loadComments() {
    const teamNumber = parseInt(id || '0', 10);
    if (!teamNumber) return;

    // Load cached comments first
    const cached = await getCachedTeamComments(teamNumber);
    // Deduplicate by comment text + team_number (guards against id:0 duplicates)
    const seen = new Set<string>();
    const deduped = cached.filter((c) => {
      const key = `${c.team_number}-${c.comment}-${c.created_at}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setComments(deduped);

    // Try fetching from server
    try {
      const fresh = await fetchTeamComments(teamNumber);
      setComments(fresh);
    } catch (err) {
      console.error('Failed to fetch comments from server:', err);
    }
  }

  function handleDeleteComment(commentId: number) {
    if (commentId === 0) return; // Can't delete local-only comments
    setCommentToDelete(commentId);
    setDeleteDialogOpen(true);
  }

  async function confirmDeleteComment() {
    const teamNumber = parseInt(id || '0', 10);
    if (!teamNumber || !commentToDelete) return;

    setIsDeletingComment(true);
    setDeleteDialogOpen(false);
    try {
      await deleteTeamComment(teamNumber, commentToDelete);
      // Reload comments after deletion
      await loadComments();
      // Recompute tags after deletion
      await updateCommentTagsForTeam(teamNumber);
    } catch (err) {
      console.error('Failed to delete comment:', err);
    } finally {
      setIsDeletingComment(false);
      setCommentToDelete(null);
    }
  }

  async function handleSendComment() {
    const teamNumber = parseInt(id || '0', 10);
    if (!teamNumber || !commentText.trim() || !competitionCode) return;

    setIsSendingComment(true);
    try {
      const localId = `${competitionCode}-${teamNumber}-${Date.now()}`;

      // Store as a comment record for upload
      await db.commentRecords.put({
        local_id: localId,
        info: {
          status: 'pending',
          competitionCode,
          created_at: Date.now(),
          last_retry: 0,
        },
        team: {
          number: teamNumber,
          name: teamName || '',
        },
        comment: commentText.trim(),
      });

      // Add to local display immediately
      const localComment = {
        id: 0,
        team_number: teamNumber,
        comment: commentText.trim(),
        created_at: Math.floor(Date.now() / 1000),
      };
      setComments((prev) => [...prev, localComment]);

      setCommentText('');
    } catch (err) {
      console.error('Failed to save comment:', err);
    } finally {
      setIsSendingComment(false);
    }
  }

  async function handlePictureCapture(capturedUri: string) {
    setUri(capturedUri);
    const teamNumber = parseInt(id || '0', 10);
    if (teamNumber && team) {
      await updateTeamPrescout(teamNumber, {
        prescout_drivetrain: team.prescout_drivetrain || '',
        prescout_hopper_size: team.prescout_hopper_size || 0,
        prescout_intake_type: team.prescout_intake_type || '',
        prescout_rotate_yaw: team.prescout_rotate_yaw ?? false,
        prescout_rotate_pitch: team.prescout_rotate_pitch ?? false,
        prescout_range: team.prescout_range || '',
        prescout_additional_comments: team.prescout_additional_comments || '',
        prescout_shooter_type: team.prescout_shooter_type || '',
        prescout_trench_travel: team.prescout_trench_travel ?? false,
        prescout_trench_travel_preference:
          team.prescout_trench_travel_preference || '',
        prescout_has_auto: team.prescout_has_auto ?? false,
        prescout_has_disruption_auto:
          team.prescout_has_disruption_auto ?? false,
        prescout_auto_starting_pose: team.prescout_auto_starting_pose || '',
        prescout_auto_depot: team.prescout_auto_depot ?? false,
        prescout_auto_outpost: team.prescout_auto_outpost ?? false,
        prescout_auto_crosses_center_line:
          team.prescout_auto_crosses_center_line ?? false,
        prescout_auto_climb_level: team.prescout_auto_climb_level || '',
        prescout_auto_center_sweeps: team.prescout_auto_center_sweeps || '',
        picture: capturedUri,
      });
      setTeam({ ...team, picture: capturedUri });
    }
  }

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
        // Recompute comment tags when opening team screen
        updateCommentTagsForTeam(teamNumber).catch((err) =>
          console.error('Failed to update comment tags:', err),
        );
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
      <Header
        title={`Team ${team.team_number}`}
        isMainScreen={false}
        showBackButton
        fallbackRoute={getBackRoute()}
      />
      <TeamPictureCamera
        isOpen={showCameraView}
        onClose={() => setShowCameraView(false)}
        onCapture={handlePictureCapture}
        teamNumber={team.team_number}
        teamName={teamName || ''}
        competitionCode={competitionCode || ''}
      />
      <Box className='max-w-2xl self-center w-full'>
        <ScrollView className='flex-1 px-4 pb-4 pt-4'>
          {team.picture ? (
            <Card
              variant='outline'
              className='aspect-square object-cover max-w-full mb-2'
            >
              <Image
                source={{ uri: team.picture }}
                size='full'
                alt={team.team_number + "'s Robot Picture"}
              />
            </Card>
          ) : null}
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
              <Button
                size='sm'
                variant='outline'
                action='secondary'
                onPress={() => {
                  setIsCommentsOpen(true);
                  loadComments();
                }}
                className='w-full'
              >
                <ButtonIcon as={MessageSquare} className='mr-2' />
                <ButtonText>Comments</ButtonText>
              </Button>
              {team.tags && team.tags.length > 0 && (
                <HStack className='flex-wrap gap-1'>
                  {team.tags.map((tag) => (
                    <Badge key={tag} size='lg' variant='solid' action='info'>
                      <BadgeText>#{tag}</BadgeText>
                    </Badge>
                  ))}
                </HStack>
              )}
            </VStack>
          </Card>
          {/* Tab Navigation */}
          <HStack className='mb-2 p-1 rounded bg-secondary-100'>
            <Button
              size='xs'
              variant={activeTab === 'overview' ? 'solid' : 'link'}
              action='secondary'
              className='w-1/4'
              onPress={() => setActiveTab('overview')}
            >
              <Text className='text-center font-semibold'>Stats</Text>
            </Button>
            <Button
              size='xs'
              variant={activeTab === 'matches' ? 'solid' : 'link'}
              action='secondary'
              className='w-1/4'
              onPress={() => setActiveTab('matches')}
            >
              <Text className='text-center font-semibold'>Matches</Text>
            </Button>
            <Button
              size='xs'
              variant={activeTab === 'prescout' ? 'solid' : 'link'}
              action='secondary'
              className='w-1/4'
              onPress={() => setActiveTab('prescout')}
            >
              <Text className='text-center font-semibold'>Prescout</Text>
            </Button>
            <Button
              size='xs'
              variant={activeTab === 'map' ? 'solid' : 'link'}
              action='secondary'
              className='w-1/4'
              onPress={() => setActiveTab('map')}
            >
              <Text className='text-center font-semibold'>Map</Text>
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
                        {team.local_consistency !== undefined
                          ? Math.round(team.local_consistency * 100)
                          : Math.round(
                              parseFloat(team.consistency_rating) * 100,
                            )}
                        %
                      </BadgeText>
                    </Badge>
                  </HStack>

                  <VStack space='xs'>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Median Auto Fuel:
                      </Text>
                      <Text className='font-semibold'>
                        {team.median_auto_fuel ?? '-'} ±{' '}
                        {team.sd_auto_fuel ?? '-'}
                      </Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Median Teleop Fuel:
                      </Text>
                      <Text className='font-semibold'>
                        {team.median_tele_fuel ?? '-'} ±{' '}
                        {team.sd_tele_fuel ?? '-'}
                      </Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Median Climb Level:
                      </Text>
                      <Text className='font-semibold'>
                        L{team.median_climb_level ?? '-'} ±{' '}
                        {team.sd_climb_level ?? '-'}
                      </Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Median Points Contributed:
                      </Text>
                      <Badge size='md' variant='solid' action='info'>
                        <BadgeText>
                          {team.median_points_contributed ?? '-'} ±{' '}
                          {team.sd_points_contributed ?? '-'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Time to First Fuel (seconds):
                      </Text>
                      <Text className='font-semibold'>
                        {team.comment_tags?.TTFF ?? 'N/A'}
                      </Text>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Time to Center Line (seconds):
                      </Text>
                      <Text className='font-semibold'>
                        {team.comment_tags?.TTCL ?? 'N/A'}
                      </Text>
                    </HStack>
                  </VStack>
                </VStack>
              </Card>

              {/* Time Stats & Percentiles Accordions */}
              <Card variant='outline' className='p-4 mb-2'>
                <Accordion type='multiple' defaultValue={[]}>
                  {/* Time Stats */}
                  <AccordionItem value='timestats'>
                    <AccordionHeader>
                      <AccordionTrigger>
                        <AccordionTitleText>
                          Time Stats (Avg per Match)
                        </AccordionTitleText>
                        <AccordionIcon as={ChevronDown} />
                      </AccordionTrigger>
                    </AccordionHeader>
                    <AccordionContent>
                      <VStack space='xs'>
                        <HStack className='justify-between'>
                          <Text className='text-typography-700'>
                            Shooting Time
                          </Text>
                          <Text className='font-semibold'>
                            {team.avg_shooting_time != null
                              ? `${team.avg_shooting_time}s`
                              : '-'}
                          </Text>
                        </HStack>
                        <HStack className='justify-between'>
                          <Text className='text-typography-700'>
                            Shooting Interval
                          </Text>
                          <Text className='font-semibold'>
                            {team.avg_shooting_interval != null
                              ? `${team.avg_shooting_interval}s`
                              : '-'}
                          </Text>
                        </HStack>
                        <HStack className='justify-between'>
                          <Text className='text-typography-700'>
                            Intake/Herding Interval
                          </Text>
                          <Text className='font-semibold'>
                            {team.avg_intake_herding_interval != null
                              ? `${team.avg_intake_herding_interval}s`
                              : '-'}
                          </Text>
                        </HStack>
                        <HStack className='justify-between'>
                          <Text className='text-typography-700'>
                            Disabled Time
                          </Text>
                          <Text className='font-semibold'>
                            {team.avg_disabled_time != null
                              ? `${team.avg_disabled_time}s`
                              : '-'}
                          </Text>
                        </HStack>
                        <HStack className='justify-between'>
                          <Text className='text-typography-700'>
                            Defense Time
                          </Text>
                          <Text className='font-semibold'>
                            {team.avg_defense_time != null
                              ? `${team.avg_defense_time}s`
                              : '-'}
                          </Text>
                        </HStack>
                      </VStack>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Percentiles */}
                  <AccordionItem value='percentiles'>
                    <AccordionHeader>
                      <AccordionTrigger>
                        <AccordionTitleText>Percentiles</AccordionTitleText>
                        <AccordionIcon as={ChevronDown} />
                      </AccordionTrigger>
                    </AccordionHeader>
                    <AccordionContent>
                      <VStack space='xs'>
                        <HStack className='justify-between'>
                          <Text className='text-typography-700'>
                            Median Fuel
                          </Text>
                          <Text className='font-semibold'>
                            {team.percentile_median_fuel != null
                              ? `${team.percentile_median_fuel}%`
                              : '-'}
                          </Text>
                        </HStack>
                        <HStack className='justify-between'>
                          <Text className='text-typography-700'>
                            Median Auto Fuel
                          </Text>
                          <Text className='font-semibold'>
                            {team.percentile_median_auto_fuel != null
                              ? `${team.percentile_median_auto_fuel}%`
                              : '-'}
                          </Text>
                        </HStack>
                        <HStack className='justify-between'>
                          <Text className='text-typography-700'>
                            Shooting Time
                          </Text>
                          <Text className='font-semibold'>
                            {team.percentile_avg_shooting_time != null
                              ? `${team.percentile_avg_shooting_time}%`
                              : '-'}
                          </Text>
                        </HStack>
                        <HStack className='justify-between'>
                          <Text className='text-typography-700'>
                            Shooting Interval
                          </Text>
                          <Text className='font-semibold'>
                            {team.percentile_avg_shooting_interval != null
                              ? `${team.percentile_avg_shooting_interval}%`
                              : '-'}
                          </Text>
                        </HStack>
                        <HStack className='justify-between'>
                          <Text className='text-typography-700'>
                            Intake/Herding
                          </Text>
                          <Text className='font-semibold'>
                            {team.percentile_avg_intake_herding_interval != null
                              ? `${team.percentile_avg_intake_herding_interval}%`
                              : '-'}
                          </Text>
                        </HStack>
                        <HStack className='justify-between'>
                          <Text className='text-typography-700'>
                            Disabled Time
                          </Text>
                          <Text className='font-semibold'>
                            {team.percentile_avg_disabled_time != null
                              ? `${team.percentile_avg_disabled_time}%`
                              : '-'}
                          </Text>
                        </HStack>
                        <HStack className='justify-between'>
                          <Text className='text-typography-700'>
                            Defense Time
                          </Text>
                          <Text className='font-semibold'>
                            {team.percentile_avg_defense_time != null
                              ? `${team.percentile_avg_defense_time}%`
                              : '-'}
                          </Text>
                        </HStack>
                      </VStack>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </Card>

              <TeamFuelChart
                matches={teamMatches}
                teamNumber={parseInt(id || '0', 10)}
              />
            </>
          )}
          {activeTab === 'matches' && (
            <>
              {matchesLoading ? (
                <Center className='py-8'>
                  <ActivityIndicator size='large' />
                </Center>
              ) : teamMatches.length === 0 ? (
                <Card variant='outline' className='p-4 mb-2'>
                  <Text className='text-center text-typography-500'>
                    No matches found for this team
                  </Text>
                </Card>
              ) : (
                teamMatches.map((match) => (
                  <TeamMatchCard
                    key={`${match.match_type}-${match.set_number}-${match.match_number}`}
                    match={match}
                    teamNumber={parseInt(id || '0', 10)}
                    competitionCode={competitionCode || ''}
                  />
                ))
              )}
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
                        as={team.prescout_drivetrain ? Binoculars : EyeOff}
                      ></BadgeIcon>
                      <BadgeText className='capitalize ml-1'>
                        {team.prescout_drivetrain
                          ? 'Prescouted'
                          : 'Not Prescouted'}
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
                      <Text className='text-typography-700'>
                        Driver Experience:
                      </Text>
                      <Badge
                        size='lg'
                        variant='solid'
                        action='muted'
                        className='justify-center items-center bg-emerald-500/40'
                      >
                        <BadgeIcon as={Contact}></BadgeIcon>
                        <BadgeText className='capitalize ml-1'>
                          {team.prescout_driver_years}{' '}
                          {team.prescout_driver_years === 1 ? 'year' : 'years'}
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
                          {team.prescout_hopper_size}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Trench Travel:
                      </Text>
                      <Badge
                        variant='solid'
                        action={
                          team.prescout_trench_travel ? 'success' : 'muted'
                        }
                      >
                        <BadgeText>
                          {team.prescout_trench_travel ? 'Yes' : 'No'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>Preference:</Text>
                      <Badge variant='solid' action='muted'>
                        <BadgeText className='capitalize'>
                          {team.prescout_trench_travel_preference === 'trench'
                            ? 'Trench Only'
                            : team.prescout_trench_travel_preference === 'bump'
                              ? 'Bump Only'
                              : team.prescout_trench_travel_preference ===
                                  'both'
                                ? 'Both'
                                : 'N/A'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                  </VStack>
                  <VStack space='xs'>
                    <HStack className='justify-between'>
                      <Heading size='lg'>Shooter Info</Heading>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>Type:</Text>
                      <Badge size='lg' variant='solid' action='muted'>
                        <BadgeText className='capitalize'>
                          {team.prescout_shooter_type || 'Unknown'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>Range:</Text>
                      <Badge
                        size='lg'
                        variant='solid'
                        action='muted'
                        className='justify-center items-center'
                      >
                        <BadgeIcon as={Goal}></BadgeIcon>
                        <BadgeText className='capitalize ml-1'>
                          {team.prescout_range === 'alliance'
                            ? 'Alliance Zone Only'
                            : team.prescout_range === 'neutral'
                              ? 'Neutral to Alliance Zone'
                              : team.prescout_range === 'opponent'
                                ? 'Opponent to Alliance Zone'
                                : team.prescout_range === 'none'
                                  ? 'N/A'
                                  : 'Unknown'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='grid grid-cols-2'>
                      <HStack className='gap-1 justify-center'>
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
                      <HStack className='gap-1 justify-center'>
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
              {/* Autonomous Info */}
              <Card variant='outline' className='p-4 mb-2'>
                <VStack space='md'>
                  <Heading size='lg'>Autonomous Info</Heading>
                  <VStack space='xs'>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>Has Auto:</Text>
                      <Badge
                        variant='solid'
                        action={team.prescout_has_auto ? 'success' : 'muted'}
                      >
                        <BadgeText>
                          {team.prescout_has_auto ? 'Yes' : 'No'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Disruption Auto:
                      </Text>
                      <Badge
                        variant='solid'
                        action={
                          team.prescout_has_disruption_auto
                            ? 'success'
                            : 'muted'
                        }
                      >
                        <BadgeText>
                          {team.prescout_has_disruption_auto ? 'Yes' : 'No'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Starting Pose:
                      </Text>
                      <Badge size='lg' variant='solid' action='muted'>
                        <BadgeText className='capitalize'>
                          {team.prescout_auto_starting_pose || 'Unknown'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>Auto Depot:</Text>
                      <Badge
                        variant='solid'
                        action={team.prescout_auto_depot ? 'success' : 'muted'}
                      >
                        <BadgeText>
                          {team.prescout_auto_depot ? 'Yes' : 'No'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>Auto Outpost:</Text>
                      <Badge
                        variant='solid'
                        action={
                          team.prescout_auto_outpost ? 'success' : 'muted'
                        }
                      >
                        <BadgeText>
                          {team.prescout_auto_outpost ? 'Yes' : 'No'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Crosses Center Line:
                      </Text>
                      <Badge
                        variant='solid'
                        action={
                          team.prescout_auto_crosses_center_line
                            ? 'success'
                            : 'muted'
                        }
                      >
                        <BadgeText>
                          {team.prescout_auto_crosses_center_line
                            ? 'Yes'
                            : 'No'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Auto Climb Level:
                      </Text>
                      <Badge size='lg' variant='solid' action='muted'>
                        <BadgeText className='capitalize'>
                          {team.prescout_auto_climb_level || 'None'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className='justify-between'>
                      <Text className='text-typography-700'>
                        Center Sweeps:
                      </Text>
                      <Badge size='lg' variant='solid' action='muted'>
                        <BadgeText className='capitalize'>
                          {team.prescout_auto_center_sweeps || 'None'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                  </VStack>
                </VStack>
              </Card>
              {/* Comments */}
              {team.prescout_additional_comments ? (
                <Card variant='outline' className='p-4 mb-2'>
                  <VStack space='md'>
                    <Heading size='lg'>Additional Comments</Heading>
                    <Text className='text-typography-700'>
                      {team.prescout_additional_comments}
                    </Text>
                  </VStack>
                </Card>
              ) : null}
              {team.prescout_drivetrain ? (
                <Button
                  size='lg'
                  action='secondary'
                  className='mb-2'
                  onPress={() => setShowCameraView(true)}
                >
                  <ButtonText>Change Picture</ButtonText>
                </Button>
              ) : null}
              <Button
                size='lg'
                action='primary'
                className='mb-2'
                onPress={() => {
                  if (team.prescout_drivetrain) {
                    setShowPrescoutAlert(true);
                  } else {
                    router.push(`/(tabs)/team/prescout/${id}`);
                  }
                }}
              >
                <ButtonText>Prescout Robot</ButtonText>
              </Button>
              <AlertDialog
                isOpen={showPrescoutAlert}
                onClose={() => setShowPrescoutAlert(false)}
              >
                <AlertDialogBackdrop />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <Heading size='lg'>Already Prescouted</Heading>
                  </AlertDialogHeader>
                  <AlertDialogBody>
                    <Text>
                      This team has already been prescouted. You cannot submit
                      prescout data again.
                    </Text>
                  </AlertDialogBody>
                  <AlertDialogFooter className='mt-2'>
                    <Button onPress={() => setShowPrescoutAlert(false)}>
                      <ButtonText>OK</ButtonText>
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          {activeTab === 'map' && <PitMap highlightTeam={id} hideSearch />}
        </ScrollView>
      </Box>

      {/* Comments Actionsheet */}
      <Actionsheet
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
      >
        <ActionsheetBackdrop />
        <ActionsheetContent className='max-h-[85%]'>
          <ActionsheetDragIndicatorWrapper>
            <ActionsheetDragIndicator />
          </ActionsheetDragIndicatorWrapper>
          <VStack className='w-full px-4 pb-4' space='md'>
            <HStack className='items-center gap-2 pt-2'>
              <Heading size='lg'>{team.team_number}</Heading>
              <Text className='text-typography-600'>{teamName}</Text>
            </HStack>
            <ScrollView
              ref={commentsScrollRef}
              className='mb-2'
              style={{ height: 300 }}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              <VStack space='sm'>
                {comments.length === 0 ? (
                  <Text className='text-typography-400 text-center py-4'>
                    No comments yet. Be the first to add one!
                  </Text>
                ) : (
                  comments.map((c, idx) => (
                    <Card
                      key={c.id || `local-${idx}`}
                      variant='outline'
                      className='p-3'
                    >
                      <HStack className='justify-between items-center mb-1'>
                        <Text className='text-xs text-typography-400'>
                          {new Date(c.created_at * 1000).toLocaleString()}
                        </Text>
                        {c.id !== 0 && (
                          <Button
                            size='xs'
                            variant='link'
                            action='negative'
                            onPress={() => handleDeleteComment(c.id)}
                            isDisabled={isDeletingComment}
                          >
                            <ButtonText className='text-xs'>Delete</ButtonText>
                          </Button>
                        )}
                      </HStack>
                      <Text className='text-typography-800'>{c.comment}</Text>
                    </Card>
                  ))
                )}
              </VStack>
            </ScrollView>
            <VStack space='sm'>
              <Textarea size='md' className='flex-1'>
                <TextareaInput
                  placeholder='Write a comment...'
                  value={commentText}
                  onChangeText={setCommentText}
                  numberOfLines={3}
                  className='min-h-20'
                />
              </Textarea>
              <Button
                size='md'
                action='primary'
                onPress={handleSendComment}
                isDisabled={!commentText.trim() || isSendingComment}
                className='self-end'
              >
                <ButtonText>Send</ButtonText>
                <ButtonIcon as={Send} className='ml-1' />
              </Button>
            </VStack>
          </VStack>
        </ActionsheetContent>
      </Actionsheet>

      {/* Delete Comment Confirmation Dialog */}
      <AlertDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <AlertDialogHeader>
            <Heading size='md'>Delete Comment</Heading>
          </AlertDialogHeader>
          <AlertDialogBody>
            <Text>
              Are you sure you want to delete this comment? This action cannot
              be undone.
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter>
            <HStack space='md' className='w-full justify-end'>
              <Button
                variant='outline'
                action='secondary'
                onPress={() => setDeleteDialogOpen(false)}
              >
                <ButtonText>Cancel</ButtonText>
              </Button>
              <Button
                action='negative'
                onPress={confirmDeleteComment}
                isDisabled={isDeletingComment}
              >
                <ButtonText>Delete</ButtonText>
              </Button>
            </HStack>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdaptiveSafeArea>
  );
}
