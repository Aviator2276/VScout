import React, { useCallback, useState, useMemo } from 'react';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { Text } from '@/components/ui/text';
import { TeamCard } from '@/components/TeamCard';
import { TeamInfo } from '@/types/team';
import { getAllTeamInfo, getTeams, NoCompetitionCodeError } from '@/api/teams';
import { Center } from '@/components/ui/center';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import { SearchIcon } from '@/components/ui/icon';
import { VStack } from '@/components/ui/vstack';
import { ActivityIndicator, FlatList, Pressable } from 'react-native';
import { useApp } from '@/contexts/AppContext';
import { useFocusEffect } from 'expo-router';
import { cssInterop } from 'nativewind';
import { Header } from '@/components/Header';
import { Badge, BadgeIcon, BadgeText } from '@/components/ui/badge';
import { SlidersHorizontal } from 'lucide-react-native';
import { TeamFilterModal, TeamFilters } from '@/components/TeamFilterModal';

cssInterop(FlatList, {
  className: {
    target: 'style',
  },
});

const DEFAULT_FILTERS: TeamFilters = {
  sortBy: 'rank',
  sortOrder: 'asc',
  drivetrain: null,
  rangeFilter: null,
  turret: null,
  hood: null,
  shooterType: null,
  trenchTravel: null,
  trenchPreference: null,
};

export default function TeamsScreen() {
  const { competitionCode } = useApp();
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [teamNames, setTeamNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<TeamFilters>(DEFAULT_FILTERS);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadTeams();
    }, [competitionCode]),
  );

  async function loadTeams() {
    try {
      setLoading(true);
      setError(null);
      const [data, allTeams] = await Promise.all([
        getAllTeamInfo(),
        getTeams(),
      ]);
      setTeams(data);
      const names: Record<number, string> = {};
      allTeams.forEach((t) => {
        names[t.number] = t.name;
      });
      setTeamNames(names);
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

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.sortBy !== 'rank' || filters.sortOrder !== 'asc') count++;
    if (filters.drivetrain) count++;
    if (filters.rangeFilter) count++;
    if (filters.turret !== null) count++;
    if (filters.hood !== null) count++;
    if (filters.shooterType) count++;
    if (filters.trenchTravel !== null) count++;
    if (filters.trenchPreference) count++;
    return count;
  }, [filters]);

  const filteredTeams = useMemo(() => {
    let result = teams;

    // Text search (supports #tag filtering)
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      if (query.startsWith('#')) {
        const tagQuery = query.slice(1);
        if (tagQuery) {
          result = result.filter(
            (team) =>
              team.tags &&
              team.tags.some((tag) => tag.toLowerCase().includes(tagQuery)),
          );
        }
      } else {
        result = result.filter(
          (team) =>
            team.team_number.toString().includes(query) ||
            (teamNames[team.team_number] || '').toLowerCase().includes(query),
        );
      }
    }

    // Drivetrain filter
    if (filters.drivetrain) {
      result = result.filter(
        (team) => team.prescout_drivetrain === filters.drivetrain,
      );
    }

    // Range filter
    if (filters.rangeFilter) {
      result = result.filter(
        (team) => team.prescout_range === filters.rangeFilter,
      );
    }

    // Turret filter
    if (filters.turret !== null) {
      result = result.filter(
        (team) => team.prescout_rotate_yaw === filters.turret,
      );
    }

    // Hood filter
    if (filters.hood !== null) {
      result = result.filter(
        (team) => team.prescout_rotate_pitch === filters.hood,
      );
    }

    // Shooter type filter
    if (filters.shooterType) {
      result = result.filter(
        (team) => team.prescout_shooter_type === filters.shooterType,
      );
    }

    // Trench travel filter
    if (filters.trenchTravel !== null) {
      result = result.filter(
        (team) => team.prescout_trench_travel === filters.trenchTravel,
      );
    }

    // Trench preference filter
    if (filters.trenchPreference) {
      result = result.filter(
        (team) => team.prescout_trench_travel_preference === filters.trenchPreference,
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (filters.sortBy) {
        case 'rank':
          cmp = a.rank - b.rank;
          break;
        case 'ranking_points':
          cmp = parseFloat(b.ranking_points || '0') - parseFloat(a.ranking_points || '0');
          break;
        case 'median_fuel_scored':
          cmp =
            (b.median_tele_fuel ?? 0) +
            (b.median_auto_fuel ?? 0) -
            ((a.median_tele_fuel ?? 0) + (a.median_auto_fuel ?? 0));
          break;
        case 'median_auto_fuel':
          cmp = (b.median_auto_fuel ?? 0) - (a.median_auto_fuel ?? 0);
          break;
        case 'median_climb_level':
          cmp = (b.median_climb_level ?? 0) - (a.median_climb_level ?? 0);
          break;
        case 'prescout_hopper_size':
          cmp = (b.prescout_hopper_size || 0) - (a.prescout_hopper_size || 0);
          break;
        case 'prescout_driver_years':
          cmp = (b.prescout_driver_years || 0) - (a.prescout_driver_years || 0);
          break;
      }
      return filters.sortOrder === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [teams, searchQuery, teamNames, filters]);

  return (
    <AdaptiveSafeArea>
      <Header title='Teams' isMainScreen />
      <Box className='flex-1 max-w-2xl self-center w-full'>
        <VStack
          space='md'
          className='px-4 py-3 border-l border-r border-b rounded-b border-outline-100'
        >
          <HStack space='sm' className='mb-0'>
            <Input size='lg' className='flex-1'>
              <InputSlot className='pl-3'>
                <InputIcon as={SearchIcon} />
              </InputSlot>
              <InputField
                placeholder='Search team #, name, or #tag'
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </Input>
            <Pressable onPress={() => setIsFilterOpen(true)}>
              <Badge
                size='lg'
                variant='solid'
                action={activeFilterCount > 0 ? 'warning' : 'muted'}
                className='h-full rounded items-center justify-center px-3'
              >
                <BadgeIcon as={SlidersHorizontal} />
                {activeFilterCount > 0 && (
                  <BadgeText className='ml-1'>{activeFilterCount}</BadgeText>
                )}
              </Badge>
            </Pressable>
          </HStack>
        </VStack>
        {loading ? (
          <Center className='flex-1 px-4'>
            <ActivityIndicator size='large' />
          </Center>
        ) : error ? (
          <Center className='flex-1 px-4'>
            <Text className='text-center text-error-500 p-4'>{error}</Text>
          </Center>
        ) : (
          <FlatList
            className='flex-1 px-4 pt-4'
            data={filteredTeams}
            keyExtractor={(item) => `team-${item.team_number}`}
            renderItem={({ item }) => (
              <TeamCard team={item} searchQuery={searchQuery} />
            )}
            ListEmptyComponent={() => (
              <Text className='text-center text-typography-500 mt-8'>
                {searchQuery ? 'No teams found' : 'No teams available'}
              </Text>
            )}
          />
        )}
      </Box>
      <TeamFilterModal
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onApply={(newFilters) => {
          setFilters(newFilters);
          setIsFilterOpen(false);
        }}
        onReset={() => {
          setFilters(DEFAULT_FILTERS);
          setIsFilterOpen(false);
        }}
      />
    </AdaptiveSafeArea>
  );
}
