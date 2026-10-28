import { useRef, useState } from "react";
import { Download, Share, SquarePlus, Check as CheckI, ArrowLeft, Lock } from "lucide-react";
import { Button, Card, Logo, Say, Tile, Tube, useT, LangCtx, Segmented, rangeLabel } from "./ui";
import { INCOME_RANGES, SAVINGS_RANGES, profileTubes, type Profile } from "./store";
import { meetsPasswordMinimum } from "./lib/auth";
import { useContext } from "react";
import { Sheet } from "./ui";
import { ConfirmEmail, ForgotPassword, PasswordInput, PasswordRule } from "./AuthPanels";
import type { AuthResult } from "./lib/auth";

export function LangToggle() {
  const { lang, setLang } = useContext(LangCtx);
  const t = useT();
  return (
    <Segmented
      label={t("Language")}
      value={lang}
      options={[
        ["en", "EN"],
        ["tr", "TR"],
      ]}
      onChange={setLang}
    />
  );
}

// Platform hints for install guidance only; never used to block features.
const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
// Embedded browsers (Instagram, Facebook, LinkedIn, Android WebView…) cannot
// install web apps, which testers often hit when opening a shared link.
const inAppBrowser = () =>
  /FBAN|FBAV|Instagram|LinkedInApp|Snapchat|TikTok|musical_ly|Line\/|; wv\)/i.test(
    navigator.userAgent,
  );

