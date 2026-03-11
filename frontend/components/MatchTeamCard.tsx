import React, { useEffect, useState, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Badge, BadgeText, BadgeIcon } from '@/components/ui/badge';
import { Heading } from '@/components/ui/heading';
import { Divider } from '@/components/ui/divider';
import { Team } from '@/types/match';
import { ShieldPlus } from 'lucide-react-native';
import { calculateClimbPoints } from '@/utils/climbPoints';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from './ui/charts';
import { CartesianGrid, Line, LineChart, XAxis } from 'recharts';
import { db } from '@/utils/db';
import { ScoutRecord } from '@/types/record';
import { Box } from '@/components/ui/box';
import { RobotAction } from '@/types/scouting';
import {
  AUTO_DURATION,
  HOLD_DURATION,
  DISPLAYABLE_DURATION,
  MATCH_PERIODS,
  TOTAL_MATCH_DURATION,
  matchTimeToDisplayPosition,
} from '@/utils/matchTimeline';
import { ACTION_COLORS } from '@/components/scouting/actionColors';

export interface MatchTeamStats {
  team: Team;
  alliance: 'blue' | 'red';
  position: 1 | 2 | 3;
  autoFuel: number;
  teleopFuel: number;
  totalFuelScored: number;
  autoClimb: boolean;
  climbLevel: string;
  totalAllianceScore: number;
}

interface MatchTeamCardProps {
  stats: MatchTeamStats;
  matchNumber?: number;
  matchType?: string;
  setNumber?: number;
  competitionCode?: string;
}

interface ActionLogEntry {
  matchTimeSec: number;
  action: RobotAction;
}

interface DisplaySegment {
  startPct: number;
  widthPct: number;
  color: string;
}

