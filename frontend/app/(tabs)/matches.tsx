import React, { useEffect, useState, useMemo } from 'react';
import { ActivityIndicator } from 'react-native';
import { AdaptiveSafeArea } from '@/components/adaptive-safe-area';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { MatchCard } from '@/components/match-card';
import { Match } from '@/types/match';
import { getMatches, NoCompetitionCodeError } from '@/api/matches';
import { Center } from '@/components/ui/center';
import { HStack } from '@/components/ui/hstack';
import { Badge, BadgeText } from '@/components/ui/badge';
import { Box } from '@/components/ui/box';
import { getCompetitionCode } from '@/utils/storage';
import { useRouter } from 'expo-router';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import { Icon, SearchIcon } from '@/components/ui/icon';
import { VStack } from '@/components/ui/vstack';
import { ScrollView } from 'react-native';

export default function MatchesScreen() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [competitionCode, setCompetitionCode] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  useEffect(() => {
    loadMatches();
    loadCompetitionCode();
  }, []);

  async function loadCompetitionCode() {
    try {
      const code = await getCompetitionCode();
      setCompetitionCode(code || 'N/A');
    } catch (error) {
      console.error('Failed to load competition code:', error);
      setCompetitionCode('N/A');
    }
  }

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
      const teamQuery = query.slice(1); // Remove @ symbol

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

    // Otherwise search by match number
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
      <Box className=" flex-1 max-w-2xl self-center w-full">
        <VStack space="md">
          <HStack space="md" className="flex justify-between">
            <Heading size="3xl">Matches</Heading>
            <Badge size="lg" variant="solid" action="info" className="h-8">
              <BadgeText>{competitionCode}</BadgeText>
            </Badge>
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
          <Center className="flex-1">
            <ActivityIndicator size="large" />
          </Center>
        ) : error ? (
          <Center className="flex-1">
            <Text className="text-center text-error-500 p-4">{error}</Text>
          </Center>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }}
            style={{ flex: 1 }}
          >
            {filteredMatches.length === 0 ? (
              <Text className="text-center text-typography-500 mt-8">
                {searchQuery
                  ? 'No matches found for your search'
                  : 'No matches available'}
              </Text>
            ) : (
              filteredMatches.map((match, index) => (
                <MatchCard
                  key={`match-${match.match_number}-${index}`}
                  match={match}
                  onScout={handleScout}
                  searchQuery={searchQuery}
                />
              ))
            )}
          </ScrollView>
        )}
      </Box>
    </AdaptiveSafeArea>
  );
}