export function InstallHelp({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [os, setOs] = useState<"ios" | "other">(isIos() ? "ios" : "other");
  const embedded = inAppBrowser();
  const steps =
    os === "ios"
      ? ([
          ["Open SpendSense in Safari.", null],
          ["Tap the Share button (in the toolbar or the ••• menu).", Share],
          ["Select “Add to Home Screen”.", SquarePlus],
          ["Keep “Open as Web App” on if shown, then tap “Add”.", CheckI],
          ["Open SpendSense from its new home screen icon.", null],
        ] as const)
      : ([
          ["Open SpendSense in Chrome, Edge or Samsung Internet.", null],
          ["Open the browser menu (⋮).", null],
          ["Tap “Install app” or “Add to Home screen”.", Download],
          ["Confirm installation.", CheckI],
        ] as const);
  return (
    <Sheet title={t("Install SpendSense")} onClose={onClose}>
      <div className="grid gap-4">
        <p className="m-0 text-soft">
          {t("Add SpendSense to your device for quick access from your home screen.")}
        </p>
        {embedded && (
          <p role="note" className="m-0 clay-butter rounded-tile p-3 font-semibold">
            {t(
              "You seem to be in an app’s built-in browser, which can’t install apps. Open this page in Safari or Chrome first.",
            )}
          </p>
        )}
        <Segmented
          label={t("Device")}
          value={os}
          onChange={setOs}
          options={[
            ["ios", "iPhone & iPad"],
            ["other", "Android & desktop"],
          ]}
        />
        <section className="clay-cream rounded-tile p-4">
          <h3 className="text-lg font-bold m-0 mb-2">
            {t(os === "ios" ? "Add to Home Screen" : "Install the app")}
          </h3>
          <ol className="m-0 p-0 list-none grid gap-2">
            {steps.map(([s, I], i) => (
              <li key={s} className="flex items-center gap-3">
                <span className="f-num w-8 h-8 rounded-full bg-sun flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="flex-1">{t(s)}</span>
                {I && <I size={18} aria-hidden className="text-soft" />}
              </li>
            ))}
          </ol>
        </section>
        <p className="m-0 text-sm text-soft">
          {t(
            os === "ios"
              ? "Don’t see it? Scroll down in the Share menu. On iOS 16.4 or later, Chrome and Edge offer it in their Share menu too."
              : "On a computer, use the install icon in the address bar. The install dialog is shown by your browser or operating system.",
          )}
        </p>
        <div className="flex justify-end">
          <Button variant="coral" onClick={onClose}>
            {t("Got it")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

// Stored score keys stay as-is (the database validates them); only the shown wording is softened.
export const TENDENCY: Record<string, string> = {
  "Impulsive Decision Maker": "Quick decisions",
  "Planned Spender": "Planning ahead",
  "Bargain Hunter": "Drawn to discounts",
  "Reward-Driven Spender": "Treating yourself",
  "Social Spender": "Influenced by friends",
};
const HABITS: [string, string[]][] = [
  ["When you see something you like…", ["Buy it soon", "Think it over", "Compare prices"]],
  ["How often do discounts tempt you?", ["Often", "Sometimes", "Rarely"]],
  ["Treating yourself after a hard day?", ["Usually", "Sometimes", "Rarely"]],
  ["How much do friends shape what you buy?", ["Quite a bit", "A little", "Not really"]],
];
export type AuthMode = "register" | "login";
export type AuthActions = {
  resend: (email: string) => Promise<AuthResult>;
  requestReset: (email: string) => Promise<AuthResult>;
};
// Google "G" mark for the (not yet connected) social sign-in button.
const GoogleMark = () => (
  <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden>
    <path
      fill="#FFC107"
      d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
    />
    <path
      fill="#FF3D00"
      d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
    />
  </svg>
);
const EMAIL = /^\S+@\S+\.\S+$/;
export function Onboarding({
  initial,
  startAt = 0,
  done,
  exit,
  authMode = "register",
  authenticated = false,
  onAuthenticate,
  onAuthModeChange,
  authActions,
  authView = "form",
}: {
  initial: Profile;
  startAt?: number;
  done: (p: Profile) => Promise<boolean>;
  exit: () => void;
  authMode?: AuthMode;
  authenticated?: boolean;
  onAuthenticate?: (
    email: string,
    password: string,
    mode: AuthMode,
    name?: { first: string; last: string },
  ) => Promise<{ error?: string; message?: string }>;
  onAuthModeChange?: (mode: AuthMode, email?: string) => void;
  authActions?: AuthActions;
  /** Opens the "Forgot password?" form directly (e.g. from an expired reset link). */
  authView?: "form" | "forgot";
}) {
  const t = useT();
  const [s, setS] = useState(startAt);
  const [p, setP] = useState<Profile>(initial);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  // Which account field the current error belongs to, for aria-invalid and focus.
  const [errField, setErrField] = useState<"name" | "email" | "password" | "form" | null>(null);
  const [first, setFirst] = useState("");
  const [lastName, setLastName] = useState("");
  const firstRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<HTMLInputElement>(null);
  // Account step sub-views: the form, "check your email", or password reset request.
  const [view, setView] = useState<"form" | "confirm" | "forgot">(authView);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const register = authMode === "register";
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // ponytail: visual only for now; Supabase sessions always persist. Wire to storage choice later.
  const [remember, setRemember] = useState(true);
  const submitting = useRef(false);
  // Signed-out users only see the welcome/account steps; the rest follow sign-in.
  const last = authenticated ? 8 : 1;
  const total = last - startAt + 1;
  const next = async () => {
    if (busy || submitting.current) return;
    if (s === 1) {
      if (register && (!first.trim() || !lastName.trim())) {
        setErrField("name");
        (first.trim() ? lastRef : firstRef).current?.focus();
        return setErr(t("Enter your first and last name."));
      }
      if (!EMAIL.test(p.email.trim())) {
        setErrField("email");
        emailRef.current?.focus();
        return setErr(t("That email looks incomplete — try name@example.com."));
      }
      if (register ? !meetsPasswordMinimum(pw) : pw.length < 1) {
        setErrField("password");
        passwordRef.current?.focus();
        return setErr(
          t(register ? "Use at least 8 characters for a new password." : "Enter your password."),
        );
      }
      setBusy(true);
      submitting.current = true;
      setErr("");
      setErrField(null);
      setNotice("");
      try {
        const response = await onAuthenticate?.(
          p.email.trim(),
          pw,
          authMode,
          register ? { first: first.trim(), last: lastName.trim() } : undefined,
        );
        if (response?.error) {
          setErr(t(response.error));
          setErrField("form");
        } else if (register && response?.message) {
          // E-mail confirmation required: replace the form with clear next steps.
          setPw("");
          setP({ ...p, email: p.email.trim() });
          setView("confirm");
        } else {
          setNotice(t(response?.message ?? "Signing in..."));
          setPw("");
        }
      } finally {
        submitting.current = false;
        setBusy(false);
      }
      return;
    }
    if (s >= 4 && s <= 7 && p.habits[s - 4] === undefined)
      return setErr(t("Pick one to continue."));
    setErr("");
    if (s === 8) {
      if (!authenticated) return setErr(t("Please log in before continuing."));
      setBusy(true);
      submitting.current = true;
      try {
        await done({ ...p, onboarded: true });
      } finally {
        submitting.current = false;
        setBusy(false);
      }
    } else setS(s + 1);
  };
  const back = () => {
    setErr("");
    setErrField(null);
    if (s === 1 && view !== "form") return setView("form");
    s === startAt ? exit() : setS(s - 1);
  };
  const clearError = () => {
    setErr("");
    setErrField(null);
  };
  const errorBox = err && (
    <p
      id="onboarding-error"
      role="alert"
      className="m-0 text-attn bg-butter rounded-inner px-3 py-2"
    >
      {err}
    </p>
  );
  const noticeBox = notice && (
    <p role="status" className="m-0 text-soft">
      {notice}
    </p>
  );
  const authVoice =
    view === "confirm" ? "Check your email" : view === "forgot" ? "Reset your password" : null;
  const errorId = err ? "onboarding-error" : "";
  const voice = [
    "Hi! I'm Blob. I'll keep you company with your money.",
    "Create your account",
    "Roughly how much comes in each month?",
    "And how much do you usually set aside?",
    ...HABITS.map((h) => h[0]),
    "A reflection of your answers, not a label. It can change anytime.",
  ][s];
  return (
    <div className="onboarding-safe max-w-xl mx-auto px-5 py-6 grid gap-5">
      <div className="flex items-center gap-3">
        {s === 1 && view === "form" && (
          <button
            type="button"
            disabled={busy}
            onClick={back}
            className="btn clay-cream min-h-11 px-4! f-ui"
          >
            <ArrowLeft size={18} aria-hidden />
            {t("Back")}
          </button>
        )}
        <div className="flex-1">
          {total > 1 && s !== 1 && (
            <>
              <p className="f-ui text-sm m-0 mb-1">
                {t("Step {n} of {t}", { n: s - startAt + 1, t: total })}
              </p>
              <div className="h-2.5 rounded-full bg-track">
                <div
                  className="h-full rounded-full bg-sun transition-all"
                  style={{ width: `${((s - startAt + 1) / total) * 100}%` }}
                />
              </div>
            </>
          )}
        </div>
        <LangToggle />
      </div>
      {!(s === 1 && view === "form") && (
        <Say
          key={s}
          live
          expr={s === 0 ? "wave" : s === 8 ? "calm" : "thinking"}
          size={s === 0 ? 120 : 64}
        >
          {t(s === 1 ? (authVoice ?? (authMode === "login" ? "Log in" : voice)) : voice)}
        </Say>
      )}
      <Card className="grid gap-3" key={"c" + s}>
        {s === 0 && (
          <>
            <h1 className="text-3xl font-bold m-0">{t("Welcome")}</h1>
            <p className="m-0 text-lg">
              {t("SpendSense gives you context. You make the decision.")}
            </p>
          </>
        )}
        {s === 1 && view === "confirm" && authActions && (
          <ConfirmEmail
            email={p.email}
            onResend={authActions.resend}
            onLogin={() => onAuthModeChange?.("login", p.email)}
            onChangeEmail={() => setView("form")}
          />
        )}
        {s === 1 && view === "forgot" && authActions && (
          <ForgotPassword
            initialEmail={p.email}
            onRequest={authActions.requestReset}
            onBack={() => setView("form")}
          />
        )}
        {s === 1 && view === "form" && (
          <form
            id="spendsense-auth"
            className="contents"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void next();
            }}
          >
            <div className="grid gap-2 justify-items-center text-center">
              <Logo size={44} alt="SpendSense" />
              <h1 className="text-3xl font-bold m-0">
                {t(authMode === "login" ? "Log in" : "Create your account")}
              </h1>
              <p className="text-soft m-0">
                {t(
                  register
                    ? "Start making calmer purchase decisions in a minute."
                    : "Welcome back. Pick up where you left off.",
                )}
              </p>
            </div>
            {register && (
              <div className="grid sm:grid-cols-2 gap-3">
                {(
                  [
                    ["First name", first, setFirst, "given-name", firstRef],
                    ["Last name", lastName, setLastName, "family-name", lastRef],
                  ] as const
                ).map(([l, v, set, ac, ref]) => (
                  <label key={l} className="grid gap-1 f-ui">
                    {t(l)}
                    <input
                      ref={ref}
                      autoComplete={ac}
                      value={v}
                      aria-invalid={(errField === "name" && !v.trim()) || undefined}
                      aria-describedby={errField === "name" ? errorId : undefined}
                      onChange={(e) => {
                        set(e.target.value);
                        if (errField === "name") clearError();
                      }}
                      className="h-13 rounded-tile border border-line bg-white px-4 font-sans"
                    />
                  </label>
                ))}
              </div>
            )}
            <label className="grid gap-1 f-ui">
              {t("Email")}
              <input
                ref={emailRef}
                type="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={errField === "email" || undefined}
                aria-describedby={errField === "email" || errField === "form" ? errorId : undefined}
                autoComplete="email"
                value={p.email}
                onChange={(e) => {
                  setP({ ...p, email: e.target.value });
                  if (errField === "email") clearError(); // no stale feedback
                }}
                className="h-13 rounded-tile border border-line bg-white px-4 font-sans"
              />
            </label>
            <PasswordInput
              label={t("Password")}
              value={pw}
              onChange={(value) => {
                setPw(value);
                if (errField === "password") clearError();
              }}
              inputRef={passwordRef}
              autoComplete={register ? "new-password" : "current-password"}
              invalid={errField === "password"}
              describedBy={
                [
                  register && "password-rule",
                  (errField === "password" || errField === "form") && errorId,
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
            />
            {register && <PasswordRule id="password-rule" value={pw} />}
            {!register && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="f-ui flex items-center gap-2 min-h-11 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-5 h-5 accent-[var(--color-leaf)]"
                  />
                  {t("Remember me")}
                </label>
                {authActions && (
                  <button
                    type="button"
                    className="text-leaf f-ui min-h-11"
                    disabled={busy}
                    onClick={() => {
                      setErr("");
                      setErrField(null);
                      setNotice("");
                      setView("forgot");
                    }}
                  >
                    {t("Forgot password?")}
                  </button>
                )}
              </div>
            )}
            {errorBox}
            {noticeBox}
            <Button
              type="submit"
              variant="coral"
              big
              disabled={busy}
              className="w-full justify-center"
            >
              {busy
                ? t(register ? "Creating account..." : "Signing in...")
                : t(register ? "Create your account" : "Log in")}
            </Button>
            <div className="flex items-center gap-3 text-sm text-soft f-ui" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              {t("or")}
              <span className="h-px flex-1 bg-line" />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                clearError();
                setNotice(t("Google sign-in is coming soon. Use your email for now."));
              }}
              className="btn clay-cream w-full justify-center min-h-12 f-ui"
            >
              <GoogleMark />
              {t("Continue with Google")}
            </button>
            {register && (
              <p className="m-0 text-xs text-soft text-center">
                {t("By creating an account, you agree to the Terms of Use and Privacy Policy.")}
              </p>
            )}
            <p className="m-0 text-sm text-soft flex items-center justify-center gap-1.5">
              <Lock size={14} aria-hidden />
              {t("Your financial data is saved securely to your account.")}
            </p>
          </form>
        )}
        {s === 1 && view === "form" && onAuthModeChange && (
          <button
            type="button"
            className="text-leaf f-ui min-h-11"
            disabled={busy}
            onClick={() => onAuthModeChange(register ? "login" : "register", p.email)}
          >
            {t(register ? "Already have an account? Log in" : "New here? Create your account")}
          </button>
        )}
        {(s === 2 || s === 3) && (
          <p className="m-0 text-sm text-soft">
            {t(
              s === 2
                ? "Used only to estimate budget fit until you add this month's income."
                : "Used only to estimate how a purchase could delay your goal.",
            )}{" "}
            {t("Not sure? Keep the selected range and change it later in Settings.")}
          </p>
        )}
        {(s === 2 || s === 3) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(s === 2 ? INCOME_RANGES : SAVINGS_RANGES).map((r, i) => (
              <Tile
                key={r}
                label={rangeLabel(t(r))}
                on={(s === 2 ? p.income : p.savings) === i}
                onClick={() => setP({ ...p, [s === 2 ? "income" : "savings"]: i })}
              />
            ))}
          </div>
        )}
        {s >= 4 && s <= 7 && (
          <div className="grid gap-2">
            {HABITS[s - 4][1].map((o, i) => (
              <Tile
                key={o}
                label={t(o)}
                on={p.habits[s - 4] === i}
                onClick={() => {
                  const h = [...p.habits];
                  h[s - 4] = i;
                  setP({ ...p, habits: h });
                }}
              />
            ))}
          </div>
        )}
        {s === 8 && (
          <>
            <h1 className="text-2xl font-bold m-0">{t("Your spending style")}</h1>
            {profileTubes(p.habits).map(([l, v]) => (
              <Tube key={l} label={t(TENDENCY[l])} value={v} color="bg-violet" />
            ))}
          </>
        )}
        {!(s === 1 && view === "form") && errorBox}
        {!(s === 1 && view === "form") && noticeBox}
      </Card>
      {/* The confirmation and reset panels carry their own way back to the form. */}
      {s !== 1 && (
        <div className="flex justify-between">
          <Button disabled={busy} onClick={back}>
            {t("Back")}
          </Button>
          <Button
            disabled={busy}
            variant="coral"
            big
            type={s === 1 ? "submit" : "button"}
            form={s === 1 ? "spendsense-auth" : undefined}
            onClick={
              s === 1
                ? undefined
                : (event) => {
                    event.preventDefault();
                    void next();
                  }
            }
          >
            {busy
              ? t(s === 1 ? (register ? "Creating account..." : "Signing in...") : "Saving...")
              : s === 8
                ? t("Let's go")
                : s === 1
                  ? t(authMode === "login" ? "Log in" : "Create your account")
                  : t("Next")}
          </Button>
        </div>
      )}
    </div>
  );
}
