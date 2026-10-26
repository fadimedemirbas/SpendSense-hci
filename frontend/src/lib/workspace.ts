import type { Decision, Entry, Goal, Profile, Purchase, Waiting } from "../store";
import { emptyProfile } from "../store";

export interface AnalysisRecord {
  id: string;
  purchase: Purchase;
  result: Record<string, unknown>;
  goalId?: string;
  createdAt: string;
}
export interface Workspace {
  profile: Profile;
  entries: Entry[];
  goals: Goal[];
  waiting: Waiting[];
  decisions: Decision[];
  analyses: AnalysisRecord[];
}
export type WorkspaceChange = (previous: Workspace) => Workspace;
export const emptyWorkspace = (email: string): Workspace => ({
  profile: { ...emptyProfile, email, habits: [] },
  entries: [],
  goals: [],
  waiting: [],
  decisions: [],
  analyses: [],
});

export function persistenceMessage(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? error.code : "";
  if (code === "40001")
    return "Your data changed in another session. Reload your data before trying again.";
  if (code === "22023" || code === "23514")
    return "Some data was incomplete or invalid. Reload your saved data before trying again.";
  if (code === "PGRST202" || code === "42P01")
    return "The database setup is not ready. Ask your team to review and apply the SpendSense migration.";
  if (code === "42501" || code === "PGRST301")
    return "Your session could not access this data. Please sign in again.";
  return "Your changes could not be saved. Check your connection and try again. No success was recorded.";
}
