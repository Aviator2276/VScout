import React, { useEffect, useState, useMemo } from 'react';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { MatchCard } from '@/components/MatchCard';
import { Match } from '@/types/match';
import { getMatches, NoCompetitionCodeError } from '@/api/matches';
import { Center } from '@/components/ui/center';
import { HStack } from '@/components/ui/hstack';
import { Badge, BadgeText } from '@/components/ui/badge';
import { Box } from '@/components/ui/box';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import { SearchIcon } from '@/components/ui/icon';
import { VStack } from '@/components/ui/vstack';
import { ActivityIndicator, FlatList } from 'react-native';
import { useApp } from '@/utils/AppContext';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { parseCompetitionCode } from '@/utils/competitionCode';
import { cssInterop } from 'nativewind';

cssInterop(FlatList, {
  className: {
    target: 'style', // map className->style
  },
});

export default function MatchesScreen() {
  const {
    competitionCode,
    serverStatus,
    ping,
    isOnline,
    checkServerConnection,
  } = useApp();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadMatches();
  }, [competitionCode]);

  async function loadMatches() {
    try {
      setLoading(true);
      setError(null);
      const data = await getMatches();
      setMatches(data);
    } catch (error) {
      console.error('Failed to load matches:', error);
      if (error instanceof NoCompetitionCodeError) {
        setError('No competition code set. Please set on Home screen.');
      } else {
        setError('Failed to load matches');
      }
    } finally {
      setLoading(false);
    }
  }

  const filteredMatches = useMemo(() => {
    if (!searchQuery.trim()) {
      return matches;
    }

    const query = searchQuery.trim();

    // Check if searching for team number (starts with @)
    if (query.startsWith('@')) {
      const teamQuery = query.slice(1);

      if (!teamQuery) {
        return matches;
      }

      return matches.filter((match) => {
        const allTeams = [
          match.blue_team_1.number,
          match.blue_team_2.number,
          match.blue_team_3.number,
          match.red_team_1.number,
          match.red_team_2.number,
          match.red_team_3.number,
        ];

        return allTeams.some((teamNumber) =>
          teamNumber.toString().includes(teamQuery),
        );
      });
    }

    return matches.filter((match) =>
      match.match_number.toString().includes(query),
    );
  }, [matches, searchQuery]);

  function handleScout(match: Match) {
    // TODO: Navigate to scouting screen with match data
    console.log('Scouting match:', match.match_number);
  }

  return (
    <AdaptiveSafeArea>
      <Box className="flex-1 max-w-2xl self-center w-full">
        <VStack space="md" className="px-4 pt-4">
          <HStack className="items-center justify-between">
            <Heading size="2xl">Matches</Heading>
            <HStack className="gap-1">
              <Center>
                <ConnectionStatus
                  ping={ping}
                  isOnline={isOnline}
                  serverStatus={serverStatus}
                  onPress={checkServerConnection}
                  size="lg"
                />
              </Center>
              <Badge size="lg" variant="solid" action="info">
                <BadgeText>{parseCompetitionCode(competitionCode)}</BadgeText>
              </Badge>
            </HStack>
          </HStack>
          <Input size="lg" className="mb-4">
            <InputSlot className="pl-3">
              <InputIcon as={SearchIcon} />
            </InputSlot>
            <InputField
              placeholder="Search Match # or @team"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </Input>
        </VStack>
        {loading ? (
          <Center className="flex-1 px-4">
            <ActivityIndicator size="large" />
          </Center>
        ) : error ? (
          <Center className="flex-1 px-4">
            <Text className="text-center text-error-500 p-4">{error}</Text>
          </Center>
        ) : (
          <FlatList
            className="flex-1 px-4"
            data={filteredMatches}
            keyExtractor={(item, index) =>
              `match-${item.match_number}-${index}`
            }
            renderItem={({ item }) => (
              <MatchCard
                match={item}
                onScout={handleScout}
                searchQuery={searchQuery}
              />
            )}
            ListEmptyComponent={() => (
              <Text className="text-center text-typography-500 mt-8">
                {searchQuery ? 'No matches found' : 'No matches available'}
              </Text>
            )}
          />
        )}
      </Box>
    </AdaptiveSafeArea>
  );
}
