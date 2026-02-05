import React from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
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
      <Card variant='outline' size='md' className='mb-3 p-4'>
        <VStack space='md'>
          <HStack className='items-center justify-between gap-2'>
            <HStack space='xs' className='items-center'>
              <Text className='text-lg font-bold text-typography-900 capitalize'>
                {match.match_type} #{match.match_number}
              </Text>
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
          </HStack>

          <VStack space='xs'>
            <HStack space='xs' className='flex-1 w-[calc(100%-1.25rem)] h-3'>
              {blueTeams.map((team, index) => {
                const isHighlighted = isTeamHighlighted(team.number);
                return (
                  <Badge
                    size='lg'
                    variant='solid'
                    key={`blue-${index}`}
                    className={`bg-blue-500/75 font-medium w-1/6 justify-center py-1 ${
                      isHighlighted &&
                      '!border-amber-400 border-[0.15rem] py-[0.1rem]'
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
                    size='lg'
                    variant='solid'
                    key={`red-${index}`}
                    className={`bg-red-500/75 font-medium w-1/6 justify-center py-1 ${
                      isHighlighted &&
                      '!border-amber-400 border-[0.15rem] py-[0.1rem]'
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
