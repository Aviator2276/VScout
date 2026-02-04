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
import { TeamInfo } from '@/types/team';
import { getTeamInfo, getTeamName } from '@/api/teams';
import { Box } from '@/components/ui/box';
import { Header } from '@/components/Header';

type TabType = 'overview' | 'prescout';

export default function TeamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

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
        <Center className="flex-1">
          <ActivityIndicator size="large" />
        </Center>
      </AdaptiveSafeArea>
    );
  }

  if (error || !team) {
    return (
      <AdaptiveSafeArea>
        <Center className="flex-1 p-4">
          <Text className="text-error-500 text-center mb-4">
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
      <Box className="max-w-2xl self-center w-full">
        <Header
          title={`Team ${team.team_number}`}
          isMainScreen={false}
          showBackButton
          goHome
        />

        <ScrollView className="flex-1 px-4 pb-4">
          <Card
            variant="outline"
            className="p-4 mb-2 aspect-square justify-evenly items-center"
          >
            A Beautiful Robot Image
          </Card>
          {/* Team Info */}
          <Card variant="outline" className="p-4 mb-2">
            <VStack space="md">
              <HStack className="items-center gap-2">
                <Heading size="2xl">{team.team_number}</Heading>
                <Text className="text-lg text-typography-600">{teamName}</Text>
              </HStack>
              <VStack space="xs">
                <HStack className="justify-between">
                  <Text className="text-typography-700">Competition:</Text>
                  <Text className="font-semibold">{team.competition.name}</Text>
                </HStack>
                <HStack className="justify-between">
                  <Text className="text-typography-700">Record:</Text>
                  <Text className="font-semibold text-amber-600">
                    {team.win}-{team.lose}-{team.tie}
                  </Text>
                </HStack>
                <HStack className="justify-between">
                  <Text className="text-typography-700">Ranking Points:</Text>
                  <Text className="font-semibold">{team.ranking_points}</Text>
                </HStack>
              </VStack>
            </VStack>
          </Card>

          {/* Tab Navigation */}
          <HStack className="mb-2 p-1 rounded bg-secondary-100">
            <Button
              size="xs"
              variant={activeTab === 'overview' ? 'solid' : 'link'}
              action="secondary"
              className="w-1/2"
              onPress={() => setActiveTab('overview')}
            >
              <Text className="text-center font-semibold">Statistics</Text>
            </Button>
            <Button
              size="xs"
              variant={activeTab === 'prescout' ? 'solid' : 'link'}
              action="secondary"
              className="w-1/2"
              onPress={() => setActiveTab('prescout')}
            >
              <Text className="text-center font-semibold">Prescout Info</Text>
            </Button>
          </HStack>

          {activeTab === 'overview' && (
            <>
              {/* Performance Stats */}
              <Card variant="outline" className="p-4 mb-2">
                <VStack space="md">
                  <Heading size="lg">Performance</Heading>
                  <VStack space="xs">
                    <HStack className="justify-between">
                      <Text className="text-typography-700">Accuracy:</Text>
                      <Text className="font-semibold">
                        {Math.round(team.accuracy * 100)}%
                      </Text>
                    </HStack>
                    <HStack className="justify-between">
                      <Text className="text-typography-700">
                        Avg Fuel Scored:
                      </Text>
                      <Text className="font-semibold">
                        {Math.round(team.avg_fuel_scored * 10) / 10}
                      </Text>
                    </HStack>
                    <HStack className="justify-between">
                      <Text className="text-typography-700">
                        Avg Auto Fuel:
                      </Text>
                      <Text className="font-semibold">
                        {Math.round(team.avg_auto_fuel * 10) / 10}
                      </Text>
                    </HStack>
                    <HStack className="justify-between">
                      <Text className="text-typography-700">Avg Shuttle:</Text>
                      <Text className="font-semibold">
                        {Math.round(team.avg_shuttle * 10) / 10}
                      </Text>
                    </HStack>
                  </VStack>
                </VStack>
              </Card>

              {/* Climb Stats */}
              <Card variant="outline" className="p-4 mb-2">
                <VStack space="md">
                  <Heading size="lg">Climb</Heading>
                  <VStack space="xs">
                    <HStack className="justify-between">
                      <Text className="text-typography-700">
                        Avg Climb Points:
                      </Text>
                      <Text className="font-semibold">
                        {Math.round(team.avg_climb_points * 10) / 10}
                      </Text>
                    </HStack>
                    <HStack className="justify-between">
                      <Text className="text-typography-700">
                        Climb Success:
                      </Text>
                      <Text className="font-semibold">
                        {Math.round(team.climb_success * 100)}%
                      </Text>
                    </HStack>
                    <HStack className="justify-between">
                      <Text className="text-typography-700">
                        Climb Success SD:
                      </Text>
                      <Text className="font-semibold">
                        {Math.round(team.climb_success_sd * 100) / 100}
                      </Text>
                    </HStack>
                  </VStack>
                </VStack>
              </Card>

              {/* Auto Stats */}
              <Card variant="outline" className="p-4 mb-2">
                <VStack space="md">
                  <Heading size="lg">Autonomous</Heading>
                  <VStack space="xs">
                    <HStack className="justify-between">
                      <Text className="text-typography-700">Auto Success:</Text>
                      <Text className="font-semibold">
                        {Math.round(team.auto_success * 100)}%
                      </Text>
                    </HStack>
                    <HStack className="justify-between">
                      <Text className="text-typography-700">
                        Auto Success SD:
                      </Text>
                      <Text className="font-semibold">
                        {Math.round(team.auto_success_sd * 100) / 100}
                      </Text>
                    </HStack>
                  </VStack>
                </VStack>
              </Card>

              {/* Overall Stats */}
              <Card variant="outline" className="p-4 mb-2">
                <VStack space="md">
                  <Heading size="lg">Overall</Heading>
                  <VStack space="xs">
                    <HStack className="justify-between">
                      <Text className="text-typography-700">
                        Avg Points Contributed:
                      </Text>
                      <Text className="font-semibold">
                        {Math.round(team.avg_points_contributed * 10) / 10}
                      </Text>
                    </HStack>
                    <HStack className="justify-between">
                      <Text className="text-typography-700">
                        Avg Alliance Match Points:
                      </Text>
                      <Text className="font-semibold">
                        {Math.round(team.avg_alliance_match_points * 10) / 10}
                      </Text>
                    </HStack>
                    <HStack className="justify-between">
                      <Text className="text-typography-700">
                        Consistency Rating:
                      </Text>
                      <Text className="font-semibold">
                        {Math.round(team.consistency_rating * 100) / 100}
                      </Text>
                    </HStack>
                  </VStack>
                </VStack>
              </Card>
            </>
          )}

          {activeTab === 'prescout' && (
            <>
              {/* Robot Info */}

              <Card variant="outline" className="p-4 mb-2">
                <VStack space="md">
                  <Heading size="lg">Robot Info</Heading>
                  <VStack space="xs">
                    <HStack className="justify-between">
                      <Text className="text-typography-700">Drivetrain:</Text>
                      <Badge variant="solid" action="muted">
                        <BadgeText className="capitalize">
                          {team.prescout_drivetrain}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className="justify-between">
                      <Text className="text-typography-700">Intake Type:</Text>
                      <Badge variant="solid" action="muted">
                        <BadgeText className="capitalize">
                          {team.prescout_intake_type}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className="justify-between">
                      <Text className="text-typography-700">Hopper Size:</Text>
                      <Text className="font-semibold">
                        {team.prescout_hopper_size}
                      </Text>
                    </HStack>
                    <HStack className="justify-between">
                      <Text className="text-typography-700">Range:</Text>
                      <Badge variant="solid" action="muted">
                        <BadgeText className="capitalize">
                          {team.prescout_range}
                        </BadgeText>
                      </Badge>
                    </HStack>
                  </VStack>
                </VStack>
              </Card>

              {/* Rotation */}
              <Card variant="outline" className="p-4 mb-2">
                <VStack space="md">
                  <Heading size="lg">Rotation</Heading>
                  <VStack space="xs">
                    <HStack className="justify-between">
                      <Text className="text-typography-700">Rotate Yaw:</Text>
                      <Badge
                        variant="solid"
                        action={team.prescout_rotate_yaw ? 'success' : 'muted'}
                      >
                        <BadgeText>
                          {team.prescout_rotate_yaw ? 'Yes' : 'No'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className="justify-between">
                      <Text className="text-typography-700">Rotate Pitch:</Text>
                      <Badge
                        variant="solid"
                        action={
                          team.prescout_rotate_pitch ? 'success' : 'muted'
                        }
                      >
                        <BadgeText>
                          {team.prescout_rotate_pitch ? 'Yes' : 'No'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                  </VStack>
                </VStack>
              </Card>

              {/* Climber */}
              <Card variant="outline" className="p-4 mb-2">
                <VStack space="md">
                  <Heading size="lg">Climber</Heading>
                  <VStack space="xs">
                    <HStack className="justify-between">
                      <Text className="text-typography-700">Climber Type:</Text>
                      <Badge variant="solid" action="muted">
                        <BadgeText className="capitalize">
                          {team.prescout_climber}
                        </BadgeText>
                      </Badge>
                    </HStack>
                    <HStack className="justify-between">
                      <Text className="text-typography-700">Auto Climb:</Text>
                      <Badge
                        variant="solid"
                        action={
                          team.prescout_climber_auto ? 'success' : 'muted'
                        }
                      >
                        <BadgeText>
                          {team.prescout_climber_auto ? 'Yes' : 'No'}
                        </BadgeText>
                      </Badge>
                    </HStack>
                  </VStack>
                </VStack>
              </Card>

              {/* Self-Reported */}
              <Card variant="outline" className="p-4 mb-2">
                <VStack space="md">
                  <Heading size="lg">Self-Reported</Heading>
                  <VStack space="xs">
                    <HStack className="justify-between">
                      <Text className="text-typography-700">Accuracy:</Text>
                      <Text className="font-semibold">
                        {team.prescout_self_reported_accuracy}%
                      </Text>
                    </HStack>
                    <HStack className="justify-between">
                      <Text className="text-typography-700">Auto Shoot:</Text>
                      <Text className="font-semibold">
                        {team.prescout_self_reported_auto_shoot}
                      </Text>
                    </HStack>
                    <HStack className="justify-between">
                      <Text className="text-typography-700">Unload Time:</Text>
                      <Text className="font-semibold">
                        {team.prescout_unload_time}s
                      </Text>
                    </HStack>
                  </VStack>
                </VStack>
              </Card>

              {/* Comments */}
              {team.prescout_additional_comments && (
                <Card variant="outline" className="p-4 mb-2">
                  <VStack space="md">
                    <Heading size="lg">Additional Comments</Heading>
                    <Text className="text-typography-700">
                      {team.prescout_additional_comments}
                    </Text>
                  </VStack>
                </Card>
              )}
              <Button size="lg" action="primary" className="mb-2">
                <ButtonText>Prescout Team</ButtonText>
              </Button>
            </>
          )}
        </ScrollView>
      </Box>
    </AdaptiveSafeArea>
  );
}
