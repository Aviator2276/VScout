import React, { useCallback, useState, useMemo } from 'react';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { Text } from '@/components/ui/text';
import { TeamCard } from '@/components/TeamCard';
import { TeamInfo } from '@/types/team';
import { getAllTeamInfo, NoCompetitionCodeError } from '@/api/teams';
import { Center } from '@/components/ui/center';
import { Box } from '@/components/ui/box';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import { SearchIcon } from '@/components/ui/icon';
import { VStack } from '@/components/ui/vstack';
import { ActivityIndicator, FlatList } from 'react-native';
import { useApp } from '@/contexts/AppContext';
import { useFocusEffect } from 'expo-router';
import { cssInterop } from 'nativewind';
import { Header } from '@/components/Header';

cssInterop(FlatList, {
  className: {
    target: 'style',
  },
});

export default function TeamsScreen() {
  const { competitionCode } = useApp();
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadTeams();
    }, [competitionCode])
  );

  async function loadTeams() {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllTeamInfo();
      setTeams(data);
    } catch (error) {
      console.error('Failed to load teams:', error);
      if (error instanceof NoCompetitionCodeError) {
        setError('No competition code set. Please set on Home screen.');
      } else {
        setError('Failed to load teams');
      }
    } finally {
      setLoading(false);
    }
  }

  const filteredTeams = useMemo(() => {
    if (!searchQuery.trim()) {
      return teams;
    }

    const query = searchQuery.trim();

    return teams.filter((team) =>
      team.team_number.toString().includes(query),
    );
  }, [teams, searchQuery]);

  return (
    <AdaptiveSafeArea>
      <Box className="flex-1 max-w-2xl self-center w-full">
        <Header title="Teams" isMainScreen />
        <VStack space="md" className="px-4">
          <Input size="lg" className="mb-4">
            <InputSlot className="pl-3">
              <InputIcon as={SearchIcon} />
            </InputSlot>
            <InputField
              placeholder="Search Team #"
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
            data={filteredTeams}
            keyExtractor={(item) => `team-${item.team_number}`}
            renderItem={({ item }) => (
              <TeamCard team={item} searchQuery={searchQuery} />
            )}
            ListEmptyComponent={() => (
              <Text className="text-center text-typography-500 mt-8">
                {searchQuery ? 'No teams found' : 'No teams available'}
              </Text>
            )}
          />
        )}
      </Box>
    </AdaptiveSafeArea>
  );
}