export function MatchTeamCard({
  stats,
  matchNumber,
  matchType,
  setNumber,
  competitionCode,
}: MatchTeamCardProps) {
  const router = useRouter();
  const {
    team,
    alliance,
    position,
    autoFuel,
    teleopFuel,
    totalFuelScored,
    autoClimb,
    climbLevel,
    totalAllianceScore,
  } = stats;

  const allianceColor =
    alliance === 'blue' ? 'bg-blue-500/20' : 'bg-red-500/20';
  const allianceBorderColor =
    alliance === 'blue' ? 'border-blue-500' : 'border-red-500';

  const handlePress = () => {
    if (matchNumber) {
      router.push(
        `/(tabs)/team/${team.number}?from=match&matchId=${matchNumber}`,
      );
    } else {
      router.push(`/(tabs)/team/${team.number}`);
    }
  };

  // Using Tailwind amber-500 and emerald-500 colors to match Gluestack theme
  const fuelColor = '#f59e0b'; // amber-500
  const climbColor = '#10b981'; // emerald-500

  const chartConfig = {
    fuel: {
      label: 'Fuel',
      color: fuelColor,
    },
    climb: {
      label: 'Climb Level',
      color: climbColor,
    },
  } satisfies ChartConfig;

  const chartData = [
    { time: 0, fuel: 0, climb: 1 },
    { time: 20, fuel: 20, climb: 0 },
    { time: 30, fuel: 3, climb: 0 },
    { time: 55, fuel: 30, climb: 0 },
    { time: 80, fuel: 28, climb: 0 },
    { time: 105, fuel: 50, climb: 0 },
    { time: 130, fuel: 2, climb: 3 },
    { time: 160, fuel: 67, climb: 3 },
  ];

  // Fetch scout record for timeline
  const [scoutRecord, setScoutRecord] = useState<ScoutRecord | null>(null);

  useEffect(() => {
    if (
      !competitionCode ||
      !matchType ||
      matchNumber === undefined ||
      setNumber === undefined
    ) {
      return;
    }

    async function loadScoutRecord() {
      try {
        const record = await db.scoutRecords
          .where(
            '[info.competitionCode+match_type+set_number+match_number+team.number]',
          )
          .equals([
            competitionCode!,
            matchType!,
            setNumber!,
            matchNumber!,
            team.number,
          ])
          .first();
        setScoutRecord(record || null);
      } catch (error) {
        console.error('Failed to load scout record:', error);
      }
    }

    loadScoutRecord();
  }, [competitionCode, matchType, setNumber, matchNumber, team.number]);

  // Convert scout record to actionLog format
  const actionLog = useMemo((): ActionLogEntry[] => {
    if (!scoutRecord) return [];

    const log: ActionLogEntry[] = [];
    let currentTime = 0;

    // Process auto segments
    for (const segment of scoutRecord.auto) {
      log.push({
        matchTimeSec: currentTime,
        action: segment.action as RobotAction,
      });
      currentTime += segment.duration;
    }

    // Skip hold period, continue from teleop start
    currentTime = AUTO_DURATION + HOLD_DURATION;
    for (const segment of scoutRecord.tele) {
      log.push({
        matchTimeSec: currentTime,
        action: segment.action as RobotAction,
      });
      currentTime += segment.duration;
    }

    return log;
  }, [scoutRecord]);

  // Timeline segments for display
  const timelineSegments = useMemo((): DisplaySegment[] => {
    if (actionLog.length === 0) return [];

    const result: DisplaySegment[] = [];
    const endTime = TOTAL_MATCH_DURATION;

    for (let i = 0; i < actionLog.length; i++) {
      const entry = actionLog[i];
      const nextTime =
        i + 1 < actionLog.length ? actionLog[i + 1].matchTimeSec : endTime;
      const color = ACTION_COLORS[entry.action]?.bg || '#6b7280';

      const autoStart = Math.max(entry.matchTimeSec, 0);
      const autoEnd = Math.min(nextTime, AUTO_DURATION);
      if (autoStart < autoEnd) {
        const startPct = (autoStart / DISPLAYABLE_DURATION) * 100;
        const widthPct = ((autoEnd - autoStart) / DISPLAYABLE_DURATION) * 100;
        result.push({ startPct, widthPct, color });
      }

      const holdEnd = AUTO_DURATION + HOLD_DURATION;
      const teleStart = Math.max(entry.matchTimeSec, holdEnd);
      const teleEnd = Math.min(nextTime, TOTAL_MATCH_DURATION);
      if (teleStart < teleEnd) {
        const displayStart = teleStart - holdEnd + AUTO_DURATION;
        const displayWidth = teleEnd - teleStart;
        const startPct = (displayStart / DISPLAYABLE_DURATION) * 100;
        const widthPct = (displayWidth / DISPLAYABLE_DURATION) * 100;
        result.push({ startPct, widthPct, color });
      }
    }

    return result;
  }, [actionLog]);

  // Period labels and tick marks
  const displayablePeriods = useMemo(
    () => MATCH_PERIODS.filter((p) => p.displayable),
    [],
  );

  const tickMarks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 0; i < displayablePeriods.length - 1; i++) {
      const period = displayablePeriods[i];
      const displayPos = matchTimeToDisplayPosition(period.endSec);
      const pct = (displayPos / DISPLAYABLE_DURATION) * 100;
      ticks.push(pct);
    }
    return ticks;
  }, [displayablePeriods]);

  const periodLabels = useMemo(() => {
    return displayablePeriods.map((period) => {
      const startPos = matchTimeToDisplayPosition(period.startSec);
      const endPos = matchTimeToDisplayPosition(period.endSec);
      const startPct = (startPos / DISPLAYABLE_DURATION) * 100;
      const widthPct = ((endPos - startPos) / DISPLAYABLE_DURATION) * 100;

      const labelMap: Record<string, string> = {
        autonomous: 'Auto',
        transition: 'Trans',
        shift_1: 'Shift 1',
        shift_2: 'Shift 2',
        shift_3: 'Shift 3',
        shift_4: 'Shift 4',
        endgame: 'Endgame',
      };

      return {
        label: labelMap[period.label] || period.label,
        startPct,
        widthPct,
      };
    });
  }, [displayablePeriods]);

  return (
    <Card
      variant='outline'
      size='sm'
      className={`mb-2 p-3 ${allianceBorderColor} border-l-8`}
    >
      <VStack space='sm'>
        <Pressable onPress={handlePress}>
          <HStack className='justify-between items-center'>
            <HStack space='sm' className='items-center'>
              <Badge
                size='sm'
                variant='solid'
                action={alliance === 'blue' ? 'info' : 'error'}
              >
                <BadgeText>{position}</BadgeText>
              </Badge>
              <Heading size='md'>{team.number}</Heading>
              <Text className='text-typography-600 truncate line-clamp-1'>
                {team.name || 'Unknown Team'}
              </Text>
            </HStack>
            <HStack className='gap-1'>
              <Badge
                size='sm'
                variant='solid'
                action='success'
                className='justify-center items-center'
              >
                <BadgeIcon as={ShieldPlus}></BadgeIcon>
                <BadgeText className='capitalize ml-1'>
                  {Math.round(
                    ((calculateClimbPoints(climbLevel) +
                      calculateClimbPoints('', autoClimb) +
                      totalFuelScored) /
                      totalAllianceScore) *
                      100,
                  ) || 0}
                  {'%'}
                </BadgeText>
              </Badge>
            </HStack>
          </HStack>
        </Pressable>

        <Divider />
        <HStack className='justify-between'>
          <VStack space='xs'>
            <Text className='text-sm font-semibold text-typography-700'>
              Fuel Scored
            </Text>
            <HStack className='justify-between'>
              <HStack space='md'>
                <VStack className='items-center'>
                  <Text className='text-xs text-typography-500'>Auto</Text>
                  <Text className='font-semibold'>{autoFuel}</Text>
                </VStack>
                <VStack className='items-center'>
                  <Text className='text-xs text-typography-500'>Teleop</Text>
                  <Text className='font-semibold'>{teleopFuel}</Text>
                </VStack>
                <VStack className='items-center'>
                  <Text className='text-xs text-typography-500'>Total</Text>
                  <Text className='font-semibold'>{totalFuelScored}</Text>
                </VStack>
              </HStack>
            </HStack>
          </VStack>
          {/* Climb Stats */}
          <VStack space='xs'>
            <Text className='text-sm font-semibold text-typography-700'>
              Climb Scored
            </Text>
            <VStack space='xs'>
              <HStack space='xs' className='gap-1 items-center'>
                <Text className='text-xs text-typography-500'>Auto:</Text>
                <Badge
                  size='sm'
                  variant='solid'
                  action={autoClimb ? 'success' : 'warning'}
                >
                  <BadgeText>{autoClimb ? 'Yes' : 'No'}</BadgeText>
                </Badge>
              </HStack>
              <HStack space='xs' className='gap-1 items-center'>
                <Text className='text-xs text-typography-500'>Endgame:</Text>
                <Badge
                  size='sm'
                  variant='solid'
                  action={climbLevel !== 'None' ? 'success' : 'warning'}
                >
                  <BadgeText>{climbLevel || 'None'}</BadgeText>
                </Badge>
              </HStack>
            </VStack>
          </VStack>
          <VStack space='xs'>
            <HStack space='xs' className='gap-1 justify-between items-center'>
              <Text className='text-xs text-typography-500'>Fuel:</Text>
              <Badge size='sm' variant='solid' action='muted'>
                <BadgeText>{totalFuelScored}</BadgeText>
              </Badge>
            </HStack>
            <HStack space='xs' className='gap-1 justify-between items-center'>
              <Text className='text-xs text-typography-500'>Climb:</Text>
              <Badge size='sm' variant='solid' action='muted'>
                <BadgeText>
                  {calculateClimbPoints(climbLevel) +
                    calculateClimbPoints('', autoClimb)}
                </BadgeText>
              </Badge>
            </HStack>
            <HStack space='xs' className='gap-1 justify-between items-center'>
              <Text className='text-xs text-typography-500'>Total:</Text>
              <Badge
                size='sm'
                variant='solid'
                action='muted'
                className={allianceColor}
              >
                <BadgeText>
                  {calculateClimbPoints(climbLevel) +
                    calculateClimbPoints('', autoClimb) +
                    totalFuelScored}
                </BadgeText>
              </Badge>
            </HStack>
          </VStack>
        </HStack>
        <VStack>
          <ChartContainer config={chartConfig} className='min-h-[200px] w-full'>
            <LineChart accessibilityLayer data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey='time'
                tickLine={false}
                tickMargin={10}
                axisLine={false}
                scale='time'
                type='number'
                interval={0}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Line
                dataKey='fuel'
                type='monotone'
                stroke={fuelColor}
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey='climb'
                type='monotone'
                stroke={climbColor}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
          <View
            style={{
              height: 10,
              borderRadius: 4,
              overflow: 'hidden',
              position: 'relative',
            }}
            className='bg-background-200'
          >
            {timelineSegments.map((seg, idx) => (
              <View
                key={idx}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${seg.startPct}%` as any,
                  width: `${seg.widthPct}%` as any,
                  backgroundColor: seg.color,
                }}
              />
            ))}

            {tickMarks.map((pct, idx) => (
              <View
                key={`tick-${idx}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${pct}%` as any,
                  width: 2,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  zIndex: 2,
                }}
              />
            ))}
          </View>

          <View style={{ position: 'relative', height: 14, marginTop: 0.25 }}>
            {periodLabels.map((p, idx) => (
              <View
                key={`label-${idx}`}
                style={{
                  position: 'absolute',
                  left: `${p.startPct}%` as any,
                  width: `${p.widthPct}%` as any,
                  height: '100%',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Text className='text-[10px] text-typography-500 font-medium'>
                  {p.label}
                </Text>
              </View>
            ))}
          </View>
          <Text className='text-xs text-typography-300 text-right'>
            *Chart for demonstration only (WIP)
          </Text>
        </VStack>
      </VStack>
    </Card>
  );
}
