import {
  Utensils,
  Bus,
  ShoppingBag,
  Receipt,
  Ticket,
  HeartPulse,
  Home,
  CircleDot,
  Briefcase,
  Laptop,
  Gift,
  type LucideIcon,
} from "lucide-react";
export type EType = "income" | "expense";
export interface Entry {
  id: string;
  type: EType;
  amount: number;
  cat: string;
  name: string;
  date: string;
}
export type GStatus = "Active" | "Completed" | "Archived";
export interface Goal {
  id: string;
  name: string;
  target: number;
  saved: number;
  date?: string;
  status: GStatus;
}
export type WaitLen = "24h" | "3d" | "1w";
export interface Purchase {
  name: string;
  price: number;
  cat: string;
  reasons: string[];
  feeling: string;
  own: boolean;
  usable?: boolean;
  wait: WaitLen;
}
export type DecisionKind = "Buy" | "Wait" | "Skip";
export interface Decision extends Purchase {
  analysisId?: string;
  id: string;
  decision: DecisionKind;
  date: string;
  fit: number;
  reflection?: number;
}
export interface Waiting extends Purchase {
  analysisId?: string;
  id: string;
  added: string;
  review: string;
  fit: number;
}
export interface Profile {
  email: string;
  income: number;
  savings: number;
  habits: number[];
  onboarded: boolean;
  currency: "symbol" | "code";
}

export const EXP_CATS: [string, LucideIcon][] = [
  ["Food", Utensils],
  ["Transport", Bus],
  ["Shopping", ShoppingBag],
  ["Bills", Receipt],
  ["Fun", Ticket],
  ["Health", HeartPulse],
  ["Home", Home],
  ["Other", CircleDot],
];
export const INC_CATS: [string, LucideIcon][] = [
  ["Salary", Briefcase],
  ["Side income", Laptop],
  ["Gift", Gift],
  ["Other", CircleDot],
];
export const catIcon = (t: EType, c: string) =>
  (t === "income" ? INC_CATS : EXP_CATS).find((x) => x[0] === c)?.[1] ?? CircleDot;
export const INCOME_RANGES = ["<₺15k", "₺15–30k", "₺30–50k", "₺50–80k", ">₺80k"],
  INCOME_MID = [10000, 22500, 40000, 65000, 95000];
export const SAVINGS_RANGES = ["None", "<₺2k", "₺2–5k", "₺5–10k", ">₺10k"],
  SAVINGS_MID = [0, 1000, 3500, 7500, 12500];
export const WAIT_DAYS: Record<WaitLen, number> = { "24h": 1, "3d": 3, "1w": 7 };

const d = (n: number) => {
  const x = new Date();
  x.setDate(x.getDate() - n);
  return x.toISOString().slice(0, 10);
};
export const uid = () => crypto.randomUUID();
export const today = () => d(0);
export const addDays = (iso: string, n: number) => {
  const x = new Date(iso);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};
export const emptyProfile: Profile = {
  email: "",
  income: 1,
  savings: 2,
  habits: [],
  onboarded: false,
  currency: "symbol",
};

const clamp = (v: number) => Math.max(0, Math.min(25, Math.round(v)));
export const level = (v: number) => (v >= 17 ? "High" : v >= 9 ? "Medium" : "Low");
export function analyze(p: Purchase, prof: Profile, goal?: Goal) {
  const income = INCOME_MID[prof.income],
    savings = SAVINGS_MID[prof.savings];
  const budget = clamp(25 - (p.price / income) * 70);
  const r = (k: string) => p.reasons.includes(k);
  const need = clamp(
    8 +
      (r("need") ? 12 : 0) +
      (r("easier") ? 6 : 0) +
      (r("wanted") ? 3 : 0) +
      (!p.own ? 4 : 0) -
      (p.own && p.usable ? 7 : 0),
  );
  const remaining = goal ? Math.max(0, goal.target - goal.saved) : 0;
  const goalImpact = remaining > 0 ? clamp((p.price / remaining) * 60) : 0;
  const impulse = clamp(
    3 +
      ["sale", "attention", "reward", "social"].filter(r).length * 5 +
      (["Excited", "Stressed", "Bored", "Tired"].includes(p.feeling) ? 5 : 0) +
      (p.wait === "24h" ? 2 : 0),
  );
  const fit = budget + need + (25 - goalImpact) + (25 - impulse);
  return {
    budget,
    need,
    goalImpact,
    impulse,
    fit,
    income,
    pctIncome: Math.round((p.price / income) * 100),
    pctGoal: remaining ? Math.round((p.price / remaining) * 100) : null,
    delayDays: savings > 0 ? Math.round(p.price / (savings / 30)) : null,
    goal,
  };
}
export function profileTubes(h: number[]) {
  const [a = 1, b = 1, c = 1, s = 1] = h;
  return [
    ["Impulsive Decision Maker", [70, 20, 30][a]],
    ["Planned Spender", [30, 75, 55][a]],
    ["Bargain Hunter", [80, 50, 20][b] + (a === 2 ? 10 : 0)],
    ["Reward-Driven Spender", [75, 45, 15][c]],
    ["Social Spender", [70, 40, 15][s]],
  ] as [string, number][];
}
