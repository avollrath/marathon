import planData from '../plan.json';

export type TrainingDay = {
  day: number;
  label?: string;
  type: string;
  distance: string;
  duration?: string;
  intensity?: string;
  shoes?: string;
  notes?: string;
  gym?: string[];
  gymIntensity?: string;
  rowing?: RowingRules;
};

type RowingRules = {
  intensity: string;
  strokeRate: string;
  effort: string;
};

type PlanJsonDay = Omit<TrainingDay, 'gym'> & {
  gym?: 'standard' | string[] | null;
};

type PlanJson = {
  gymWorkout: string[];
  rules?: {
    rowing?: RowingRules;
  };
  plan: PlanJsonDay[];
};

const typedPlanData = planData as PlanJson;

export const PLAN_START_DATE = '2026-04-26';

const toLocalDate = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const getCurrentPlanDay = (date = new Date()): number | null => {
  const [year, month, day] = PLAN_START_DATE.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  const current = toLocalDate(date);
  const elapsedDays = Math.floor((current.getTime() - start.getTime()) / 86_400_000);
  const planDay = elapsedDays + 1;

  return planDay >= 1 && planDay <= typedPlanData.plan.length ? planDay : null;
};

export const trainingPlan: TrainingDay[] = typedPlanData.plan.map((day) => ({
  ...day,
  gym: day.gym === 'standard' ? typedPlanData.gymWorkout : Array.isArray(day.gym) ? day.gym : undefined,
  rowing: day.type.toLowerCase().includes('rowing') ? typedPlanData.rules?.rowing : undefined,
}));
