import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Filter = 'All' | 'Runs' | 'Rowing' | 'Gym' | 'Rest' | 'Race Day';
export type SyncStatus = 'Saved locally' | 'Synced' | 'Sync unavailable' | 'Sync error';

export type ProgressState = {
  completedDays: number[];
  customNotes: Record<number, string>;
  actualDistances: Record<number, number>;
  selectedFilter: Filter;
  lastUpdated: string;
};

export const STORAGE_KEY = 'marathon-control-progress';
export const SUPABASE_RECORD_ID = 'andre-marathon-2026';

export const defaultProgressState = (): ProgressState => ({
  completedDays: [],
  customNotes: {},
  actualDistances: {},
  selectedFilter: 'All',
  lastUpdated: new Date(0).toISOString(),
});

const isFilter = (value: unknown): value is Filter =>
  value === 'All' ||
  value === 'Runs' ||
  value === 'Rowing' ||
  value === 'Gym' ||
  value === 'Rest' ||
  value === 'Race Day';

export const normalizeState = (value: unknown): ProgressState => {
  const fallback = defaultProgressState();
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  const candidate = value as Partial<ProgressState>;
  return {
    completedDays: Array.isArray(candidate.completedDays)
      ? candidate.completedDays.filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 21)
      : fallback.completedDays,
    customNotes:
      candidate.customNotes && typeof candidate.customNotes === 'object' && !Array.isArray(candidate.customNotes)
        ? Object.fromEntries(
            Object.entries(candidate.customNotes)
              .filter(([day, note]) => Number.isInteger(Number(day)) && typeof note === 'string')
              .map(([day, note]) => [Number(day), note]),
          )
        : fallback.customNotes,
    actualDistances:
      candidate.actualDistances && typeof candidate.actualDistances === 'object' && !Array.isArray(candidate.actualDistances)
        ? Object.fromEntries(
            Object.entries(candidate.actualDistances)
              .filter(([day, distance]) => Number.isInteger(Number(day)) && Number(day) >= 1 && Number(day) <= 21 && typeof distance === 'number' && distance >= 0)
              .map(([day, distance]) => [Number(day), distance]),
          )
        : fallback.actualDistances,
    selectedFilter: isFilter(candidate.selectedFilter) ? candidate.selectedFilter : fallback.selectedFilter,
    lastUpdated: typeof candidate.lastUpdated === 'string' ? candidate.lastUpdated : fallback.lastUpdated,
  };
};

export const loadLocalState = (): ProgressState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeState(JSON.parse(stored)) : defaultProgressState();
  } catch {
    return defaultProgressState();
  }
};

export const saveLocalState = (state: ProgressState): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const createSupabaseClient = (): SupabaseClient | null => {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!url || !anonKey) {
    return null;
  }

  return createClient(url, anonKey);
};

export const fetchRemoteState = async (client: SupabaseClient): Promise<ProgressState | null> => {
  const { data, error } = await client.from('training_progress').select('data').eq('id', SUPABASE_RECORD_ID).maybeSingle();
  if (error) {
    throw error;
  }

  return data?.data ? normalizeState(data.data) : null;
};

export const syncRemoteState = async (client: SupabaseClient, state: ProgressState): Promise<void> => {
  const { error } = await client.from('training_progress').upsert({
    id: SUPABASE_RECORD_ID,
    data: state,
    updated_at: state.lastUpdated,
  });

  if (error) {
    throw error;
  }
};

export const newerState = (localState: ProgressState, remoteState: ProgressState | null): ProgressState => {
  if (!remoteState) {
    return localState;
  }

  const localTime = Date.parse(localState.lastUpdated);
  const remoteTime = Date.parse(remoteState.lastUpdated);
  return remoteTime > localTime ? remoteState : localState;
};
