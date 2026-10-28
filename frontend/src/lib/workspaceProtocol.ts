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
  protocol: ClientProtocol = 1,
): asserts value is { revision: number; workspace: LoadedWorkspace } {
  if (!value || typeof value !== "object") throw new Error("Invalid workspace response");
  const envelope = value as { revision?: number; workspace?: Workspace; protocol?: unknown };
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
    ) ||
    !matchesProtocol(envelope as { protocol?: unknown; workspace: Workspace }, protocol)
  ) {
    throw new Error("Incomplete workspace response");
  }
}

/* ---------- client protocols ---------- */

/**
 * What this client can SHOW, which the database uses to decide what it may load
 * and save (migration 202610280001):
 * - 1: TRY-only screens. Loads spendsense_load_workspace(uuid), which returns the
 *   original lira response and refuses (0A000) accounts holding USD/EUR records;
 *   saves schemaVersion 1 with TRY only.
 * - 3: currency-aware screens. Loads spendsense_load_workspace_v3(uuid, 3) with
 *   explicit currencies; saves schemaVersion 3 with a currency on every record.
 * Storage support alone is not enough: a build may claim 3 only together with
 * screens that show USD/EUR correctly (Phase 5).
 */
export type ClientProtocol = 1 | 3;
export const CLIENT_PROTOCOL: ClientProtocol = 1;

/** The load RPC for a protocol. Anything else fails before a request is made. */
export function workspaceLoadRequest(protocol: number, userId: string) {
  if (protocol === 1)
    return { fn: "spendsense_load_workspace", args: { expected_user_id: userId } };
  if (protocol === 3)
    return {
      fn: "spendsense_load_workspace_v3",
      args: { expected_user_id: userId, client_protocol: 3 },
    };
  throw new WorkspaceProtocolError("SS_PROTOCOL_UNSUPPORTED", "Unsupported client protocol.");
}

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

/** Every monetary currency in a loaded workspace, including goal snapshots in analyses. */
function loadedCurrencies(workspace: Workspace): unknown[] {
  return [
    ...workspace.entries.map((entry) => entry.currency),
    ...workspace.goals.map((goal) => goal.currency),
    ...workspace.decisions.map((decision) => decision.currency),
    ...workspace.waiting.map((item) => item.currency),
    ...workspace.analyses.flatMap((analysis) => [
      analysis.purchase?.currency,
      (analysis.result?.goal as { currency?: unknown } | undefined)?.currency,
    ]),
  ];
}

/**
 * Protocol 1 must never accept foreign amounts, even if a server sent them: a
 * TRY-only screen would show them as lira. Protocol 3 requires the v3 response
 * marker and explicit currencies on the profile, entries and goals.
 */
function matchesProtocol(
  envelope: { protocol?: unknown; workspace: Workspace },
  protocol: ClientProtocol,
): boolean {
  const { workspace } = envelope;
  if (protocol === 1)
    return loadedCurrencies(workspace).every(
      (currency) => currency === undefined || currency === "TRY",
    );
  return (
    envelope.protocol === 3 &&
    isCurrency(workspace.profile.displayCurrency) &&
    [...workspace.entries, ...workspace.goals].every((record) => isCurrency(record.currency))
  );
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
 * prepareWorkspaceSave and then applies the database contract for the client
 * protocol. Every entry, goal and purchase and the profile's displayCurrency must
 * carry a valid currency; nothing is filled in here, so a missing value is a bug
 * that fails the save instead of being saved as lira.
 * - 3: schemaVersion 3.
 * - 1: schemaVersion 1, allowed only while everything is TRY. Anything else is
 *   refused, never stripped or downgraded, so currency information is not lost.
 * - anything else: refused.
 */
export function prepareVersionedWorkspaceSave(
  previous: Workspace,
  next: Workspace,
  ownerId: string,
  protocol: number,
) {
  if (protocol !== 1 && protocol !== 3)
    throw new WorkspaceProtocolError("SS_PROTOCOL_UNSUPPORTED", "Unsupported client protocol.");
  const prepared = prepareWorkspaceSave(previous, next, ownerId);
  const { workspace } = prepared;
  const values = currencies(workspace);
  const display = workspace.profile.displayCurrency;
  if (!values.every(isCurrency) || !isCurrency(display))
    throw new WorkspaceProtocolError(
      "SS_CURRENCY_CONTRACT",
      "Every amount needs a valid currency before saving.",
    );
  if (protocol === 3)
    return { workspace, payload: { ...prepared.payload, schemaVersion: 3 as const } };
  if (display !== "TRY" || values.some((currency) => currency !== "TRY"))
    throw new WorkspaceProtocolError(
      "SS_PROTOCOL_UNSUPPORTED",
      "This app version can only save TRY amounts.",
    );
  return { workspace, payload: { ...prepared.payload, schemaVersion: 1 as const } };
}
