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
import { Match } from '@/types/match';
import { ShieldPlus, ChevronDown } from 'lucide-react-native';
import { calculateClimbPoints } from '@/utils/climbPoints';
import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionTitleText,
  AccordionIcon,
  AccordionContent,
} from '@/components/ui/accordion';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from './ui/charts';
import { CartesianGrid, Line, LineChart, XAxis } from 'recharts';
import { db } from '@/utils/db';
import { RobotActionRecord } from '@/types/scouting';
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

interface TeamMatchCardProps {
  match: Match;
  teamNumber: number;
  competitionCode: string;
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

type PositionKey = 'blue_1' | 'blue_2' | 'blue_3' | 'red_1' | 'red_2' | 'red_3';

function getTeamPosition(match: Match, teamNumber: number): { position: PositionKey; alliance: 'blue' | 'red'; slot: 1 | 2 | 3 } | null {
  if (match.blue_team_1.number === teamNumber) return { position: 'blue_1', alliance: 'blue', slot: 1 };
  if (match.blue_team_2.number === teamNumber) return { position: 'blue_2', alliance: 'blue', slot: 2 };
  if (match.blue_team_3.number === teamNumber) return { position: 'blue_3', alliance: 'blue', slot: 3 };
  if (match.red_team_1.number === teamNumber) return { position: 'red_1', alliance: 'red', slot: 1 };
  if (match.red_team_2.number === teamNumber) return { position: 'red_2', alliance: 'red', slot: 2 };
  if (match.red_team_3.number === teamNumber) return { position: 'red_3', alliance: 'red', slot: 3 };
  return null;
}

export function TeamMatchCard({
  match,
  teamNumber,
  competitionCode,
}: TeamMatchCardProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [robotActions, setRobotActions] = useState<RobotActionRecord | null>(null);

  const positionInfo = getTeamPosition(match, teamNumber);

  useEffect(() => {
    async function loadRobotActions() {
      try {
        const cached = await db.robotActions
          .where('[competitionCode+match_type+set_number+match_number+team_number]')
          .equals([
            competitionCode,
            match.match_type,
            match.set_number,
            match.match_number,
            teamNumber,
          ])
          .first();
        setRobotActions(cached || null);
      } catch (error) {
        console.error('Failed to load robot actions:', error);
      }
    }
    loadRobotActions();
  }, [competitionCode, match.match_type, match.set_number, match.match_number, teamNumber]);

  const chartData = useMemo(() => {
    if (!robotActions) return [{ time: 0, fuel: 0 }];

    const points: { time: number; fuel: number }[] = [{ time: 0, fuel: 0 }];
    let currentTime = 0;
    let cumulativeFuel = 0;

    for (const segment of robotActions.auto) {
      currentTime += segment.duration;
      if (segment.fuel) {
        cumulativeFuel += segment.fuel;
      }
      points.push({
        time: Math.round(currentTime * 10) / 10,
        fuel: cumulativeFuel,
      });
    }

    currentTime = AUTO_DURATION + HOLD_DURATION;
    points.push({ time: currentTime, fuel: cumulativeFuel });

    for (const segment of robotActions.tele) {
      currentTime += segment.duration;
      if (segment.fuel) {
        cumulativeFuel += segment.fuel;
      }
      points.push({
        time: Math.round(currentTime * 10) / 10,
        fuel: cumulativeFuel,
      });
    }

    return points;
  }, [robotActions]);

  const actionLog = useMemo((): ActionLogEntry[] => {
    if (!robotActions) return [];

    const log: ActionLogEntry[] = [];
    let currentTime = 0;

    for (const segment of robotActions.auto) {
      log.push({
        matchTimeSec: currentTime,
        action: segment.action as RobotAction,
      });
      currentTime += segment.duration;
    }

    currentTime = AUTO_DURATION + HOLD_DURATION;
    for (const segment of robotActions.tele) {
      log.push({
        matchTimeSec: currentTime,
        action: segment.action as RobotAction,
      });
      currentTime += segment.duration;
    }

    return log;
  }, [robotActions]);

  const timelineSegments = useMemo((): DisplaySegment[] => {
    if (actionLog.length === 0) return [];

    const result: DisplaySegment[] = [];
    const endTime = TOTAL_MATCH_DURATION;

    for (let i = 0; i < actionLog.length; i++) {
      const entry = actionLog[i];
      const nextTime = i + 1 < actionLog.length ? actionLog[i + 1].matchTimeSec : endTime;
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

  const displayablePeriods = useMemo(() => MATCH_PERIODS.filter((p) => p.displayable), []);

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

  if (!positionInfo) return null;

  const { position, alliance, slot } = positionInfo;

  const autoFuel = (match as any)[`${position}_auto_fuel`] as number ?? 0;
  const teleopFuel = (match as any)[`${position}_teleop_fuel`] as number ?? 0;
  const totalFuelScored = (match as any)[`${position}_fuel_scored`] as number ?? 0;
  const autoClimb = (match as any)[`${position}_auto_climb`] as boolean ?? false;
  const climbLevel = (match as any)[`${position}_climb`] as string ?? 'None';
  const totalAllianceScore = alliance === 'blue' ? match.blue_total_score : match.red_total_score;

  const allianceBorderColor = alliance === 'blue' ? 'border-blue-500' : 'border-red-500';
  const allianceColor = alliance === 'blue' ? 'bg-blue-500/20' : 'bg-red-500/20';

  const handlePress = () => {
    router.push(`/(tabs)/match/${match.match_number}?from=team&teamId=${teamNumber}`);
  };

  const fuelColor = '#f59e0b';

  const chartConfig = {
    fuel: {
      label: 'Fuel Scored',
      color: fuelColor,
    },
  } satisfies ChartConfig;

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
                <BadgeText>{slot}</BadgeText>
              </Badge>
              <Heading size='md' className='capitalize'>
                {match.match_type} #{match.match_number}
              </Heading>
              <Badge
                size='sm'
                variant='solid'
                action={match.has_played ? 'success' : 'muted'}
              >
                <BadgeText>{match.has_played ? 'Played' : 'Upcoming'}</BadgeText>
              </Badge>
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
                  {calculateClimbPoints(climbLevel) + calculateClimbPoints('', autoClimb)}
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
        <Accordion
          type='single'
          variant='unfilled'
          size='sm'
          className='w-full'
        >
          <AccordionItem value='details'>
            <AccordionHeader className='py-1'>
              <AccordionTrigger className='py-1'>
                {({ isExpanded }: { isExpanded: boolean }) => (
                  <>
                    <AccordionTitleText className='text-xs font-medium'>
                      {isExpanded ? 'Hide' : 'Show'} Graph & Timeline
                    </AccordionTitleText>
                    <AccordionIcon as={ChevronDown} className='ml-1 w-3 h-3' />
                  </>
                )}
              </AccordionTrigger>
            </AccordionHeader>
            <AccordionContent className='pt-2 pb-0 px-0'>
              <VStack space='sm' className='w-full'>
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
                  </LineChart>
                </ChartContainer>
                <VStack space='xs' className='w-full'>
                  <View
                    style={{
                      height: 10,
                      borderRadius: 4,
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                    className='bg-background-200 w-full'
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

                  <View style={{ position: 'relative', height: 14, marginTop: 0.25 }} className='w-full'>
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
                </VStack>
              </VStack>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </VStack>
    </Card>
  );
}
