import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';

export type NetworkQuality = 'good' | 'poor' | 'bad';

interface NetworkQualityResult {
  quality: NetworkQuality;
  label: string;
}

// Extend Navigator interface for Network Information API (not available on all browsers)
interface NetworkInformation extends EventTarget {
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g';
  downlinkMax?: number;
  downlink?: number;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function getQualityFromConnection(connection: NetworkInformation): NetworkQualityResult {
  const { effectiveType, downlinkMax, downlink } = connection;
  const speed = downlinkMax ?? downlink ?? 0;

  if (effectiveType === '4g' && speed > 5) {
    return { quality: 'good', label: 'Good' };
  }
  if (effectiveType === '4g' || effectiveType === '3g') {
    return { quality: 'poor', label: 'Poor' };
  }
  // 2g, slow-2g, or no connection
  return { quality: 'bad', label: 'Bad' };
}

function getQualityFromPing(ping: number | null): NetworkQualityResult {
  if (ping === null) {
    return { quality: 'bad', label: 'Bad' };
  }
  if (ping < 150) {
    return { quality: 'good', label: 'Good' };
  }
  if (ping <= 500) {
    return { quality: 'poor', label: 'Poor' };
  }
  return { quality: 'bad', label: 'Bad' };
}

export function useNetworkQuality(): NetworkQualityResult {
  const { ping, isOnline } = useApp();
  const [result, setResult] = useState<NetworkQualityResult>({ quality: 'bad', label: 'Bad' });

  useEffect(() => {
    if (!isOnline) {
      setResult({ quality: 'bad', label: 'Bad' });
      return;
    }

    const nav = navigator as NavigatorWithConnection;

    // iOS PWA: use ping-based detection
    if (isIOS() || !nav.connection) {
      setResult(getQualityFromPing(ping));
      return;
    }

    // Non-iOS with Network Information API
    const connection = nav.connection;

    const updateQuality = () => {
      setResult(getQualityFromConnection(connection));
    };

    updateQuality();
    connection.addEventListener('change', updateQuality);

    return () => {
      connection.removeEventListener('change', updateQuality);
    };
  }, [ping, isOnline]);

  return result;
}
