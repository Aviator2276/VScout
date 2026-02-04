import React, { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { HStack } from '@/components/ui/hstack';
import { VStack } from '@/components/ui/vstack';
import { TeamInfo } from '@/types/team';
import { Badge, BadgeIcon, BadgeText } from '@/components/ui/badge';
import { getTeamName } from '@/api/teams';
import { Dice4, Fuel, MoveVertical, PackageOpen } from 'lucide-react-native';

interface TeamCardProps {
  team: TeamInfo;
  searchQuery?: string;
}

export function TeamCard({ team, searchQuery = '' }: TeamCardProps) {
  const router = useRouter();
  const [teamName, setTeamName] = useState<string | null>(null);

  useEffect(() => {
    getTeamName(team.team_number).then(setTeamName);
  }, [team.team_number]);

  const isHighlighted = (): boolean => {
    if (!searchQuery.trim()) {
      return false;
    }
    return team.team_number.toString().includes(searchQuery.trim());
  };

  const handleCardPress = () => {
    router.push(`/team/${team.team_number}`);
  };

  return (
    <Pressable onPress={handleCardPress}>
      <Card
        variant="outline"
        size="md"
        className={`mb-3 p-4 ${isHighlighted() ? 'border-amber-400 border-2' : ''}`}
      >
        <HStack className="items-center justify-between">
          <VStack className="w-full">
            <HStack space="sm" className="items-center pb-2 justify-between">
              <HStack space="sm" className="items-center">
                <Text className="text-lg font-bold text-typography-900">
                  {team.team_number}
                </Text>
                <Text className="text-md text-typography-600 overflow-hidden max-w-48">
                  {teamName}
                </Text>
              </HStack>
              <Text className="text-md text-typography-600">
                RP {team.ranking_points}
              </Text>
            </HStack>
            <HStack space="sm" className="items-center w-full">
              <Badge size="lg" variant="solid" action="info">
                <BadgeText>#{team.rank}</BadgeText>
              </Badge>
              <Text className="text-sm text-amber-600 dark:text-amber-500">
                {team.win}-{team.lose}-{team.tie}
              </Text>
              <HStack className="flex-1 w-full justify-end gap-1">
                <Badge
                  size="lg"
                  variant="solid"
                  action="muted"
                  className="w-18 justify-evenly"
                >
                  <BadgeIcon as={Fuel}></BadgeIcon>
                  <BadgeText className="ml-1">{team.avg_fuel_scored}</BadgeText>
                </Badge>
                <Badge
                  size="lg"
                  variant="solid"
                  action="muted"
                  className="w-11 justify-evenly"
                >
                  <BadgeText>L{team.avg_climb_points}</BadgeText>
                </Badge>
                <Badge
                  size="lg"
                  variant="solid"
                  action="muted"
                  className="w-12 justify-evenly"
                >
                  <BadgeIcon as={PackageOpen}></BadgeIcon>
                  <BadgeText className="ml-1">
                    {team.prescout_hopper_size}1
                  </BadgeText>
                </Badge>
                <Badge size="lg" variant="solid" action="muted">
                  <BadgeIcon
                    as={
                      team.prescout_drivetrain === 'swerve'
                        ? Dice4
                        : MoveVertical
                    }
                  ></BadgeIcon>
                </Badge>
              </HStack>
            </HStack>
          </VStack>
        </HStack>
      </Card>
    </Pressable>
  );
}
