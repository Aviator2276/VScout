import { Center } from '@/components/ui/center';
import { Heading } from '@/components/ui/heading';
import { Text } from '@/components/ui/text';
import { AdaptiveSafeArea } from '@/components/adaptive-safe-area';
import { VStack } from '@/components/ui/vstack';
import { Button, ButtonText } from '@/components/ui/button';
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
import { HStack } from '@/components/ui/hstack';
import { useEffect, useState } from 'react';
import { getCompetitions, Competition } from '@/api/competitions';
import { ChevronDownIcon } from '@/components/ui/icon';
import { useApp } from '@/utils/AppContext';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { Badge, BadgeText } from '@/components/ui/badge';
import { Box } from '@/components/ui/box';

export default function HomeScreen() {
  const {
    competitionCode,
    setCompetitionCode: setGlobalCompetitionCode,
    serverStatus,
    ping,
    isOnline,
    checkServerConnection,
  } = useApp();
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
      await setGlobalCompetitionCode(localCompetitionCode);
      setIsCompleting(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setIsCompleting(false);
    }
  }

  return (
    <AdaptiveSafeArea>
      <Box className="px-4 pt-4 flex-1 max-w-2xl self-center w-full">
        <HStack className="items-center justify-between">
          <Heading size="2xl">Home</Heading>
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
        <FormControl>
          <Text className="text-typography-900 font-medium mb-2">
            Competition
          </Text>
          <Select
            selectedValue={localCompetitionCode}
            onValueChange={(value) => setLocalCompetitionCode(value)}
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
                    <SelectItem label="Loading..." value="" isDisabled />
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

        <VStack space="lg" className="mb-8">
          <HStack space="sm" className="justify-center"></HStack>

          <VStack space="md">
            <Button
              size="lg"
              action="primary"
              onPress={handleComplete}
              isDisabled={!localCompetitionCode}
            >
              <ButtonText>Set Comp Code</ButtonText>
            </Button>
          </VStack>
        </VStack>
      </Box>
    </AdaptiveSafeArea>
  );
}
