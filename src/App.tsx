import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Check,
  Database,
  Download,
  Dumbbell,
  Flag,
  RotateCcw,
  Timer,
  Upload,
  Waves,
} from "lucide-react";
import iconUrl from "./icon.svg";
import {
  getCurrentPlanDay,
  getPlanDate,
  trainingPlan,
  type TrainingDay,
} from "./plan";
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
} from "./storage";

const filters: Filter[] = ["All", "Runs", "Rowing", "Gym", "Rest", "Race Day"];
const UNLOCK_STORAGE_KEY = "marathon-control-edit-unlocked";

const classifyDay = (day: TrainingDay): Filter[] => {
  const type = day.type.toLowerCase();
  const isRowingOnly =
    type.includes("rowing") || day.distance.toLowerCase().includes("rowing");
  const hasRowing = isRowingOnly || day.rowingOptional;
  return [
    day.distance.trim() !== "0 km" && !isRowingOnly ? "Runs" : null,
    hasRowing ? "Rowing" : null,
    day.gym ? "Gym" : null,
    type === "rest" ? "Rest" : null,
    type === "race day" ? "Race Day" : null,
  ].filter(Boolean) as Filter[];
};

const isVisible = (day: TrainingDay, filter: Filter) =>
  filter === "All" || classifyDay(day).includes(filter);

const timestamp = () => new Date().toISOString();

const isDistanceDay = (day: TrainingDay) => day.distance.trim() !== "0 km";

const formatDistanceTotal = (value: number) =>
  `${Number(value.toFixed(1)).toString()} km`;

const plannedRunDistance = (day: TrainingDay) => {
  if (
    day.type.toLowerCase().includes("rowing") ||
    day.distance.toLowerCase().includes("rowing")
  ) {
    return 0;
  }

  const normalized = day.distance.toLowerCase().replace(",", ".");
  const range = normalized.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (range) {
    return (Number(range[1]) + Number(range[2])) / 2;
  }

  const single = normalized.match(/(\d+(?:\.\d+)?)/);
  return single ? Number(single[1]) : 0;
};

const formatUpdatedAt = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));

const formatPlanDate = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

