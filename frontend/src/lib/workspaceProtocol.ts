import type { Decision, Entry, Goal, Profile, Purchase, Waiting } from "../store";
import { isCurrency, type Currency } from "./currency.ts";
import type { AnalysisRecord, Workspace } from "./workspace";

export const workspaceCollections = [
  "entries",
  "goals",
  "analyses",
  "decisions",
  "waiting",
] as const;

export function prepareWorkspaceSave(previous: Workspace, next: Workspace, ownerId: string) {
  const previousGoalIds = new Set(previous.goals.map((goal) => goal.id));
  const goalIds = new Set(next.goals.map((goal) => goal.id));
  // The live reference is nullable; the calculation's historical goal snapshot stays intact.
  const workspace: Workspace = {
    ...next,
    analyses: next.analyses.map((analysis) => ({
      ...analysis,
      goalId:
        analysis.goalId && previousGoalIds.has(analysis.goalId) && !goalIds.has(analysis.goalId)
          ? undefined
          : analysis.goalId,
    })),
  };
  const deletions = Object.fromEntries(
    workspaceCollections.map((key) => {
      const remaining = new Set(workspace[key].map((record) => record.id));
      return [
        key,
        previous[key].filter((record) => !remaining.has(record.id)).map((record) => record.id),
      ];
    }),
  );
  const reflected = new Set(
    workspace.decisions
      .filter((decision) => decision.reflection !== undefined)
      .map((decision) => decision.id),
  );
  deletions.reflections = previous.decisions
    .filter((decision) => decision.reflection !== undefined && !reflected.has(decision.id))
    .map((decision) => decision.id);
  return { workspace, payload: { ...workspace, ownerId, schemaVersion: 1, deletions } };
}

export function assertLoadedWorkspace(
  value: unknown,
): asserts value is { revision: number; workspace: LoadedWorkspace } {
  if (!value || typeof value !== "object") throw new Error("Invalid workspace response");
  const envelope = value as { revision?: number; workspace?: Workspace };
  if (
    !Number.isSafeInteger(envelope.revision) ||
    envelope.revision! < 0 ||
    !envelope.workspace ||
    !workspaceCollections.every((key) => Array.isArray(envelope.workspace![key])) ||
    !envelope.workspace.profile ||
    !Array.isArray(envelope.workspace.profile.habits) ||
    !Number.isInteger(envelope.workspace.profile.income) ||
    envelope.workspace.profile.income < 0 ||
    envelope.workspace.profile.income > 4 ||
    !Number.isInteger(envelope.workspace.profile.savings) ||
    envelope.workspace.profile.savings < 0 ||
    envelope.workspace.profile.savings > 4 ||
    typeof envelope.workspace.profile.onboarded !== "boolean" ||
    !["symbol", "code"].includes(envelope.workspace.profile.currency) ||
    ![0, 4].includes(envelope.workspace.profile.habits.length) ||
    envelope.workspace.profile.habits.some(
      (answer) => !Number.isInteger(answer) || answer < 0 || answer > 2,
    ) ||
    (envelope.workspace.profile.onboarded && envelope.workspace.profile.habits.length !== 4) ||
    !workspaceCollections.every((key) =>
      envelope.workspace![key].every((record) => record && typeof record.id === "string"),
    ) ||
    // Currency fields are optional (legacy data is TRY) but must be valid when present.
    !optionalCurrency(envelope.workspace.profile.displayCurrency) ||
    ![
      ...envelope.workspace.entries,
      ...envelope.workspace.goals,
      ...envelope.workspace.decisions,
      ...envelope.workspace.waiting,
    ].every((record) => optionalCurrency(record.currency)) ||
    !envelope.workspace.analyses.every(
      (analysis) =>
        analysis.purchase === undefined ||
        (typeof analysis.purchase === "object" &&
          analysis.purchase !== null &&
          optionalCurrency(analysis.purchase.currency)),
    )
  ) {
    throw new Error("Incomplete workspace response");
  }
}

/* ---------- multi-currency protocol (schemaVersion 2) ---------- */

