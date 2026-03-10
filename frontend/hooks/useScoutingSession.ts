import { useState, useRef, useCallback, useEffect } from 'react';
import { RobotAction, ActionSegment, RobotActionRecord } from '@/types/scouting';
import {
  AUTO_DURATION,
  HOLD_DURATION,
  TOTAL_MATCH_DURATION,
  getPhaseAtTime,
  getDisplayCountdown,
  getPeriodAtTime,
} from '@/utils/matchTimeline';
import { db } from '@/utils/db';
import { saveScoutRecord } from '@/api/scout';

export type SessionState = 'ready' | 'running' | 'finished';

interface ActionLogEntry {
  matchTimeSec: number;
  action: RobotAction;
}

interface UseScoutingSessionParams {
  matchNumber: number;
  matchType: string;
  setNumber: number;
  teamNumber: number;
  competitionCode: string;
  playbackSpeed: number;
}

export interface ScoutingSession {
  sessionState: SessionState;
  elapsedMatchSec: number;
  currentAction: RobotAction;
  isDisabled: boolean;
  isClimbing: boolean;
  isDefending: boolean;
  currentPhase: 'auto' | 'hold' | 'teleop';
  displayCountdown: string;
  periodLabel: string;
  actionLog: ActionLogEntry[];
  startSession: () => void;
  setAction: (action: RobotAction) => void;
  toggleDisabled: () => void;
  toggleClimbing: () => void;
  toggleDefending: () => void;
  resetSession: () => void;
  getRecordData: () => RobotActionRecord;
  saveToDb: (notes?: string) => Promise<void>;
}

