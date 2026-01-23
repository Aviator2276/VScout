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
import { initDatabase, setCompetitionCode } from '@/utils/storage';
import { getCompetitions, Competition } from '@/api/competitions';
import { ChevronDownIcon } from '@/components/ui/icon';

export default function HomeScreen() {
  const [isCompleting, setIsCompleting] = useState(false);
  const [competitionCode, setCompetitionCodeState] = useState('');
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loadingCompetitions, setLoadingCompetitions] = useState(true);
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initDatabase()
      .then(() => setDbReady(true))
      .catch((err) => console.error('Failed to init database:', err));
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

    if (!competitionCode) {
      return;
    }

    try {
      setIsCompleting(true);
      await setCompetitionCode(competitionCode);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setIsCompleting(false);
    }
  }

  return (
    <AdaptiveSafeArea>
      <Center className="p-4 flex-1 max-w-2xl self-center w-full">
        <VStack space="lg" className="items-center">
          <Heading size="3xl">Home</Heading>
          <Text className="p-4">Welcome to VibeScout</Text>
        </VStack>
        <FormControl>
          <Text className="text-typography-900 font-medium mb-2">
            Competition
          </Text>
          <Select
            selectedValue={competitionCode}
            onValueChange={(value) => setCompetitionCodeState(value)}
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
              isDisabled={!competitionCode || !dbReady}
            >
              <ButtonText>Set Comp Code</ButtonText>
            </Button>
          </VStack>
        </VStack>
      </Center>
    </AdaptiveSafeArea>
  );
}
