import type { Decision, Entry, Goal, Profile, Purchase, Waiting } from "../store";
import { emptyProfile } from "../store.ts";

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

// Shown (and translated) by the existing error display; no SQL or server detail.
export const UPDATE_REQUIRED_MESSAGE =
  "A newer version of the app is available. Please update the app to keep your data safe.";
export const CURRENCY_UNSUPPORTED_MESSAGE =
  "Saving USD or EUR amounts is not available yet. Your data was not changed.";

export function persistenceMessage(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? error.code : "";
  // 0A000: the database refused a TRY-only (protocol 1) load or save because the
  // account holds USD/EUR records that this app version cannot show correctly.
  if (code === "0A000") return UPDATE_REQUIRED_MESSAGE;
  if (code === "SS_PROTOCOL_UNSUPPORTED") return CURRENCY_UNSUPPORTED_MESSAGE;
  if (code === "SS_CURRENCY_CONTRACT")
    return "Some data was incomplete or invalid. Reload your saved data before trying again.";
  if (code === "40001")
    return "Your data changed in another session. Reload your data before trying again.";
  if (code === "22023" || code === "23514")
    return "Some data was incomplete or invalid. Reload your saved data before trying again.";
  // PGRST202 / 42883: the RPC does not exist (for example the currency migration
  // is not applied yet); 42P01: a table is missing.
  if (code === "PGRST202" || code === "42883" || code === "42P01")
    return "The database setup is not ready. Ask your team to review and apply the SpendSense migration.";
  if (code === "42501" || code === "PGRST301")
    return "Your session could not access this data. Please sign in again.";
  return "Your changes could not be saved. Check your connection and try again. No success was recorded.";
}
