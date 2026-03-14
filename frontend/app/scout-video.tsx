import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Platform,
  View,
  Text as RNText,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useKeepAwake } from 'expo-keep-awake';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
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
import { getVideoUrl, revokeVideoUrl } from '@/utils/videoStorage';
import { usePreventZoom } from '@/hooks/usePreventZoom';
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

function useIsMobileWeb(): boolean {
  const { width } = useWindowDimensions();
  if (Platform.OS !== 'web') return false;
  return width < 768;
}

function useIsPortrait(): boolean {
  const { width, height } = useWindowDimensions();
  return height > width;
}

export default function ScoutVideoScreen() {
  const { matchNumber, speed, teamNumber, muted } = useLocalSearchParams<{
    matchNumber: string;
    speed: string;
    teamNumber: string;
    muted: string;
  }>();
  const { competitionCode } = useApp();
  const [match, setMatch] = useState<Match | null>(null);
  const playbackSpeed = speed ? parseFloat(speed) : 1;
  const isMuted = muted === 'true';
  const isMobileWeb = useIsMobileWeb();
  const isPortrait = useIsPortrait();
  const { width, height } = useWindowDimensions();

  useKeepAwake();
  usePreventZoom();

  const matchNum = parseInt(matchNumber || '0', 10);
  const teamNum = parseInt(teamNumber || '0', 10);

  // Determine team alliance color
  const getTeamAlliance = (): 'blue' | 'red' | null => {
    if (!match) return null;
    const blueTeams = [match.blue_team_1, match.blue_team_2, match.blue_team_3];
    const redTeams = [match.red_team_1, match.red_team_2, match.red_team_3];
    if (blueTeams.some((t) => t.number === teamNum)) return 'blue';
    if (redTeams.some((t) => t.number === teamNum)) return 'red';
    return null;
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownAudioRef = useRef<HTMLAudioElement | null>(null);

  const session = useScoutingSession({
    matchNumber: matchNum,
    matchType: match?.match_type || 'qualification',
    setNumber: match?.set_number || 1,
    teamNumber: teamNum,
    competitionCode: competitionCode || '',
    playbackSpeed,
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

  // Load video from OPFS
  useEffect(() => {
    let url: string | null = null;
    async function loadVideo() {
      if (!competitionCode || !matchNum) return;
      try {
        url = await getVideoUrl(competitionCode, matchNum);
        if (url) setVideoUrl(url);
      } catch (err) {
        console.error('Failed to load video:', err);
      }
    }
    loadVideo();
    return () => {
      if (url) revokeVideoUrl(url);
    };
  }, [competitionCode, matchNum]);

  // Set playback rate whenever the video element is available
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [videoUrl, playbackSpeed]);

  // Pause/resume video when session state changes
  useEffect(() => {
    if (session.sessionState === 'finished' && videoRef.current) {
      videoRef.current.pause();
    }
    if (session.sessionState === 'paused' && videoRef.current) {
      videoRef.current.pause();
    }
    if (
      session.sessionState === 'running' &&
      videoRef.current &&
      countdown === null
    ) {
      videoRef.current.play().catch(() => {});
    }
  }, [session.sessionState]);

  // Pause video when leaving the screen
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
      }
    };
  }, []);

  // Start countdown when user presses the start button
  const handleStartCountdown = useCallback(() => {
    // Pre-load audio (skip if muted)
    if (Platform.OS === 'web' && !isMuted) {
      const audio = new Audio(require('@/assets/sounds/countdown.wav'));
      countdownAudioRef.current = audio;
      audio.play().catch(() => {});
    }
    setCountdown(3);
  }, [isMuted]);

  // Tick down the countdown, then start session + video
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      session.startSession();
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.playbackRate = playbackSpeed;
        videoRef.current.play().catch(() => {});
      }
      return;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, session.startSession, playbackSpeed]);

  // Force landscape: lock orientation on native and mobile web
  useEffect(() => {
    if (Platform.OS !== 'web') {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      return () => {
        ScreenOrientation.unlockAsync();
      };
    }

    // On web, try the Screen Orientation API (mobile browsers)
    const lockLandscape = () => {
      (screen.orientation as any)?.lock?.('landscape').catch(() => {});
    };
    lockLandscape();

    // Re-lock if orientation somehow changes (e.g. user rotates while lock failed)
    const handleOrientationChange = () => lockLandscape();
    screen.orientation?.addEventListener?.('change', handleOrientationChange);

    return () => {
      screen.orientation?.removeEventListener?.(
        'change',
        handleOrientationChange,
      );
      (screen.orientation as any)?.unlock?.();
    };
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

  // On mobile web in portrait, rotate the entire content to simulate landscape
  const needsRotation = isMobileWeb && isPortrait;

  // Dynamic joystick size: cap so toggles + joystick don't overlap
  // Sidebar height is roughly `height - header(~50)`. Toggles take ~140px.
  // Remaining space is for the joystick (including labels ~20px).
  const effectiveHeight = needsRotation ? width : height;
  const sidebarHeight = effectiveHeight - 50;
  const joystickMaxSize = Math.max(80, Math.min(160, sidebarHeight - 180));

  const content = (
    <Box className='flex-1 scouting-no-select pb-1'>
      {/* Header */}
      <ScoutingHeader
        matchType={match?.match_type || 'qualification'}
        matchNumber={matchNum}
        teamNumber={teamNum}
        currentAction={session.currentAction}
        currentPhase={session.currentPhase}
        displayCountdown={session.displayCountdown}
        sessionRunning={session.sessionState === 'running'}
        isPaused={session.sessionState === 'paused'}
        onPause={session.pauseSession}
        onResume={session.resumeSession}
      />

      <HStack className='flex-1'>
        <Box className='flex-1 pl-2 justify-center'>
          <Box className='bg-background-950 aspect-video overflow-hidden rounded-xl items-center'>
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                playsInline
                preload='auto'
                muted={isMuted}
                onLoadedMetadata={() => {
                  if (videoRef.current) videoRef.current.currentTime = 0;
                }}
                style={{
                  width: '100%',
                  objectFit: 'cover',
                  borderRadius: 12,
                }}
              />
            ) : (
              <Box className='flex-1 items-center justify-center'>
                <Box />
              </Box>
            )}
          </Box>
          <MatchTimeline
            actionLog={session.actionLog}
            elapsedMatchSec={session.elapsedMatchSec}
            missedActionTime={session.missedActionTime}
          />
        </Box>

        <Box className='w-64 items-center justify-between py-2'>
          <Box className='w-full px-2 flex-shrink-0'>
            <ScoutingToggles
              isDisabled={session.isDisabled}
              isClimbing={session.isClimbing}
              isDefending={session.isDefending}
              onToggleDisabled={session.toggleDisabled}
              onToggleClimbing={session.toggleClimbing}
              onToggleDefending={session.toggleDefending}
              onMarkMissed={session.markMissed}
              onUndoMissed={session.undoMissed}
              onClearMissedPulse={session.clearMissedPulse}
              sessionRunning={session.sessionState === 'running'}
            />
          </Box>

          <Box className='flex-1 items-center justify-center'>
            <ScoutingJoystick
              disabled={
                session.isDisabled ||
                session.isClimbing ||
                session.isDefending ||
                session.sessionState !== 'running'
              }
              onActionChange={session.setAction}
              size={joystickMaxSize}
            />
          </Box>
        </Box>
      </HStack>

      {session.sessionState === 'ready' && countdown === null && (
        <ScoutingStartOverlay
          matchType={match?.match_type || 'qualification'}
          matchNumber={matchNum}
          teamNumber={teamNum}
          teamAlliance={getTeamAlliance()}
          playbackSpeed={playbackSpeed}
          isLive={false}
          onStart={handleStartCountdown}
          alignRight
          videoUrl={videoUrl}
        />
      )}

      {countdown !== null && countdown > 0 && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            zIndex: 50,
          }}
        >
          <View
            style={{
              width: 160,
              height: 160,
              borderRadius: 80,
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <RNText
              style={{
                fontSize: 96,
                fontWeight: '800',
                color: 'rgba(255, 255, 255, 0.9)',
              }}
            >
              {countdown}
            </RNText>
          </View>
        </View>
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
            <Text className='text-typography-'>
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
    </Box>
  );

  return (
    <View
      className='bg-background-0'
      style={
        needsRotation
          ? {
              width: height,
              height: width,
              transform: [{ rotate: '90deg' }],
              position: 'absolute',
              top: (height - width) / 2,
              left: -(height - width) / 2,
            }
          : { flex: 1 }
      }
    >
      {content}
    </View>
  );
}
