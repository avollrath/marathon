import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Check, Database, Download, Dumbbell, Flag, RotateCcw, Upload } from 'lucide-react';
import { trainingPlan, type TrainingDay } from './plan';
import {
  createSupabaseClient,
  defaultProgressState,
  fetchRemoteState,
  loadLocalState,
  newerState,
  normalizeState,
  saveLocalState,
  syncRemoteState,
  type Filter,
  type ProgressState,
  type SyncStatus,
} from './storage';

const filters: Filter[] = ['All', 'Runs', 'Gym', 'Rest', 'Race Day'];

const classifyDay = (day: TrainingDay): Filter[] => {
  const type = day.type.toLowerCase();
  return [
    day.distance.trim() !== '0 km' ? 'Runs' : null,
    day.gym ? 'Gym' : null,
    type === 'rest' ? 'Rest' : null,
    type === 'race day' ? 'Race Day' : null,
  ].filter(Boolean) as Filter[];
};

const isVisible = (day: TrainingDay, filter: Filter) => filter === 'All' || classifyDay(day).includes(filter);

const timestamp = () => new Date().toISOString();

function App() {
  const [state, setState] = useState<ProgressState>(() => loadLocalState());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('Saved locally');
  const [importError, setImportError] = useState('');
  const [remoteChecked, setRemoteChecked] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const supabase = useMemo(() => createSupabaseClient(), []);

  const completedSet = useMemo(() => new Set(state.completedDays), [state.completedDays]);
  const completedCount = state.completedDays.length;
  const progressPercent = Math.round((completedCount / trainingPlan.length) * 100);
  const runDays = trainingPlan.filter((day) => classifyDay(day).includes('Runs')).length;
  const restDays = trainingPlan.filter((day) => classifyDay(day).includes('Rest')).length;
  const gymDays = trainingPlan.filter((day) => classifyDay(day).includes('Gym')).length;
  const filteredPlan = trainingPlan.filter((day) => isVisible(day, state.selectedFilter));

  useEffect(() => {
    let isMounted = true;
    if (!supabase) {
      setSyncStatus('Sync unavailable');
      setRemoteChecked(true);
      return;
    }

    fetchRemoteState(supabase)
      .then((remoteState) => {
        if (!isMounted) {
          return;
        }
        setState((current) => {
          const selected = newerState(current, remoteState);
          saveLocalState(selected);
          return selected;
        });
        setSyncStatus('Synced');
        setRemoteChecked(true);
      })
      .catch(() => {
        if (isMounted) {
          setSyncStatus('Sync error');
          setRemoteChecked(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    saveLocalState(state);

    if (!supabase) {
      setSyncStatus('Sync unavailable');
      return;
    }

    if (!remoteChecked) {
      setSyncStatus('Saved locally');
      return;
    }

    let cancelled = false;
    setSyncStatus('Saved locally');
    syncRemoteState(supabase, state)
      .then(() => {
        if (!cancelled) {
          setSyncStatus('Synced');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSyncStatus('Sync error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [state, supabase, remoteChecked]);

  const updateState = (updater: (current: ProgressState) => ProgressState) => {
    setState((current) => updater({ ...current, lastUpdated: timestamp() }));
  };

  const toggleCompleted = (day: number) => {
    updateState((current) => {
      const completedDays = current.completedDays.includes(day)
        ? current.completedDays.filter((value) => value !== day)
        : [...current.completedDays, day].sort((a, b) => a - b);
      return { ...current, completedDays };
    });
  };

  const updateNote = (day: number, note: string) => {
    updateState((current) => ({
      ...current,
      customNotes: { ...current.customNotes, [day]: note },
    }));
  };

  const updateFilter = (selectedFilter: Filter) => {
    updateState((current) => ({ ...current, selectedFilter }));
  };

  const resetProgress = () => {
    if (!window.confirm('Reset completed days and custom notes? This cannot be undone.')) {
      return;
    }
    setState({ ...defaultProgressState(), lastUpdated: timestamp(), selectedFilter: state.selectedFilter });
  };

  const exportBackup = () => {
    const backup = JSON.stringify(state, null, 2);
    const blob = new Blob([backup], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `marathon-control-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = async (file: File | undefined) => {
    setImportError('');
    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      const imported = normalizeState(JSON.parse(content));
      if (!window.confirm('Import this backup and overwrite current progress?')) {
        return;
      }
      setState({ ...imported, lastUpdated: timestamp() });
    } catch {
      setImportError('Backup import failed. Choose a valid Marathon Control JSON file.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <main className="min-h-screen bg-carbon text-nickel">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="grid gap-4 border border-white/10 bg-graphite/80 p-4 shadow-insetLine md:grid-cols-[1fr_auto] md:p-6">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-steel">
              <span>21-day taper system</span>
              <span className="h-px w-8 bg-white/20" />
              <span>{new Date(state.lastUpdated).getTime() > 0 ? `Updated ${new Date(state.lastUpdated).toLocaleString()}` : 'No edits yet'}</span>
            </div>
            <h1 className="text-4xl font-semibold uppercase leading-none text-white sm:text-6xl">Marathon Control</h1>
          </div>
          <div className="grid min-w-64 gap-3 border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-4 font-mono text-xs uppercase text-steel">
              <span>Progress</span>
              <span className="text-nickel">{completedCount}/21</span>
            </div>
            <div className="h-2 border border-white/10 bg-black">
              <div className="h-full bg-gradient-to-r from-signal to-ember" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="flex items-center gap-2 text-sm text-nickel">
              <Database className="h-4 w-4 text-signal" />
              {syncStatus}
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                className={`border px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] transition ${
                  state.selectedFilter === filter
                    ? 'border-ember bg-ember text-black'
                    : 'border-white/10 bg-white/[0.03] text-steel hover:border-white/30 hover:text-white'
                }`}
                key={filter}
                onClick={() => updateFilter(filter)}
                type="button"
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 border border-white/10 bg-graphite/70 p-3 text-sm md:grid-cols-3 lg:grid-cols-2">
            <Stat label="Completed" value={completedCount} />
            <Stat label="Remaining" value={trainingPlan.length - completedCount} />
            <Stat label="Run days" value={runDays} />
            <Stat label="Rest days" value={restDays} />
            <Stat label="Gym days" value={gymDays} />
            <Stat label="Progress" value={`${progressPercent}%`} />
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredPlan.map((day) => (
            <article
              className={`relative grid min-h-[420px] gap-4 border bg-graphite/80 p-4 shadow-insetLine ${
                day.day === 6 || day.day === 21 ? 'border-ember/70' : 'border-white/10'
              } ${completedSet.has(day.day) ? 'opacity-75' : ''}`}
              key={day.day}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-xs uppercase tracking-[0.2em] text-steel">
                    Day {day.day.toString().padStart(2, '0')} {day.label ? `/ ${day.label}` : ''}
                  </div>
                  <h2 className="mt-2 text-xl font-semibold uppercase leading-tight text-white">{day.type}</h2>
                </div>
                <button
                  aria-label={`Mark day ${day.day} complete`}
                  className={`grid h-10 w-10 place-items-center border transition ${
                    completedSet.has(day.day)
                      ? 'border-signal bg-signal text-black'
                      : 'border-white/15 bg-black/20 text-steel hover:border-signal hover:text-signal'
                  }`}
                  onClick={() => toggleCompleted(day.day)}
                  type="button"
                >
                  <Check className="h-5 w-5" />
                </button>
              </div>

              {(day.day === 6 || day.day === 21) && (
                <div className="flex items-center gap-2 border border-ember/40 bg-ember/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-ember">
                  {day.day === 21 ? <Flag className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                  {day.day === 21 ? 'Race day' : 'Key long run'}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Metric label="Distance" value={day.distance} />
                <Metric label="Shoes" value={day.shoes} />
              </div>
              <Metric label="Intensity" value={day.intensity} full />
              <Metric label="Notes" value={day.notes} full />

              {day.gym && (
                <div className="border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-steel">
                    <Dumbbell className="h-4 w-4 text-signal" />
                    Gym
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {day.gym.map((exercise) => (
                      <span className="border border-white/10 px-2 py-1 text-xs text-nickel" key={`${day.day}-${exercise}`}>
                        {exercise}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <label className="grid gap-2 self-end">
                <span className="font-mono text-xs uppercase tracking-[0.16em] text-steel">Custom note</span>
                <textarea
                  className="min-h-24 resize-y border border-white/10 bg-black/30 p-3 text-sm text-white outline-none transition placeholder:text-steel/50 focus:border-signal"
                  onChange={(event) => updateNote(day.day, event.target.value)}
                  placeholder="Add race-week observation..."
                  value={state.customNotes[day.day] ?? ''}
                />
              </label>
            </article>
          ))}
        </section>

        <footer className="flex flex-wrap items-center gap-3 border border-white/10 bg-graphite/80 p-4">
          <button className="control-button" onClick={resetProgress} type="button">
            <RotateCcw className="h-4 w-4" />
            Reset progress
          </button>
          <button className="control-button" onClick={exportBackup} type="button">
            <Download className="h-4 w-4" />
            Export backup
          </button>
          <button className="control-button" onClick={() => fileInputRef.current?.click()} type="button">
            <Upload className="h-4 w-4" />
            Import backup
          </button>
          <input
            accept="application/json"
            className="hidden"
            onChange={(event) => void importBackup(event.target.files?.[0])}
            ref={fileInputRef}
            type="file"
          />
          {importError && <p className="text-sm text-ember">{importError}</p>}
        </footer>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border border-white/10 bg-black/20 p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-steel">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function Metric({ label, value, full = false }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={`border border-white/10 bg-black/20 p-3 ${full ? 'col-span-full' : ''}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-steel">{label}</div>
      <div className="mt-1 text-sm leading-relaxed text-nickel">{value}</div>
    </div>
  );
}

export default App;
