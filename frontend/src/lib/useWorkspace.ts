import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { requireSupabase } from "./supabase";
import { profileTubes } from "../store";
import {
  CLIENT_PROTOCOL,
  assertLoadedWorkspace,
  normalizeLoadedWorkspace,
  prepareVersionedWorkspaceSave,
  workspaceLoadRequest,
} from "./workspaceProtocol";
import { onlineOperation } from "../pwa/network";
import {
  emptyWorkspace,
  persistenceMessage,
  type Workspace,
  type WorkspaceChange,
} from "./workspace";

export function useWorkspace(userId: string, email: string) {
  const [workspace, setWorkspace] = useState<Workspace>(() => emptyWorkspace(email));
  const current = useRef(workspace);
  const revision = useRef(0);
  const active = useRef(true);
  const ready = useRef(false);
  const loadRequest = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const saving = useRef(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (pending) return;
    ready.current = false;
    const request = ++loadRequest.current;
    setLoading(true);
    setError("");
    try {
      // Protocol 1 (TRY-only screens) or 3 (currency-aware); see workspaceProtocol.ts.
      const load = workspaceLoadRequest(CLIENT_PROTOCOL, userId);
      const { data, error: readError } = await onlineOperation(() =>
        requireSupabase().rpc(load.fn, load.args),
      );
      if (readError) throw readError;
      if (!active.current || loadRequest.current !== request) return;
      if (data !== null) assertLoadedWorkspace(data, CLIENT_PROTOCOL);
      // Legacy records without a currency are lira; normalised copies, inputs untouched.
      const loaded = data ? normalizeLoadedWorkspace(data.workspace) : emptyWorkspace(email);
      const next = { ...loaded, profile: { ...loaded.profile, email } };
      current.current = next;
      revision.current = data?.revision ?? 0;
      setWorkspace(next);
      ready.current = true;
    } catch (failure) {
      if (active.current && loadRequest.current === request) setError(persistenceMessage(failure));
    } finally {
      if (active.current && loadRequest.current === request) setLoading(false);
    }
  }, [email, pending, userId]);

  useEffect(() => {
    active.current = true;
    void reload();
    return () => {
      active.current = false;
      ready.current = false;
      loadRequest.current++;
    };
    // This hook is mounted with a user-specific React key. Token refreshes do not reload data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, email]);

  const updateWorkspace = useCallback(
    (change: WorkspaceChange): Promise<boolean> => {
      // The native disabled fieldset renders on the next tick. This synchronous
      // guard rejects a second click before then instead of queuing a duplicate.
      if (saving.current || !active.current || !ready.current) return Promise.resolve(false);
      saving.current = true;
      setPending((value) => value + 1);
      const operation = queue.current
        .then(async () => {
          if (!active.current || !ready.current) return false;
          try {
            // Refuses (WorkspaceProtocolError) before any request if the payload
            // cannot be saved without losing currency information.
            const { workspace: next, payload } = prepareVersionedWorkspaceSave(
              current.current,
              change(current.current),
              userId,
              CLIENT_PROTOCOL,
            );
            const { data, error: saveError } = await onlineOperation(() =>
              requireSupabase().rpc("spendsense_save_workspace", {
                payload: {
                  ...payload,
                  behaviorScores:
                    next.profile.habits.length === 4
                      ? Object.fromEntries(profileTubes(next.profile.habits))
                      : {},
                },
                expected_revision: revision.current,
              }),
            );
            if (saveError) throw saveError;
            if (!Number.isSafeInteger(data) || data < 0) {
              throw new Error("Invalid workspace revision response");
            }
            if (!active.current) return false;
            current.current = next;
            revision.current = data;
            setWorkspace(next);
            setError("");
            return true;
          } catch (failure) {
            if (active.current) {
              ready.current = false;
              setError(persistenceMessage(failure));
            }
            return false;
          }
        })
        .finally(() => {
          saving.current = false;
          if (active.current) setPending((value) => value - 1);
        });
      queue.current = operation;
      return operation;
    },
    [userId],
  );

  function setter<K extends keyof Workspace>(key: K) {
    return (action: SetStateAction<Workspace[K]>) =>
      updateWorkspace((previous) => ({
        ...previous,
        [key]:
          typeof action === "function"
            ? (action as (value: Workspace[K]) => Workspace[K])(previous[key])
            : action,
      }));
  }

  return {
    ...workspace,
    loading,
    pending,
    error,
    reload,
    updateWorkspace,
    setEntries: setter("entries"),
    setGoals: setter("goals"),
    setWaiting: setter("waiting"),
    setDecisions: setter("decisions"),
    setProfile: setter("profile"),
  };
}
