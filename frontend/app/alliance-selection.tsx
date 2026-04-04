import React, {
  useCallback,
  useState,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import {
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  FlatList,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { AdaptiveSafeArea } from '@/components/AdaptiveSafeArea';
import { Header } from '@/components/Header';
import { Text } from '@/components/ui/text';
import { Box } from '@/components/ui/box';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { Center } from '@/components/ui/center';
import { Button, ButtonIcon, ButtonText } from '@/components/ui/button';
import { Badge, BadgeText } from '@/components/ui/badge';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import { SearchIcon } from '@/components/ui/icon';
import {
  Modal,
  ModalBackdrop,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@/components/ui/modal';
import { TeamInfo } from '@/types/team';
import { getAllTeamInfo, getTeams } from '@/api/teams';
import { useApp } from '@/contexts/AppContext';
import { db } from '@/utils/db';
import {
  ChevronUp,
  ChevronDown,
  Plus,
  X,
  Trash2,
  ExternalLink,
} from 'lucide-react-native';
import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionTitleText,
  AccordionIcon,
  AccordionContent,
} from '@/components/ui/accordion';
import { Image } from '@/components/ui/image';
import { Icon } from '@/components/ui/icon';
import { TeamFuelChart } from '@/components/TeamFuelChart';
import { Match } from '@/types/match';

// ─── Types ───────────────────────────────────────────────────────────
type Alliance = [number | null, number | null, number | null];

interface AllianceState {
  alliances: Alliance[];
  picklist: number[];
  builderSlots: [number | null, number | null, number | null];
}

// ─── Small Components ────────────────────────────────────────────────

function AllianceSlot({
  allianceIndex,
  slotIndex,
  teamNumber,
  isSelected,
  onPress,
  onClear,
}: {
  allianceIndex: number;
  slotIndex: number;
  teamNumber: number | null;
  isSelected: boolean;
  onPress: () => void;
  onClear: () => void;
}) {
  return (
    <Pressable onPress={onPress} className='flex-1'>
      <Box
        className={`no-select h-9 rounded border items-center justify-center ${
          isSelected
            ? 'border-amber-400 border-2 bg-amber-400/10'
            : teamNumber
              ? 'border-outline-300 bg-background-50'
              : 'border-dashed border-outline-200 bg-background-0'
        }`}
      >
        {teamNumber ? (
          <HStack className='w-full items-center justify-between px-2'>
            <Text className='text-sm font-bold text-typography-800'>
              {teamNumber}
            </Text>
            <Pressable onPress={onClear} hitSlop={8}>
              <Icon as={X} size='2xs' className='text-typography-400' />
            </Pressable>
          </HStack>
        ) : (
          <Text className='text-xs text-typography-300'>---</Text>
        )}
      </Box>
    </Pressable>
  );
}

function TeamChip({
  teamNumber,
  isSelected,
  onPress,
  onLongPress,
  teamName,
  rp,
  compact,
}: {
  teamNumber: number;
  isSelected: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  teamName?: string;
  rp?: string;
  compact?: boolean;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress}>
      <HStack
        className={`no-select px-2 py-1.5 rounded border items-center justify-between ${
          isSelected
            ? 'border-amber-400 border-2 bg-amber-400/10'
            : 'border-outline-200 bg-background-50'
        }`}
      >
        <HStack className='items-center gap-2'>
          <Text className='text-sm font-bold text-typography-900'>
            {teamNumber}
          </Text>
          {!compact && teamName && (
            <Text className='text-xs -ml-1 text-typography-500 line-clamp-1 text-ellipsis'>
              {teamName}
            </Text>
          )}
        </HStack>
        {!compact && rp != null && (
          <Text className='text-xs text-typography-500 flex-shrink-0'>
            RP {Math.round(parseFloat(rp))}
          </Text>
        )}
      </HStack>
    </Pressable>
  );
}

function StatRow({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string | number | undefined | null;
  suffix?: string;
}) {
  return (
    <HStack className='justify-between'>
      <Text className='text-typography-600 text-sm'>{label}</Text>
      <Text className='font-semibold text-sm'>
        {value != null ? `${value}${suffix || ''}` : '—'}
      </Text>
    </HStack>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className='text-xs font-bold text-typography-400 uppercase tracking-wide mt-2'>
      {title}
    </Text>
  );
}

function TeamStatsModal({
  isOpen,
  onClose,
  team,
  teamName,
  competitionCode,
}: {
  isOpen: boolean;
  onClose: () => void;
  team: TeamInfo | null;
  teamName?: string;
  competitionCode?: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [showEnlargedImage, setShowEnlargedImage] = useState(false);
  const [teamMatches, setTeamMatches] = useState<Match[]>([]);
  const notesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load notes and matches when team changes
  useEffect(() => {
    if (team) {
      setNotes(team.personal_notes || '');
      loadTeamMatches(team.team_number);
    } else {
      setTeamMatches([]);
    }
  }, [team, competitionCode]);

  async function loadTeamMatches(teamNumber: number) {
    if (!competitionCode) return;
    try {
      const allMatches = await db.matches
        .where('competitionCode')
        .equals(competitionCode)
        .toArray();
      const filtered = allMatches.filter(
        (m) =>
          m.blue_team_1.number === teamNumber ||
          m.blue_team_2.number === teamNumber ||
          m.blue_team_3.number === teamNumber ||
          m.red_team_1.number === teamNumber ||
          m.red_team_2.number === teamNumber ||
          m.red_team_3.number === teamNumber,
      );
      filtered.sort((a, b) => a.match_number - b.match_number);
      setTeamMatches(filtered);
    } catch (err) {
      console.error('Failed to load team matches:', err);
    }
  }

  // Save notes with debounce
  const saveNotes = useCallback(
    (text: string) => {
      if (!team || !competitionCode) return;
      if (notesTimeoutRef.current) clearTimeout(notesTimeoutRef.current);
      notesTimeoutRef.current = setTimeout(async () => {
        try {
          const existing = await db.teamInfo.get([
            competitionCode,
            team.team_number,
          ]);
          if (existing) {
            await db.teamInfo.put({ ...existing, personal_notes: text });
          }
        } catch (err) {
          console.error('Failed to save notes:', err);
        }
      }, 500);
    },
    [team, competitionCode],
  );

  const handleNotesChange = (text: string) => {
    setNotes(text);
    saveNotes(text);
  };

  if (!team) return null;

  const totalMedianFuel =
    (team.median_auto_fuel ?? 0) + (team.median_tele_fuel ?? 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalBackdrop />
      <ModalContent className='max-w-sm max-h-[85%]'>
        <ModalHeader>
          <HStack className='items-center gap-3 flex-1'>
            {team.picture ? (
              <Pressable onPress={() => setShowEnlargedImage(true)}>
                <Box className='w-14 h-14 rounded-lg overflow-hidden border border-outline-200'>
                  <Image
                    source={{ uri: team.picture }}
                    alt={`Team ${team.team_number}`}
                    className='w-full h-full'
                    resizeMode='cover'
                  />
                </Box>
              </Pressable>
            ) : (
              <Center className='w-14 h-14 rounded-lg bg-background-100 border border-outline-200'>
                <Text className='text-typography-400 text-xs'>No Pic</Text>
              </Center>
            )}
            <VStack className='flex-1'>
              <Heading size='lg'>Team {team.team_number}</Heading>
              {teamName && (
                <Text className='text-sm text-typography-500'>{teamName}</Text>
              )}
              <HStack className='items-center gap-2 mt-0.5'>
                <Badge size='sm' action='info'>
                  <BadgeText>#{team.rank}</BadgeText>
                </Badge>
                <Text className='text-xs text-typography-500'>
                  {team.win}-{team.lose}-{team.tie}
                </Text>
                <Text className='text-xs text-typography-400'>•</Text>
                <Text className='text-xs text-typography-500'>
                  {team.ranking_points} RP
                </Text>
              </HStack>
              {team.tags && team.tags.length > 0 && (
                <Text className='text-xs text-typography-400 mt-0.5'>
                  {team.tags.join(', ')}
                </Text>
              )}
            </VStack>
          </HStack>
        </ModalHeader>
        <ModalBody>
          <ScrollView showsVerticalScrollIndicator={false}>
            <VStack space='sm'>
              {/* ── More Info Button ── */}
              <Button
                size='sm'
                variant='outline'
                onPress={() => {
                  onClose();
                  router.push(`/(tabs)/team/${team.team_number}?from=alliance-selection`);
                }}
              >
                <ButtonIcon as={ExternalLink} />
                <ButtonText>View Full Team Page</ButtonText>
              </Button>

              {/* ── Accordion Sections ── */}
              <Accordion
                type='multiple'
                defaultValue={['scoring', 'prescouting']}
              >
                {/* ── Scoring ── */}
                <AccordionItem value='scoring'>
                  <AccordionHeader>
                    <AccordionTrigger>
                      <AccordionTitleText>Scoring (Median)</AccordionTitleText>
                      <AccordionIcon as={ChevronDown} />
                    </AccordionTrigger>
                  </AccordionHeader>
                  <AccordionContent>
                    <VStack space='xs'>
                      <StatRow
                        label='Total Fuel'
                        value={totalMedianFuel.toFixed(1)}
                      />
                      <StatRow
                        label='Auto Fuel'
                        value={team.median_auto_fuel}
                      />
                      <StatRow
                        label='Teleop Fuel'
                        value={team.median_tele_fuel}
                      />
                      <StatRow
                        label='Climb Level'
                        value={team.median_climb_level}
                      />
                      <StatRow
                        label='Points Contributed'
                        value={team.median_points_contributed}
                      />
                    </VStack>
                  </AccordionContent>
                </AccordionItem>

                {/* ── Prescouting ── */}
                <AccordionItem value='prescouting'>
                  <AccordionHeader>
                    <AccordionTrigger>
                      <AccordionTitleText>Prescouting</AccordionTitleText>
                      <AccordionIcon as={ChevronDown} />
                    </AccordionTrigger>
                  </AccordionHeader>
                  <AccordionContent>
                    <VStack space='xs'>
                      <StatRow
                        label='Drivetrain'
                        value={team.prescout_drivetrain || undefined}
                      />
                      <StatRow
                        label='Hopper Size'
                        value={team.prescout_hopper_size || undefined}
                      />
                      <StatRow
                        label='Intake Type'
                        value={team.prescout_intake_type || undefined}
                      />
                      <StatRow
                        label='Shooter Type'
                        value={team.prescout_shooter_type || undefined}
                      />
                      <StatRow
                        label='Range'
                        value={team.prescout_range || undefined}
                      />
                      <StatRow
                        label='Driver Years'
                        value={team.prescout_driver_years || undefined}
                      />
                      <StatRow
                        label='Rotate Yaw'
                        value={team.prescout_rotate_yaw ? 'Yes' : 'No'}
                      />
                      <StatRow
                        label='Rotate Pitch'
                        value={team.prescout_rotate_pitch ? 'Yes' : 'No'}
                      />
                      <StatRow
                        label='Trench Travel'
                        value={team.prescout_trench_travel ? 'Yes' : 'No'}
                      />
                      {team.prescout_trench_travel && (
                        <StatRow
                          label='Trench Preference'
                          value={
                            team.prescout_trench_travel_preference || undefined
                          }
                        />
                      )}
                      {team.prescout_additional_comments ? (
                        <VStack space='xs' className='mt-1'>
                          <Text className='text-typography-600 text-sm'>
                            Comments
                          </Text>
                          <Text className='text-sm'>
                            {team.prescout_additional_comments}
                          </Text>
                        </VStack>
                      ) : null}
                    </VStack>
                  </AccordionContent>
                </AccordionItem>

                {/* ── Time Stats ── */}
                <AccordionItem value='timestats'>
                  <AccordionHeader>
                    <AccordionTrigger>
                      <AccordionTitleText>
                        Time Stats (Avg per Match)
                      </AccordionTitleText>
                      <AccordionIcon as={ChevronDown} />
                    </AccordionTrigger>
                  </AccordionHeader>
                  <AccordionContent>
                    <VStack space='xs'>
                      <StatRow
                        label='Shooting Time'
                        value={team.avg_shooting_time}
                        suffix='s'
                      />
                      <StatRow
                        label='Shooting Interval'
                        value={team.avg_shooting_interval}
                        suffix='s'
                      />
                      <StatRow
                        label='Intake/Herding Interval'
                        value={team.avg_intake_herding_interval}
                        suffix='s'
                      />
                      <StatRow
                        label='Disabled Time'
                        value={team.avg_disabled_time}
                        suffix='s'
                      />
                      <StatRow
                        label='Defense Time'
                        value={team.avg_defense_time}
                        suffix='s'
                      />
                    </VStack>
                  </AccordionContent>
                </AccordionItem>

                {/* ── Percentiles ── */}
                <AccordionItem value='percentiles'>
                  <AccordionHeader>
                    <AccordionTrigger>
                      <AccordionTitleText>Percentiles</AccordionTitleText>
                      <AccordionIcon as={ChevronDown} />
                    </AccordionTrigger>
                  </AccordionHeader>
                  <AccordionContent>
                    <VStack space='xs'>
                      <StatRow
                        label='Median Fuel'
                        value={team.percentile_median_fuel}
                        suffix='%'
                      />
                      <StatRow
                        label='Median Auto Fuel'
                        value={team.percentile_median_auto_fuel}
                        suffix='%'
                      />
                      <StatRow
                        label='Shooting Time'
                        value={team.percentile_avg_shooting_time}
                        suffix='%'
                      />
                      <StatRow
                        label='Shooting Interval'
                        value={team.percentile_avg_shooting_interval}
                        suffix='%'
                      />
                      <StatRow
                        label='Intake/Herding'
                        value={team.percentile_avg_intake_herding_interval}
                        suffix='%'
                      />
                      <StatRow
                        label='Disabled Time'
                        value={team.percentile_avg_disabled_time}
                        suffix='%'
                      />
                      <StatRow
                        label='Defense Time'
                        value={team.percentile_avg_defense_time}
                        suffix='%'
                      />
                    </VStack>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* ── Fuel Chart ── */}
              {teamMatches.length > 0 && (
                <TeamFuelChart
                  matches={teamMatches}
                  teamNumber={team.team_number}
                />
              )}

              {/* ── Personal Notes ── */}
              <SectionHeader title='Personal Notes' />
              <TextInput
                className='border border-outline-200 rounded-md p-2 text-sm text-typography-900 min-h-[80px] bg-background-0'
                placeholder='Write your notes about this team...'
                placeholderTextColor='#999'
                value={notes}
                onChangeText={handleNotesChange}
                multiline
                textAlignVertical='top'
              />
            </VStack>
          </ScrollView>
        </ModalBody>
        <ModalFooter>
          <Button onPress={onClose} className='flex-1'>
            <ButtonText>Close</ButtonText>
          </Button>
        </ModalFooter>
      </ModalContent>

      {/* Enlarged Image Modal */}
      {team.picture && (
        <Modal
          isOpen={showEnlargedImage}
          onClose={() => setShowEnlargedImage(false)}
        >
          <ModalBackdrop />
          <ModalContent className='max-w-3xl w-[90%]'>
            <ModalHeader>
              <Heading size='md'>Team {team.team_number} Robot</Heading>
            </ModalHeader>
            <ModalBody>
              <Image
                source={{ uri: team.picture }}
                alt={`Team ${team.team_number} Robot`}
                className='w-full aspect-square h-full'
                resizeMode='contain'
              />
            </ModalBody>
            <ModalFooter>
              <Button
                onPress={() => setShowEnlargedImage(false)}
                className='flex-1'
              >
                <ButtonText>Close</ButtonText>
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────

export default function AllianceSelectionScreen() {
  const { competitionCode } = useApp();
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [teamNames, setTeamNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Alliance state: 8 alliances × 3 slots
  const [alliances, setAlliances] = useState<Alliance[]>(
    Array.from({ length: 8 }, () => [null, null, null] as Alliance),
  );

  // Picklist
  const [picklist, setPicklist] = useState<number[]>([]);

  // Bottom tab
  const [activeTab, setActiveTab] = useState<'teams' | 'builder'>('teams');

  // Teams tab search
  const [searchQuery, setSearchQuery] = useState('');

  // Selection mode: tap a team, then tap an empty slot
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{
    alliance: number;
    slot: number;
  } | null>(null);

  // Team stats modal
  const [modalTeam, setModalTeam] = useState<TeamInfo | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Alliance builder
  const [builderSlots, setBuilderSlots] = useState<
    [number | null, number | null, number | null]
  >([null, null, null]);
  const [builderInput, setBuilderInput] = useState<[string, string, string]>([
    '',
    '',
    '',
  ]);

  // Track if initial load is complete to avoid saving during load
  const isInitialLoadRef = useRef(true);

  // ── Persistence ──
  const STORAGE_KEY = `allianceSelection_${competitionCode}`;

  // Load persisted state on mount
  useEffect(() => {
    async function loadPersistedState() {
      if (!competitionCode) return;
      try {
        const stored = await db.config.get({ key: STORAGE_KEY });
        if (stored?.value) {
          const state: AllianceState = JSON.parse(stored.value);
          if (state.alliances) setAlliances(state.alliances);
          if (state.picklist) setPicklist(state.picklist);
          if (state.builderSlots) {
            setBuilderSlots(state.builderSlots);
            setBuilderInput([
              state.builderSlots[0]?.toString() || '',
              state.builderSlots[1]?.toString() || '',
              state.builderSlots[2]?.toString() || '',
            ]);
          }
        }
      } catch (err) {
        console.error('Failed to load alliance selection state:', err);
      } finally {
        isInitialLoadRef.current = false;
      }
    }
    loadPersistedState();
  }, [competitionCode]);

  // Save state whenever it changes
  useEffect(() => {
    if (isInitialLoadRef.current || !competitionCode) return;
    const state: AllianceState = { alliances, picklist, builderSlots };
    db.config
      .put({ key: STORAGE_KEY, value: JSON.stringify(state) })
      .catch((err) =>
        console.error('Failed to save alliance selection state:', err),
      );
  }, [alliances, picklist, builderSlots, competitionCode]);

  // ── Data loading ──
  useFocusEffect(
    useCallback(() => {
      loadTeams();
    }, [competitionCode]),
  );

  async function loadTeams() {
    try {
      setLoading(true);
      setError(null);
      const [data, allTeamsList] = await Promise.all([
        getAllTeamInfo(),
        getTeams(),
      ]);
      setTeams(data);
      const names: Record<number, string> = {};
      allTeamsList.forEach((t) => {
        names[t.number] = t.name;
      });
      setTeamNames(names);
    } catch (err) {
      console.error('Failed to load teams:', err);
      setError('Failed to load teams');
    } finally {
      setLoading(false);
    }
  }

  // ── Derived data ──
  const assignedTeams = useMemo(() => {
    const set = new Set<number>();
    alliances.forEach((a) => a.forEach((t) => t && set.add(t)));
    return set;
  }, [alliances]);

  const teamInfoMap = useMemo(() => {
    const map = new Map<number, TeamInfo>();
    teams.forEach((t) => map.set(t.team_number, t));
    return map;
  }, [teams]);

  const remainingTeams = useMemo(() => {
    let result = teams.filter((t) => !assignedTeams.has(t.team_number));
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (t) =>
          t.team_number.toString().includes(q) ||
          (teamNames[t.team_number] || '').toLowerCase().includes(q) ||
          (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(q))),
      );
    }
    // Sort by rank, then by ranking points
    result.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return (
        parseFloat(b.ranking_points || '0') -
        parseFloat(a.ranking_points || '0')
      );
    });
    return result;
  }, [teams, assignedTeams, searchQuery, teamNames]);

  const picklistNotAssigned = useMemo(
    () => picklist.filter((t) => !assignedTeams.has(t)),
    [picklist, assignedTeams],
  );

  // ── Alliance builder stats ──
  const builderStats = useMemo(() => {
    const teamInfos = builderSlots
      .filter((n): n is number => n !== null)
      .map((n) => teamInfoMap.get(n))
      .filter((t): t is TeamInfo => t !== undefined);

    if (teamInfos.length === 0) return null;

    // Helper: use locally computed median if available, otherwise fall back to API avg string
    const getFuel = (t: TeamInfo) =>
      t.median_auto_fuel != null && t.median_tele_fuel != null
        ? (t.median_auto_fuel ?? 0) + (t.median_tele_fuel ?? 0)
        : parseFloat(t.avg_fuel_scored || '0');
    const getAutoFuel = (t: TeamInfo) =>
      t.median_auto_fuel ?? parseFloat(t.avg_auto_fuel || '0');
    const getTeleFuel = (t: TeamInfo) =>
      t.median_tele_fuel ??
      parseFloat(t.avg_fuel_scored || '0') - parseFloat(t.avg_auto_fuel || '0');
    const getClimb = (t: TeamInfo) =>
      t.median_climb_level ?? parseFloat(t.avg_climb_points || '0');
    const getPoints = (t: TeamInfo) =>
      t.median_points_contributed ??
      parseFloat(t.avg_points_contributed || '0');
    const getConsistency = (t: TeamInfo) =>
      t.local_consistency ?? parseFloat(t.consistency_rating || '0');

    const sumMedianFuel = teamInfos.reduce((sum, t) => sum + getFuel(t), 0);
    const sumMedianAutoFuel = teamInfos.reduce(
      (sum, t) => sum + getAutoFuel(t),
      0,
    );
    const sumMedianTeleFuel = teamInfos.reduce(
      (sum, t) => sum + getTeleFuel(t),
      0,
    );
    const sumMedianClimb = teamInfos.reduce((sum, t) => sum + getClimb(t), 0);
    const sumMedianPoints = teamInfos.reduce((sum, t) => sum + getPoints(t), 0);
    const avgConsistency =
      teamInfos.reduce((sum, t) => sum + getConsistency(t), 0) /
      teamInfos.length;

    return {
      teamCount: teamInfos.length,
      sumMedianFuel,
      sumMedianAutoFuel,
      sumMedianTeleFuel,
      sumMedianClimb,
      sumMedianPoints,
      avgConsistency,
    };
  }, [builderSlots, teamInfoMap]);

  // ── Interaction handlers ──

  function handleTeamSelect(teamNumber: number) {
    if (selectedTeam === teamNumber) {
      setSelectedTeam(null);
    } else {
      setSelectedTeam(teamNumber);
      // If a slot is already selected, place the team there
      if (selectedSlot) {
        placeTeamInSlot(teamNumber, selectedSlot.alliance, selectedSlot.slot);
        setSelectedTeam(null);
        setSelectedSlot(null);
      }
    }
  }

  function handleTeamLongPress(teamNumber: number) {
    const info = teamInfoMap.get(teamNumber);
    if (info) {
      setModalTeam(info);
      setShowModal(true);
    }
  }

  function handleSlotPress(allianceIdx: number, slotIdx: number) {
    const currentTeam = alliances[allianceIdx][slotIdx];

    if (currentTeam) {
      // Slot has a team - show modal on press
      const info = teamInfoMap.get(currentTeam);
      if (info) {
        setModalTeam(info);
        setShowModal(true);
      }
      return;
    }

    // Empty slot
    if (selectedTeam) {
      // Place selected team
      placeTeamInSlot(selectedTeam, allianceIdx, slotIdx);
      setSelectedTeam(null);
      setSelectedSlot(null);
    } else {
      // Select this slot to receive a team
      if (
        selectedSlot?.alliance === allianceIdx &&
        selectedSlot?.slot === slotIdx
      ) {
        setSelectedSlot(null);
      } else {
        setSelectedSlot({ alliance: allianceIdx, slot: slotIdx });
      }
    }
  }

  function placeTeamInSlot(
    teamNumber: number,
    allianceIdx: number,
    slotIdx: number,
  ) {
    setAlliances((prev) => {
      const next = prev.map((a) => [...a] as Alliance);
      // Remove from any existing slot
      next.forEach((a) => {
        a.forEach((t, i) => {
          if (t === teamNumber) a[i] = null;
        });
      });
      next[allianceIdx][slotIdx] = teamNumber;
      return next;
    });
  }

  function clearSlot(allianceIdx: number, slotIdx: number) {
    setAlliances((prev) => {
      const next = prev.map((a) => [...a] as Alliance);
      next[allianceIdx][slotIdx] = null;
      return next;
    });
  }

  function addToPicklist(teamNumber: number) {
    if (!picklist.includes(teamNumber)) {
      setPicklist((prev) => [...prev, teamNumber]);
    }
    setSelectedTeam(null);
  }

  function removeFromPicklist(teamNumber: number) {
    setPicklist((prev) => prev.filter((t) => t !== teamNumber));
  }

  function movePicklistItem(index: number, direction: 'up' | 'down') {
    setPicklist((prev) => {
      const next = [...prev];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= next.length) return prev;
      [next[index], next[newIndex]] = [next[newIndex], next[index]];
      return next;
    });
  }

  function applyBuilderInput(slotIdx: number) {
    const val = parseInt(builderInput[slotIdx], 10);
    if (!isNaN(val) && teamInfoMap.has(val)) {
      setBuilderSlots((prev) => {
        const next = [...prev] as [number | null, number | null, number | null];
        next[slotIdx] = val;
        return next;
      });
    }
  }

  function clearBuilderSlot(slotIdx: number) {
    setBuilderSlots((prev) => {
      const next = [...prev] as [number | null, number | null, number | null];
      next[slotIdx] = null;
      return next;
    });
    setBuilderInput((prev) => {
      const next = [...prev] as [string, string, string];
      next[slotIdx] = '';
      return next;
    });
  }

  // ── Render ──

  if (loading) {
    return (
      <AdaptiveSafeArea>
        <Header title='Alliance Selection' showBackButton />
        <Center className='flex-1'>
          <ActivityIndicator size='large' />
        </Center>
      </AdaptiveSafeArea>
    );
  }

  if (error) {
    return (
      <AdaptiveSafeArea>
        <Header title='Alliance Selection' showBackButton />
        <Center className='flex-1 px-4'>
          <Text className='text-center text-error-500'>{error}</Text>
        </Center>
      </AdaptiveSafeArea>
    );
  }

  return (
    <AdaptiveSafeArea>
      <Header title='Alliance Selection' showBackButton />
      <Box className='flex-1 max-w-2xl self-center w-full'>
        <VStack className='flex-1'>
          {/* ── Top Box: Alliance Slots ── */}
          <ScrollView
            className='max-h-[45%] border-b border-outline-100'
            contentContainerStyle={{ padding: 12 }}
          >
            <VStack space='sm'>
              <HStack className='items-center justify-between mb-1'>
                <Heading size='sm'>Alliances</Heading>
                {selectedTeam && (
                  <Badge size='sm' action='warning'>
                    <BadgeText>Placing: {selectedTeam}</BadgeText>
                  </Badge>
                )}
              </HStack>
              {alliances.map((alliance, aIdx) => (
                <HStack key={aIdx} space='xs' className='items-center'>
                  <Text className='text-xs font-bold text-typography-500 w-5 text-center'>
                    {aIdx + 1}
                  </Text>
                  {alliance.map((teamNum, sIdx) => (
                    <AllianceSlot
                      key={sIdx}
                      allianceIndex={aIdx}
                      slotIndex={sIdx}
                      teamNumber={teamNum}
                      isSelected={
                        selectedSlot?.alliance === aIdx &&
                        selectedSlot?.slot === sIdx
                      }
                      onPress={() => handleSlotPress(aIdx, sIdx)}
                      onClear={() => clearSlot(aIdx, sIdx)}
                    />
                  ))}
                </HStack>
              ))}
            </VStack>
          </ScrollView>

          {/* ── Bottom Box ── */}
          <VStack className='flex-1'>
            {/* Tab Switch */}
            <HStack className='mx-3 mt-2 mb-1 p-1 rounded bg-secondary-100'>
              <Button
                size='xs'
                variant={activeTab === 'teams' ? 'solid' : 'link'}
                action='secondary'
                className='w-1/2'
                onPress={() => setActiveTab('teams')}
              >
                <Text className='text-center font-semibold'>Teams</Text>
              </Button>
              <Button
                size='xs'
                variant={activeTab === 'builder' ? 'solid' : 'link'}
                action='secondary'
                className='w-1/2'
                onPress={() => setActiveTab('builder')}
              >
                <Text className='text-center font-semibold'>
                  Alliance Builder
                </Text>
              </Button>
            </HStack>

            {activeTab === 'teams' ? (
              /* ── Teams Tab ── */
              <HStack className='flex-1 px-3 pb-2 gap-2'>
                <VStack className='flex-1'>
                  <HStack className='items-center justify-between mb-1'>
                    <Text className='text-xs font-bold text-typography-600 py-2'>
                      Picklist
                    </Text>
                    {selectedTeam && !picklist.includes(selectedTeam) && (
                      <Button
                        onPress={() => addToPicklist(selectedTeam)}
                        hitSlop={4}
                        size='xs'
                      >
                        <ButtonIcon as={Plus} />
                        <ButtonText>Add</ButtonText>
                      </Button>
                    )}
                  </HStack>
                  <ScrollView className='flex-1'>
                    <VStack space='xs'>
                      {picklistNotAssigned.length === 0 ? (
                        <Text className='text-xs text-typography-400 text-center py-4'>
                          Tap a team, then tap &quot;+ Add&quot; to build your
                          picklist
                        </Text>
                      ) : (
                        picklistNotAssigned.map((teamNum, idx) => {
                          const info = teamInfoMap.get(teamNum);
                          return (
                            <HStack
                              key={teamNum}
                              className='items-center gap-1'
                            >
                              <VStack className='gap-0'>
                                <Pressable
                                  onPress={() =>
                                    movePicklistItem(
                                      picklist.indexOf(teamNum),
                                      'up',
                                    )
                                  }
                                  hitSlop={2}
                                  disabled={picklist.indexOf(teamNum) === 0}
                                >
                                  <Icon
                                    as={ChevronUp}
                                    size='2xs'
                                    className={
                                      picklist.indexOf(teamNum) === 0
                                        ? 'text-typography-200'
                                        : 'text-typography-500'
                                    }
                                  />
                                </Pressable>
                                <Pressable
                                  onPress={() =>
                                    movePicklistItem(
                                      picklist.indexOf(teamNum),
                                      'down',
                                    )
                                  }
                                  hitSlop={2}
                                  disabled={
                                    picklist.indexOf(teamNum) ===
                                    picklist.length - 1
                                  }
                                >
                                  <Icon
                                    as={ChevronDown}
                                    size='2xs'
                                    className={
                                      picklist.indexOf(teamNum) ===
                                      picklist.length - 1
                                        ? 'text-typography-200'
                                        : 'text-typography-500'
                                    }
                                  />
                                </Pressable>
                              </VStack>
                              <Box className='flex-1'>
                                <TeamChip
                                  teamNumber={teamNum}
                                  isSelected={selectedTeam === teamNum}
                                  onPress={() => handleTeamSelect(teamNum)}
                                  onLongPress={() =>
                                    handleTeamLongPress(teamNum)
                                  }
                                  teamName={teamNames[teamNum]}
                                />
                              </Box>
                              <Pressable
                                onPress={() => removeFromPicklist(teamNum)}
                                hitSlop={4}
                              >
                                <Icon
                                  as={X}
                                  size='xs'
                                  className='text-typography-400'
                                />
                              </Pressable>
                            </HStack>
                          );
                        })
                      )}
                    </VStack>
                  </ScrollView>
                </VStack>

                {/* Right Column: Remaining Teams */}
                <VStack className='flex-1'>
                  <Text className='text-xs font-bold text-typography-600 mb-1'>
                    Available Teams
                  </Text>
                  <Input size='sm' className='mb-1'>
                    <InputSlot className='pl-2'>
                      <InputIcon as={SearchIcon} />
                    </InputSlot>
                    <InputField
                      placeholder='Search...'
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                    />
                  </Input>
                  <ScrollView className='flex-1'>
                    <VStack space='xs'>
                      {remainingTeams.map((team) => (
                        <TeamChip
                          key={team.team_number}
                          teamNumber={team.team_number}
                          isSelected={selectedTeam === team.team_number}
                          onPress={() => handleTeamSelect(team.team_number)}
                          onLongPress={() =>
                            handleTeamLongPress(team.team_number)
                          }
                          teamName={teamNames[team.team_number]}
                          rp={team.ranking_points}
                        />
                      ))}
                      {remainingTeams.length === 0 && (
                        <Text className='text-xs text-typography-400 text-center py-4'>
                          {searchQuery
                            ? 'No teams found'
                            : 'All teams assigned'}
                        </Text>
                      )}
                    </VStack>
                  </ScrollView>
                </VStack>
              </HStack>
            ) : (
              /* ── Alliance Builder Tab ── */
              <ScrollView
                className='flex-1 px-3 pb-2'
                contentContainerStyle={{ paddingBottom: 16 }}
              >
                <VStack space='md'>
                  {/* Builder Team Slots */}
                  <VStack space='sm'>
                    <Text className='text-xs font-bold text-typography-600'>
                      Enter Team Numbers
                    </Text>
                    <HStack space='sm'>
                      {builderSlots.map((slot, idx) => (
                        <VStack key={idx} className='flex-1' space='xs'>
                          <HStack className='items-center gap-1'>
                            <Input size='sm' className='flex-1'>
                              <InputField
                                placeholder={`Team ${idx + 1}`}
                                value={
                                  slot !== null
                                    ? slot.toString()
                                    : builderInput[idx]
                                }
                                onChangeText={(text: string) => {
                                  setBuilderInput((prev) => {
                                    const next = [...prev] as [
                                      string,
                                      string,
                                      string,
                                    ];
                                    next[idx] = text;
                                    return next;
                                  });
                                  // Auto-apply if valid
                                  const val = parseInt(text, 10);
                                  if (!isNaN(val) && teamInfoMap.has(val)) {
                                    setBuilderSlots((prev) => {
                                      const next = [...prev] as [
                                        number | null,
                                        number | null,
                                        number | null,
                                      ];
                                      next[idx] = val;
                                      return next;
                                    });
                                  } else {
                                    setBuilderSlots((prev) => {
                                      const next = [...prev] as [
                                        number | null,
                                        number | null,
                                        number | null,
                                      ];
                                      next[idx] = null;
                                      return next;
                                    });
                                  }
                                }}
                                keyboardType='numeric'
                              />
                            </Input>
                            {slot !== null && (
                              <Pressable
                                onPress={() => clearBuilderSlot(idx)}
                                hitSlop={4}
                              >
                                <Icon
                                  as={X}
                                  size='xs'
                                  className='text-typography-400'
                                />
                              </Pressable>
                            )}
                          </HStack>
                          {slot !== null && (
                            <Text className='text-xs text-typography-500 text-center'>
                              #{teamInfoMap.get(slot)?.rank ?? '?'} •{' '}
                              {teamNames[slot] || 'Unknown'}
                            </Text>
                          )}
                        </VStack>
                      ))}
                    </HStack>
                  </VStack>

                  {/* Combined Stats */}
                  {builderStats ? (
                    <Card variant='outline' className='p-3'>
                      <VStack space='sm'>
                        <Heading size='sm'>
                          Alliance Performance ({builderStats.teamCount} team
                          {builderStats.teamCount !== 1 ? 's' : ''})
                        </Heading>
                        <VStack space='xs'>
                          <HStack className='justify-between'>
                            <Text className='text-sm text-typography-600'>
                              Sum Median Fuel Scored
                            </Text>
                            <Text className='text-sm font-bold'>
                              {builderStats.sumMedianFuel.toFixed(1)}
                            </Text>
                          </HStack>
                          <HStack className='justify-between'>
                            <Text className='text-sm text-typography-600'>
                              Sum Median Auto Fuel
                            </Text>
                            <Text className='text-sm font-bold'>
                              {builderStats.sumMedianAutoFuel.toFixed(1)}
                            </Text>
                          </HStack>
                          <HStack className='justify-between'>
                            <Text className='text-sm text-typography-600'>
                              Sum Median Tele Fuel
                            </Text>
                            <Text className='text-sm font-bold'>
                              {builderStats.sumMedianTeleFuel.toFixed(1)}
                            </Text>
                          </HStack>
                          <HStack className='justify-between'>
                            <Text className='text-sm text-typography-600'>
                              Sum Median Climb
                            </Text>
                            <Text className='text-sm font-bold'>
                              {builderStats.sumMedianClimb.toFixed(1)}
                            </Text>
                          </HStack>
                          <HStack className='justify-between'>
                            <Text className='text-sm text-typography-600'>
                              Sum Median Points Contributed
                            </Text>
                            <Text className='text-sm font-bold'>
                              {builderStats.sumMedianPoints.toFixed(1)}
                            </Text>
                          </HStack>
                          <HStack className='justify-between'>
                            <Text className='text-sm text-typography-600'>
                              Avg Consistency
                            </Text>
                            <Text className='text-sm font-bold'>
                              {builderStats.avgConsistency.toFixed(2)}
                            </Text>
                          </HStack>
                        </VStack>

                        {/* Individual team breakdown */}
                        <VStack space='xs' className='mt-2'>
                          <Text className='text-xs font-bold text-typography-500'>
                            Individual Breakdown
                          </Text>
                          {builderSlots
                            .filter((n): n is number => n !== null)
                            .map((num) => {
                              const t = teamInfoMap.get(num);
                              if (!t) return null;
                              return (
                                <Pressable
                                  key={num}
                                  onPress={() => {
                                    setModalTeam(t);
                                    setShowModal(true);
                                  }}
                                >
                                  <HStack className='justify-between items-center py-1 px-2 rounded bg-background-50 border border-outline-100'>
                                    <Text className='text-xs font-bold'>
                                      {num}
                                    </Text>
                                    <HStack className='gap-3'>
                                      <Text className='text-xs text-typography-500'>
                                        F:{' '}
                                        {(
                                          (t.median_auto_fuel ?? 0) +
                                          (t.median_tele_fuel ?? 0)
                                        ).toFixed(1)}
                                      </Text>
                                      <Text className='text-xs text-typography-500'>
                                        A: {t.median_auto_fuel ?? 0}
                                      </Text>
                                      <Text className='text-xs text-typography-500'>
                                        C: {t.median_climb_level ?? 0}
                                      </Text>
                                    </HStack>
                                  </HStack>
                                </Pressable>
                              );
                            })}
                        </VStack>
                      </VStack>
                    </Card>
                  ) : (
                    <Center className='py-8'>
                      <Text className='text-sm text-typography-400'>
                        Enter team numbers above to see combined stats
                      </Text>
                    </Center>
                  )}
                </VStack>
              </ScrollView>
            )}
          </VStack>
        </VStack>
      </Box>

      {/* Team Stats Modal */}
      <TeamStatsModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        team={modalTeam}
        teamName={modalTeam ? teamNames[modalTeam.team_number] : undefined}
        competitionCode={competitionCode ?? undefined}
      />
    </AdaptiveSafeArea>
  );
}
