import React from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Button, ButtonText } from '@/components/ui/button';
import { Match } from '@/types/match';
import { Badge, BadgeText } from '@/components/ui/badge';

interface MatchCardProps {
  match: Match;
  onScout: (match: Match) => void;
  searchQuery?: string;
}

export function MatchCard({
  match,
  onScout,
  searchQuery = '',
}: MatchCardProps) {
  const router = useRouter();
  const blueTeams = [match.blue_team_1, match.blue_team_2, match.blue_team_3];
  const redTeams = [match.red_team_1, match.red_team_2, match.red_team_3];

  // Check if a team number matches the search query
  const isTeamHighlighted = (teamNumber: number): boolean => {
    if (!searchQuery.trim() || !searchQuery.startsWith('@')) {
      return false;
    }
    const teamQuery = searchQuery.slice(1);
    if (teamQuery.length < 2) {
      return false;
    }
    return teamNumber.toString().includes(teamQuery);
  };

  // Format Unix timestamp to readable time
  const formatMatchTime = (timestamp: number): string => {
    if (!timestamp) return 'TBD';
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const handleCardPress = () => {
    router.push(`/match/${match.match_number}`);
  };

  return (
    <Pressable onPress={handleCardPress}>
      <Card variant="outline" size="md" className="mb-3 p-4">
        <VStack space="md">
          <HStack className="items-center justify-between gap-2">
            <HStack space="xs" className="items-center">
              <Text className="text-lg font-bold text-typography-900 capitalize">
                {match.match_type} #{match.match_number}
              </Text>
              <Text className="text-sm text-typography-700">
                {formatMatchTime(match.start_match_time)}
              </Text>
            </HStack>
            <Button
              className="right-0"
              size="sm"
              action="primary"
              onPress={() => onScout(match)}
            >
              <ButtonText>Scout</ButtonText>
            </Button>
          </HStack>

          <VStack space="xs">
            <HStack space="xs" className="flex-1 justify-around">
              {blueTeams.map((team, index) => {
                const isHighlighted = isTeamHighlighted(team.number);
                return (
                  <Badge
                    size="lg"
                    variant="solid"
                    key={`blue-${index}`}
                    className={`!bg-blue-600 font-medium flex-1 justify-center py-2 ${
                      isHighlighted && '!border-amber-400 border-4 py-0'
                    }`}
                  >
                    <BadgeText>{team.number}</BadgeText>
                  </Badge>
                );
              })}
              {redTeams.map((team, index) => {
                const isHighlighted = isTeamHighlighted(team.number);
                return (
                  <Badge
                    size="lg"
                    variant="solid"
                    key={`red-${index}`}
                    className={`!bg-red-600 font-medium flex-1 justify-center py-2 ${
                      isHighlighted && '!border-amber-400 border-4 py-0'
                    }`}
                  >
                    <BadgeText>{team.number}</BadgeText>
                  </Badge>
                );
              })}
            </HStack>
          </VStack>
        </VStack>
      </Card>
    </Pressable>
  );
}
