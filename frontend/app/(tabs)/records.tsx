import { useState } from 'react';
import { Center } from '@/components/ui/center';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { AdaptiveSafeArea } from '@/components/adaptive-safe-area';
import { Button, ButtonText } from '@/components/ui/button';
import { VStack } from '@/components/ui/vstack';
import { db } from '@/utils/db';
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { HStack } from '@/components/ui/hstack';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { Badge, BadgeText } from '@/components/ui/badge';
import { useApp } from '@/utils/AppContext';
import { Box } from '@/components/ui/box';

export default function RecordsScreen() {
  const {
    competitionCode,
    serverStatus,
    ping,
    isOnline,
    checkServerConnection,
  } = useApp();
  const [isResetting, setIsResetting] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  async function handleResetDatabase() {
    try {
      setIsResetting(true);
      await db
        .delete()
        .then(async () => {
          console.log('Database successfully deleted');
          await db.open();
          console.log('Database reinitialized');
          setIsResetting(false);
        })
        .catch((err) => console.log(err));
      setShowDialog(false);
    } catch (error) {
      console.error('Failed to reset database:', error);
      setIsResetting(false);
    }
  }

  return (
    <AdaptiveSafeArea>
      <Box className="px-4 pt-4 flex-1 max-w-2xl self-center w-full">
        <VStack space="md">
          <HStack className="items-center justify-between">
            <Heading size="2xl">Records</Heading>
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
                <BadgeText>{competitionCode || 'N/A'}</BadgeText>
              </Badge>
            </HStack>
          </HStack>
        </VStack>
      </Box>
      <Box className="p-4 flex-1 max-w-2xl self-center w-full">
        <Button
          size="lg"
          action="negative"
          onPress={() => setShowDialog(true)}
          isDisabled={isResetting}
        >
          <ButtonText>Reset Database</ButtonText>
        </Button>
      </Box>

      <AlertDialog isOpen={showDialog} onClose={() => setShowDialog(false)}>
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <AlertDialogHeader>
            <Heading size="lg">Reset Database</Heading>
          </AlertDialogHeader>
          <AlertDialogBody>
            <Text>
              Are you sure you want to delete all data? This will reset the app
              and show onboarding again.
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter>
            <Button
              variant="outline"
              action="secondary"
              onPress={() => setShowDialog(false)}
              isDisabled={isResetting}
            >
              <ButtonText>Cancel</ButtonText>
            </Button>
            <Button
              action="negative"
              onPress={handleResetDatabase}
              isDisabled={isResetting}
            >
              <ButtonText>
                {isResetting ? 'Resetting...' : 'Delete All'}
              </ButtonText>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdaptiveSafeArea>
  );
}
