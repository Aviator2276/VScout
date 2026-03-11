import React, { useEffect, useState } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { usePreventZoom } from '@/hooks/usePreventZoom';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { Button, ButtonText } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';

export default function ScoutLiveScreen() {
  const { matchNumber, teamNumber } = useLocalSearchParams<{
    matchNumber: string;
    teamNumber: string;
  }>();
  const { competitionCode } = useApp();
  const [match, setMatch] = useState<Match | null>(null);

  useKeepAwake();
  usePreventZoom();

  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const matchNum = parseInt(matchNumber || '0', 10);
  const teamNum = parseInt(teamNumber || '0', 10);

  // Detect Android web to avoid SafeAreaView doubling insets
  const isAndroidWeb =
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    /android/i.test(navigator.userAgent);

  // Determine team alliance color
  const getTeamAlliance = (): 'blue' | 'red' | null => {
    if (!match) return null;
    const blueTeams = [match.blue_team_1, match.blue_team_2, match.blue_team_3];
    const redTeams = [match.red_team_1, match.red_team_2, match.red_team_3];
    if (blueTeams.some((t) => t.number === teamNum)) return 'blue';
    if (redTeams.some((t) => t.number === teamNum)) return 'red';
    return null;
  };

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
    onToggleDefending: session.toggleDefending,
    sessionRunning: session.sessionState === 'running',
  });

  // Unlock orientation so landscape/portrait both work
  useEffect(() => {
    if (Platform.OS === 'web') {
      (screen.orientation as any)?.unlock?.();
    } else {
      ScreenOrientation.unlockAsync();
    }
  }, []);

  // Load match data
  useEffect(() => {
    async function loadMatch() {
      if (!matchNumber) return;
      try {
        const matches = await getMatches();
        const found = matches.find((m) => m.match_number === matchNum);
        if (found) setMatch(found);
      } catch (err) {
        console.error('Failed to load match:', err);
      }
    }
    loadMatch();
  }, [matchNumber]);

  // On Android web in landscape, use View instead of SafeAreaView to avoid doubled insets
  const Container = isAndroidWeb && isLandscape ? View : SafeAreaView;

  return (
    <Container className='flex-1 bg-background-0'>
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

        <Box className='flex-1' />

        {isLandscape ? (
          <HStack className='items-center justify-between px-4 pb-4' space='xl'>
            <Box className='flex-shrink-0'>
              <ScoutingToggles
                isDisabled={session.isDisabled}
                isClimbing={session.isClimbing}
                isDefending={session.isDefending}
                onToggleDisabled={session.toggleDisabled}
                onToggleClimbing={session.toggleClimbing}
                onToggleDefending={session.toggleDefending}
                sessionRunning={session.sessionState === 'running'}
              />
            </Box>
            <ScoutingJoystick
              disabled={
                session.isDisabled ||
                session.isClimbing ||
                session.isDefending ||
                session.sessionState !== 'running'
              }
              onActionChange={session.setAction}
              size={Math.max(80, Math.min(160, height - 180))}
            />
          </HStack>
        ) : (
          <VStack className='items-center pb-4' space='sm'>
            <Box className='px-4 w-full flex-shrink-0'>
              <ScoutingToggles
                isDisabled={session.isDisabled}
                isClimbing={session.isClimbing}
                isDefending={session.isDefending}
                onToggleDisabled={session.toggleDisabled}
                onToggleClimbing={session.toggleClimbing}
                onToggleDefending={session.toggleDefending}
                sessionRunning={session.sessionState === 'running'}
              />
            </Box>
            <ScoutingJoystick
              disabled={
                session.isDisabled ||
                session.isClimbing ||
                session.isDefending ||
                session.sessionState !== 'running'
              }
              onActionChange={session.setAction}
              size={Math.max(80, Math.min(160, height - 350))}
            />
          </VStack>
        )}
      </Box>

      {session.sessionState === 'ready' && (
        <ScoutingStartOverlay
          matchType={match?.match_type || 'qualification'}
          matchNumber={matchNum}
          teamNumber={teamNum}
          teamAlliance={getTeamAlliance()}
          playbackSpeed={1}
          isLive
          onStart={session.startSession}
        />
      )}

      <ScoutingEndScreen
        isOpen={session.sessionState === 'finished'}
        matchType={match?.match_type || 'qualification'}
        matchNumber={matchNum}
        teamNumber={teamNum}
        recordData={session.getRecordData()}
        actionLog={session.actionLog}
        onSave={session.saveToDb}
        onRestart={session.resetSession}
      />

      {/* Stall detection alert */}
      <AlertDialog isOpen={session.isStalled} onClose={session.clearStall}>
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <AlertDialogHeader>
            <Heading size='md'>Session Error</Heading>
          </AlertDialogHeader>
          <AlertDialogBody>
            <Text className='text-typography-500'>
              The scouting session timer has stopped unexpectedly. Please
              restart your session to ensure accurate data.
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter>
            <HStack space='md' className='w-full justify-end'>
              <Button
                action='negative'
                className='mt-2'
                onPress={() => {
                  session.clearStall();
                  session.resetSession();
                }}
              >
                <ButtonText>Restart Session</ButtonText>
              </Button>
            </HStack>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Container>
  );
}
