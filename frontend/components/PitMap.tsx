import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { View, Pressable, useColorScheme } from 'react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Heading } from '@/components/ui/heading';
import { HStack } from '@/components/ui/hstack';
import { Spinner } from '@/components/ui/spinner';
import { Icon } from '@/components/ui/icon';
import { Input, InputField, InputSlot, InputIcon } from '@/components/ui/input';
import {
  Map,
  Search,
  ZoomIn,
  ZoomOut,
  Locate,
  Binoculars,
  EyeOff,
  Image as ImageIcon,
  ImageOff,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import {
  getNexusData,
  NexusData,
  PitMap as PitMapType,
  PitAddresses,
} from '@/api/nexus';
import { getTeams, getAllTeamInfo } from '@/api/teams';
import { Team, TeamInfo } from '@/types/team';
import { useApp } from '@/contexts/AppContext';

const SCALE_FACTOR = 0.5;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

// Exact RGB values from gluestack-ui-provider/config.ts
const COLORS = {
  light: {
    bgCanvas: 'rgb(242,241,241)',
    wall: 'rgb(165,163,163)',
    areaBg: 'rgb(162,221,250)',
    areaBorder: 'rgb(87,194,246)',
    areaText: 'rgb(9,115,168)',
    labelText: 'rgb(163,163,163)',
    pitEmptyBg: 'rgb(220,219,219)',
    pitEmptyBorder: 'rgb(221,220,219)',
    pitGreyBg: 'rgb(213,212,212)',
    pitGreyBorder: 'rgb(165,163,163)',
    pitOrangeBg: 'rgb(254,205,170)',
    pitOrangeBorder: 'rgb(231,120,40)',
    pitGreenBg: 'rgb(132,211,162)',
    pitGreenBorder: 'rgb(52,131,82)',
    pitHighlight: 'rgb(234,179,8)',
    pitText: 'rgb(38,38,39)',
    iconGreen: 'rgb(42,121,72)',
    iconRed: 'rgb(220,38,38)',
  },
  dark: {
    bgCanvas: 'rgb(65,64,64)',
    wall: 'rgb(140,141,141)',
    areaBg: 'rgb(7,90,131)',
    areaBorder: 'rgb(11,141,205)',
    areaText: 'rgb(124,207,248)',
    labelText: 'rgb(140,140,140)',
    pitEmptyBg: 'rgb(83,82,82)',
    pitEmptyBorder: 'rgb(83,82,82)',
    pitGreyBg: 'rgb(116,116,116)',
    pitGreyBorder: 'rgb(140,141,141)',
    pitOrangeBg: 'rgb(180,90,26)',
    pitOrangeBorder: 'rgb(251,149,75)',
    pitGreenBg: 'rgb(32,111,62)',
    pitGreenBorder: 'rgb(72,151,102)',
    pitHighlight: 'rgb(234,179,8)',
    pitText: 'rgb(245,245,245)',
    iconGreen: 'rgb(102,181,132)',
    iconRed: 'rgb(249,97,96)',
  },
};

interface PitMapProps {
  highlightTeam?: string;
  hideSearch?: boolean;
}

export function PitMap({
  highlightTeam: highlightTeamProp,
  hideSearch,
}: PitMapProps) {
  const [nexusData, setNexusData] = useState<NexusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(0.5);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);
  const [searchHighlight, setSearchHighlight] = useState<string | null>(null);
  const [teamInfoMap, setTeamInfoMap] = useState<Record<string, TeamInfo>>({});
  const panStart = useRef({ x: 0, y: 0 });
  const panOffset = useRef({ x: 0, y: 0 });
  const didPan = useRef(false);
  const containerRef = useRef<View>(null);
  const isFirstLoad = useRef(true);
  const router = useRouter();
  const { lastDataUpdate } = useApp();
  const isDark = useColorScheme() === 'dark';
  const T = isDark ? COLORS.dark : COLORS.light;

  const highlightTeam = searchHighlight || highlightTeamProp;

  const centerOnPits = useCallback((data: NexusData | null) => {
    if (!data?.map) return;
    const pitEntries = Object.values(data.map.pits);
    if (pitEntries.length === 0) return;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const pit of pitEntries) {
      const left = pit.position.x * SCALE_FACTOR;
      const top = pit.position.y * SCALE_FACTOR;
      const right = left + pit.size.x * SCALE_FACTOR;
      const bottom = top + pit.size.y * SCALE_FACTOR;
      if (left < minX) minX = left;
      if (top < minY) minY = top;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    }
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const el = containerRef.current as unknown as HTMLElement | null;
    const containerW = el?.clientWidth ?? 300;
    const newZoom = 0.5;
    setZoom(newZoom);
    setPan({
      x: containerW / 2 - centerX * newZoom,
      y: 300 / 2 - centerY * newZoom,
    });
  }, []);

  const centerOnTeam = useCallback(
    (teamNum: string, data: NexusData | null) => {
      if (!data?.map) return;
      const pitEntry = Object.entries(data.map.pits).find(([address, pit]) => {
        if (pit.team === teamNum) return true;
        if (data.pits) {
          const addr = data.pits[teamNum];
          if (addr && addr === address) return true;
        }
        return false;
      });
      if (!pitEntry) return;
      const pit = pitEntry[1];
      const centerX = (pit.position.x + pit.size.x / 2) * SCALE_FACTOR;
      const centerY = (pit.position.y + pit.size.y / 2) * SCALE_FACTOR;
      const el = containerRef.current as unknown as HTMLElement | null;
      const containerW = el?.clientWidth ?? 300;
      const focusZoom = 1;
      setZoom(focusZoom);
      setPan({
        x: containerW / 2 - centerX * focusZoom,
        y: 300 / 2 - centerY * focusZoom,
      });
    },
    [],
  );

  useEffect(() => {
    const firstLoad = isFirstLoad.current;
    isFirstLoad.current = false;

    Promise.all([
      getNexusData().catch(() => undefined),
      getTeams().catch(() => []),
      getAllTeamInfo().catch(() => []),
    ])
      .then(([data, teamList, teamInfoList]) => {
        setNexusData(data ?? null);
        setTeams(teamList);
        const infoMap: Record<string, TeamInfo> = {};
        for (const info of teamInfoList) {
          infoMap[info.team_number.toString()] = info;
        }
        setTeamInfoMap(infoMap);
        if (firstLoad && data?.map) {
          requestAnimationFrame(() => centerOnPits(data));
        }
      })
      .finally(() => {
        if (firstLoad) setLoading(false);
      });
  }, [lastDataUpdate]);

  const teamsOnMap = useMemo(() => {
    if (!nexusData?.map) return new Set<string>();
    const s = new Set<string>();
    for (const [, pit] of Object.entries(nexusData.map.pits)) {
      if (pit.team) s.add(pit.team);
    }
    if (nexusData.pits) {
      for (const teamNum of Object.keys(nexusData.pits)) {
        s.add(teamNum);
      }
    }
    return s;
  }, [nexusData]);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (!query.trim()) {
        setSearchHighlight(null);
        return;
      }
      const q = query.trim().toLowerCase();
      if (teamsOnMap.has(q)) {
        setSearchHighlight(q);
        centerOnTeam(q, nexusData);
        return;
      }
      const match = teams.find((t) => {
        if (!teamsOnMap.has(t.number.toString())) return false;
        return (
          t.number.toString().startsWith(q) ||
          (t.name && t.name.toLowerCase().includes(q))
        );
      });
      if (match) {
        const num = match.number.toString();
        setSearchHighlight(num);
        centerOnTeam(num, nexusData);
      } else {
        setSearchHighlight(null);
      }
    },
    [teams, teamsOnMap, nexusData, centerOnTeam],
  );

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const handleReset = useCallback(() => {
    centerOnPits(nexusData);
  }, [nexusData, centerOnPits]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      setIsPanning(true);
      didPan.current = false;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOffset.current = { ...pan };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [pan],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        didPan.current = true;
      }
      setPan({
        x: panOffset.current.x + dx,
        y: panOffset.current.y + dy,
      });
    },
    [isPanning],
  );

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.min(Math.max(z + delta, MIN_ZOOM), MAX_ZOOM));
  }, []);

  if (loading) {
    return (
      <Card variant='filled' className='p-4 mb-2'>
        <HStack className='items-center justify-between mb-2'>
          <Heading size='md'>Pit Map</Heading>
          <Icon as={Map} size='lg' className='text-typography-600' />
        </HStack>
        <View className='items-center justify-center py-8'>
          <Spinner size='small' />
        </View>
      </Card>
    );
  }

  if (!nexusData?.map) {
    return null;
  }

  const { map, pits } = nexusData;

  return (
    <Card variant='filled' className='p-4 mb-2'>
      <HStack className='items-center justify-between mb-2'>
        <Heading size='md'>Pit Map</Heading>
        <HStack space='sm' className='items-center'>
          <Pressable onPress={handleZoomOut} className='p-1'>
            <Icon as={ZoomOut} size='sm' className='text-typography-600' />
          </Pressable>
          <Text className='text-xs text-typography-500 min-w-[36px] text-center'>
            {Math.round(zoom * 100)}%
          </Text>
          <Pressable onPress={handleZoomIn} className='p-1'>
            <Icon as={ZoomIn} size='sm' className='text-typography-600' />
          </Pressable>
          <Pressable onPress={handleReset} className='p-1 ml-1'>
            <Icon as={Locate} size='sm' className='text-typography-600' />
          </Pressable>
        </HStack>
      </HStack>

      <View
        className='overflow-hidden rounded-lg border border-outline-200'
        style={{ height: 300, backgroundColor: T.bgCanvas } as any}
      >
        {/* @ts-ignore - web-only pointer/wheel events */}
        <View
          ref={containerRef}
          style={
            {
              width: '100%',
              height: '100%',
              cursor: isPanning ? 'grabbing' : 'grab',
              touchAction: 'none',
            } as any
          }
          onPointerDown={handlePointerDown as any}
          onPointerMove={handlePointerMove as any}
          onPointerUp={handlePointerUp as any}
          onPointerCancel={handlePointerUp as any}
          onWheel={handleWheel as any}
        >
          <View
            style={{
              transformOrigin: '0 0',
              transform: [
                { translateX: pan.x },
                { translateY: pan.y },
                { scale: zoom },
              ],
              width: map.size.x * SCALE_FACTOR,
              height: map.size.y * SCALE_FACTOR,
            }}
          >
            <MapContent
              map={map}
              pits={pits}
              highlightTeam={highlightTeam}
              teamInfoMap={teamInfoMap}
              colors={T}
              onTeamPress={(team) => {
                if (didPan.current) return;
                router.push(`/(tabs)/team/${team}`);
              }}
            />
          </View>
        </View>
      </View>

      {!hideSearch && (
        <Input size='sm' className='mt-2'>
          <InputSlot className='pl-3'>
            <InputIcon as={Search} />
          </InputSlot>
          <InputField
            placeholder='Search team # or name'
            value={searchQuery}
            onChangeText={handleSearch}
          />
        </Input>
      )}
    </Card>
  );
}

