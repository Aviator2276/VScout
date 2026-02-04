import React from 'react';
import { useRouter } from 'expo-router';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Center } from '@/components/ui/center';
import { Badge, BadgeText } from '@/components/ui/badge';
import { Button, ButtonText } from '@/components/ui/button';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useApp } from '@/utils/AppContext';
import { parseCompetitionCode } from '@/utils/competitionCode';

interface HeaderProps {
  title: string;
  isMainScreen?: boolean;
  showBackButton?: boolean;
  goHome?: boolean;
}

export function Header({
  title,
  isMainScreen = false,
  showBackButton = false,
  goHome = false,
}: HeaderProps) {
  const router = useRouter();
  const {
    competitionCode,
    serverStatus,
    ping,
    isOnline,
    checkServerConnection,
  } = useApp();

  return (
    <HStack className="items-center justify-between px-4 py-2">
      <HStack className="gap-2 items-center">
        {showBackButton && (
          <Button
            variant="link"
            size="sm"
            className="font-bold"
            onPress={() => goHome ? router.push('/') : router.back()}
          >
            <ButtonText>←</ButtonText>
          </Button>
        )}
        <Heading size={isMainScreen ? '2xl' : 'lg'}>{title}</Heading>
      </HStack>
      <HStack className="gap-1">
        <Center>
          <ConnectionStatus
            ping={ping}
            isOnline={isOnline}
            serverStatus={serverStatus}
            onPress={checkServerConnection}
            size="lg"
          />
        </Center>
        <Badge size="lg" variant="solid" action="info">
          <BadgeText>{parseCompetitionCode(competitionCode)}</BadgeText>
        </Badge>
      </HStack>
    </HStack>
  );
}
