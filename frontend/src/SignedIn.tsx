import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  AppCtx,
  SETTINGS_SECTIONS,
  TABS,
  type Prefill,
  type SettingsSection,
  type Tab,
} from "./context";
import { setCurrencyMode, Button, Card, Dialog, Loading, useT } from "./ui";
import { uid, type Entry, type Holding, type Profile, type Purchase } from "./store";
import { Onboarding } from "./Onboarding";
import { Shell } from "./Shell";
import { Money, QuickAdd } from "./Money";
import { SavingSheet } from "./Savings";
import { Decide } from "./Decide";
import { HomePage, Goals, WaitingPage, HistoryPage, Insights } from "./Pages";
import { SettingsPage } from "./Settings";
import { useWorkspace } from "./lib/useWorkspace";
import { readShortcutPreference, writeShortcutPreference } from "./lib/keyboardShortcuts";

export default function SignedIn({
  session,
  logout,
}: {
  session: Session;
  logout: () => Promise<void>;
}) {
  const t = useT();
  // Name entered at sign up lives in the auth user's metadata.
  const meta = (session.user.user_metadata ?? {}) as { first_name?: string; full_name?: string };
  const data = useWorkspace(session.user.id, session.user.email ?? "");
  // Tabs live in the URL path (/home, /money…) so browser/OS back gestures move between screens.
  const sectionFromPath = () =>
    SETTINGS_SECTIONS.find((x) => `/settings/${x}` === location.pathname) ?? null;
  const fromPath = (): Tab =>
    sectionFromPath() ? "settings" : (TABS.find((x) => `/${x}` === location.pathname) ?? "home");
  const [tab, setTabRaw] = useState<Tab>(fromPath);
  const [settingsSection, setSettingsSection] = useState(sectionFromPath);
  const depth = useRef(0);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [quickAdd, setQuickAdd] = useState<Entry | "new" | "new-income" | null>(null);
  const [saveSheet, setSaveSheet] = useState<Holding | "new" | null>(null);
  const [tour, setTour] = useState<number | null>(null);
  const [lastCat, setLastCat] = useState("Shopping");
  const [retaking, setRetaking] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [shortcutsEnabled, setShortcutsEnabledRaw] = useState(() => {
    try {
      return readShortcutPreference(localStorage);
    } catch {
      return false;
    }
  });
  const setShortcutsEnabled = (enabled: boolean) => {
    try {
      writeShortcutPreference(localStorage, enabled);
    } catch {
      // Storage blocked: the preference still applies for this visit.
    }
    setShortcutsEnabledRaw(enabled);
  };
  setCurrencyMode(data.profile.currency);
  useEffect(() => {
    // "/" or a signed-out page like /how-it-works becomes the current tab's path.
    if (!settingsSection && location.pathname !== `/${tab}`)
      history.replaceState(null, "", `/${tab}`);
    const pop = () => {
      depth.current = Math.max(0, depth.current - 1);
      setTabRaw(fromPath());
      setSettingsSection(sectionFromPath());
      scrollTo({ top: 0 });
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  const navigate = (next: Tab, section: SettingsSection | null = null) => {
    const path = section ? `/${next}/${section}` : `/${next}`;
    if (path !== location.pathname) {
      history.pushState(null, "", path);
      depth.current++;
    }
    setTabRaw(next);
    setSettingsSection(section);
    scrollTo({ top: 0 });
  };
  const setTab = (next: Tab) => navigate(next);
  const ctx = {
    ...data,
    tab,
    setTab,
    settingsSection,
    openSettings: (section: SettingsSection | null) => navigate("settings", section),
    canGoBack: depth.current > 0,
    goBack: () => history.back(),
    prefill,
    openDecide: (purchase?: Prefill) => setPrefill(purchase ?? null),
    quickAdd,
    setQuickAdd,
    saveSheet,
    setSaveSheet,
    tour,
    setTour,
    shortcutsEnabled,
    setShortcutsEnabled,
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
  if (data.loading) return <Loading text="Getting your data ready..." />;
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
            exit={() => (retaking ? setRetaking(false) : setConfirmLogout(true))}
          />
        ) : (
          <Shell>
            {tab === "home" && <HomePage firstName={meta.first_name?.trim() || undefined} />}
            {tab === "money" && <Money />}
            {tab === "decide" && <Decide />}
            {tab === "goals" && <Goals />}
            {tab === "insights" && <Insights />}
            {tab === "waiting" && <WaitingPage />}
            {tab === "history" && <HistoryPage />}
            {tab === "settings" && (
              <SettingsPage
                name={meta.full_name?.trim() || undefined}
                reset={() =>
                  data.updateWorkspace((previous) => ({
                    ...previous,
                    entries: [],
                    goals: [],
                    waiting: [],
                    decisions: [],
                    analyses: [],
                    holdings: [],
                  }))
                }
                logout={() => void logout()}
                retake={() => setRetaking(true)}
              />
            )}
            {quickAdd && <QuickAdd key={typeof quickAdd === "string" ? quickAdd : quickAdd.id} />}
            {saveSheet && (
              <SavingSheet key={typeof saveSheet === "string" ? saveSheet : saveSheet.id} />
            )}
          </Shell>
        )}
      </fieldset>
      {confirmLogout && (
        <Dialog
          title={t("Log out?")}
          body={t("You can finish these questions the next time you log in.")}
          confirm={t("Log out")}
          onClose={() => setConfirmLogout(false)}
          onConfirm={logout}
        />
      )}
    </AppCtx.Provider>
  );
}