type ColorMap = typeof COLORS.light;

interface MapContentProps {
  map: PitMapType;
  pits: PitAddresses | null;
  highlightTeam?: string;
  teamInfoMap: Record<string, TeamInfo>;
  colors: ColorMap;
  onTeamPress: (team: string) => void;
}

function MapContent({
  map,
  pits,
  highlightTeam,
  teamInfoMap,
  colors: T,
  onTeamPress,
}: MapContentProps) {
  const addressToTeam: Record<string, string> = {};
  if (pits) {
    for (const [teamNum, address] of Object.entries(pits)) {
      addressToTeam[address] = teamNum;
    }
  }

  return (
    <View style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Walls */}
      {map.walls &&
        Object.entries(map.walls).map(([id, wall]) => (
          <View
            key={`wall-${id}`}
            style={{
              position: 'absolute',
              left: wall.position.x * SCALE_FACTOR,
              top: wall.position.y * SCALE_FACTOR,
              width: Math.max(wall.size.x * SCALE_FACTOR, 2),
              height: Math.max(wall.size.y * SCALE_FACTOR, 2),
              backgroundColor: T.wall,
            }}
          />
        ))}

      {/* Areas */}
      {map.areas &&
        Object.entries(map.areas).map(([id, area]) => (
          <View
            key={`area-${id}`}
            style={{
              position: 'absolute',
              left: area.position.x * SCALE_FACTOR,
              top: area.position.y * SCALE_FACTOR,
              width: area.size.x * SCALE_FACTOR,
              height: area.size.y * SCALE_FACTOR,
              backgroundColor: T.areaBg,
              borderWidth: 1,
              borderColor: T.areaBorder,
              borderRadius: 2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize:
                  Math.min(area.size.x, area.size.y) * SCALE_FACTOR * 0.15,
                color: T.areaText,
                textAlign: 'center',
              }}
              numberOfLines={2}
            >
              {area.label}
            </Text>
          </View>
        ))}

      {/* Labels */}
      {map.labels &&
        Object.entries(map.labels).map(([id, label]) => (
          <View
            key={`label-${id}`}
            style={{
              position: 'absolute',
              left: label.position.x * SCALE_FACTOR,
              top: label.position.y * SCALE_FACTOR,
              width: label.size.x * SCALE_FACTOR,
              height: label.size.y * SCALE_FACTOR,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize:
                  Math.min(label.size.x, label.size.y) * SCALE_FACTOR * 0.3,
                color: T.labelText,
                textAlign: 'center',
              }}
              numberOfLines={2}
            >
              {label.label}
            </Text>
          </View>
        ))}

      {/* Arrows */}
      {map.arrows &&
        Object.entries(map.arrows).map(([id, arrow]) => (
          <View
            key={`arrow-${id}`}
            style={{
              position: 'absolute',
              left: arrow.position.x * SCALE_FACTOR,
              top: arrow.position.y * SCALE_FACTOR,
              width: arrow.size.x * SCALE_FACTOR,
              height: arrow.size.y * SCALE_FACTOR,
              alignItems: 'center',
              justifyContent: 'center',
              transform: arrow.angle ? [{ rotate: `${arrow.angle}deg` }] : [],
            }}
          >
            <Text
              style={{
                fontSize:
                  Math.min(arrow.size.x, arrow.size.y) * SCALE_FACTOR * 0.5,
                color: T.arrowText,
              }}
            >
              {'\u2192'}
            </Text>
          </View>
        ))}

      {/* Pits */}
      {Object.entries(map.pits).map(([address, pit]) => {
        const teamNum = pit.team || addressToTeam[address] || null;
        const isHighlighted = !!highlightTeam && teamNum === highlightTeam;
        const info = teamNum ? teamInfoMap[teamNum] : undefined;
        const scouted = !!info?.prescout_drivetrain;
        const pictured = !!info?.picture;
        const doneCount = (scouted ? 1 : 0) + (pictured ? 1 : 0);

        let bgColor: string;
        let borderColor: string;
        if (!teamNum) {
          bgColor = T.pitEmptyBg;
          borderColor = T.pitEmptyBorder;
        } else if (doneCount === 2) {
          bgColor = T.pitGreenBg;
          borderColor = T.pitGreenBorder;
        } else if (doneCount === 1) {
          bgColor = T.pitOrangeBg;
          borderColor = T.pitOrangeBorder;
        } else {
          bgColor = T.pitGreyBg;
          borderColor = T.pitGreyBorder;
        }
        if (isHighlighted) {
          borderColor = T.pitHighlight;
        }

        const pitW = pit.size.x * SCALE_FACTOR;
        const pitH = pit.size.y * SCALE_FACTOR;
        const fontSize = Math.min(pitW, pitH) * 0.28;
        const iconSize = Math.max(fontSize * 0.7, 5);

        return (
          <Pressable
            key={`pit-${address}`}
            onPress={() => teamNum && onTeamPress(teamNum)}
            style={{
              position: 'absolute',
              left: pit.position.x * SCALE_FACTOR,
              top: pit.position.y * SCALE_FACTOR,
              width: pitW,
              height: pitH,
              backgroundColor: bgColor,
              borderWidth: isHighlighted ? 3 : 1,
              borderColor,
              borderRadius: 2,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {teamNum && (
              <>
                <Text
                  style={{
                    fontSize,
                    fontWeight: isHighlighted ? '700' : '600',
                    color: T.pitText,
                    textAlign: 'center',
                    lineHeight: fontSize * 1.2,
                  }}
                  numberOfLines={1}
                >
                  {teamNum}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    gap: iconSize * 0.4,
                    marginTop: iconSize * 0.15,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon
                    as={scouted ? Binoculars : EyeOff}
                    style={{
                      width: iconSize,
                      height: iconSize,
                      color: scouted ? T.iconGreen : T.iconRed,
                    }}
                  />
                  <Icon
                    as={pictured ? ImageIcon : ImageOff}
                    style={{
                      width: iconSize,
                      height: iconSize,
                      color: pictured ? T.iconGreen : T.iconRed,
                    }}
                  />
                </View>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
