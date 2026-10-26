import { createContext, useContext, type SetStateAction } from "react";
import type { WorkspaceChange } from "./lib/workspace";
import type { Entry, Goal, Waiting, Decision, Profile, Purchase } from "./store";
export const TABS = [
  "home",
  "money",
  "decide",
  "goals",
  "insights",
  "waiting",
  "history",
  "settings",
] as const;
export type Tab = (typeof TABS)[number];
type S<T> = (value: SetStateAction<T>) => Promise<boolean>;
export type Prefill = Partial<Purchase> & {
  waitId?: string;
  review?: boolean;
  analysisId?: string;
};
export interface AppState {
  updateWorkspace: (change: WorkspaceChange) => Promise<boolean>;
  recordAnalysis: (
    purchase: Purchase,
    result: Record<string, unknown>,
    goalId?: string,
  ) => Promise<string | null>;
  tab: Tab;
  setTab: (t: Tab) => void;
  goBack: () => void;
  canGoBack: boolean;
  entries: Entry[];
  setEntries: S<Entry[]>;
  goals: Goal[];
  setGoals: S<Goal[]>;
  waiting: Waiting[];
  setWaiting: S<Waiting[]>;
  decisions: Decision[];
  setDecisions: S<Decision[]>;
  profile: Profile;
  setProfile: S<Profile>;
  prefill: Prefill | null;
  openDecide: (p?: Prefill) => void;
  quickAdd: Entry | "new" | "new-income" | null;
  setQuickAdd: (e: Entry | "new" | "new-income" | null) => void;
  tour: number | null;
  setTour: (n: number | null) => void;
  lastCat: string;
  setLastCat: (c: string) => void;
}
export const AppCtx = createContext<AppState>(null!);
export const useApp = () => useContext(AppCtx);
