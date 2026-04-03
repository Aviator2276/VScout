import React, { useState, useEffect } from 'react';
import { ScrollView, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectTrigger,
  SelectInput,
  SelectIcon,
  SelectPortal,
  SelectBackdrop,
  SelectContent,
  SelectDragIndicatorWrapper,
  SelectDragIndicator,
  SelectItem,
  SelectScrollView,
} from '@/components/ui/select';
import { ChevronDownIcon } from '@/components/ui/icon';
import { Competition, getCompetitions } from '@/api/competitions';
import { parseCompetitionCode, extractYear } from '@/utils/competitionCode';
import { useApp } from '@/contexts/AppContext';
import {
  ChevronRight,
  ChevronLeft,
  Download,
  Smartphone,
  Wifi,
  Binoculars,
  Tablet,
  GraduationCap,
} from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Image } from '@/components/ui/image';
import { APP_VERSION } from '@/utils/version';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { DownlinkStatus } from '@/components/DownlinkStatus';
import { UplinkStatus } from '@/components/UplinkStatus';

interface OnboardingPage {
  title: string;
  icon: typeof Download;
  useLogoInsteadOfIcon?: boolean;
  content?: React.ReactNode;
  ContentComponent?: React.FC;
}

function OfflineSupportContent() {
  const { ping, isOnline, serverStatus, checkServerConnection } = useApp();

  return (
    <VStack space='md'>
      <Text className='text-typography-600 text-center'>
        VScout works offline at competitions where internet may be unreliable.
        Here&apos;s how you know if you&apos;re connected on the header.
      </Text>
      <Card variant='outline' size='md'>
        <VStack space='sm'>
          <HStack space='sm' className='items-center'>
            <ConnectionStatus
              ping={ping}
              isOnline={isOnline}
              serverStatus={serverStatus}
              onPress={checkServerConnection}
              size='lg'
            />
            <Heading size='sm'>Connection</Heading>
          </HStack>
          <Text className='text-typography-500'>
            Shows your connection quality to the server. Tap it to check your
            ping.
          </Text>
        </VStack>
      </Card>
      <Card variant='outline' size='md'>
        <VStack space='sm'>
          <HStack space='sm' className='items-center'>
            <DownlinkStatus size='lg' />
            <Heading size='sm'>Downlink</Heading>
          </HStack>
          <Text className='text-typography-500'>
            Shows how fresh your cached data is. Tap it to see when data was
            last synced and force a refresh.
          </Text>
        </VStack>
      </Card>
      <Card variant='outline' size='md'>
        <VStack space='sm'>
          <HStack space='sm' className='items-center'>
            <UplinkStatus size='lg' />
            <Heading size='sm'>Uplink</Heading>
          </HStack>
          <Text className='text-typography-500'>
            Shows the status of your scouting uploads. Tap it to upload now or
            retry failed uploads.
          </Text>
        </VStack>
      </Card>
      <Text className='text-typography-500 text-center'>
        Make sure to load the app while connected before heading to a
        competition.
      </Text>
    </VStack>
  );
}

