import React from 'react';
import { useRouter } from 'expo-router';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Center } from '@/components/ui/center';
import { Badge, BadgeText } from '@/components/ui/badge';
import { Button, ButtonText } from '@/components/ui/button';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { DownlinkStatus } from '@/components/DownlinkStatus';
import { useApp } from '@/contexts/AppContext';
import { parseCompetitionCode } from '@/utils/competitionCode';
import { UplinkStatus } from './UplinkStatus';

interface HeaderProps {
  title: string;
  isMainScreen?: boolean;
  showBackButton?: boolean;
  goHome?: boolean;
  fallbackRoute?: string;
}

export function Header({
  title,
  isMainScreen = false,
  showBackButton = false,
  goHome = false,
  fallbackRoute,
}: HeaderProps) {
  const router = useRouter();
  const {
    competitionCode,
    serverStatus,
    ping,
    isOnline,
    checkServerConnection,
  } = useApp();

  const handleBackNavigation = () => {
    if (goHome) {
      router.push('/');
      return;
    }

    if (fallbackRoute) {
      router.navigate(fallbackRoute as any);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate('/');
    }
  };

  return (
    <HStack className='items-center justify-between px-4 py-2 mb-4'>
      <HStack className='gap-2 items-center'>
        {showBackButton && (
          <Button
            variant='outline'
            size='sm'
            className='px-2 font-bold border-primary-500/5'
            onPress={handleBackNavigation}
          >
            <ButtonText>←</ButtonText>
          </Button>
        )}
        <Heading
          size={isMainScreen ? '2xl' : 'lg'}
          className='text-ellipsis line-clamp-1'
        >
          {title}
        </Heading>
      </HStack>
      <HStack className='gap-1'>
        <Center>
          <ConnectionStatus
            ping={ping}
            isOnline={isOnline}
            serverStatus={serverStatus}
            onPress={checkServerConnection}
            size='lg'
          />
        </Center>
        <Center>
          <DownlinkStatus size='lg' />
        </Center>
        <UplinkStatus />
        <Badge size='lg' variant='solid' action='info'>
          <BadgeText>{parseCompetitionCode(competitionCode)}</BadgeText>
        </Badge>
      </HStack>
    </HStack>
  );
}