function App() {
  const [state, setState] = useState<ProgressState>(() => loadLocalState());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("Saved locally");
  const [importError, setImportError] = useState("");
  const [lockMessage, setLockMessage] = useState("");
  const [passwordValue, setPasswordValue] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [unlockPromptOpen, setUnlockPromptOpen] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(
    () => sessionStorage.getItem(UNLOCK_STORAGE_KEY) === "true",
  );
  const [remoteChecked, setRemoteChecked] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dayRefs = useRef<Record<number, HTMLElement | null>>({});
  const pendingWriteRef = useRef<(() => void) | null>(null);
  const supabase = useMemo(() => createSupabaseClient(), []);
  const editPassword =
    (import.meta.env.VITE_EDIT_PASSWORD as string | undefined)?.trim() ?? "";
  const isEditPasswordConfigured = editPassword.length > 0;
  const canEdit = isEditPasswordConfigured && isUnlocked;

  const currentPlanDay = useMemo(
    () => getCurrentPlanDay(currentDate),
    [currentDate],
  );
  const completedSet = useMemo(
    () => new Set(state.completedDays),
    [state.completedDays],
  );
  const completedCount = state.completedDays.length;
  const progressPercent = Math.round(
    (completedCount / trainingPlan.length) * 100,
  );
  const runDays = trainingPlan.filter((day) =>
    classifyDay(day).includes("Runs"),
  ).length;
  const rowingDays = trainingPlan.filter((day) =>
    classifyDay(day).includes("Rowing"),
  ).length;
  const restDays = trainingPlan.filter((day) =>
    classifyDay(day).includes("Rest"),
  ).length;
  const gymDays = trainingPlan.filter((day) =>
    classifyDay(day).includes("Gym"),
  ).length;
  const plannedDistance = trainingPlan.reduce(
    (total, day) => total + plannedRunDistance(day),
    0,
  );
  const completedDistance = trainingPlan.reduce(
    (total, day) =>
      completedSet.has(day.day)
        ? total + (state.actualDistances[day.day] ?? 0)
        : total,
    0,
  );
  const filteredPlan = trainingPlan.filter((day) =>
    isVisible(day, state.selectedFilter),
  );
  const currentDayVisible = currentPlanDay
    ? filteredPlan.some((day) => day.day === currentPlanDay)
    : false;

  useEffect(() => {
    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    favicon.type = "image/svg+xml";
    favicon.href = iconUrl;
  }, []);

  useEffect(() => {
    if (!currentPlanDay || !currentDayVisible) {
      return;
    }

    window.requestAnimationFrame(() => {
      dayRefs.current[currentPlanDay]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [currentPlanDay, currentDayVisible, state.selectedFilter]);

  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    const timeout = window.setTimeout(
      () => setCurrentDate(new Date()),
      tomorrow.getTime() - now.getTime() + 1000,
    );

    return () => window.clearTimeout(timeout);
  }, [currentDate]);

  useEffect(() => {
    let isMounted = true;
    if (!supabase) {
      setSyncStatus("Sync unavailable");
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
          return selected;
        });
        setSyncStatus("Synced");
        setRemoteChecked(true);
      })
      .catch(() => {
        if (isMounted) {
          setSyncStatus("Sync error");
          setRemoteChecked(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (!canEdit) {
      return;
    }

    saveLocalState(state);

    if (!supabase) {
      setSyncStatus("Sync unavailable");
      return;
    }

    if (!remoteChecked) {
      setSyncStatus("Saved locally");
      return;
    }

    let cancelled = false;
    setSyncStatus("Saved locally");
    syncRemoteState(supabase, state)
      .then(() => {
        if (!cancelled) {
          setSyncStatus("Synced");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSyncStatus("Sync error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [state, supabase, remoteChecked, canEdit, isEditPasswordConfigured]);

  const requestWriteAccess = (writeAction: () => void) => {
    setImportError("");
    setLockMessage("");
    setPasswordError("");

    if (!isEditPasswordConfigured) {
      setLockMessage("Editing locked, password not configured");
      return;
    }

    if (isUnlocked) {
      writeAction();
      return;
    }

    pendingWriteRef.current = writeAction;
    setPasswordValue("");
    setUnlockPromptOpen(true);
  };

  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (passwordValue === editPassword) {
      sessionStorage.setItem(UNLOCK_STORAGE_KEY, "true");
      setIsUnlocked(true);
      setUnlockPromptOpen(false);
      setPasswordValue("");
      setPasswordError("");
      const pendingWrite = pendingWriteRef.current;
      pendingWriteRef.current = null;
      pendingWrite?.();
      return;
    }

    setPasswordError("Incorrect password");
  };

  const lockEditing = () => {
    sessionStorage.removeItem(UNLOCK_STORAGE_KEY);
    pendingWriteRef.current = null;
    setIsUnlocked(false);
    setUnlockPromptOpen(false);
    setPasswordValue("");
    setPasswordError("");
    setLockMessage("");
  };

  const updateState = (updater: (current: ProgressState) => ProgressState) => {
    setState((current) => updater({ ...current, lastUpdated: timestamp() }));
  };

  const toggleCompleted = (day: number) => {
    requestWriteAccess(() => {
      updateState((current) => {
        const completedDays = current.completedDays.includes(day)
          ? current.completedDays.filter((value) => value !== day)
          : [...current.completedDays, day].sort((a, b) => a - b);
        return { ...current, completedDays };
      });
    });
  };

  const updateActualDistance = (day: number, value: string) => {
    requestWriteAccess(() => {
      updateState((current) => {
        const actualDistances = { ...current.actualDistances };
        const distance = Number(value);

        if (value === "" || !Number.isFinite(distance) || distance < 0) {
          delete actualDistances[day];
        } else {
          actualDistances[day] = distance;
        }

        return { ...current, actualDistances };
      });
    });
  };

  const updateFilter = (selectedFilter: Filter) => {
    requestWriteAccess(() => {
      updateState((current) => ({ ...current, selectedFilter }));
    });
  };

  const resetProgress = () => {
    requestWriteAccess(() => {
      if (
        !window.confirm(
          "Reset completed days and actual distances? This cannot be undone.",
        )
      ) {
        return;
      }
      setState({
        ...defaultProgressState(),
        lastUpdated: timestamp(),
        selectedFilter: state.selectedFilter,
      });
    });
  };

  const exportBackup = () => {
    const backup = JSON.stringify(state, null, 2);
    const blob = new Blob([backup], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `marathon-control-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = async (file: File | undefined) => {
    setImportError("");
    if (!file) {
      return;
    }

    requestWriteAccess(() => {
      void applyImportedBackup(file);
    });
  };

  const applyImportedBackup = async (file: File) => {
    try {
      const content = await file.text();
      const imported = normalizeState(JSON.parse(content));
      if (
        !window.confirm("Import this backup and overwrite current progress?")
      ) {
        return;
      }
      setState({ ...imported, lastUpdated: timestamp() });
    } catch {
      setImportError(
        "Backup import failed. Choose a valid Marathon Control JSON file.",
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <main className="min-h-screen bg-carbon text-nickel">
      <section className="mx-auto flex w-full max-w-[2200px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-10 xl:px-16 2xl:px-20">
        {" "}
        <header className="grid gap-4 border border-white/10 bg-graphite/85 p-4 shadow-insetLine md:grid-cols-[1fr_auto] md:p-6">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-steel">
              <span>21-day taper system</span>
              <span className="w-8 h-px bg-white/20" />
              <span>
                {new Date(state.lastUpdated).getTime() > 0
                  ? `Updated ${formatUpdatedAt(state.lastUpdated)}`
                  : "No edits yet"}
              </span>
              <span className="w-8 h-px bg-white/20" />
              <span
                className={
                  canEdit
                    ? "text-ember drop-shadow-[0_0_6px_rgba(214,255,0,0.45)]"
                    : "text-steel"
                }
              >
                {canEdit ? "Unlocked" : "Read-only"}
              </span>
              {canEdit && (
                <button
                  className="border border-ember/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-ember transition hover:bg-ember hover:text-black hover:shadow-neonSoft"
                  onClick={lockEditing}
                  type="button"
                >
                  Lock
                </button>
              )}
            </div>
            <div className="flex items-center gap-4">
              <img
                alt=""
                className="object-contain border h-14 w-14 shrink-0 border-white/10 sm:h-20 sm:w-20"
                src={iconUrl}
              />
              <h1 className="text-4xl font-semibold leading-none text-white uppercase sm:text-6xl">
                Marathon Control Center
              </h1>
            </div>
          </div>
          <div className="grid gap-3 p-4 border min-w-64 border-white/10 bg-black/30 shadow-neonInset">
            <div className="flex items-center justify-between gap-4 font-mono text-xs uppercase text-steel">
              <span>Progress</span>
              <span className="text-nickel transition hover:text-ember hover:drop-shadow-[0_0_7px_rgba(214,255,0,0.55)]">
                {completedCount}/21
              </span>
            </div>
            <div className="h-2 border border-white/10 bg-black shadow-[inset_0_1px_5px_rgba(0,0,0,0.85)]">
              <div
                className="h-full transition-all duration-200 ease-in-out neon-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-nickel">
              <Database className="h-4 w-4 text-ember drop-shadow-[0_0_8px_rgba(214,255,0,0.75)]" />
              {syncStatus}
            </div>
            {!isEditPasswordConfigured && (
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-steel">
                Editing locked, password not configured
              </div>
            )}
          </div>
        </header>
        {lockMessage && (
          <div className="border border-white/10 bg-black/30 p-3 font-mono text-xs uppercase tracking-[0.16em] text-steel">
            {lockMessage}
          </div>
        )}
        {unlockPromptOpen && (
          <div className="fixed inset-0 z-50 grid px-4 place-items-center bg-black/70 backdrop-blur-sm">
            <form
              className="grid w-full max-w-sm gap-4 p-5 border border-ember/50 bg-graphite shadow-neonSoft"
              onSubmit={submitPassword}
            >
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ember">
                  Editing locked
                </div>
                <h2 className="mt-2 text-xl font-semibold leading-tight text-white uppercase">
                  Enter edit password
                </h2>
              </div>
              <input
                autoFocus
                className="px-3 text-sm text-white transition-all duration-200 border outline-none h-11 border-white/10 bg-black/35 placeholder:text-steel/50 focus:border-ember focus:shadow-neonSoft"
                onChange={(event) => {
                  setPasswordValue(event.target.value);
                  setPasswordError("");
                }}
                type="password"
                value={passwordValue}
              />
              {passwordError && (
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-ember">
                  {passwordError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  className="border border-white/10 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-steel transition hover:border-white/30 hover:text-white"
                  onClick={() => {
                    pendingWriteRef.current = null;
                    setUnlockPromptOpen(false);
                    setPasswordValue("");
                    setPasswordError("");
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="border border-[#D6FF00] bg-[#D6FF00] px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-black shadow-neon transition hover:bg-[#BFFF00]"
                  type="submit"
                >
                  Unlock
                </button>
              </div>
            </form>
          </div>
        )}
        <section className="grid gap-4">
          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 2xl:grid-cols-6">
            {filters.map((filter) => (
              <button
                className={`min-h-11 border px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] transition ${
                  state.selectedFilter === filter
                    ? "border-[#D6FF00] bg-[#D6FF00] text-black shadow-[0_0_8px_rgba(214,255,0,0.6),0_0_16px_rgba(214,255,0,0.3)]"
                    : "border-white/10 bg-white/[0.03] text-steel hover:border-[#D6FF00]/80 hover:bg-[#D6FF00]/[0.04] hover:text-white hover:shadow-[0_0_6px_rgba(214,255,0,0.34),0_0_14px_rgba(214,255,0,0.18)]"
                }`}
                key={filter}
                onClick={() => updateFilter(filter)}
                type="button"
              >
                {filter}
              </button>
            ))}
          </div>

          <div className="grid w-full grid-cols-2 gap-2 p-3 text-sm border border-white/10 bg-graphite/75 shadow-neonInset sm:grid-cols-3 xl:grid-cols-9">
            <Stat label="Completed" value={completedCount} />
            <Stat
              label="Remaining"
              value={trainingPlan.length - completedCount}
            />
            <Stat label="Run days" value={runDays} />
            <Stat label="Rowing" value={rowingDays} />
            <Stat label="Rest days" value={restDays} />
            <Stat label="Gym days" value={gymDays} />
            <Stat
              label="Plan km"
              value={formatDistanceTotal(plannedDistance)}
            />
            <Stat
              label="Done km"
              value={formatDistanceTotal(completedDistance)}
            />
            <Stat label="Progress" value={`${progressPercent}%`} />
          </div>
        </section>
        <section
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          }}
        >
          {" "}
          {filteredPlan.map((day) => {
            const isCurrentDay = day.day === currentPlanDay;
            const planDate = formatPlanDate(getPlanDate(day.day));
            const isKeyLongRun = day.type
              .toLowerCase()
              .includes("key long run");
            const isRaceDay = day.type.toLowerCase() === "race day";

            return (
              <article
                className={`instrument-card group relative grid min-h-[420px] gap-4 border bg-graphite/85 p-4 shadow-insetLine ${
                  isCurrentDay
                    ? "border-ember shadow-neonSoft ring-1 ring-ember/45"
                    : isKeyLongRun || isRaceDay
                      ? "border-white/10"
                      : "border-white/10"
                } ${completedSet.has(day.day) ? "opacity-70" : ""}`}
                key={day.day}
                ref={(element) => {
                  dayRefs.current[day.day] = element;
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs uppercase tracking-[0.2em] text-steel">
                      Day {day.day.toString().padStart(2, "0")}{" "}
                      {day.label ? `/ ${day.label}` : ""}
                    </div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-steel">
                      {planDate}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <h2 className="text-xl font-semibold leading-tight text-white uppercase">
                        {day.type}
                      </h2>
                      {isCurrentDay && (
                        <span className="border border-ember bg-ember/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ember shadow-neonSoft">
                          Today
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    aria-label={`Mark day ${day.day} complete`}
                    className={`grid h-10 w-10 place-items-center border transition-all duration-200 ease-in-out ${
                      completedSet.has(day.day)
                        ? "scale-105 border-ember bg-black text-ember shadow-neon"
                        : "border-white/15 bg-black/20 text-steel hover:border-ember hover:text-ember hover:shadow-neonSoft"
                    }`}
                    onClick={() => toggleCompleted(day.day)}
                    type="button"
                  >
                    <Check
                      className={`h-5 w-5 transition-transform duration-200 ${completedSet.has(day.day) ? "scale-110 drop-shadow-[0_0_6px_rgba(214,255,0,0.75)]" : ""}`}
                    />
                  </button>
                </div>

                {(isKeyLongRun || isRaceDay) && (
                  <div className="flex items-center gap-2 border border-ember/40 bg-ember/5 px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] text-ember shadow-neonSoft">
                    {isRaceDay ? (
                      <Flag className="w-4 h-4" />
                    ) : (
                      <Activity className="w-4 h-4" />
                    )}
                    {isRaceDay ? "Race day" : "Key long run"}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Distance" value={day.distance} />
                  {day.duration ? (
                    <Metric label="Duration" value={day.duration} />
                  ) : (
                    <Metric label="Shoes" value={day.shoes ?? "none"} />
                  )}
                </div>
                {day.duration && day.shoes && (
                  <Metric label="Shoes" value={day.shoes} full />
                )}
                {day.intensity && (
                  <Metric label="Intensity" value={day.intensity} full />
                )}
                {day.notes && <Metric label="Notes" value={day.notes} full />}

                {isDistanceDay(day) && (
                  <label className="grid gap-2">
                    <span className="metric-label font-mono text-xs uppercase tracking-[0.16em] text-steel transition-colors duration-200">
                      Actual km
                    </span>
                    <input
                      className="px-3 text-sm text-white transition-all duration-200 border outline-none h-11 border-white/10 bg-black/35 placeholder:text-steel/50 focus:border-ember focus:shadow-neonSoft"
                      inputMode="decimal"
                      min="0"
                      onChange={(event) =>
                        updateActualDistance(day.day, event.target.value)
                      }
                      placeholder="0"
                      step="0.1"
                      type="number"
                      value={state.actualDistances[day.day] ?? ""}
                    />
                  </label>
                )}

                {day.rowing && (
                  <div className="p-3 transition border border-white/10 bg-black/25 group-hover:border-ember/45">
                    <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-steel">
                      <Waves className="w-4 h-4 text-ember" />
                      {day.rowingOptional ? "Optional rowing" : "Rowing"}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <MiniMetric label="Pace" value={day.rowing.intensity} />
                      <MiniMetric label="Rate" value={day.rowing.strokeRate} />
                      <MiniMetric label="Effort" value={day.rowing.effort} />
                    </div>
                  </div>
                )}

                {day.gym && (
                  <div className="p-3 transition border border-white/10 bg-black/25 group-hover:border-ember/45">
                    <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-steel">
                      <Dumbbell className="w-4 h-4 text-ember" />
                      Gym
                    </div>
                    {day.gymIntensity && (
                      <div className="mb-3 text-sm text-nickel">
                        {day.gymIntensity}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {day.gym.map((exercise) => (
                        <span
                          className="px-2 py-1 text-xs transition border border-white/10 text-nickel group-hover:border-ember/35"
                          key={`${day.day}-${exercise}`}
                        >
                          {exercise}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
        <footer className="flex flex-wrap items-center gap-3 p-4 border border-white/10 bg-graphite/80">
          <button
            className="control-button"
            onClick={resetProgress}
            type="button"
          >
            <RotateCcw className="w-4 h-4" />
            Reset progress
          </button>
          <button
            className="control-button"
            onClick={exportBackup}
            type="button"
          >
            <Download className="w-4 h-4" />
            Export backup
          </button>
          <button
            className="control-button"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Upload className="w-4 h-4" />
            Import backup
          </button>
          <input
            accept="application/json"
            className="hidden"
            onChange={(event) => void importBackup(event.target.files?.[0])}
            ref={fileInputRef}
            type="file"
          />
          {importError && (
            <p className="text-sm text-ember drop-shadow-[0_0_6px_rgba(214,255,0,0.35)]">
              {importError}
            </p>
          )}
        </footer>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="p-3 transition-all duration-200 border group border-white/10 bg-black/25 hover:border-ember/60 hover:shadow-neonSoft">
      <div className="metric-label font-mono text-[10px] uppercase tracking-[0.18em] text-steel transition-colors duration-200">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-white transition duration-200 group-hover:text-ember group-hover:drop-shadow-[0_0_7px_rgba(214,255,0,0.5)]">
        {value}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  full = false,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div
      className={`border border-white/10 bg-black/25 p-3 transition group-hover:border-ember/35 ${full ? "col-span-full" : ""}`}
    >
      <div className="metric-label font-mono text-[10px] uppercase tracking-[0.18em] text-steel transition-colors duration-200">
        {label}
      </div>
      <div className="mt-1 text-sm leading-relaxed text-nickel">{value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="metric-label flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-steel transition-colors duration-200">
        <Timer className="w-3 h-3" />
        {label}
      </div>
      <div className="mt-1 text-xs leading-relaxed text-nickel">{value}</div>
    </div>
  );
}

export default App;
