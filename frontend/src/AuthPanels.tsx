import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Circle, Eye, EyeOff, KeyRound, MailCheck } from "lucide-react";
import { Button, Card, Say, useT } from "./ui";
import {
  meetsPasswordMinimum,
  PASSWORD_MIN_LENGTH,
  RESEND_COOLDOWN_SECONDS,
  type AuthResult,
} from "./lib/auth";

const EMAIL = /^\S+@\S+\.\S+$/;
const field = "h-13 rounded-tile border border-line bg-white px-4 font-sans";

/** Seconds left before an e-mail can be requested again (prevents repeated sends). */
function useCooldown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= now) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until, now]);
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  return [
    left,
    () => {
      setNow(Date.now());
      setUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
    },
  ] as const;
}

/** Moves focus to a panel heading when it replaces the form the user was in. */
function useFocusHeading() {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return ref;
}

/** The existing minimum, shown before submitting and ticked once satisfied. */
export function PasswordRule({ id, value }: { id: string; value: string }) {
  const t = useT();
  const ok = meetsPasswordMinimum(value);
  return (
    <p
      id={id}
      aria-live="polite"
      className={`m-0 text-sm flex items-center gap-2 ${ok ? "text-leaf" : "text-soft"}`}
    >
      {ok ? <CheckCircle2 size={16} aria-hidden /> : <Circle size={16} aria-hidden />}
      <span>{t("At least {n} characters", { n: PASSWORD_MIN_LENGTH })}</span>
      <span className="sr-only">
        {t(ok ? "Requirement met" : "Requirement not met yet")}
      </span>
    </p>
  );
}

