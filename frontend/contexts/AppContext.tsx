import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { db } from '@/utils/db';
import { Platform } from 'react-native';
import { API_BASE_URL } from '@/utils/api';
import {
  cacheMatches,
  NoCompetitionCodeError as MatchNoCompCodeError,
} from '@/api/matches';
import {
  cacheTeams,
  cacheTeamInfo,
  syncTeamPictures,
  NoCompetitionCodeError as TeamNoCompCodeError,
} from '@/api/teams';
import {
  syncRobotActions,
  NoCompetitionCodeError as ScoutNoCompCodeError,
} from '@/api/scout';
import { calculateAllTeamStats } from '@/api/teamStats';

type DataFreshnessStatus = 'current' | 'aging' | 'stale';

interface AppContextType {
  competitionCode: string | null;
  setCompetitionCode: (code: string) => Promise<void>;
  isOnline: boolean;
  isLoading: boolean;
  serverStatus: 'connected' | 'disconnected' | 'checking';
  ping: number | null;
  checkServerConnection: () => Promise<void>;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>;
  // Data freshness
  lastDataUpdate: Date | null;
  dataRefreshInterval: number; // in minutes
  setDataRefreshInterval: (minutes: number) => Promise<void>;
  dataFreshnessStatus: DataFreshnessStatus;
  forceDataRefresh: () => Promise<void>;
  isRefreshingData: boolean;
  // Onboarding
  onboardingComplete: boolean | null; // null = still loading
  completeOnboarding: () => Promise<void>;
  // Upload trigger
  triggerUpload: () => void;
  registerUploadHandler: (handler: () => void) => void;
  // Service worker / offline
  swStatus: 'active' | 'installing' | 'unsupported' | 'none';
  forceAppUpdate: () => Promise<void>;
  isUpdatingApp: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [competitionCode, setCompetitionCodeState] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [serverStatus, setServerStatus] = useState<
    'connected' | 'disconnected' | 'checking'
  >('checking');
  const [ping, setPing] = useState<number | null>(null);
  const [pollingInterval, setPollingInterval] = useState<number | null>(null);
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>(
    'system',
  );
  const [lastDataUpdate, setLastDataUpdate] = useState<Date | null>(null);
  const [dataRefreshInterval, setDataRefreshIntervalState] =
    useState<number>(30); // default 30 minutes
  const [dataFreshnessStatus, setDataFreshnessStatus] =
    useState<DataFreshnessStatus>('current');
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [dataRefreshTimerId, setDataRefreshTimerId] = useState<number | null>(
    null,
  );
  const uploadHandlerRef = useRef<(() => void) | null>(null);
  const [swStatus, setSwStatus] = useState<
    'active' | 'installing' | 'unsupported' | 'none'
  >('none');
  const [isUpdatingApp, setIsUpdatingApp] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    loadOnboardingState();
    loadCompetitionCode();
    loadTheme();
    loadDataRefreshInterval();
    loadLastDataUpdate();
    checkServerConnection();
    setupConnectionListeners();
    performDataRefresh();
    checkServiceWorkerStatus();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
      if (dataRefreshTimerId) {
        clearInterval(dataRefreshTimerId);
      }
    };
  }, []);

  // Setup data refresh interval
  useEffect(() => {
    if (dataRefreshTimerId) {
      clearInterval(dataRefreshTimerId);
    }

    const intervalMs = dataRefreshInterval * 60 * 1000;
    const timerId = window.setInterval(() => {
      performDataRefresh();
    }, intervalMs);
    setDataRefreshTimerId(timerId);

    return () => {
      if (timerId) {
        clearInterval(timerId);
      }
    };
  }, [dataRefreshInterval]);

  // Periodic picture sync (every 2 minutes), independent of data refresh
  useEffect(() => {
    if (!isOnline) return;

    // Run picture sync on mount
    syncTeamPictures().catch((err) =>
      console.error('Periodic picture sync failed:', err),
    );

    const pictureSyncInterval = window.setInterval(() => {
      syncTeamPictures().catch((err) =>
        console.error('Periodic picture sync failed:', err),
      );
    }, 2 * 60 * 1000);

    return () => clearInterval(pictureSyncInterval);
  }, [isOnline]);

  // Update freshness status based on time elapsed
  useEffect(() => {
    if (!lastDataUpdate) {
      setDataFreshnessStatus('stale');
      return;
    }

    const updateFreshnessStatus = () => {
      const now = new Date();
      const elapsed = now.getTime() - lastDataUpdate.getTime();
      const intervalMs = dataRefreshInterval * 60 * 1000;
      const percentage = elapsed / intervalMs;

      if (percentage < 0.25) {
        setDataFreshnessStatus('current');
      } else if (percentage < 0.75) {
        setDataFreshnessStatus('aging');
      } else {
        setDataFreshnessStatus('stale');
      }
    };

    updateFreshnessStatus();
    // Check every 10 seconds to update status
    const statusInterval = window.setInterval(updateFreshnessStatus, 10000);

    return () => clearInterval(statusInterval);
  }, [lastDataUpdate, dataRefreshInterval]);

  useEffect(() => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    if (isOnline) {
      const interval = window.setInterval(() => {
        checkServerConnection();
      }, 60000);
      setPollingInterval(interval);
    } else {
      setPollingInterval(null);
    }

    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [isOnline]);

  function setupConnectionListeners() {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  function handleOnline() {
    setIsOnline(true);
    checkServerConnection();
  }

  function handleOffline() {
    setIsOnline(false);
    setServerStatus('disconnected');
    setPing(null);
  }

  async function loadOnboardingState() {
    if (Platform.OS !== 'web') {
      setOnboardingComplete(true);
      return;
    }

    try {
      const result = await db.config.get({ key: 'onboarding_complete' });
      setOnboardingComplete(result?.value === 'true');
    } catch (error) {
      console.error('Failed to load onboarding state:', error);
      setOnboardingComplete(false);
    }
  }

  async function completeOnboarding() {
    try {
      await db.config.put({ key: 'onboarding_complete', value: 'true' });
      setOnboardingComplete(true);
    } catch (error) {
      console.error('Failed to save onboarding state:', error);
      throw error;
    }
  }

  async function loadCompetitionCode() {
    if (Platform.OS !== 'web') {
      setIsLoading(false);
      return;
    }

    try {
      const result = await db.config.get({ key: 'compCode' });
      setCompetitionCodeState(result?.value || null);
    } catch (error) {
      console.error('Failed to load competition code:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadTheme() {
    if (Platform.OS !== 'web') {
      return;
    }

    try {
      const result = await db.config.get({ key: 'theme' });
      if (result?.value && ['light', 'dark', 'system'].includes(result.value)) {
        setThemeState(result.value as 'light' | 'dark' | 'system');
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
    }
  }

  async function loadDataRefreshInterval() {
    if (Platform.OS !== 'web') {
      return;
    }

    try {
      const result = await db.config.get({ key: 'dataRefreshInterval' });
      if (result?.value) {
        const interval = parseInt(result.value, 10);
        if (!isNaN(interval) && interval > 0) {
          setDataRefreshIntervalState(interval);
        }
      }
    } catch (error) {
      console.error('Failed to load data refresh interval:', error);
    }
  }

  async function loadLastDataUpdate() {
    if (Platform.OS !== 'web') {
      return;
    }

    try {
      const result = await db.config.get({ key: 'lastDataUpdate' });
      if (result?.value) {
        const date = new Date(result.value);
        if (!isNaN(date.getTime())) {
          setLastDataUpdate(date);
        }
      }
    } catch (error) {
      console.error('Failed to load last data update:', error);
    }
  }

  async function setDataRefreshInterval(minutes: number) {
    try {
      await db.config.put({
        key: 'dataRefreshInterval',
        value: minutes.toString(),
      });
      setDataRefreshIntervalState(minutes);
    } catch (error) {
      console.error('Failed to save data refresh interval:', error);
      throw error;
    }
  }

  async function fetchSyncHash(): Promise<string | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sync`, {
        method: 'GET',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        return data.hash || null;
      }
      return null;
    } catch (error) {
      console.error('Failed to fetch sync hash:', error);
      return null;
    }
  }

  async function performDataRefresh(forceRefresh = false) {
    if (isRefreshingData) return;

    // Check if we have a competition code set
    const compCode = (await db.config.get({ key: 'compCode' }))?.value;
    if (!compCode) {
      console.log('No competition code set, skipping data refresh');
      return;
    }

    // Check if we need to refresh based on hash (unless forced)
    if (!forceRefresh) {
      const serverHash = await fetchSyncHash();
      const storedHash = (await db.config.get({ key: 'lastSyncHash' }))?.value;
      const lastUpdate = (await db.config.get({ key: 'lastDataUpdate' }))?.value;

      if (serverHash && storedHash && serverHash === storedHash && lastUpdate) {
        const lastUpdateTime = new Date(lastUpdate).getTime();
        const now = Date.now();
        const intervalMs = dataRefreshInterval * 60 * 1000;

        // Skip refresh if hash matches and we're within the interval
        if (now - lastUpdateTime < intervalMs) {
          console.log('Data unchanged (hash match), skipping refresh');
          return;
        }
      }
    }

    setIsRefreshingData(true);
    try {
      // Fetch the current hash before refreshing
      const newHash = await fetchSyncHash();

      // Cache teams first (needed for team info)
      console.log('Refreshing teams data...');
      await cacheTeams();

      // Cache matches
      console.log('Refreshing matches data...');
      await cacheMatches();

      // Cache team info (depends on teams being cached first)
      console.log('Refreshing team info data...');
      await cacheTeamInfo();

      // Sync robot actions (depends on matches being cached first)
      console.log('Syncing robot actions data...');
      await syncRobotActions();

      // Calculate team stats from match data
      console.log('Calculating team stats...');
      await calculateAllTeamStats();

      // Update timestamp and hash, store in db for persistence
      const now = new Date();
      await db.config.put({ key: 'lastDataUpdate', value: now.toISOString() });
      if (newHash) {
        await db.config.put({ key: 'lastSyncHash', value: newHash });
      }
      setLastDataUpdate(now);
      setDataFreshnessStatus('current');

      console.log('Data refresh completed successfully');
    } catch (error) {
      if (
        error instanceof MatchNoCompCodeError ||
        error instanceof TeamNoCompCodeError ||
        error instanceof ScoutNoCompCodeError
      ) {
        console.log('No competition code set, skipping data refresh');
      } else {
        console.error('Failed to refresh data:', error);
      }
    } finally {
      setIsRefreshingData(false);
    }
  }

  async function forceDataRefresh() {
    await performDataRefresh(true);
  }

  const triggerUpload = useCallback(() => {
    if (uploadHandlerRef.current) {
      uploadHandlerRef.current();
    }
  }, []);

  const registerUploadHandler = useCallback((handler: () => void) => {
    uploadHandlerRef.current = handler;
  }, []);

  async function setCompetitionCode(code: string) {
    try {
      await db.config.put({ key: 'compCode', value: code });
      setCompetitionCodeState(code);
      // Trigger data refresh when competition code is set
      await performDataRefresh();
    } catch (error) {
      console.error('Failed to save competition code:', error);
      throw error;
    }
  }

  async function setTheme(newTheme: 'light' | 'dark' | 'system') {
    try {
      await db.config.put({ key: 'theme', value: newTheme });
      setThemeState(newTheme);
    } catch (error) {
      console.error('Failed to save theme:', error);
      throw error;
    }
  }

  async function checkServiceWorkerStatus() {
    if (!('serviceWorker' in navigator)) {
      setSwStatus('unsupported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.active) {
        setSwStatus('active');
      } else if (registration?.installing || registration?.waiting) {
        setSwStatus('installing');
      } else {
        setSwStatus('none');
      }

      // Listen for future state changes
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        setSwStatus('active');
      });
    } catch (error) {
      console.error('Failed to check service worker status:', error);
      setSwStatus('none');
    }
  }

  async function forceAppUpdate() {
    if (!('serviceWorker' in navigator)) return;

    setIsUpdatingApp(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        // Listen for the new SW to take over, then reload
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!refreshing) {
            refreshing = true;
            window.location.reload();
          }
        });

        // Force the SW to check for updates
        await registration.update();

        // If there's a waiting worker after the update check, tell it to activate
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          // controllerchange listener above will reload
          return;
        }

        // Also listen for a new installing worker that may appear
        if (registration.installing) {
          registration.installing.addEventListener('statechange', (e) => {
            const sw = e.target as ServiceWorker;
            if (sw.state === 'installed' && registration.waiting) {
              registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          });
          return;
        }

        // No update found — app is already up to date
        setIsUpdatingApp(false);
      } else {
        setIsUpdatingApp(false);
      }
    } catch (error) {
      console.error('Failed to force app update:', error);
      setIsUpdatingApp(false);
    }
  }

  async function checkServerConnection() {
    if (!navigator.onLine) {
      setServerStatus('disconnected');
      setPing(null);
      return;
    }

    setServerStatus('checking');
    const startTime = performance.now();

    try {
      const response = await fetch(`${API_BASE_URL}/api/health`, {
        method: 'GET',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000),
      });

      const endTime = performance.now();
      const pingTime = Math.round(endTime - startTime);

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'healthy') {
          setServerStatus('connected');
          setPing(pingTime);
        } else {
          setServerStatus('disconnected');
          setPing(null);
        }
      } else {
        setServerStatus('disconnected');
        setPing(null);
      }
    } catch (error) {
      console.error('Server connection check failed:', error);
      setServerStatus('disconnected');
      setPing(null);
    }
  }

  return (
    <AppContext.Provider
      value={{
        competitionCode,
        setCompetitionCode,
        isOnline,
        isLoading,
        serverStatus,
        ping,
        checkServerConnection,
        theme,
        setTheme,
        lastDataUpdate,
        dataRefreshInterval,
        setDataRefreshInterval,
        dataFreshnessStatus,
        forceDataRefresh,
        isRefreshingData,
        onboardingComplete,
        completeOnboarding,
        triggerUpload,
        registerUploadHandler,
        swStatus,
        forceAppUpdate,
        isUpdatingApp,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

// Backwards compatibility - can be removed later
export const useCompetitionCode = useApp;
export const CompetitionProvider = AppProvider;
