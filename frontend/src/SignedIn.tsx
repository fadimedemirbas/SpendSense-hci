import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AppCtx, type Tab, type Prefill } from "./context";
import { setCurrencyMode, Button, Card, useT } from "./ui";
import { uid, type Entry, type Profile, type Purchase } from "./store";
import { Onboarding } from "./Onboarding";
import { Shell } from "./Shell";
import { Money, QuickAdd } from "./Money";
import { Decide } from "./Decide";
import { HomePage, Goals, WaitingPage, HistoryPage, Insights, SettingsPage } from "./Pages";
import { useWorkspace } from "./lib/useWorkspace";

export default function SignedIn({
  session,
  logout,
}: {
  session: Session;
  logout: () => Promise<void>;
}) {
  const t = useT();
  const data = useWorkspace(session.user.id, session.user.email ?? "");
  const [tab, setTabRaw] = useState<Tab>("home");
  const history = useRef<Tab[]>([]);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [quickAdd, setQuickAdd] = useState<Entry | "new" | "new-income" | null>(null);
  const [tour, setTour] = useState<number | null>(null);
  const [lastCat, setLastCat] = useState("Shopping");
  const [retaking, setRetaking] = useState(false);
  setCurrencyMode(data.profile.currency);
  const setTab = (next: Tab) => {
    if (next !== tab) history.current.push(tab);
    setTabRaw(next);
    scrollTo({ top: 0 });
  };
  const ctx = {
    ...data,
    tab,
    setTab,
    canGoBack: history.current.length > 0,
    goBack: () => {
      setTabRaw(history.current.pop() ?? "home");
      scrollTo({ top: 0 });
    },
    prefill,
    openDecide: (purchase?: Prefill) => setPrefill(purchase ?? null),
    quickAdd,
    setQuickAdd,
    tour,
    setTour,
    lastCat,
    setLastCat,
    recordAnalysis: async (
      purchase: Purchase,
      result: Record<string, unknown>,
      goalId?: string,
    ) => {
      const id = uid();
      const saved = await data.updateWorkspace((previous) => ({
        ...previous,
        analyses: [
          ...previous.analyses,
          { id, purchase, result, goalId, createdAt: new Date().toISOString() },
        ],
      }));
      return saved ? id : null;
    },
  };
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      document.getElementById("main-content")?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [tab, data.loading]);
  if (data.loading)
    return (
      <div className="max-w-xl mx-auto px-5 py-6">
        <Card>
          <p role="status">{t("Loading your SpendSense data...")}</p>
        </Card>
      </div>
    );
  if (data.error)
    return (
      <div className="max-w-xl mx-auto px-5 py-6">
        <Card>
          <p role="alert">{t(data.error)}</p>
          <div className="flex gap-3 flex-wrap">
            <Button disabled={data.pending > 0} onClick={() => void data.reload()}>
              {t("Reload my data")}
            </Button>
            <Button onClick={() => void logout()}>{t("Log out")}</Button>
          </div>
        </Card>
      </div>
    );
  const finish = async (profile: Profile) => {
    const saved = await data.setProfile(profile);
    if (saved) {
      setRetaking(false);
      setTab("home");
      if (!data.profile.onboarded) setTour(0);
    }
    return saved;
  };
  return (
    <AppCtx.Provider value={ctx}>
      {data.pending > 0 && (
        <p role="status" className="sr-only">
          {t("Saving your changes…")}
        </p>
      )}
      <fieldset disabled={data.pending > 0} className="contents" aria-busy={data.pending > 0}>
        {!data.profile.onboarded || retaking ? (
          <Onboarding
            initial={data.profile}
            startAt={retaking ? 4 : 2}
            authenticated
            done={finish}
            exit={() => (retaking ? setRetaking(false) : void logout())}
          />
        ) : (
          <Shell>
            {tab === "home" && <HomePage />}
            {tab === "money" && <Money />}
            {tab === "decide" && <Decide />}
            {tab === "goals" && <Goals />}
            {tab === "insights" && <Insights />}
            {tab === "waiting" && <WaitingPage />}
            {tab === "history" && <HistoryPage />}
            {tab === "settings" && (
              <SettingsPage
                reset={() =>
                  data.updateWorkspace((previous) => ({
                    ...previous,
                    entries: [],
                    goals: [],
                    waiting: [],
                    decisions: [],
                    analyses: [],
                  }))
                }
                logout={() => void logout()}
                retake={() => setRetaking(true)}
              />
            )}
            {quickAdd && <QuickAdd key={typeof quickAdd === "string" ? quickAdd : quickAdd.id} />}
          </Shell>
        )}
      </fieldset>
    </AppCtx.Provider>
  );
}
