import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
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
  const { matchNumber, speed, teamNumber } = useLocalSearchParams<{
    matchNumber: string;
    speed: string;
    teamNumber: string;
  }>();
  const { competitionCode } = useApp();
  const [match, setMatch] = useState<Match | null>(null);
  const playbackSpeed = speed ? parseFloat(speed) : 1;
  const isMobileWeb = useIsMobileWeb();
  const isPortrait = useIsPortrait();
  const { width, height } = useWindowDimensions();

  useKeepAwake();
  usePreventZoom();

  const matchNum = parseInt(matchNumber || '0', 10);
  const teamNum = parseInt(teamNumber || '0', 10);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

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

  // Pause video when session finishes
  useEffect(() => {
    if (session.sessionState === 'finished' && videoRef.current) {
      videoRef.current.pause();
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

  // Wrap startSession to also play the video
  const handleStart = useCallback(() => {
    session.startSession();
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.playbackRate = playbackSpeed;
      videoRef.current.play().catch(() => {});
    }
  }, [session.startSession, playbackSpeed]);

  // On native phones, lock to landscape; on web, try the orientation API (phones only)
  useEffect(() => {
    if (Platform.OS !== 'web') {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      return () => {
        ScreenOrientation.unlockAsync();
      };
    }

    if (isMobileWeb) {
      (screen.orientation as any)?.lock?.('landscape').catch(() => {});
      return () => {
        (screen.orientation as any)?.unlock?.();
      };
    }
  }, [isMobileWeb]);

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

  // End screen
  if (session.sessionState === 'finished') {
    const endContent = (
      <ScoutingEndScreen
        matchType={match?.match_type || 'qualification'}
        matchNumber={matchNum}
        teamNumber={teamNum}
        recordData={session.getRecordData()}
        actionLog={session.actionLog}
        onSave={session.saveToDb}
        onRestart={session.resetSession}
      />
    );

    if (needsRotation) {
      return (
        <View
          style={{
            width: height,
            height: width,
            transform: [{ rotate: '90deg' }],
            position: 'absolute',
            top: (height - width) / 2,
            left: -(height - width) / 2,
          }}
          className='bg-background-0'
        >
          {endContent}
        </View>
      );
    }

    return (
      <SafeAreaView className='flex-1 bg-background-0'>
        {endContent}
      </SafeAreaView>
    );
  }

  const content = (
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

      <HStack className='flex-1'>
        <Box className='flex-1 pl-2 justify-center'>
          <Box className='bg-background-950 aspect-video overflow-hidden rounded-xl items-center'>
            {videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                playsInline
                preload='auto'
                muted={false}
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
          />
        </Box>

        <Box className='w-64 items-center justify-between py-2'>
          <Box className='w-full px-2'>
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
          />
        </Box>
      </HStack>

      {session.sessionState === 'ready' && (
        <ScoutingStartOverlay
          matchType={match?.match_type || 'qualification'}
          matchNumber={matchNum}
          teamNumber={teamNum}
          playbackSpeed={playbackSpeed}
          isLive={false}
          onStart={handleStart}
          alignRight
        />
      )}
    </Box>
  );

  if (needsRotation) {
    return (
      <View
        style={{
          width: height,
          height: width,
          transform: [{ rotate: '90deg' }],
          position: 'absolute',
          top: (height - width) / 2,
          left: -(height - width) / 2,
        }}
        className='bg-background-0'
      >
        {content}
      </View>
    );
  }

  return (
    <SafeAreaView className='flex-1 bg-background-0'>{content}</SafeAreaView>
  );
}
