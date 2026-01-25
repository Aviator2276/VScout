import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { db } from '@/utils/db';
import { Platform } from 'react-native';
import { API_BASE_URL } from '@/utils/api';

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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [competitionCode, setCompetitionCodeState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [serverStatus, setServerStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [ping, setPing] = useState<number | null>(null);
  const [pollingInterval, setPollingInterval] = useState<number | null>(null);
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>('system');

  useEffect(() => {
    loadCompetitionCode();
    loadTheme();
    checkServerConnection();
    setupConnectionListeners();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, []);

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

  async function setCompetitionCode(code: string) {
    try {
      await db.config.put({ key: 'compCode', value: code });
      setCompetitionCodeState(code);
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
