import React, { useState, useEffect, useRef } from 'react';
import { Pressable } from 'react-native';
import { Badge, BadgeIcon, BadgeText } from '@/components/ui/badge';
import {
  LoaderCircle,
  LucideIcon,
  Wifi,
  WifiHigh,
  WifiLow,
  WifiOff,
} from 'lucide-react-native';

interface ConnectionStatusProps {
  ping: number | null;
  isOnline: boolean;
  serverStatus: 'connected' | 'disconnected' | 'checking';
  onPress?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export function ConnectionStatus({
  ping,
  isOnline,
  serverStatus,
  onPress,
  size = 'lg',
}: ConnectionStatusProps) {
  const [showPing, setShowPing] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handlePress = () => {
    setShowPing(true);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setShowPing(false);
    }, 5000);

    onPress?.();
  };
  const getConnectionQuality = (): {
    action: 'success' | 'warning' | 'error' | 'muted';
    icon: LucideIcon;
    label: string;
  } => {
    if (!isOnline || serverStatus === 'disconnected') {
      return { action: 'error', icon: WifiOff, label: 'Offline' };
    }

    if (serverStatus === 'checking' || ping === null) {
      return { action: 'muted', icon: LoaderCircle, label: 'Checking...' };
    }

    // Ping thresholds (in milliseconds)
    if (ping < 300) {
      return { action: 'success', icon: Wifi, label: 'Good' };
    } else if (ping < 750) {
      return { action: 'warning', icon: WifiHigh, label: 'Weak' };
    } else if (ping < 1500) {
      return { action: 'error', icon: WifiLow, label: 'Bad' };
    } else {
      return { action: 'error', icon: WifiOff, label: 'Poor' };
    }
  };

  const quality = getConnectionQuality();
  const isChecking = serverStatus === 'checking';

  return (
    <Pressable onPress={handlePress}>
      <Badge size={size} variant="solid" action={quality.action}>
        {showPing && ping !== null && <BadgeText>{ping} ms</BadgeText>}
        <BadgeIcon
          as={quality.icon}
          className={`${showPing && ping !== null ? 'ml-1' : 'my-[0.1rem]'} ${isChecking ? 'animate-spin' : ''}`}
        />
      </Badge>
    </Pressable>
  );
}
