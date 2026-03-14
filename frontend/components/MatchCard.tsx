import React from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { Match } from '@/types/match';
import { Badge, BadgeIcon, BadgeText } from '@/components/ui/badge';
import {
  Popover,
  PopoverArrow,
  PopoverBackdrop,
  PopoverBody,
  PopoverContent,
} from './ui/popover';
import { CircleDashed, CircleDot, CircleDotDashed, Video, VideoOff } from 'lucide-react-native';
import { Icon } from './ui/icon';
import { db } from '@/utils/db';
import { useLiveQuery } from 'dexie-react-hooks';

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

  const videoRecord = useLiveQuery(
    async () => {
      const compCode = (await db.config.get({ key: 'compCode' }))?.value;
      if (!compCode) return null;
      return (await db.matchVideos.get([compCode, match.match_number])) ?? null;
    },
    [match.match_number],
    null,
  );

  const isVideoDownloaded = videoRecord?.isDownloaded ?? false;

  // Count how many teams have been scouted
  const scoutedCount = [
    match.blue_1_scouted,
    match.blue_2_scouted,
    match.blue_3_scouted,
    match.red_1_scouted,
    match.red_2_scouted,
    match.red_3_scouted,
  ].filter(Boolean).length;

  const getScoutedIcon = () => {
    if (scoutedCount === 0) return CircleDashed;
    if (scoutedCount === 6) return CircleDot;
    return CircleDotDashed;
  };

  const getScoutedColor = () => {
    if (scoutedCount === 0) return 'text-warning-500';
    if (scoutedCount === 6) return 'text-success-500';
    return 'text-info-500';
  };

  const getScoutedText = () => {
    if (scoutedCount === 0) return 'Not Scouted';
    if (scoutedCount === 6) return 'Fully Scouted';
    return `${scoutedCount}/6 Scouted`;
  };

  // Check if match number matches search (less than 3 digits = match search)
  const isMatchHighlighted = (): boolean => {
    const query = searchQuery.trim();
    if (!query) return false;
    // If query is less than 3 digits, treat as match number search
    if (query.length < 3) {
      return match.match_number.toString().includes(query);
    }
    return false;
  };

  // Check if a team matches the search query (by number or name)
  const isTeamHighlighted = (team: { number: number; name: string }): boolean => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return false;
    // Less than 3 characters = match number search only, don't highlight teams
    if (query.length < 3) return false;
    // Require at least 3 digits for team number search
    const matchesNumber = team.number.toString().includes(query);
    const matchesName = team.name.toLowerCase().includes(query);
    return matchesNumber || matchesName;
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
    router.push(`/(tabs)/match/${match.match_number}`);
  };

  return (
    <Pressable onPress={handleCardPress}>
      <Card
        variant='outline'
        size='md'
        className={`mb-2 p-2 ${isMatchHighlighted() ? 'border-amber-400 border-2' : ''}`}
      >
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
            <HStack className='flex-1 w-full justify-end items-center gap-2'>
              <Popover
                placement='bottom'
                size='xs'
                trigger={(triggerProps) => (
                  <Pressable {...triggerProps}>
                    <Badge
                      size='lg'
                      variant='solid'
                      action={isVideoDownloaded ? 'success' : 'muted'}
                      className='justify-center items-center'
                    >
                      <BadgeIcon
                        size='sm'
                        className=''
                        as={isVideoDownloaded ? Video : VideoOff}
                      ></BadgeIcon>
                    </Badge>
                  </Pressable>
                )}
              >
                <PopoverBackdrop />
                <PopoverContent>
                  <PopoverArrow />
                  <PopoverBody>
                    <Text className='text-typography-900'>
                      {isVideoDownloaded
                        ? 'Video Downloaded'
                        : 'Video Not Downloaded'}
                    </Text>
                  </PopoverBody>
                </PopoverContent>
              </Popover>
              <Popover
                placement='bottom'
                size='xs'
                trigger={(triggerProps) => (
                  <Pressable {...triggerProps}>
                    <Icon
                      as={getScoutedIcon()}
                      size='md'
                      className={getScoutedColor()}
                    />
                  </Pressable>
                )}
              >
                <PopoverBackdrop />
                <PopoverContent>
                  <PopoverArrow />
                  <PopoverBody>
                    <Text className='text-typography-900'>{getScoutedText()}</Text>
                  </PopoverBody>
                </PopoverContent>
              </Popover>
            </HStack>
          </HStack>

          <VStack space='xs'>
            <HStack space='xs' className='flex-1 w-[calc(100%-1.25rem)] h-3'>
              {blueTeams.map((team, index) => {
                const isHighlighted = isTeamHighlighted(team);
                return (
                  <Badge
                    size='lg'
                    variant='solid'
                    key={`blue-${index}`}
                    className={`bg-blue-500/75 rounded font-medium w-1/6 justify-center py-1 ${
                      isHighlighted &&
                      '!border-amber-400 border-[0.15rem] py-[0.1rem]'
                    }`}
                  >
                    <BadgeText>{team.number}</BadgeText>
                  </Badge>
                );
              })}
              {redTeams.map((team, index) => {
                const isHighlighted = isTeamHighlighted(team);
                return (
                  <Badge
                    size='lg'
                    variant='solid'
                    key={`red-${index}`}
                    className={`bg-red-500/75 rounded font-medium w-1/6 justify-center py-1 ${
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
