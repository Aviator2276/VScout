import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Heading } from '@/components/ui/heading';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/charts';
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import { Match } from '@/types/match';

const TEAM_POSITIONS = [
  { teamKey: 'blue_team_1' as const, prefix: 'blue_1' },
  { teamKey: 'blue_team_2' as const, prefix: 'blue_2' },
  { teamKey: 'blue_team_3' as const, prefix: 'blue_3' },
  { teamKey: 'red_team_1' as const, prefix: 'red_1' },
  { teamKey: 'red_team_2' as const, prefix: 'red_2' },
  { teamKey: 'red_team_3' as const, prefix: 'red_3' },
];

interface ChartDataPoint {
  match: string;
  autoFuel: number | null;
  teleFuel: number | null;
  scouted: boolean;
}

interface TeamFuelChartProps {
  matches: Match[];
  teamNumber: number;
}

export function TeamFuelChart({ matches, teamNumber }: TeamFuelChartProps) {
  const chartData = useMemo(() => {
    const playedMatches = matches
      .filter((m) => m.has_played)
      .sort((a, b) => a.match_number - b.match_number);

    return playedMatches
      .map((match): ChartDataPoint | null => {
        for (const { teamKey, prefix } of TEAM_POSITIONS) {
          if (match[teamKey].number !== teamNumber) continue;

          const scouted =
            ((match as any)[`${prefix}_scouted`] as boolean) ?? false;

          if (!scouted) {
            return {
              match: `M${match.match_number}`,
              autoFuel: null,
              teleFuel: null,
              scouted: false,
            };
          }

          const autoFuel =
            ((match as any)[`${prefix}_auto_fuel`] as number) ?? 0;
          const teleFuel =
            ((match as any)[`${prefix}_teleop_fuel`] as number) ?? 0;

          return {
            match: `M${match.match_number}`,
            autoFuel,
            teleFuel,
            scouted: true,
          };
        }
        return null;
      })
      .filter((d): d is ChartDataPoint => d !== null);
  }, [matches, teamNumber]);

  const unscoutedMatches = useMemo(
    () => chartData.filter((d) => !d.scouted).map((d) => d.match),
    [chartData],
  );

  const chartConfig = {
    autoFuel: {
      label: 'Auto Fuel',
      color: '#3b82f6', // blue-500
    },
    teleFuel: {
      label: 'Teleop Fuel',
      color: '#f59e0b', // amber-500
    },
  } satisfies ChartConfig;

  if (chartData.length === 0) {
    return null;
  }

  return (
    <Card variant='outline' className='p-4 mb-2'>
      <VStack space='sm'>
        <Heading size='sm'>Fuel Scored Over Matches</Heading>
        <ChartContainer config={chartConfig} className='min-h-[220px] w-full'>
          <LineChart accessibilityLayer data={chartData}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey='match'
              tickLine={false}
              tickMargin={8}
              axisLine={false}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              width={30}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent />}
            />
            <ChartLegend content={<ChartLegendContent payload={[]} />} />
            {unscoutedMatches.map((matchLabel) => (
              <ReferenceLine
                key={matchLabel}
                x={matchLabel}
                stroke='#ef4444'
                strokeDasharray='4 4'
                strokeOpacity={0.5}
              />
            ))}
            <Line
              dataKey='autoFuel'
              type='monotone'
              stroke='#3b82f6'
              strokeWidth={2}
              dot={{ r: 3, fill: '#3b82f6' }}
              connectNulls={false}
            />
            <Line
              dataKey='teleFuel'
              type='monotone'
              stroke='#f59e0b'
              strokeWidth={2}
              dot={{ r: 3, fill: '#f59e0b' }}
              connectNulls={false}
            />
          </LineChart>
        </ChartContainer>
        {unscoutedMatches.length > 0 && (
          <Text className='text-xs text-red-400'>
            Not scouted: {unscoutedMatches.join(', ')}
          </Text>
        )}
      </VStack>
    </Card>
  );
}
