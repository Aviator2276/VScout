import React, { useEffect, useState } from 'react';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Box } from '@/components/ui/box';
import { Card } from '@/components/ui/card';
import { Button, ButtonText } from '@/components/ui/button';
import { useApp } from '@/contexts/AppContext';
import { Badge, BadgeText } from '@/components/ui/badge';
import { useRouter } from 'expo-router';
import { db, getStorageInfo, StorageInfo } from '@/utils/db';
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
import { cacheMatches } from '@/api/matches';
import { cacheTeams, cacheTeamInfo } from '@/api/teams';
import {
  ChevronDownIcon,
  Sun,
  Moon,
  MonitorCog,
} from 'lucide-react-native';
import {
  parseCompetitionCode as parseCode,
  extractYear,
} from '@/utils/competitionCode';
import Constants from 'expo-constants';
import {
  Table,
  TableBody,
  TableData,
  TableFooter,
  TableRow,
} from '@/components/ui/table';
import { Icon } from '@/components/ui/icon';
import { ScrollView } from 'react-native';
import { Progress, ProgressFilledTrack } from '@/components/ui/progress';
import { Header } from '@/components/Header';

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
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  useEffect(() => {
    loadCompetitions();
    loadStorageInfo();
  }, []);

  async function loadStorageInfo() {
    const info = await getStorageInfo();
    setStorage(info);
  }

  if (!storage || !storage.available) {
    return null;
  }

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
      await cacheMatches();
      await cacheTeams();
      await cacheTeamInfo();
      await loadStorageInfo();
      setShowCompCodeDialog(false);
      setIsCompleting(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setIsCompleting(false);
    }
  }

  async function handleResetDatabase() {
    try {
      setIsResetting(true);
      await db.delete().then(async () => {
        await db.open();
      });
      window.location.reload();
    } catch (error) {
      console.error('Failed to reset database:', error);
      setIsResetting(false);
    }
  }

  return (
    <AdaptiveSafeArea>
      <Box className="flex-1 max-w-2xl self-center w-full">
          <Header title="Settings"  showBackButton goHome />
          <ScrollView className="flex-1 pb-4 px-4">
            <VStack space="md">
              <Card variant="outline" size="sm">
                <Heading size="lg" className="text-primary-500 mb-2">
                  App Information
                </Heading>
                <Table className="w-full">
                  <TableBody>
                    <TableRow className="m-0">
                      <TableData>App version:</TableData>
                      <TableData>
                        {Constants.expoConfig.version || 'Unknown'}
                      </TableData>
                    </TableRow>
                    <TableRow>
                      <TableData>Comp code:</TableData>
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
                      <TableData>App Offline mode:</TableData>
                      <TableData>
                        <Badge size="lg" variant="solid" action="error">
                          <BadgeText>Unavailable</BadgeText>
                        </Badge>
                      </TableData>
                    </TableRow>
                    <TableRow>
                      <TableData>Server status:</TableData>
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
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableData>Last ping time:</TableData>
                      <TableData>
                        {ping !== null ? ping + ' ms' : 'Unknown'}
                      </TableData>
                    </TableRow>
                  </TableFooter>
                </Table>
                <Heading size="lg" className="text-primary-500 mb-2">
                  Storage Usage
                </Heading>
                <Text className="text-primary-200 mb-2">
                  Total storage capacity is determined by the device and
                  available storage.
                </Text>
                <VStack space="md">
                  <VStack space="xs">
                    <HStack className="justify-between items-center">
                      <Text className="text-sm font-semibold text-typography-700">
                        Total Storage Usage
                      </Text>
                      <Text className="text-xs text-typography-600">
                        {storage.usageFormatted} / {storage.quotaFormatted}
                      </Text>
                    </HStack>
                    <Progress value={storage.usagePercentage} size="sm">
                      <ProgressFilledTrack className="bg-info-500" />
                    </Progress>
                    <Text className="text-xs text-typography-600">
                      {storage.usagePercentage.toFixed(1)}% used
                    </Text>
                  </VStack>
                </VStack>
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
