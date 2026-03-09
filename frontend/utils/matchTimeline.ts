export interface MatchPeriod {
  label: string;
  phase: 'auto' | 'hold' | 'teleop';
  durationSec: number;
  startSec: number;
  endSec: number;
  displayable: boolean;
}

export const AUTO_DURATION = 20;
export const HOLD_DURATION = 4;
export const TELEOP_DURATION = 140;
export const TOTAL_MATCH_DURATION =
  AUTO_DURATION + HOLD_DURATION + TELEOP_DURATION; // 164s
export const DISPLAYABLE_DURATION = AUTO_DURATION + TELEOP_DURATION; // 160s (no hold)

const periodDefs: {
  label: string;
  phase: 'auto' | 'hold' | 'teleop';
  durationSec: number;
  displayable: boolean;
}[] = [
  { label: 'autonomous', phase: 'auto', durationSec: 20, displayable: true },
  { label: 'hold', phase: 'hold', durationSec: HOLD_DURATION, displayable: false },
  { label: 'transition', phase: 'teleop', durationSec: 10, displayable: true },
  { label: 'shift_1', phase: 'teleop', durationSec: 25, displayable: true },
  { label: 'shift_2', phase: 'teleop', durationSec: 25, displayable: true },
  { label: 'shift_3', phase: 'teleop', durationSec: 25, displayable: true },
  { label: 'shift_4', phase: 'teleop', durationSec: 25, displayable: true },
  { label: 'endgame', phase: 'teleop', durationSec: 30, displayable: true },
];

export const MATCH_PERIODS: MatchPeriod[] = (() => {
  let cumulative = 0;
  return periodDefs.map((def) => {
    const period: MatchPeriod = {
      ...def,
      startSec: cumulative,
      endSec: cumulative + def.durationSec,
    };
    cumulative += def.durationSec;
    return period;
  });
})();

export function getPhaseAtTime(
  elapsedMatchSec: number,
): 'auto' | 'hold' | 'teleop' {
  if (elapsedMatchSec < AUTO_DURATION) return 'auto';
  if (elapsedMatchSec < AUTO_DURATION + HOLD_DURATION) return 'hold';
  return 'teleop';
}

export function getPeriodAtTime(elapsedMatchSec: number): MatchPeriod {
  for (const period of MATCH_PERIODS) {
    if (elapsedMatchSec < period.endSec) return period;
  }
  return MATCH_PERIODS[MATCH_PERIODS.length - 1];
}

export function getDisplayCountdown(elapsedMatchSec: number): string {
  const phase = getPhaseAtTime(elapsedMatchSec);

  if (phase === 'auto') {
    const remaining = Math.max(0, AUTO_DURATION - elapsedMatchSec);
    return formatTime(remaining);
  }

  if (phase === 'hold') {
    const holdElapsed = elapsedMatchSec - AUTO_DURATION;
    const remaining = Math.max(0, HOLD_DURATION - holdElapsed);
    return formatTime(remaining);
  }

  // teleop: countdown from TELEOP_DURATION
  const teleopElapsed = elapsedMatchSec - AUTO_DURATION - HOLD_DURATION;
  const remaining = Math.max(0, TELEOP_DURATION - teleopElapsed);
  return formatTime(remaining);
}

export function getPhaseLabel(phase: 'auto' | 'hold' | 'teleop'): string {
  switch (phase) {
    case 'auto':
      return 'Auto';
    case 'hold':
      return 'Hold';
    case 'teleop':
      return 'Teleop';
  }
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  if (secs === 60) {
    return `${mins + 1}:00`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function matchTimeToDisplayPosition(matchTimeSec: number): number {
  if (matchTimeSec <= AUTO_DURATION) {
    return matchTimeSec;
  }
  if (matchTimeSec <= AUTO_DURATION + HOLD_DURATION) {
    return AUTO_DURATION;
  }
  return matchTimeSec - HOLD_DURATION;
}
