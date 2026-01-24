import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { db } from '@/utils/db';
import { Platform } from 'react-native';

interface CompetitionContextType {
  competitionCode: string | null;
  setCompetitionCode: (code: string) => Promise<void>;
  isLoading: boolean;
}

const CompetitionContext = createContext<CompetitionContextType | undefined>(undefined);

export function CompetitionProvider({ children }: { children: ReactNode }) {
  const [competitionCode, setCompetitionCodeState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCompetitionCode();
  }, []);

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

  async function setCompetitionCode(code: string) {
    try {
      await db.config.put({ key: 'compCode', value: code });
      setCompetitionCodeState(code);
    } catch (error) {
      console.error('Failed to save competition code:', error);
      throw error;
    }
  }

  return (
    <CompetitionContext.Provider value={{ competitionCode, setCompetitionCode, isLoading }}>
      {children}
    </CompetitionContext.Provider>
  );
}

export function useCompetitionCode() {
  const context = useContext(CompetitionContext);
  if (context === undefined) {
    throw new Error('useCompetitionCode must be used within a CompetitionProvider');
  }
  return context;
}
