import { useRef, useState } from "react";
import {
  ShoppingBag,
  Scale as ScaleI,
  Hand,
  ChevronRight,
  PiggyBank,
  Target,
  Zap,
  Heart,
  Download,
  HelpCircle,
  Share,
  SquarePlus,
  Check as CheckI,
  Wallet,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import {
  Blob,
  Button,
  Card,
  Logo,
  Ring,
  Say,
  Tile,
  Tube,
  useT,
  LangCtx,
  Segmented,
  rangeLabel,
} from "./ui";
import { INCOME_RANGES, SAVINGS_RANGES, profileTubes, type Profile } from "./store";
import { meetsPasswordMinimum } from "./lib/auth";
import { useContext } from "react";
import { Sheet } from "./ui";
import { usePwa } from "./pwa/Pwa";
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

export function Landing({ start }: { start: (login: boolean) => void }) {
  const t = useT();
  const pwa = usePwa();
  const [help, setHelp] = useState(false);
  // Native prompt where the browser offers one; otherwise step-by-step help.
  const openInstall = async () => {
    if (!(await pwa.install())) setHelp(true);
  };
  const H2 =({ children }: { children: string }) => (
    <h2 className="text-2xl font-semibold m-0 mb-4">{t(children)}</h2>
  );
  return (
    <div className="max-w-5xl mx-auto px-5 py-6 pt-[max(24px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-2 flex-wrap">
        <Logo />
        <b className="text-xl">SpendSense</b>
        <span className="flex-1" />
        {pwa.mode !== "installed" && (
          <Button
            className="px-3! sm:px-5!"
            aria-label={t(pwa.mode === "prompt" ? "Install app" : "How to install")}
            onClick={openInstall}
            icon={
              pwa.mode === "prompt" ? (
                <Download size={18} aria-hidden />
              ) : (
                <HelpCircle size={18} aria-hidden />
              )
            }
          >
            <span className="hidden sm:inline">
              {t(pwa.mode === "prompt" ? "Install app" : "How to install")}
            </span>
          </Button>
        )}
        <LangToggle />
        <Button variant="butter" onClick={() => start(true)}>
          {t("Log in")}
        </Button>
        {/* `!` is needed to beat the unlayered .btn display rule (same as px-0! elsewhere). */}
        <Button variant="coral" className="hidden! sm:inline-flex!" onClick={() => start(false)}>
          {t("Get started")}
        </Button>
      </header>
      {help && <InstallHelp onClose={() => setHelp(false)} />}
      <section className="grid md:grid-cols-2 gap-10 items-center py-12 md:py-20">
        <div className="rise">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight m-0">
            {t("Pause. Reflect. Decide.")}
          </h1>
          <p className="text-lg text-soft mt-4">
            {t("Context for your purchases. The decision stays yours.")}
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Button variant="coral" big onClick={() => start(false)}>
              {t("Get started")}
            </Button>
            <Button
              big
              onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}
            >
              {t("See how it works")}
            </Button>
          </div>
          {pwa.mode !== "installed" && (
            // On phones the header install control is icon-only, so testers
            // missed it. This labelled card makes installation visible there.
            <section
              aria-label={t("Use SpendSense like an app")}
              className="sm:hidden mt-6 clay-cream rounded-tile p-4 grid gap-3"
            >
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-inner clay-sun flex items-center justify-center shrink-0">
                  <Smartphone size={20} aria-hidden />
                </span>
                <div className="min-w-0">
                  <b className="f-ui block">{t("Use SpendSense like an app")}</b>
                  <p className="m-0 text-sm text-soft">
                    {t("Add it to your home screen for one-tap, full-screen access.")}
                  </p>
                </div>
              </div>
              <Button
                className="w-full justify-center"
                onClick={openInstall}
                icon={
                  pwa.mode === "prompt" ? (
                    <Download size={18} aria-hidden />
                  ) : (
                    <HelpCircle size={18} aria-hidden />
                  )
                }
              >
                {t(pwa.mode === "prompt" ? "Install app" : "How to install")}
              </Button>
            </section>
          )}
        </div>
        <Card className="flex flex-col gap-4">
          <Say expr="wave" size={96}>
            {t("Here's the context. It's your call.")}
          </Say>
          <div className="flex gap-4 items-center">
            <Ring value={68} size={110} label={t("Example fit {n}", { n: 68 })} />
            <div className="flex-1 grid gap-2">
              {["Budget fit", "Need level", "Goal impact", "Impulse signals"].map((c, i) => (
                <Tube key={c} label={t(c)} value={[84, 64, 28, 36][i]} />
              ))}
            </div>
          </div>
          <p className="f-ui text-xs text-soft m-0">{t("Example preview")}</p>
        </Card>
      </section>
      <section id="how" className="py-6">
        <H2>See how it works</H2>
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {(
            [
              ["Add a purchase", ShoppingBag],
              ["See your context", ScaleI],
              ["You decide", Hand],
            ] as const
          ).map(([l, I], i) => (
            <div key={l} className="contents">
              <Card className="flex-1 flex items-center gap-3">
                <span className="w-12 h-12 rounded-inner clay-sun flex items-center justify-center">
                  <I size={22} aria-hidden />
                </span>
                <b className="f-ui text-lg">{t(l)}</b>
              </Card>
              {i < 2 && <ChevronRight className="hidden md:block text-soft shrink-0" aria-hidden />}
            </div>
          ))}
        </div>
      </section>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 py-6">
        {(
          [
            ["Track money", Wallet],
            ["Budget fit", PiggyBank],
            ["Goal impact", Target],
            ["Impulse check", Zap],
          ] as const
        ).map(([l, I]) => (
          <Card key={l} className="flex flex-col items-center text-center gap-2">
            <I size={26} aria-hidden />
            <span className="f-ui">{t(l)}</span>
          </Card>
        ))}
      </section>
      <p className="f-ui text-soft py-4 flex flex-wrap justify-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-1">
          <Heart size={16} aria-hidden />
          {t("No judgment")}
        </span>
        <span className="flex items-center gap-1">
          <Hand size={16} aria-hidden />
          {t("You stay in control")}
        </span>
        <span className="flex items-center gap-1">
          <ShieldCheck size={16} aria-hidden />
          {t("Your data stays private")}
        </span>
      </p>
      <section className="clay-butter rounded-card p-8 my-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold m-0">{t("Ready to start?")}</h2>
        <Button variant="coral" big onClick={() => start(false)}>
          {t("Get started")}
        </Button>
      </section>
      <footer className="f-ui text-sm text-soft flex items-center gap-2 py-4">
        <Logo size={24} />
        SpendSense · {t("HCI prototype")}
      </footer>
    </div>
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
  const [errField, setErrField] = useState<"email" | "password" | "form" | null>(null);
  // Account step sub-views: the form, "check your email", or password reset request.
  const [view, setView] = useState<"form" | "confirm" | "forgot">(authView);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const register = authMode === "register";
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  // Signed-out users only see the welcome/account steps; the rest follow sign-in.
  const last = authenticated ? 8 : 1;
  const total = last - startAt + 1;
  const next = async () => {
    if (busy || submitting.current) return;
    if (s === 1) {
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
        const response = await onAuthenticate?.(p.email.trim(), pw, authMode);
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
        <div className="flex-1">
          {total > 1 && (
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
      <Say
        key={s}
        live
        expr={s === 0 ? "wave" : s === 8 ? "calm" : "thinking"}
        size={s === 0 ? 120 : 64}
      >
        {t(s === 1 ? (authVoice ?? (authMode === "login" ? "Log in" : voice)) : voice)}
      </Say>
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
            <h1 className="text-2xl font-bold m-0">
              {t(authMode === "login" ? "Log in" : "Create your account")}
            </h1>
            <p className="text-soft m-0 text-sm">
              {t("Your financial data is saved securely to your account.")}
            </p>
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
            {!register && authActions && (
              <button
                type="button"
                className="text-leaf f-ui min-h-11 justify-self-start"
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
        {err && (
          <p
            id="onboarding-error"
            role="alert"
            className="m-0 text-attn bg-butter rounded-inner px-3 py-2"
          >
            {err}
          </p>
        )}
        {notice && (
          <p role="status" className="m-0 text-soft">
            {notice}
          </p>
        )}
      </Card>
      {/* The confirmation and reset panels carry their own way back to the form. */}
      {!(s === 1 && view !== "form") && (
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