export function useScoutingSession({
  matchNumber,
  matchType,
  setNumber,
  teamNumber,
  competitionCode,
  playbackSpeed,
}: UseScoutingSessionParams): ScoutingSession {
  const [sessionState, setSessionState] = useState<SessionState>('ready');
  const [elapsedRealMs, setElapsedRealMs] = useState(0);
  const [currentAction, setCurrentAction] = useState<RobotAction>('traversing');
  const [isDisabled, setIsDisabled] = useState(false);
  const [isClimbing, setIsClimbing] = useState(false);
  const [isDefending, setIsDefending] = useState(false);
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);

  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const sessionStateRef = useRef<SessionState>('ready');
  const elapsedRealMsRef = useRef(0);
  const lastActionChangeSecRef = useRef<number>(0);
  const pendingTraversingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep ref in sync
  useEffect(() => {
    sessionStateRef.current = sessionState;
  }, [sessionState]);

  // Derived values
  const elapsedMatchSec = (elapsedRealMs / 1000) * playbackSpeed;
  const currentPhase = getPhaseAtTime(elapsedMatchSec);
  const displayCountdown = getDisplayCountdown(elapsedMatchSec);
  const period = getPeriodAtTime(elapsedMatchSec);

  // RAF loop
  const tick = useCallback((timestamp: number) => {
    if (sessionStateRef.current !== 'running') return;

    const realElapsed = timestamp - startTimeRef.current;
    elapsedRealMsRef.current = realElapsed;
    const matchSec = (realElapsed / 1000) * playbackSpeed;

    if (matchSec >= TOTAL_MATCH_DURATION) {
      setElapsedRealMs(TOTAL_MATCH_DURATION / playbackSpeed * 1000);
      setSessionState('finished');
      sessionStateRef.current = 'finished';
      return;
    }

    setElapsedRealMs(realElapsed);
    rafRef.current = requestAnimationFrame(tick);
  }, [playbackSpeed]);

  // Cleanup RAF and pending timers on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      if (pendingTraversingRef.current !== null) {
        clearTimeout(pendingTraversingRef.current);
      }
    };
  }, []);

  const startSession = useCallback(() => {
    setSessionState('running');
    sessionStateRef.current = 'running';
    setElapsedRealMs(0);
    elapsedRealMsRef.current = 0;
    setCurrentAction('traversing');
    setIsDisabled(false);
    setIsClimbing(false);
    setActionLog([{ matchTimeSec: 0, action: 'traversing' }]);
    lastActionChangeSecRef.current = 0;
    if (pendingTraversingRef.current !== null) {
      clearTimeout(pendingTraversingRef.current);
      pendingTraversingRef.current = null;
    }
    startTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const MIN_ACTION_DURATION_SEC = 0.5;

  const canChangeAction = useCallback((): boolean => {
    const currentRealMs = elapsedRealMsRef.current;
    const matchSec = (currentRealMs / 1000) * playbackSpeed;
    return (matchSec - lastActionChangeSecRef.current) >= MIN_ACTION_DURATION_SEC;
  }, [playbackSpeed]);

  const applyAction = useCallback((action: RobotAction) => {
    const currentRealMs = elapsedRealMsRef.current;
    const matchSec = (currentRealMs / 1000) * playbackSpeed;
    lastActionChangeSecRef.current = matchSec;
    setCurrentAction(action);
    setActionLog((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.action === action) return prev;
      return [...prev, { matchTimeSec: matchSec, action }];
    });
  }, [playbackSpeed]);

  const setAction = useCallback((action: RobotAction) => {
    const currentRealMs = elapsedRealMsRef.current;
    const matchSec = (currentRealMs / 1000) * playbackSpeed;
    const elapsed = matchSec - lastActionChangeSecRef.current;

    // Clear any pending traversing timeout
    if (pendingTraversingRef.current !== null) {
      clearTimeout(pendingTraversingRef.current);
      pendingTraversingRef.current = null;
    }

    // Always update the displayed state to match the joystick
    setCurrentAction(action);

    if (elapsed >= MIN_ACTION_DURATION_SEC) {
      applyAction(action);
    } else {
      // Schedule the action to log after the remaining cooldown
      const remainingSec = MIN_ACTION_DURATION_SEC - elapsed;
      const remainingRealMs = (remainingSec / playbackSpeed) * 1000;
      pendingTraversingRef.current = setTimeout(() => {
        pendingTraversingRef.current = null;
        if (sessionStateRef.current === 'running') {
          applyAction(action);
        }
      }, remainingRealMs);
    }
  }, [playbackSpeed, applyAction]);

  const toggleDisabled = useCallback(() => {
    if (!canChangeAction()) return;
    setIsDisabled((prev) => {
      const newVal = !prev;
      if (newVal) {
        setIsClimbing(false);
        setIsDefending(false);
        setAction('disabled');
      } else {
        setAction('traversing');
      }
      return newVal;
    });
  }, [setAction, canChangeAction]);

  const toggleClimbing = useCallback(() => {
    if (!canChangeAction()) return;
    setIsClimbing((prev) => {
      const newVal = !prev;
      if (newVal) {
        setIsDefending(false);
        setAction('climbing');
      } else {
        setAction('traversing');
      }
      return newVal;
    });
  }, [setAction, canChangeAction]);

  const toggleDefending = useCallback(() => {
    if (!canChangeAction()) return;
    setIsDefending((prev) => {
      const newVal = !prev;
      if (newVal) {
        setIsClimbing(false);
        setAction('defending');
      } else {
        setAction('traversing');
      }
      return newVal;
    });
  }, [setAction, canChangeAction]);

  const resetSession = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setSessionState('ready');
    sessionStateRef.current = 'ready';
    setElapsedRealMs(0);
    elapsedRealMsRef.current = 0;
    setCurrentAction('traversing');
    setIsDisabled(false);
    setIsClimbing(false);
    setIsDefending(false);
    setActionLog([]);
    lastActionChangeSecRef.current = 0;
    if (pendingTraversingRef.current !== null) {
      clearTimeout(pendingTraversingRef.current);
      pendingTraversingRef.current = null;
    }
  }, []);

  const getRecordData = useCallback((): RobotActionRecord => {
    const autoEnd = AUTO_DURATION;
    const holdEnd = AUTO_DURATION + HOLD_DURATION;
    const matchEnd = TOTAL_MATCH_DURATION;

    const autoSegments: ActionSegment[] = [];
    const teleSegments: ActionSegment[] = [];

    for (let i = 0; i < actionLog.length; i++) {
      const entry = actionLog[i];
      const nextTime = i + 1 < actionLog.length ? actionLog[i + 1].matchTimeSec : matchEnd;

      // Determine overlap with auto phase (0 to autoEnd)
      const autoStart = Math.max(entry.matchTimeSec, 0);
      const autoEndClamp = Math.min(nextTime, autoEnd);
      if (autoStart < autoEndClamp) {
        const duration = Math.round((autoEndClamp - autoStart) * 100) / 100;
        autoSegments.push({ duration, action: entry.action });
      }

      // Determine overlap with teleop phase (holdEnd to matchEnd)
      const teleStart = Math.max(entry.matchTimeSec, holdEnd);
      const teleEndClamp = Math.min(nextTime, matchEnd);
      if (teleStart < teleEndClamp) {
        const duration = Math.round((teleEndClamp - teleStart) * 100) / 100;
        teleSegments.push({ duration, action: entry.action });
      }
    }

    return {
      competitionCode,
      match_type: matchType,
      set_number: setNumber,
      match_number: matchNumber,
      team_number: teamNumber,
      auto: autoSegments,
      tele: teleSegments,
    };
  }, [actionLog, competitionCode, matchType, setNumber, matchNumber, teamNumber]);

  const saveToDb = useCallback(async (notes?: string) => {
    const record = getRecordData();
    if (notes) record.notes = notes;
    // Save to local robotActions table
    await db.robotActions.put(record);
    // Save to scoutRecords for upload tracking
    await saveScoutRecord(record);
  }, [getRecordData]);

  return {
    sessionState,
    elapsedMatchSec,
    currentAction,
    isDisabled,
    isClimbing,
    isDefending,
    currentPhase,
    displayCountdown,
    periodLabel: period.label,
    actionLog,
    startSession,
    setAction,
    toggleDisabled,
    toggleClimbing,
    toggleDefending,
    resetSession,
    getRecordData,
    saveToDb,
  };
}