type Legacy<T extends { currency: Currency }> = Omit<T, "currency"> & { currency?: Currency };
/** A workspace as the database returns it: legacy records may lack currency fields. */
export interface LoadedWorkspace {
  profile: Omit<Profile, "displayCurrency"> & { displayCurrency?: Currency };
  entries: Legacy<Entry>[];
  goals: Legacy<Goal>[];
  waiting: Legacy<Waiting>[];
  decisions: Legacy<Decision>[];
  analyses: (Omit<AnalysisRecord, "purchase"> & { purchase: Legacy<Purchase> })[];
}

const optionalCurrency = (value: unknown) => value === undefined || isCurrency(value);

/**
 * Which database contract served a load. Migration 202610280001 always returns
 * profile.displayCurrency, so its presence is a reliable capability signal that
 * needs no extra request. A missing profile (new account) reveals nothing.
 */
export type ServerProtocol = "v1" | "v2" | "unknown";
export function detectServerProtocol(
  data: { workspace: LoadedWorkspace } | null | undefined,
): ServerProtocol {
  if (!data) return "unknown";
  return data.workspace.profile.displayCurrency === undefined ? "v1" : "v2";
}

function withCurrency<T extends { currency?: Currency }>(record: T): T & { currency: Currency } {
  return { ...record, currency: record.currency ?? "TRY" };
}

/**
 * Loading boundary: records saved before multi-currency support are lira, so a
 * missing currency becomes "TRY". Returns new objects (inputs are not mutated);
 * amounts, IDs, dates and analysis results are carried over unchanged.
 */
export function normalizeLoadedWorkspace(loaded: LoadedWorkspace): Workspace {
  return {
    profile: { ...loaded.profile, displayCurrency: loaded.profile.displayCurrency ?? "TRY" },
    entries: loaded.entries.map(withCurrency),
    goals: loaded.goals.map(withCurrency),
    waiting: loaded.waiting.map(withCurrency),
    decisions: loaded.decisions.map(withCurrency),
    analyses: loaded.analyses.map((analysis) =>
      analysis.purchase ? { ...analysis, purchase: withCurrency(analysis.purchase) } : analysis,
    ) as Workspace["analyses"],
  };
}

export type ProtocolErrorCode = "SS_CURRENCY_CONTRACT" | "SS_PROTOCOL_UNSUPPORTED";
/** A save refused in the browser before any request; nothing was sent or changed. */
export class WorkspaceProtocolError extends Error {
  readonly code: ProtocolErrorCode;
  constructor(code: ProtocolErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** Every amount-bearing record, with its currency as given (no defaults applied). */
function currencies(workspace: Workspace): unknown[] {
  return [
    ...workspace.entries.map((entry) => entry.currency),
    ...workspace.goals.map((goal) => goal.currency),
    ...workspace.analyses.map((analysis) => analysis.purchase?.currency),
    ...workspace.decisions.map((decision) => decision.currency),
    ...workspace.waiting.map((item) => item.currency),
  ];
}

/**
 * The save used by the app. Builds the same deletion intent as
 * prepareWorkspaceSave and then applies the database contract:
 * - "v2" server: schemaVersion 2; every entry, goal and purchase and the profile's
 *   displayCurrency must carry a valid currency. Nothing is filled in here: a
 *   missing value is a bug and fails the save instead of being saved as lira.
 * - "v1" or "unknown" server: schemaVersion 1, allowed only while everything is
 *   TRY (version 1 means lira). Anything else is refused, never stripped or
 *   downgraded, so currency information cannot be lost on an older database.
 */
export function prepareVersionedWorkspaceSave(
  previous: Workspace,
  next: Workspace,
  ownerId: string,
  server: ServerProtocol,
) {
  const prepared = prepareWorkspaceSave(previous, next, ownerId);
  const { workspace } = prepared;
  const values = currencies(workspace);
  const display = workspace.profile.displayCurrency;
  if (!values.every(isCurrency) || !isCurrency(display))
    throw new WorkspaceProtocolError(
      "SS_CURRENCY_CONTRACT",
      "Every amount needs a valid currency before saving.",
    );
  if (server === "v2")
    return { workspace, payload: { ...prepared.payload, schemaVersion: 2 as const } };
  if (display !== "TRY" || values.some((currency) => currency !== "TRY"))
    throw new WorkspaceProtocolError(
      "SS_PROTOCOL_UNSUPPORTED",
      "This database cannot store non-TRY amounts yet.",
    );
  return { workspace, payload: { ...prepared.payload, schemaVersion: 1 as const } };
}
