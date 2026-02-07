import React, { useEffect, useState, useMemo, useRef } from 'react';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { Text } from '@/components/ui/text';
import { MatchCard } from '@/components/MatchCard';
import { Match } from '@/types/match';
import { getMatches, NoCompetitionCodeError } from '@/api/matches';
import { Center } from '@/components/ui/center';
import { Box } from '@/components/ui/box';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import { SearchIcon } from '@/components/ui/icon';
import { VStack } from '@/components/ui/vstack';
import { ActivityIndicator, FlatList, FlatList as FlatListType } from 'react-native';
import { useApp } from '@/contexts/AppContext';
import { cssInterop } from 'nativewind';
import { Header } from '@/components/Header';

cssInterop(FlatList, {
  className: {
    target: 'style', // map className->style
  },
});

export default function MatchesScreen() {
  const { competitionCode } = useApp();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const flatListRef = useRef<FlatListType<Match>>(null);
  const hasScrolledRef = useRef(false);

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

  const firstUnplayedIndex = useMemo(() => {
    return filteredMatches.findIndex((match) => !match.has_played);
  }, [filteredMatches]);

  useEffect(() => {
    if (
      !loading &&
      !searchQuery &&
      filteredMatches.length > 0 &&
      firstUnplayedIndex > 0 &&
      flatListRef.current &&
      !hasScrolledRef.current
    ) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: firstUnplayedIndex,
          animated: false,
          viewPosition: 0,
        });
        hasScrolledRef.current = true;
      }, 100);
    }
  }, [loading, filteredMatches, firstUnplayedIndex, searchQuery]);

  function handleScout(match: Match) {
    // TODO: Navigate to scouting screen with match data
    console.log('Scouting match:', match.match_number);
  }

  return (
    <AdaptiveSafeArea>
      <Box className="flex-1 max-w-2xl self-center w-full">
        <Header title="Matches" isMainScreen />
        <VStack space="md" className="px-4">
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
            ref={flatListRef}
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
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({
                  index: info.index,
                  animated: false,
                });
              }, 100);
            }}
          />
        )}
      </Box>
    </AdaptiveSafeArea>
  );
}
