import React, { useState, useEffect, useRef } from 'react';
import { Pressable } from 'react-native';
import { Badge, BadgeIcon, BadgeText } from '@/components/ui/badge';
import {
  LucideIcon,
  Radio,
  Wifi,
  WifiHigh,
  WifiLow,
  WifiOff,
  WifiZero,
} from 'lucide-react-native';
import { Spinner } from './ui/spinner';

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
      return { action: 'muted', icon: Radio, label: 'Checking...' };
    }

    // Ping thresholds (in milliseconds)
    if (ping < 150) {
      return { action: 'success', icon: Wifi, label: 'Good' };
    } else if (ping < 300) {
      return { action: 'warning', icon: WifiHigh, label: 'Weak' };
    } else if (ping < 1500) {
      return { action: 'error', icon: WifiLow, label: 'Bad' };
    } else {
      return { action: 'error', icon: WifiZero, label: 'Poor' };
    }
  };

  const quality = getConnectionQuality();
  const isChecking = serverStatus === 'checking';

  return (
    <Pressable onPress={handlePress}>
      <Badge size={size} variant="solid" action={quality.action}>
        {showPing && ping !== null && (
          <BadgeText className="line-clamp-1">{ping} ms</BadgeText>
        )}
        {isChecking ? (
          <Spinner size="small" className="ml-1" color="grey" />
        ) : (
          <BadgeIcon
            as={quality.icon}
            className={
              showPing && ping !== null ? 'ml-1 my-[0.1rem]' : 'my-[0.1rem]'
            }
          />
        )}
      </Badge>
    </Pressable>
  );
}