/** Password input with the same show/hide control as the login form. */
export function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
  invalid,
  describedBy,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  invalid?: boolean;
  describedBy?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const t = useT();
  const [show, setShow] = useState(false);
  return (
    <label className="grid gap-1 f-ui">
      {label}
      <span className="relative">
        <input
          ref={inputRef}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${field} w-full pr-12`}
        />
        <button
          type="button"
          aria-label={t(show ? "Hide password" : "Show password")}
          aria-pressed={show}
          onClick={() => setShow(!show)}
          className="absolute right-1 top-1 w-11 h-11 flex items-center justify-center"
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}

const translate = (r: AuthResult, t: (s: string) => string): AuthResult => ({
  error: r.error && t(r.error),
  message: r.message && t(r.message),
});

function Feedback({ result, id }: { result: AuthResult | null; id: string }) {
  if (!result || (!result.error && !result.message)) return null;
  return result.error ? (
    <p id={id} role="alert" className="m-0 text-attn bg-butter rounded-inner px-3 py-2">
      {result.error}
    </p>
  ) : (
    <p id={id} role="status" className="m-0 bg-leaftint text-leaf rounded-inner px-3 py-2">
      {result.message}
    </p>
  );
}

/** Shown after sign-up when Supabase requires e-mail confirmation. */
export function ConfirmEmail({
  email,
  onResend,
  onLogin,
  onChangeEmail,
}: {
  email: string;
  onResend: (email: string) => Promise<AuthResult>;
  onLogin: () => void;
  onChangeEmail: () => void;
}) {
  const t = useT();
  const heading = useFocusHeading();
  const [left, startCooldown] = useCooldown();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AuthResult | null>(null);
  const id = useId();
  // An e-mail was just sent, so the first resend waits for the cooldown too.
  useEffect(() => startCooldown(), []);
  const resend = async () => {
    if (busy || left > 0) return;
    setBusy(true);
    const response = await onResend(email);
    setResult(translate(response, t));
    if (!response.error) startCooldown();
    setBusy(false);
  };
  return (
    <div className="grid gap-3">
      <MailCheck size={32} className="text-leaf" aria-hidden />
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold m-0">
        {t("Check your email")}
      </h1>
      <p className="m-0">
        {t("We sent a confirmation link to {e}. Open it to activate your account, then log in.", {
          e: email,
        })}
      </p>
      <p className="m-0 text-sm text-soft">
        {t("Can't find it? Check your spam or junk folder. It can take a few minutes to arrive.")}
      </p>
      <Feedback result={result} id={`${id}-feedback`} />
      <div className="flex flex-wrap gap-2">
        <Button variant="coral" onClick={onLogin}>
          {t("Go to log in")}
        </Button>
        <Button
          onClick={() => void resend()}
          disabled={busy || left > 0}
          aria-describedby={left > 0 ? `${id}-wait` : undefined}
        >
          {busy ? t("Sending...") : t("Resend email")}
        </Button>
      </div>
      {left > 0 && (
        <p id={`${id}-wait`} className="m-0 text-sm text-soft">
          {t("You can resend in {n} s.", { n: left })}
        </p>
      )}
      <button
        type="button"
        className="text-leaf f-ui min-h-11 justify-self-start"
        onClick={onChangeEmail}
      >
        {t("Use a different email")}
      </button>
    </div>
  );
}

/** "Forgot password?" request form. */
export function ForgotPassword({
  initialEmail,
  onRequest,
  onBack,
}: {
  initialEmail: string;
  onRequest: (email: string) => Promise<AuthResult>;
  onBack: () => void;
}) {
  const t = useT();
  const heading = useFocusHeading();
  const input = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState(initialEmail);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [left, startCooldown] = useCooldown();
  const [result, setResult] = useState<AuthResult | null>(null);
  const id = useId();
  const submit = async () => {
    if (busy || left > 0) return;
    if (!EMAIL.test(email.trim())) {
      setInvalid(true);
      setResult({ error: t("That email looks incomplete — try name@example.com.") });
      input.current?.focus();
      return;
    }
    setInvalid(false);
    setBusy(true);
    const response = await onRequest(email.trim());
    setResult(translate(response, t));
    if (!response.error) startCooldown();
    setBusy(false);
  };
  return (
    <form
      noValidate
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <KeyRound size={28} aria-hidden />
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold m-0">
        {t("Reset your password")}
      </h1>
      <p id={`${id}-help`} className="m-0 text-sm text-soft">
        {t("Enter your account email. We'll send you a link to set a new password.")}
      </p>
      <label className="grid gap-1 f-ui">
        {t("Email")}
        <input
          ref={input}
          type="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          autoComplete="email"
          value={email}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-help${result ? ` ${id}-feedback` : ""}`}
          onChange={(e) => {
            setEmail(e.target.value);
            if (invalid) {
              setInvalid(false);
              setResult(null);
            }
          }}
          className={field}
        />
      </label>
      <Feedback result={result} id={`${id}-feedback`} />
      {result?.message && (
        <p className="m-0 text-sm text-soft">
          {t("Can't find it? Check your spam or junk folder. It can take a few minutes to arrive.")}
        </p>
      )}
      <div className="flex flex-wrap gap-2 justify-between">
        <Button type="button" onClick={onBack}>
          {t("Back to log in")}
        </Button>
        <Button
          type="submit"
          variant="coral"
          disabled={busy || left > 0}
          aria-describedby={left > 0 ? `${id}-wait` : undefined}
        >
          {busy ? t("Sending...") : t(result?.message ? "Send again" : "Send reset link")}
        </Button>
      </div>
      {left > 0 && (
        <p id={`${id}-wait`} className="m-0 text-sm text-soft text-right">
          {t("You can resend in {n} s.", { n: left })}
        </p>
      )}
    </form>
  );
}

function Shell({
  voice,
  header,
  children,
}: {
  voice: string;
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="onboarding-safe max-w-xl mx-auto px-5 py-6 grid gap-5">
      {header && <div className="flex justify-end">{header}</div>}
      <Say expr="thinking" size={64} live>
        {voice}
      </Say>
      <Card className="grid gap-3">{children}</Card>
    </div>
  );
}

