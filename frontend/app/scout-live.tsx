import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useKeepAwake } from 'expo-keep-awake';
import { Box } from '@/components/ui/box';
import { Match } from '@/types/match';
import { getMatches } from '@/api/matches';
import { useApp } from '@/contexts/AppContext';
import { useScoutingSession } from '@/hooks/useScoutingSession';
import { useScoutingInput } from '@/hooks/useScoutingInput';
import { ScoutingStartOverlay } from '@/components/scouting/ScoutingStartOverlay';
import { ScoutingHeader } from '@/components/scouting/ScoutingHeader';
import { MatchTimeline } from '@/components/scouting/MatchTimeline';
import { ScoutingJoystick } from '@/components/scouting/ScoutingJoystick';
import { ScoutingToggles } from '@/components/scouting/ScoutingToggles';
import { ScoutingEndScreen } from '@/components/scouting/ScoutingEndScreen';

export default function ScoutLiveScreen() {
  const { matchNumber, teamNumber } = useLocalSearchParams<{
    matchNumber: string;
    teamNumber: string;
  }>();
  const { competitionCode } = useApp();
  const [match, setMatch] = useState<Match | null>(null);

  useKeepAwake();

  const matchNum = parseInt(matchNumber || '0', 10);
  const teamNum = parseInt(teamNumber || '0', 10);

  const session = useScoutingSession({
    matchNumber: matchNum,
    matchType: match?.match_type || 'qualification',
    setNumber: match?.set_number || 1,
    teamNumber: teamNum,
    competitionCode: competitionCode || '',
    playbackSpeed: 1,
  });

  // Keyboard and gamepad input
  useScoutingInput({
    disabled: session.isDisabled || session.isClimbing,
    onActionChange: session.setAction,
    onToggleDisabled: session.toggleDisabled,
    onToggleClimbing: session.toggleClimbing,
    sessionRunning: session.sessionState === 'running',
  });

  // Lock to portrait on mount, restore on unmount
  useEffect(() => {
    if (Platform.OS === 'web') {
      (screen.orientation as any)?.lock?.('portrait').catch(() => {});
      return () => {
        (screen.orientation as any)?.unlock?.();
      };
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      return () => {
        ScreenOrientation.unlockAsync();
      };
    }
  }, []);

  // Load match data
  useEffect(() => {
    async function loadMatch() {
      if (!matchNumber) return;
      try {
        const matches = await getMatches();
        const found = matches.find(
          (m) => m.match_number === matchNum,
        );
        if (found) setMatch(found);
      } catch (err) {
        console.error('Failed to load match:', err);
      }
    }
    loadMatch();
  }, [matchNumber]);

  // End screen
  if (session.sessionState === 'finished') {
    return (
      <SafeAreaView className='flex-1 bg-background-0'>
        <ScoutingEndScreen
          matchType={match?.match_type || 'qualification'}
          matchNumber={matchNum}
          teamNumber={teamNum}
          recordData={session.getRecordData()}
          actionLog={session.actionLog}
          onSave={session.saveToDb}
          onRestart={session.resetSession}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className='flex-1 bg-background-0'>
      <Box className='flex-1 scouting-no-select'>
        {/* Header */}
        <ScoutingHeader
          matchType={match?.match_type || 'qualification'}
          matchNumber={matchNum}
          teamNumber={teamNum}
          currentAction={session.currentAction}
          currentPhase={session.currentPhase}
          displayCountdown={session.displayCountdown}
          sessionRunning={session.sessionState === 'running'}
        />

        {/* Timeline */}
        <MatchTimeline
          actionLog={session.actionLog}
          elapsedMatchSec={session.elapsedMatchSec}
        />

        {/* Spacer */}
        <Box className='flex-1' />

        {/* Toggles */}
        <Box className='px-4 pb-4'>
          <ScoutingToggles
            isDisabled={session.isDisabled}
            isClimbing={session.isClimbing}
            onToggleDisabled={session.toggleDisabled}
            onToggleClimbing={session.toggleClimbing}
            sessionRunning={session.sessionState === 'running'}
          />
        </Box>

        {/* Joystick */}
        <Box className='items-center pb-8'>
          <ScoutingJoystick
            disabled={session.isDisabled || session.isClimbing || session.sessionState !== 'running'}
            onActionChange={session.setAction}
          />
        </Box>
      </Box>

      {/* Start overlay */}
      {session.sessionState === 'ready' && (
        <ScoutingStartOverlay
          matchType={match?.match_type || 'qualification'}
          matchNumber={matchNum}
          teamNumber={teamNum}
          playbackSpeed={1}
          isLive
          onStart={session.startSession}
        />
      )}
    </SafeAreaView>
  );
}
