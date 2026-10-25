import type { Workspace } from "./workspace";

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
): asserts value is { revision: number; workspace: Workspace } {
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
    )
  ) {
    throw new Error("Incomplete workspace response");
  }
}
