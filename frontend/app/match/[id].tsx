import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, ActivityIndicator } from 'react-native';
import { AdaptiveSafeArea } from '@/components/adaptive-safe-area';
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

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        <Center className="flex-1">
          <ActivityIndicator size="large" />
        </Center>
      </AdaptiveSafeArea>
    );
  }

  if (error || !match) {
    return (
      <AdaptiveSafeArea>
        <Center className="flex-1 p-4">
          <Text className="text-error-500 text-center mb-4">
            {error || 'Match not found'}
          </Text>
          <Button onPress={() => router.back()}>
            <ButtonText>Go Back</ButtonText>
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
      <Box className="p-4 max-w-2xl self-center w-full">
        <VStack space="lg">
          <HStack className="items-center justify-between">
            <HStack className="gap-2">
              <Button
                variant="outline"
                size="sm"
                className="px-2"
                onPress={() => router.back()}
              >
                <ButtonText>←</ButtonText>
              </Button>
              <Heading size="2xl">Match Details</Heading>
            </HStack>
            <Badge
              size="lg"
              variant="solid"
              action={isMatchCompleted() ? 'success' : 'warning'}
            >
              <BadgeText>
                {isMatchCompleted() ? 'Completed' : 'Upcoming'}
              </BadgeText>
            </Badge>
          </HStack>
          <ScrollView className="flex-1 pb-6">
            {/* Match Info */}
            <Card variant="outline" className="p-4 mb-2">
              <VStack space="md">
                <Heading size="2xl" className="capitalize">
                  {match.match_type} Match #{match.match_number}
                </Heading>
                <VStack space="xs">
                  <HStack className="justify-between">
                    <Text className="text-typography-700">Competition:</Text>
                    <Text className="font-semibold">
                      {match.competition.name}
                    </Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-typography-700">Set Number:</Text>
                    <Text className="font-semibold">{match.set_number}</Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-typography-700">Start Time:</Text>
                    <Text className="font-semibold">
                      {formatMatchTime(match.start_match_time)}
                    </Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-typography-700">Duration:</Text>
                    <Text className="font-semibold">
                      {formatDuration(
                        match.start_match_time,
                        match.end_match_time,
                      )}
                    </Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-typography-700">Total Points:</Text>
                    <Text className="font-semibold text-xl">
                      {match.total_points}
                    </Text>
                  </HStack>
                </VStack>
              </VStack>
            </Card>

            {/* Teams */}
            <Card variant="outline" className="p-4 mb-2">
              <VStack space="md">
                <Heading size="lg">Teams</Heading>

                {/* Blue Alliance */}
                <VStack space="xs">
                  <Text className="font-semibold text-blue-500">
                    Blue Alliance
                  </Text>
                  {blueTeams.map((team, index) => (
                    <HStack
                      key={`blue-${index}`}
                      className="items-center justify-between p-2 bg-blue-950/20 rounded"
                    >
                      <Text className="font-medium">Team {team.number}</Text>
                      <Text className="text-sm text-typography-600">
                        {team.name}
                      </Text>
                    </HStack>
                  ))}
                </VStack>

                {/* Red Alliance */}
                <VStack space="xs">
                  <Text className="font-semibold text-red-500">
                    Red Alliance
                  </Text>
                  {redTeams.map((team, index) => (
                    <HStack
                      key={`red-${index}`}
                      className="items-center justify-between p-2 bg-red-950/20 rounded"
                    >
                      <Text className="font-medium">Team {team.number}</Text>
                      <Text className="text-sm text-typography-600">
                        {team.name}
                      </Text>
                    </HStack>
                  ))}
                </VStack>
              </VStack>
            </Card>

            {/* Fuel Statistics */}
            <Card variant="outline" className="p-4 mb-2">
              <VStack space="md">
                <Heading size="lg">Fuel Statistics</Heading>

                <VStack space="sm">
                  <HStack className="justify-between">
                    <Text className="text-typography-700">
                      Total Blue Fuels:
                    </Text>
                    <Text className="font-semibold text-blue-500">
                      {match.total_blue_fuels}
                    </Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-typography-700">
                      Total Red Fuels:
                    </Text>
                    <Text className="font-semibold text-red-500">
                      {match.total_red_fuels}
                    </Text>
                  </HStack>
                </VStack>

                {/* Auto Fuel */}
                <VStack space="xs">
                  <Text className="font-semibold">Autonomous Fuel</Text>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Blue 1:</Text>
                    <Text>{match.blue_1_auto_fuel}</Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Blue 2:</Text>
                    <Text>{match.blue_2_auto_fuel}</Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Blue 3:</Text>
                    <Text>{match.blue_3_auto_fuel}</Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Red 1:</Text>
                    <Text>{match.red_1_auto_fuel}</Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Red 2:</Text>
                    <Text>{match.red_2_auto_fuel}</Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Red 3:</Text>
                    <Text>{match.red_3_auto_fuel}</Text>
                  </HStack>
                </VStack>

                {/* Teleop Fuel */}
                <VStack space="xs">
                  <Text className="font-semibold">Teleop Fuel</Text>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Blue 1:</Text>
                    <Text>{match.blue_1_teleop_fuel}</Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Blue 2:</Text>
                    <Text>{match.blue_2_teleop_fuel}</Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Blue 3:</Text>
                    <Text>{match.blue_3_teleop_fuel}</Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Red 1:</Text>
                    <Text>{match.red_1_teleop_fuel}</Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Red 2:</Text>
                    <Text>{match.red_2_teleop_fuel}</Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Red 3:</Text>
                    <Text>{match.red_3_teleop_fuel}</Text>
                  </HStack>
                </VStack>

                {/* Fuel Scored */}
                <VStack space="xs">
                  <Text className="font-semibold">Fuel Scored</Text>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Blue 1:</Text>
                    <Text>{match.blue_1_fuel_scored}</Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Blue 2:</Text>
                    <Text>{match.blue_2_fuel_scored}</Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Blue 3:</Text>
                    <Text>{match.blue_3_fuel_scored}</Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Red 1:</Text>
                    <Text>{match.red_1_fuel_scored}</Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Red 2:</Text>
                    <Text>{match.red_2_fuel_scored}</Text>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">Red 3:</Text>
                    <Text>{match.red_3_fuel_scored}</Text>
                  </HStack>
                </VStack>
              </VStack>
            </Card>

            {/* Climb Statistics */}
            <Card variant="outline" className="p-4 mb-2">
              <VStack space="md">
                <Heading size="lg">Climb Performance</Heading>

                <VStack space="xs">
                  <Text className="font-semibold text-blue-500">
                    Blue Alliance
                  </Text>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">
                      Team {blueTeams[0].number}:
                    </Text>
                    <Badge
                      variant="solid"
                      action={
                        match.blue_1_climb !== 'None' ? 'success' : 'muted'
                      }
                    >
                      <BadgeText>{match.blue_1_climb}</BadgeText>
                    </Badge>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">
                      Team {blueTeams[1].number}:
                    </Text>
                    <Badge
                      variant="solid"
                      action={
                        match.blue_2_climb !== 'None' ? 'success' : 'muted'
                      }
                    >
                      <BadgeText>{match.blue_2_climb}</BadgeText>
                    </Badge>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">
                      Team {blueTeams[2].number}:
                    </Text>
                    <Badge
                      variant="solid"
                      action={
                        match.blue_3_climb !== 'None' ? 'success' : 'muted'
                      }
                    >
                      <BadgeText>{match.blue_3_climb}</BadgeText>
                    </Badge>
                  </HStack>
                </VStack>

                <VStack space="xs">
                  <Text className="font-semibold text-red-500">
                    Red Alliance
                  </Text>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">
                      Team {redTeams[0].number}:
                    </Text>
                    <Badge
                      variant="solid"
                      action={
                        match.red_1_climb !== 'None' ? 'success' : 'muted'
                      }
                    >
                      <BadgeText>{match.red_1_climb}</BadgeText>
                    </Badge>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">
                      Team {redTeams[1].number}:
                    </Text>
                    <Badge
                      variant="solid"
                      action={
                        match.red_2_climb !== 'None' ? 'success' : 'muted'
                      }
                    >
                      <BadgeText>{match.red_2_climb}</BadgeText>
                    </Badge>
                  </HStack>
                  <HStack className="justify-between">
                    <Text className="text-sm text-typography-600">
                      Team {redTeams[2].number}:
                    </Text>
                    <Badge
                      variant="solid"
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

            {/* Scout Button */}
            <Button size="lg" action="primary" className="">
              <ButtonText>Scout This Match</ButtonText>
            </Button>
          </ScrollView>
        </VStack>
      </Box>
    </AdaptiveSafeArea>
  );
}
