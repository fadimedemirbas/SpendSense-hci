import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Button, Card, LangCtx, Loading, ToastHost, type Lang, useT } from "./ui";
import { emptyProfile } from "./store";
import { LangToggle, Onboarding, type AuthMode } from "./Onboarding";
import { Landing } from "./Landing";
import {
  initialAuthRedirect,
  requireSupabase,
  supabase,
  supabaseConfigurationError,
} from "./lib/supabase";
import {
  authenticateUser,
  passwordResetRedirect,
  requestPasswordReset,
  resendConfirmation,
  updatePassword,
  type AuthResult,
} from "./lib/auth";
import { ResetPassword } from "./AuthPanels";
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

export default function App() {
  const [lang, setLang] = useState<Lang>(() =>
    localStorage.getItem("ss.lang") === '"tr"' ? "tr" : "en",
  );
  // A short loading screen makes the language switch feel like a deliberate page change.
  const [switching, setSwitching] = useState(false);
  const switchLang = (next: Lang) => {
    if (next === lang) return;
    setLang(next);
    setSwitching(true);
    setTimeout(() => setSwitching(false), 700);
  };
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(Boolean(supabase));
  const [authError, setAuthError] = useState("");
  const [stage, setStage] = useState<"landing" | "onb">("landing");
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  // Keeps the typed e-mail when switching between log in and registration.
  const [authEmail, setAuthEmail] = useState("");
  const [authView, setAuthView] = useState<"form" | "forgot">("form");
  // Switching from log in to sign up goes straight to the form, skipping the welcome step.
  const [skipWelcome, setSkipWelcome] = useState(false);
  // Password recovery opened from the reset e-mail ("invalid" = expired/used link).
  const [recovery, setRecovery] = useState<"none" | "active" | "done" | "invalid">(() =>
    initialAuthRedirect.kind === "recovery"
      ? "active"
      : initialAuthRedirect.kind === "link-error" && initialAuthRedirect.recovery
        ? "invalid"
        : "none",
  );
  const [linkError] = useState(
    () => initialAuthRedirect.kind === "link-error" && !initialAuthRedirect.recovery,
  );
  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem("ss.lang", JSON.stringify(lang));
  }, [lang]);
  useEffect(() => {
    // Error links are never consumed by Supabase; clear them so a reload starts clean.
    if (initialAuthRedirect.kind === "link-error")
      history.replaceState(null, "", location.pathname);
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    let receivedAuthEvent = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (mounted) {
        if (event === "PASSWORD_RECOVERY") setRecovery("active");
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
  async function authenticate(
    email: string,
    password: string,
    mode: AuthMode,
    name?: { first: string; last: string },
  ) {
    if (supabaseConfigurationError) return { error: supabaseConfigurationError };
    try {
      return await onlineOperation(() =>
        authenticateUser(requireSupabase(), email, password, mode, window.location.origin, name),
      );
    } catch {
      return { error: "You are offline. Reconnect before signing in." };
    }
  }
  async function emailAction(action: () => Promise<AuthResult>): Promise<AuthResult> {
    if (supabaseConfigurationError) return { error: supabaseConfigurationError };
    try {
      return await onlineOperation(action);
    } catch {
      return { error: "You are offline. Reconnect and try again." };
    }
  }
  const authActions = {
    resend: (email: string) =>
      emailAction(() => resendConfirmation(requireSupabase(), email, window.location.origin)),
    requestReset: (email: string) =>
      emailAction(() =>
        requestPasswordReset(
          requireSupabase(),
          email,
          passwordResetRedirect(window.location.origin),
        ),
      ),
  };
  const leaveRecovery = () => {
    setRecovery("none");
    history.replaceState(null, "", location.pathname);
  };
  const openLogin = (view: "form" | "forgot") => {
    leaveRecovery();
    setAuthMode("login");
    setAuthView(view);
    setStage("onb");
  };
  async function cancelRecovery() {
    // Leaving the reset screen signs the recovery session out on this device only.
    if (session) {
      try {
        await onlineOperation(() => requireSupabase().auth.signOut({ scope: "local" }));
      } catch {
        return setAuthError("Could not log out. Check your connection and try again.");
      }
      setSession(null);
    }
    openLogin("form");
  }
  // A recovery link without a valid session (expired, reused or tampered) is invalid.
  const recoveryState =
    recovery === "active" ? (initializing ? "checking" : session ? "form" : "invalid") : recovery;
  async function logout() {
    try {
      const { error } = await onlineOperation(() =>
        requireSupabase().auth.signOut({ scope: "local" }),
      );
      if (error) throw error;
      setSession(null);
      setStage("landing");
      history.replaceState(null, "", "/");
      setAuthError("");
    } catch {
      setAuthError("Could not log out. Check your connection and try again.");
    }
  }
  return (
    <LangCtx.Provider value={{ lang, setLang: switchLang }}>
      {switching && (
        <div className="fixed inset-0 z-[100] bg-cream">
          <Loading text="Switching language..." />
        </div>
      )}
      <Pwa>
        <ToastHost key={session?.user.id ?? "signed-out"}>
          {authError && (
            <p role="alert" className="max-w-xl mx-auto px-5 py-3 text-danger">
              <LocalText value={authError} />
            </p>
          )}
          {linkError && !session && (
            <p role="alert" className="max-w-xl mx-auto px-5 py-3 text-attn">
              <LocalText value="This email link is invalid or has expired. Log in, or request a new link." />
            </p>
          )}
          {recovery !== "none" ? (
            <ResetPassword
              state={recoveryState as "checking" | "form" | "done" | "invalid"}
              header={<LangToggle />}
              onSave={async (password) => {
                const result = await emailAction(() => updatePassword(requireSupabase(), password));
                if (result.expired) setRecovery("invalid");
                else if (!result.error) setRecovery("done");
                return result;
              }}
              onContinue={leaveRecovery}
              onCancel={() => void cancelRecovery()}
              onRequestNew={() => openLogin("forgot")}
            />
          ) : initializing ? (
            <Loading text="Restoring your session..." />
          ) : session ? (
            <WorkspaceBoundary key={session.user.id} fallback={<LoadError />}>
              <Suspense fallback={<Loading text="Getting your data ready..." />}>
                <SignedIn key={session.user.id} session={session} logout={logout} />
              </Suspense>
            </WorkspaceBoundary>
          ) : stage === "landing" ? (
            <Landing
              start={(login) => {
                setAuthMode(login ? "login" : "register");
                setAuthView("form");
                setSkipWelcome(false);
                setStage("onb");
              }}
            />
          ) : (
            <Onboarding
              key={`${authMode}-${authView}`}
              initial={{ ...emptyProfile, habits: [], email: authEmail }}
              startAt={authMode === "login" || skipWelcome ? 1 : 0}
              authMode={authMode}
              authView={authView}
              authActions={authActions}
              onAuthenticate={authenticate}
              onAuthModeChange={(mode, email) => {
                if (email !== undefined) setAuthEmail(email);
                setAuthView("form");
                setSkipWelcome(true);
                setAuthMode(mode);
              }}
              exit={() => setStage("landing")}
              done={async () => false}
            />
          )}
        </ToastHost>
      </Pwa>
    </LangCtx.Provider>
  );
}