const ONBOARDING_PAGES: OnboardingPage[] = [
  {
    title: 'Welcome to VScout',
    icon: Binoculars,
    useLogoInsteadOfIcon: true,
    content: (
      <VStack space='md'>
        <Text className='text-typography-600 text-center text-lg'>
          Version: {APP_VERSION}
        </Text>
        <Text className='text-typography-500 text-center'>
          Let&apos;s get you set up in just a few steps.
        </Text>
      </VStack>
    ),
  },
  {
    title: 'Install the App',
    icon: Download,
    content: (
      <VStack space='md'>
        <Text className='text-typography-600 text-center'>
          VScout works best when installed as an app on your device.
        </Text>
        <Card variant='outline' size='md'>
          <VStack space='sm'>
            <Heading size='sm'>iOS (Safari)</Heading>
            <Text className='text-typography-500'>
              1. Tap the Share button at the bottom of Safari{'\n'}
              2. Scroll down and tap &quot;Add to Home Screen&quot;{'\n'}
              3. Tap &quot;Add&quot; to confirm {'\n'}
              4. Open the application on your Home Screen
            </Text>
          </VStack>
        </Card>
        <Card variant='outline' size='md'>
          <VStack space='sm'>
            <Heading size='sm'>Android (Chrome)</Heading>
            <Text className='text-typography-500'>
              1. Tap the three-dot menu in the top right{'\n'}
              2. Tap &quot;Add to Home screen&quot;{'\n'}
              3. Tap &quot;Add&quot; to confirm{'\n'}
              4. Open the application on your Home Screen
            </Text>
          </VStack>
        </Card>
      </VStack>
    ),
  },
  {
    title: 'Offline Support',
    icon: Wifi,
    ContentComponent: OfflineSupportContent,
  },
  {
    title: 'How To Scout',
    icon: GraduationCap,
    content: (
      <VStack space='md'>
        <Text className='text-typography-600 text-center'>
          A few tips to get you started
        </Text>
        <Card variant='outline' size='md'>
          <VStack space='sm'>
            <Heading size='sm'>Tips</Heading>
            <Text className='text-typography-500'>
              • When you scout, you are watching the robots actions. Each action
              is recorded for the whole match.
              {'\n'}• The most important robot action is shooting. Make sure
              their action is in sync with the time of the match.{'\n'}• If you
              recorded that the robot had shot but it missed, use the missed
              button to delete the recent action.{'\n'}• Learn more in the
              tutorials on the home screen.
            </Text>
          </VStack>
        </Card>
      </VStack>
    ),
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { competitionCode, setCompetitionCode, completeOnboarding } = useApp();
  const [currentPage, setCurrentPage] = useState(0);
  const [compCode, setCompCode] = useState(competitionCode || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  // Total pages = template pages + final comp code page
  const totalPages = ONBOARDING_PAGES.length + 1;
  const isOnTemplatePage = currentPage < ONBOARDING_PAGES.length;
  const isOnCompCodePage = currentPage === ONBOARDING_PAGES.length;

  async function handleFinish() {
    setIsSubmitting(true);
    try {
      if (compCode.trim()) {
        await setCompetitionCode(compCode.trim());
      }
      await completeOnboarding();
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSkip() {
    // Skip to the comp code page
    setCurrentPage(ONBOARDING_PAGES.length);
  }

  function handleNext() {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  }

  function handleBack() {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  }

  return (
    <AdaptiveSafeArea hasTabBar={false}>
      <Box className='flex-1 max-w-lg self-center w-full'>
        {/* Header with skip */}
        <HStack className='items-center justify-between px-4 py-3'>
          <Text className='text-typography-400 text-sm'>
            {currentPage + 1} / {totalPages}
          </Text>
          {isOnTemplatePage && (
            <Pressable onPress={handleSkip}>
              <Text className='text-primary-500 font-medium'>Skip</Text>
            </Pressable>
          )}
        </HStack>

        {/* Progress bar */}
        <Box className='px-4 mb-4'>
          <Box className='h-1 bg-background-200 rounded-full overflow-hidden'>
            <Box
              className='h-full bg-primary-500 rounded-full'
              style={{ width: `${((currentPage + 1) / totalPages) * 100}%` }}
            />
          </Box>
        </Box>

        {/* Page content */}
        <ScrollView
          className='flex-1 px-4'
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          {isOnTemplatePage ? (
            <VStack space='lg' className='flex-1 justify-center py-8'>
              <Box className='items-center mb-4'>
                {ONBOARDING_PAGES[currentPage].useLogoInsteadOfIcon ? (
                  <Image
                    source={require('@/assets/images/VScout-1024@x1.png')}
                    alt='VibeScout Logo'
                    className='w-32 h-32 rounded-2xl'
                  />
                ) : (
                  <Box className='w-16 h-16 rounded-full bg-primary-500/10 items-center justify-center'>
                    <Icon
                      as={ONBOARDING_PAGES[currentPage].icon}
                      size='xl'
                      className='text-primary-500'
                    />
                  </Box>
                )}
              </Box>
              <Heading size='2xl' className='text-center'>
                {ONBOARDING_PAGES[currentPage].title}
              </Heading>
              {(() => {
                const PageContent =
                  ONBOARDING_PAGES[currentPage].ContentComponent;
                return PageContent ? (
                  <PageContent />
                ) : (
                  ONBOARDING_PAGES[currentPage].content
                );
              })()}
            </VStack>
          ) : (
            <VStack space='lg' className='flex-1 justify-center py-8'>
              <Heading size='2xl' className='text-center'>
                Set Competition
              </Heading>
              <Text className='text-typography-600 text-center'>
                Enter your competition code to start syncing data. You can
                always change this later in Settings.
              </Text>
              <VStack space='sm'>
                <Text className='font-medium'>Competition Code</Text>
                <Select
                  selectedValue={compCode}
                  onValueChange={(value) => setCompCode(value)}
                >
                  <SelectTrigger size='lg'>
                    <SelectInput placeholder='Select competition' />
                    <SelectIcon className='mr-3' as={ChevronDownIcon} />
                  </SelectTrigger>
                  <SelectPortal>
                    <SelectBackdrop />
                    <SelectContent>
                      <SelectDragIndicatorWrapper>
                        <SelectDragIndicator />
                      </SelectDragIndicatorWrapper>
                      <SelectScrollView>
                        {loadingCompetitions ? (
                          <SelectItem label='Loading...' value='' isDisabled />
                        ) : competitions.length === 0 ? (
                          <SelectItem
                            label='No competitions available. Check your internet connection.'
                            value=''
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
              </VStack>
            </VStack>
          )}
        </ScrollView>

        {/* Navigation buttons */}
        <Box className='px-4 pb-6 pt-3'>
          {isOnCompCodePage ? (
            <VStack space='sm'>
              <Button
                size='lg'
                action='positive'
                onPress={handleFinish}
                isDisabled={isSubmitting}
              >
                <ButtonText>
                  {isSubmitting
                    ? 'Setting up...'
                    : compCode.trim()
                      ? 'Get Started'
                      : 'Skip for Now'}
                </ButtonText>
              </Button>
              <Button
                size='lg'
                variant='outline'
                action='secondary'
                onPress={handleBack}
              >
                <ButtonText>Back</ButtonText>
              </Button>
            </VStack>
          ) : (
            <HStack space='sm'>
              {currentPage > 0 && (
                <Button
                  size='lg'
                  variant='outline'
                  action='secondary'
                  onPress={handleBack}
                  className='flex-1'
                >
                  <ButtonText>Back</ButtonText>
                </Button>
              )}
              <Button
                size='lg'
                action='primary'
                onPress={handleNext}
                className='flex-1'
              >
                <ButtonText>Next</ButtonText>
              </Button>
            </HStack>
          )}
        </Box>
      </Box>
    </AdaptiveSafeArea>
  );
}