/** Opened from the password-reset e-mail link. */
export function ResetPassword({
  state,
  header,
  onSave,
  onContinue,
  onCancel,
  onRequestNew,
}: {
  state: "checking" | "form" | "done" | "invalid";
  /** Language switcher, passed in to avoid a circular import with Onboarding. */
  header?: ReactNode;
  onSave: (password: string) => Promise<AuthResult>;
  onContinue: () => void;
  onCancel: () => void;
  onRequestNew: () => void;
}) {
  const t = useT();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<{ text: string; field: "pw" | "pw2" | "form" } | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const second = useRef<HTMLInputElement>(null);
  const id = useId();
  if (state === "checking")
    return (
      <Shell header={header} voice={t("Set a new password")}>
        <p role="status" className="m-0">
          {t("Checking your link...")}
        </p>
      </Shell>
    );
  if (state === "invalid")
    return (
      <Shell header={header} voice={t("Reset your password")}>
        <InvalidLink onRequestNew={onRequestNew} onBack={onCancel} />
      </Shell>
    );
  if (state === "done")
    return (
      <Shell header={header} voice={t("Password updated")}>
        <DoneMessage onContinue={onContinue} />
      </Shell>
    );
  const save = async () => {
    if (busy) return;
    if (!meetsPasswordMinimum(pw)) {
      setErr({ text: t("Use at least 8 characters for a new password."), field: "pw" });
      return first.current?.focus();
    }
    if (pw !== pw2) {
      setErr({ text: t("The passwords don't match."), field: "pw2" });
      return second.current?.focus();
    }
    setErr(null);
    setBusy(true);
    const response = await onSave(pw);
    setBusy(false);
    if (response.error) setErr({ text: t(response.error), field: "form" });
  };
  const errId = `${id}-error`;
  return (
    <Shell header={header} voice={t("Set a new password")}>
      <form
        noValidate
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h1 className="text-2xl font-bold m-0">{t("Set a new password")}</h1>
        <p className="m-0 text-sm text-soft">{t("Choose a new password for your account.")}</p>
        <PasswordInput
          label={t("New password")}
          value={pw}
          onChange={(value) => {
            setPw(value);
            if (err?.field === "pw") setErr(null);
          }}
          autoComplete="new-password"
          inputRef={first}
          invalid={err?.field === "pw"}
          describedBy={`${id}-rule${err && err.field !== "pw2" ? ` ${errId}` : ""}`}
        />
        <PasswordRule id={`${id}-rule`} value={pw} />
        <PasswordInput
          label={t("Repeat new password")}
          value={pw2}
          onChange={(value) => {
            setPw2(value);
            if (err?.field === "pw2") setErr(null);
          }}
          autoComplete="new-password"
          inputRef={second}
          invalid={err?.field === "pw2"}
          describedBy={err && err.field !== "pw" ? errId : undefined}
        />
        {err && (
          <p id={errId} role="alert" className="m-0 text-attn bg-butter rounded-inner px-3 py-2">
            {err.text}
          </p>
        )}
        <div className="flex flex-wrap gap-2 justify-between">
          <Button type="button" onClick={onCancel} disabled={busy}>
            {t("Cancel")}
          </Button>
          <Button type="submit" variant="coral" disabled={busy}>
            {busy ? t("Saving...") : t("Save new password")}
          </Button>
        </div>
      </form>
    </Shell>
  );
}

function InvalidLink({ onRequestNew, onBack }: { onRequestNew: () => void; onBack: () => void }) {
  const t = useT();
  const heading = useFocusHeading();
  return (
    <div className="grid gap-3">
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold m-0">
        {t("This reset link no longer works")}
      </h1>
      <p className="m-0">
        {t(
          "It may have expired or already been used. Reset links work once and expire after a while. Request a new one to continue.",
        )}
      </p>
      <div className="flex flex-wrap gap-2 justify-between">
        <Button onClick={onBack}>{t("Back to log in")}</Button>
        <Button variant="coral" onClick={onRequestNew}>
          {t("Send a new link")}
        </Button>
      </div>
    </div>
  );
}

function DoneMessage({ onContinue }: { onContinue: () => void }) {
  const t = useT();
  const heading = useFocusHeading();
  return (
    <div className="grid gap-3">
      <CheckCircle2 size={32} className="text-leaf" aria-hidden />
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold m-0">
        {t("Password updated")}
      </h1>
      <p role="status" className="m-0">
        {t("Your new password is saved and you're signed in.")}
      </p>
      <Button variant="coral" className="justify-self-start" onClick={onContinue}>
        {t("Continue to SpendSense")}
      </Button>
    </div>
  );
}
