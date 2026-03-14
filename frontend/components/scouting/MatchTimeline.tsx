import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Box } from '@/components/ui/box';
import { Text } from '@/components/ui/text';
import { RobotAction } from '@/types/scouting';
import {
  AUTO_DURATION,
  HOLD_DURATION,
  DISPLAYABLE_DURATION,
  MATCH_PERIODS,
  TOTAL_MATCH_DURATION,
  matchTimeToDisplayPosition,
} from '@/utils/matchTimeline';
import { ACTION_COLORS } from './actionColors';

interface ActionLogEntry {
  matchTimeSec: number;
  action: RobotAction;
}

interface MatchTimelineProps {
  actionLog: ActionLogEntry[];
  elapsedMatchSec: number;
  isFinished?: boolean;
  missedActionTime?: number | null;
}

interface DisplaySegment {
  startPct: number;
  widthPct: number;
  color: string;
  pulse?: boolean;
}

export function MatchTimeline({
  actionLog,
  elapsedMatchSec,
  isFinished = false,
  missedActionTime,
}: MatchTimelineProps) {
  const endTime = isFinished ? TOTAL_MATCH_DURATION : elapsedMatchSec;

  const segments = useMemo((): DisplaySegment[] => {
    if (actionLog.length === 0) return [];

    const result: DisplaySegment[] = [];

    for (let i = 0; i < actionLog.length; i++) {
      const entry = actionLog[i];
      const nextTime =
        i + 1 < actionLog.length ? actionLog[i + 1].matchTimeSec : endTime;
      const color = ACTION_COLORS[entry.action]?.bg || '#6b7280';
      const shouldPulse =
        missedActionTime != null &&
        entry.matchTimeSec === missedActionTime &&
        entry.action === 'missed';

      const autoStart = Math.max(entry.matchTimeSec, 0);
      const autoEnd = Math.min(nextTime, AUTO_DURATION);
      if (autoStart < autoEnd) {
        const startPct = (autoStart / DISPLAYABLE_DURATION) * 100;
        const widthPct = ((autoEnd - autoStart) / DISPLAYABLE_DURATION) * 100;
        result.push({ startPct, widthPct, color, pulse: shouldPulse });
      }

      const holdEnd = AUTO_DURATION + HOLD_DURATION;
      const teleStart = Math.max(entry.matchTimeSec, holdEnd);
      const teleEnd = Math.min(nextTime, TOTAL_MATCH_DURATION);
      if (teleStart < teleEnd) {
        const displayStart = teleStart - holdEnd + AUTO_DURATION;
        const displayWidth = teleEnd - teleStart;
        const startPct = (displayStart / DISPLAYABLE_DURATION) * 100;
        const widthPct = (displayWidth / DISPLAYABLE_DURATION) * 100;
        result.push({ startPct, widthPct, color, pulse: shouldPulse });
      }
    }

    return result;
  }, [actionLog, endTime, missedActionTime]);

  // Tick marks at period boundaries (displayable periods only)
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

  // Period labels with positions
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

  // Progress indicator position
  const progressPct = useMemo(() => {
    if (isFinished) return 100;
    const displayPos = matchTimeToDisplayPosition(elapsedMatchSec);
    return Math.min((displayPos / DISPLAYABLE_DURATION) * 100, 100);
  }, [elapsedMatchSec, isFinished]);

  return (
    <Box className='w-full px-3 py-1'>
      {/* Pulse animation for missed segments */}
      {missedActionTime != null && (
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @keyframes missed-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.3; }
              }
              .missed-pulse { animation: missed-pulse 0.6s ease-in-out infinite; }
            `,
          }}
        />
      )}

      {/* Timeline bar */}
      <View
        style={{
          height: 10,
          borderRadius: 4,
          overflow: 'hidden',
          position: 'relative',
        }}
        className='bg-background-200'
      >
        {/* Action segments */}
        {segments.map((seg, idx) => (
          <View
            key={idx}
            className={seg.pulse ? 'missed-pulse' : ''}
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

        {/* Tick marks */}
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

        {/* Progress indicator line */}
        {!isFinished && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${progressPct}%` as any,
              width: 2,
              backgroundColor: '#ffffff',
              zIndex: 3,
            }}
            className='animate-pulse'
          />
        )}
      </View>

      {/* Period labels */}
      <View style={{ position: 'relative', height: 14 }}>
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
    </Box>
  );
}
