import React, {
  createContext,
  useContext,
  useState,
  useEffect,
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
  NoCompetitionCodeError as TeamNoCompCodeError,
} from '@/api/teams';

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

  useEffect(() => {
    loadCompetitionCode();
    loadTheme();
    loadDataRefreshInterval();
    loadLastDataUpdate();
    checkServerConnection();
    setupConnectionListeners();
    performDataRefresh();

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

  async function performDataRefresh() {
    if (isRefreshingData) return;

    // Check if we have a competition code set
    const compCode = (await db.config.get({ key: 'compCode' }))?.value;
    if (!compCode) {
      console.log('No competition code set, skipping data refresh');
      return;
    }

    setIsRefreshingData(true);
    try {
      // Cache teams first (needed for team info)
      console.log('Refreshing teams data...');
      await cacheTeams();

      // Cache matches
      console.log('Refreshing matches data...');
      await cacheMatches();

      // Cache team info (depends on teams being cached first)
      console.log('Refreshing team info data...');
      await cacheTeamInfo();

      // Update timestamp and store it in db for persistence
      const now = new Date();
      await db.config.put({ key: 'lastDataUpdate', value: now.toISOString() });
      setLastDataUpdate(now);
      setDataFreshnessStatus('current');

      console.log('Data refresh completed successfully');
    } catch (error) {
      if (
        error instanceof MatchNoCompCodeError ||
        error instanceof TeamNoCompCodeError
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
    await performDataRefresh();
  }

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
