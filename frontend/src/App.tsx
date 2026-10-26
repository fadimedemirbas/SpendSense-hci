import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Button, Card, LangCtx, ToastHost, type Lang, useT } from "./ui";
import { emptyProfile } from "./store";
import { Landing, Onboarding, type AuthMode } from "./Onboarding";
import { requireSupabase, supabase, supabaseConfigurationError } from "./lib/supabase";
import { authenticateUser } from "./lib/auth";
import { Pwa } from "./pwa/Pwa";
import { onlineOperation } from "./pwa/network";
const SignedIn = lazy(() => import("./SignedIn"));
class WorkspaceBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function LoadError() {
  const t = useT();
  return (
    <div className="max-w-xl mx-auto px-5 py-6">
      <Card>
        <p role="alert">{t("This screen could not load. Reconnect and reload SpendSense.")}</p>
        <p>{t("Reloading discards unsaved inputs. Saved information stays in your account.")}</p>
        <Button onClick={() => location.reload()}>{t("Reload my data")}</Button>
      </Card>
    </div>
  );
}
function LocalText({ value }: { value: string }) {
  const t = useT();
  return <>{t(value)}</>;
}
function LoadingScreen() {
  const t = useT();
  return (
    <p role="status" className="max-w-xl mx-auto px-5 py-6">
      {t("Loading your SpendSense data...")}
    </p>
  );
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() =>
    localStorage.getItem("ss.lang") === '"tr"' ? "tr" : "en",
  );
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(Boolean(supabase));
  const [authError, setAuthError] = useState("");
  const [stage, setStage] = useState<"landing" | "onb">("landing");
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem("ss.lang", JSON.stringify(lang));
  }, [lang]);
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    let receivedAuthEvent = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        receivedAuthEvent = true;
        setSession(nextSession);
        if (nextSession) setAuthError("");
        setInitializing(false);
      }
    });
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted || receivedAuthEvent) return;
        if (error) setAuthError("Your session could not be restored. Please log in again.");
        setSession(data.session);
        setInitializing(false);
      })
      .catch(() => {
        if (mounted) {
          setAuthError("Could not restore your session. Check your connection.");
          setInitializing(false);
        }
      });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);
  async function authenticate(email: string, password: string, mode: AuthMode) {
    if (supabaseConfigurationError) return { error: supabaseConfigurationError };
    try {
      return await onlineOperation(() =>
        authenticateUser(requireSupabase(), email, password, mode, window.location.origin),
      );
    } catch {
      return { error: "You are offline. Reconnect before signing in." };
    }
  }
  async function logout() {
    try {
      const { error } = await onlineOperation(() =>
        requireSupabase().auth.signOut({ scope: "local" }),
      );
      if (error) throw error;
      setSession(null);
      setStage("landing");
      history.replaceState(null, "", location.pathname);
      setAuthError("");
    } catch {
      setAuthError("Could not log out. Check your connection and try again.");
    }
  }
  return (
    <LangCtx.Provider value={{ lang, setLang }}>
      <Pwa>
        <ToastHost key={session?.user.id ?? "signed-out"}>
          {authError && (
            <p role="alert" className="max-w-xl mx-auto px-5 py-3 text-danger">
              <LocalText value={authError} />
            </p>
          )}
          {initializing ? (
            <p role="status" className="max-w-xl mx-auto px-5 py-6">
              <LocalText value="Restoring your session..." />
            </p>
          ) : session ? (
            <WorkspaceBoundary key={session.user.id} fallback={<LoadError />}>
              <Suspense fallback={<LoadingScreen />}>
                <SignedIn key={session.user.id} session={session} logout={logout} />
              </Suspense>
            </WorkspaceBoundary>
          ) : stage === "landing" ? (
            <Landing
              start={(login) => {
                setAuthMode(login ? "login" : "register");
                setStage("onb");
              }}
            />
          ) : (
            <Onboarding
              key={authMode}
              initial={{ ...emptyProfile, habits: [] }}
              startAt={authMode === "login" ? 1 : 0}
              authMode={authMode}
              onAuthenticate={authenticate}
              onAuthModeChange={setAuthMode}
              exit={() => setStage("landing")}
              done={async () => false}
            />
          )}
        </ToastHost>
      </Pwa>
    </LangCtx.Provider>
  );
}
