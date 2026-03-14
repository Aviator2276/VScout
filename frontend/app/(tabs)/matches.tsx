import React, {
  useCallback,
  useState,
  useMemo,
  useRef,
  useEffect,
} from 'react';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { Text } from '@/components/ui/text';
import { MatchCard } from '@/components/MatchCard';
import { Match } from '@/types/match';
import { getMatches, NoCompetitionCodeError } from '@/api/matches';
import { Center } from '@/components/ui/center';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import { SearchIcon } from '@/components/ui/icon';
import { VStack } from '@/components/ui/vstack';
import {
  ActivityIndicator,
  FlatList,
  FlatList as FlatListType,
  Pressable,
} from 'react-native';
import { useApp } from '@/contexts/AppContext';
import { useFocusEffect, useRouter } from 'expo-router';
import { cssInterop } from 'nativewind';
import { Header } from '@/components/Header';
import { Fab, FabIcon, FabLabel } from '@/components/ui/fab';
import { Badge, BadgeIcon, BadgeText } from '@/components/ui/badge';
import { Film, SlidersHorizontal } from 'lucide-react-native';
import { MatchFilterModal, MatchFilters } from '@/components/MatchFilterModal';
import { db } from '@/utils/db';
import { useLiveQuery } from 'dexie-react-hooks';

cssInterop(FlatList, {
  className: {
    target: 'style', // map className->style
  },
});

const DEFAULT_FILTERS: MatchFilters = {
  timeFilter: 'all',
  hasVideo: null,
  sortBy: 'match_number',
  sortOrder: 'asc',
};

export default function MatchesScreen() {
  const { competitionCode } = useApp();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<MatchFilters>(DEFAULT_FILTERS);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const flatListRef = useRef<FlatListType<Match>>(null);
  const hasScrolledRef = useRef(false);

  // Get downloaded video status for all matches
  const downloadedVideos = useLiveQuery(
    async () => {
      const compCode = (await db.config.get({ key: 'compCode' }))?.value;
      if (!compCode) return new Set<number>();
      const videos = await db.matchVideos
        .where('competitionCode')
        .equals(compCode)
        .filter((v) => v.isDownloaded)
        .toArray();
      return new Set(videos.map((v) => v.match_number));
    },
    [],
    new Set<number>(),
  );

  useFocusEffect(
    useCallback(() => {
      loadMatches();
    }, [competitionCode]),
  );

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

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.timeFilter !== 'all') count++;
    if (filters.hasVideo !== null) count++;
    if (filters.sortBy !== 'match_number' || filters.sortOrder !== 'asc')
      count++;
    return count;
  }, [filters]);

  const filteredMatches = useMemo(() => {
    let result = matches;

    // Text search
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();

      // Less than 3 characters = match number search only
      if (query.length < 3) {
        result = result.filter((match) =>
          match.match_number.toString().includes(query),
        );
      } else {
        // 3+ characters = search by team number or team name
        result = result.filter((match) => {
          const allTeams = [
            match.blue_team_1,
            match.blue_team_2,
            match.blue_team_3,
            match.red_team_1,
            match.red_team_2,
            match.red_team_3,
          ];

          return allTeams.some(
            (team) =>
              team.number.toString().includes(query) ||
              team.name.toLowerCase().includes(query),
          );
        });
      }
    }

    // Time filter
    if (filters.timeFilter === 'upcoming') {
      result = result.filter((match) => !match.has_played);
    } else if (filters.timeFilter === 'played') {
      result = result.filter((match) => match.has_played);
    }

    // Video filter
    if (filters.hasVideo === true) {
      result = result.filter((match) =>
        downloadedVideos.has(match.match_number),
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (filters.sortBy === 'match_number') {
        cmp = a.match_number - b.match_number;
      } else if (filters.sortBy === 'scouted_count') {
        const aCount = [
          a.blue_1_scouted,
          a.blue_2_scouted,
          a.blue_3_scouted,
          a.red_1_scouted,
          a.red_2_scouted,
          a.red_3_scouted,
        ].filter(Boolean).length;
        const bCount = [
          b.blue_1_scouted,
          b.blue_2_scouted,
          b.blue_3_scouted,
          b.red_1_scouted,
          b.red_2_scouted,
          b.red_3_scouted,
        ].filter(Boolean).length;
        cmp = aCount - bCount;
      }
      return filters.sortOrder === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [matches, searchQuery, filters, downloadedVideos]);

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
      <Header title='Matches' isMainScreen />
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
                placeholder='Search match, team #, or name'
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
            ref={flatListRef}
            className='flex-1 px-4 pt-4'
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
              <Text className='text-center text-typography-500 mt-8'>
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
        <Fab
          size='lg'
          placement='bottom right'
          onPress={() => router.push('/videos')}
        >
          <FabIcon as={Film} size='md' />
        </Fab>
      </Box>
      <MatchFilterModal
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
