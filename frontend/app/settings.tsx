import React, { useEffect, useState } from 'react';
import { AdaptiveSafeArea } from '@/components/adaptive-safe-area';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Box } from '@/components/ui/box';
import { Card } from '@/components/ui/card';
import { Button, ButtonText } from '@/components/ui/button';
import { useApp } from '@/utils/AppContext';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { Badge, BadgeText } from '@/components/ui/badge';
import { Center } from '@/components/ui/center';
import { useRouter } from 'expo-router';
import { db } from '@/utils/db';
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { FormControl } from '@/components/ui/form-control';
import {
  Select,
  SelectBackdrop,
  SelectContent,
  SelectDragIndicator,
  SelectDragIndicatorWrapper,
  SelectIcon,
  SelectInput,
  SelectItem,
  SelectPortal,
  SelectScrollView,
  SelectTrigger,
} from '@/components/ui/select';
import { Competition, getCompetitions } from '@/api/competitions';
import { ChevronDownIcon, Sun, Moon, MonitorCog } from 'lucide-react-native';
import Constants from 'expo-constants';
import { Table, TableBody, TableData, TableRow } from '@/components/ui/table';
import { Icon } from '@/components/ui/icon';
import { ScrollView } from 'react-native';

export default function SettingsScreen() {
  const {
    competitionCode,
    setCompetitionCode,
    serverStatus,
    ping,
    isOnline,
    checkServerConnection,
    theme,
    setTheme,
  } = useApp();
  const router = useRouter();
  const [isResetting, setIsResetting] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showCompCodeDialog, setShowCompCodeDialog] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [localCompetitionCode, setLocalCompetitionCode] = useState('');
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loadingCompetitions, setLoadingCompetitions] = useState(true);

  useEffect(() => {
    loadCompetitions();
  }, []);

  async function loadCompetitions() {
    try {
      setLoadingCompetitions(true);
      const data = await getCompetitions();
      setCompetitions(data.filter((c) => c.code));
    } catch (error) {
      console.error('Failed to load competitions:', error);
    } finally {
      setLoadingCompetitions(false);
    }
  }

  function parseCompetitionCode(code: string): string {
    const match = code.match(/^\d{4}(.+)$/);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
    return code.toUpperCase();
  }

  function extractYear(code: string): string | null {
    const match = code.match(/^(\d{4})/);
    return match ? match[1] : null;
  }

  async function handleComplete() {
    if (isCompleting) return;

    if (!localCompetitionCode) {
      return;
    }

    try {
      setIsCompleting(true);
      await db.delete();
      await db.open();
      await setCompetitionCode(localCompetitionCode);
      setShowCompCodeDialog(false);
      setIsCompleting(false);
      window.location.reload();
    } catch (error) {
      console.error('Failed to save settings:', error);
      setIsCompleting(false);
    }
  }

  async function handleResetDatabase() {
    try {
      setIsResetting(true);
      await db.delete().then(async () => {
        console.log('Database successfully deleted');
        await db.open();
        console.log('Database reinitialized');
        setIsResetting(false);
      });
      window.location.reload();
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
            <HStack className="gap-2">
              <Button
                variant="outline"
                size="sm"
                className="px-2"
                onPress={() => router.push('/')}
              >
                <ButtonText>←</ButtonText>
              </Button>
              <Heading size="2xl">Settings</Heading>
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
                <BadgeText>{competitionCode || 'N/A'}</BadgeText>
              </Badge>
            </HStack>
          </HStack>
          <ScrollView className="flex-1 pb-6">
            <VStack space="md">
              <Card variant="outline" size="sm">
                <Heading size="lg" className="text-primary-500 mb-2">
                  App Information
                </Heading>
                <Table className="w-full">
                  <TableBody>
                    <TableRow className="m-0">
                      <TableData>App Version:</TableData>
                      <TableData>
                        {Constants.expoConfig.version || 'Unknown'}
                      </TableData>
                    </TableRow>
                    <TableRow>
                      <TableData>Comp Code:</TableData>
                      <TableData>
                        <Badge
                          size="lg"
                          variant="solid"
                          action={competitionCode !== null ? 'info' : 'error'}
                        >
                          <BadgeText>{competitionCode || 'Not set'}</BadgeText>
                        </Badge>
                      </TableData>
                    </TableRow>
                    <TableRow>
                      <TableData>Server Status:</TableData>
                      <TableData>
                        <Badge
                          size="lg"
                          variant="solid"
                          action={
                            serverStatus === 'connected'
                              ? 'success'
                              : serverStatus === 'checking'
                                ? 'warning'
                                : 'error'
                          }
                        >
                          <BadgeText>{serverStatus}</BadgeText>
                        </Badge>
                      </TableData>
                    </TableRow>
                    {ping !== null && (
                      <TableRow>
                        <TableData>Ping:</TableData>
                        <TableData>{ping} ms</TableData>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
              <Card variant="outline" size="sm">
                <Heading size="lg" className="mb-2">
                  Configuration
                </Heading>
                <VStack space="sm">
                  <Heading size="md">Theme</Heading>
                  <Text className="text-primary-500 mb-2">
                    Choose your color theme for the app.
                  </Text>
                  <HStack space="md" className="justify-evenly">
                    <Button
                      size="lg"
                      variant={theme === 'light' ? 'solid' : 'outline'}
                      action="secondary"
                      onPress={() => setTheme('light')}
                      className="flex-1"
                    >
                      <HStack
                        space="xs"
                        className="flex items-center justify-between"
                      >
                        <Icon as={Sun} size="lg" />
                        <ButtonText size="sm">Light</ButtonText>
                      </HStack>
                    </Button>
                    <Button
                      size="lg"
                      variant={theme === 'dark' ? 'solid' : 'outline'}
                      action="secondary"
                      onPress={() => setTheme('dark')}
                      className="flex-1"
                    >
                      <HStack space="xs" className="items-center">
                        <Icon as={Moon} size="lg" />
                        <ButtonText size="sm">Dark</ButtonText>
                      </HStack>
                    </Button>
                    <Button
                      size="lg"
                      variant={theme === 'system' ? 'solid' : 'outline'}
                      action="secondary"
                      onPress={() => setTheme('system')}
                      className="flex-1"
                    >
                      <HStack space="xs" className="items-center">
                        <Icon as={MonitorCog} size="lg" />
                        <ButtonText size="sm">System</ButtonText>
                      </HStack>
                    </Button>
                  </HStack>
                </VStack>
              </Card>

              <Card variant="outline">
                <Heading size="lg" className="text-error-500 mb-2">
                  Danger Zone
                </Heading>
                <VStack space="sm">
                  <FormControl>
                    <Heading size="md">Competition Code</Heading>
                    <Text className="text-primary-500 mb-2">
                      Choose the competition you’re participating in. This will
                      delete all local data.
                    </Text>
                    <Select
                      selectedValue={localCompetitionCode}
                      onValueChange={(value) => {
                        setLocalCompetitionCode(value);
                        if (value) {
                          setShowCompCodeDialog(true);
                        }
                      }}
                    >
                      <SelectTrigger size="lg">
                        <SelectInput placeholder="Select competition" />
                        <SelectIcon className="mr-3" as={ChevronDownIcon} />
                      </SelectTrigger>
                      <SelectPortal>
                        <SelectBackdrop />
                        <SelectContent>
                          <SelectDragIndicatorWrapper>
                            <SelectDragIndicator />
                          </SelectDragIndicatorWrapper>
                          <SelectScrollView>
                            {loadingCompetitions ? (
                              <SelectItem
                                label="Loading..."
                                value=""
                                isDisabled
                              />
                            ) : competitions.length === 0 ? (
                              <SelectItem
                                label="No competitions available. Check your internet connection."
                                value=""
                                isDisabled
                              />
                            ) : (
                              competitions.map((comp) => {
                                const year = extractYear(comp.code);
                                const code = parseCompetitionCode(comp.code);
                                const label = year
                                  ? `${code} (${year}) - ${comp.name}`
                                  : `${code} - ${comp.name}`;
                                return (
                                  <SelectItem
                                    key={comp.code}
                                    label={label}
                                    value={comp.code}
                                  />
                                );
                              })
                            )}
                          </SelectScrollView>
                        </SelectContent>
                      </SelectPortal>
                    </Select>
                  </FormControl>
                  <Heading size="md">App Reset</Heading>
                  <Text className="text-primary-500 mb-2">
                    Reset all local data including scouting data, matches,
                    teams, and settings.
                  </Text>
                  <Button
                    size="md"
                    action="negative"
                    onPress={() => setShowResetDialog(true)}
                    isDisabled={isResetting}
                  >
                    <ButtonText>Reset Database</ButtonText>
                  </Button>
                </VStack>
              </Card>
            </VStack>
          </ScrollView>
        </VStack>
      </Box>

      <AlertDialog
        isOpen={showCompCodeDialog}
        onClose={() => setShowCompCodeDialog(false)}
      >
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <AlertDialogHeader>
            <Heading>Change Competition Code</Heading>
          </AlertDialogHeader>
          <AlertDialogBody>
            <Text>
              This action will permanently delete your local scouting data,
              including all matches and teams. An internet connection is
              required to download the new match and team data.
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter>
            <HStack space="md" className="mt-2 w-full justify-end">
              <Button
                action="secondary"
                onPress={() => setShowCompCodeDialog(false)}
                isDisabled={isCompleting}
              >
                <ButtonText>Cancel</ButtonText>
              </Button>
              <Button
                action="primary"
                onPress={handleComplete}
                isDisabled={isCompleting}
              >
                <ButtonText>
                  {isCompleting ? 'Applying...' : 'Apply'}
                </ButtonText>
              </Button>
            </HStack>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        isOpen={showResetDialog}
        onClose={() => setShowResetDialog(false)}
      >
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <AlertDialogHeader>
            <Heading>Reset Database</Heading>
          </AlertDialogHeader>
          <AlertDialogBody>
            <Text>
              This action will permanently delete your local scouting data,
              including all matches and teams. An internet connection is
              required to redownload match and team data. A competition code
              will not be auto-selected.
            </Text>
          </AlertDialogBody>
          <AlertDialogFooter>
            <HStack space="md" className="mt-2 w-full justify-end">
              <Button
                action="secondary"
                onPress={() => setShowResetDialog(false)}
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
                  {isResetting ? 'Resetting...' : 'Reset'}
                </ButtonText>
              </Button>
            </HStack>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdaptiveSafeArea>
  );
}
