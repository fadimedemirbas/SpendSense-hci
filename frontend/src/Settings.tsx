import { useContext, useState, type ReactNode } from "react";
import {
  Globe,
  Coins,
  Mail,
  User,
  KeyRound,
  LogOut,
  Wallet,
  PiggyBank,
  Repeat,
  FileSpreadsheet,
  FileJson,
  Trash2,
  Map,
  Download,
  Info,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "./context";
import {
  Button,
  Card,
  Dialog,
  LangCtx,
  PageHead,
  Segmented,
  Tube,
  rangeLabel,
  useT,
  useToast,
} from "./ui";
import { INCOME_RANGES, SAVINGS_RANGES, profileTubes, today } from "./store";
import { InstallHelp, TENDENCY } from "./Onboarding";
import { requireSupabase } from "./lib/supabase";
import { onlineOperation } from "./pwa/network";
import { usePwa } from "./pwa/Pwa";
import { version } from "../package.json";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2" aria-label={title}>
      <h2 className="f-ui text-sm text-soft uppercase tracking-wider m-0 px-1">{title}</h2>
      <Card className="py-1! md:py-1!">{children}</Card>
    </section>
  );
}

function Row({
  icon,
  title,
  desc,
  children,
}: {
  icon: ReactNode;
  title: string;
  desc?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-4 border-t border-cardline first:border-0">
      <span
        className="w-10 h-10 rounded-inner bg-peach flex items-center justify-center shrink-0"
        aria-hidden
      >
        {icon}
      </span>
      <div className="grow basis-48">
        <p className="m-0 font-medium">{title}</p>
        {desc && <p className="m-0 text-sm text-soft">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

const download = (name: string, type: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};
const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

function PasswordForm({ onDone }: { onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (pw.length < 8) return setErr(t("Use at least 8 characters for a new password."));
    if (pw !== pw2) return setErr(t("The passwords don't match."));
    setBusy(true);
    setErr("");
    try {
      const { error } = await onlineOperation(() =>
        requireSupabase().auth.updateUser({ password: pw }),
      );
      if (error) return setErr(t("Your password could not be changed. Log in again and retry."));
      toast(t("Password changed."));
      onDone();
    } catch {
      setErr(t("You are offline. Reconnect before changing your password."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="basis-full grid gap-3 sm:grid-cols-2 rise"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {(
        [
          ["New password", pw, setPw],
          ["Repeat new password", pw2, setPw2],
        ] as const
      ).map(([l, v, set]) => (
        <label key={l} className="f-ui grid gap-1">
          {t(l)}
          <input
            type="password"
            autoComplete="new-password"
            value={v}
            onChange={(e) => set(e.target.value)}
            aria-invalid={!!err}
            aria-describedby={err ? "password-error" : undefined}
            className="h-12 rounded-tile border border-line bg-white px-4 font-sans"
          />
        </label>
      ))}
      {err && (
        <p
          id="password-error"
          role="alert"
          className="sm:col-span-2 m-0 text-attn bg-butter rounded-inner px-3 py-2"
        >
          {err}
        </p>
      )}
      <div className="sm:col-span-2 flex gap-2 justify-end">
        <Button type="button" onClick={onDone}>
          {t("Cancel")}
        </Button>
        <Button type="submit" variant="coral" disabled={busy}>
          {busy ? t("Saving...") : t("Change password")}
        </Button>
      </div>
    </form>
  );
}

export function SettingsPage({
  reset,
  logout,
  retake,
  name,
}: {
  reset: () => Promise<boolean>;
  logout: () => void;
  retake: () => void;
  name?: string;
}) {
  const { profile, setProfile, setTour, setTab, entries, goals, decisions, waiting } = useApp();
  const t = useT();
  const pwa = usePwa();
  const { lang, setLang } = useContext(LangCtx);
  const [confirm, setConfirm] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [password, setPassword] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);
  const select = "min-h-11 rounded-full clay-cream px-4 f-ui";
  const exportCsv = () =>
    download(
      `spendsense-entries-${today()}.csv`,
      "text/csv;charset=utf-8",
      // BOM so spreadsheet apps read Turkish characters correctly.
      "﻿" +
        [
          ["Date", "Type", "Category", "Note", "Amount"].map((h) => csvCell(t(h))).join(","),
          ...[...entries]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((e) =>
              [e.date, t(e.type === "income" ? "Income" : "Expense"), t(e.cat), e.name, e.amount]
                .map(csvCell)
                .join(","),
            ),
        ].join("\r\n"),
    );
  const exportJson = () =>
    download(
      `spendsense-backup-${today()}.json`,
      "application/json",
      JSON.stringify(
        { exportedAt: new Date().toISOString(), profile, entries, goals, decisions, waiting },
        null,
        2,
      ),
    );
  return (
    <>
      <PageHead title={t("Settings")} />
      <Section title={t("Account")}>
        {name && <Row icon={<User size={18} />} title={t("Name")} desc={name} />}
        <Row icon={<Mail size={18} />} title={t("Email")} desc={profile.email} />
        <Row
          icon={<KeyRound size={18} />}
          title={t("Password")}
          desc={t("Use at least 8 characters.")}
        >
          {!password && <Button onClick={() => setPassword(true)}>{t("Change password")}</Button>}
          {password && <PasswordForm onDone={() => setPassword(false)} />}
        </Row>
        <Row
          icon={<LogOut size={18} className="text-danger" />}
          title={t("Log out")}
          desc={t("Your data stays in your account.")}
        >
          <Button onClick={() => setConfirmLogout(true)} className="text-danger!">
            {t("Log out")}
          </Button>
        </Row>
      </Section>

      <Section title={t("Preferences")}>
        <Row icon={<Globe size={18} />} title={t("Language")}>
          <Segmented
            label={t("Language")}
            value={lang}
            onChange={setLang}
            options={[
              ["en", "English"],
              ["tr", "Türkçe"],
            ]}
          />
        </Row>
        <Row
          icon={<Coins size={18} />}
          title={t("Currency display")}
          desc={t("Display only — amounts are not converted.")}
        >
          <Segmented
            label={t("Currency display")}
            value={profile.currency}
            onChange={(c) => setProfile({ ...profile, currency: c })}
            options={[
              ["symbol", "₺ 1.000"],
              ["code", "1.000 TRY"],
            ]}
          />
        </Row>
      </Section>

      <Section title={t("Budget basics")}>
        <Row
          icon={<Wallet size={18} />}
          title={t("Monthly income")}
          desc={t("Used until you add this month's income.")}
        >
          <select
            aria-label={t("Monthly income")}
            value={profile.income}
            onChange={(e) => setProfile({ ...profile, income: +e.target.value })}
            className={select}
          >
            {INCOME_RANGES.map((r, i) => (
              <option key={r} value={i}>
                {rangeLabel(t(r))}
              </option>
            ))}
          </select>
        </Row>
        <Row
          icon={<PiggyBank size={18} />}
          title={t("Monthly savings")}
          desc={t("Used to estimate how purchases delay your goals.")}
        >
          <select
            aria-label={t("Monthly savings")}
            value={profile.savings}
            onChange={(e) => setProfile({ ...profile, savings: +e.target.value })}
            className={select}
          >
            {SAVINGS_RANGES.map((r, i) => (
              <option key={r} value={i}>
                {rangeLabel(t(r))}
              </option>
            ))}
          </select>
        </Row>
      </Section>

      <Section title={t("Your spending style")}>
        {profile.habits.length === 4 && (
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 pt-4 pb-2">
            {profileTubes(profile.habits).map(([l, v]) => (
              <Tube key={l} label={t(TENDENCY[l])} value={v} color="bg-violet" />
            ))}
          </div>
        )}
        <Row
          icon={<Repeat size={18} />}
          title={t("Retake the questions")}
          desc={t("A reflection of your answers, not a label. It can change anytime.")}
        >
          <Button onClick={retake}>{t("Retake spending style questions")}</Button>
        </Row>
      </Section>

      <Section title={t("Your data")}>
        <Row
          icon={<FileSpreadsheet size={18} />}
          title={t("Export entries")}
          desc={t("Income and expenses as a spreadsheet (CSV).")}
        >
          <Button icon={<Download size={16} />} onClick={exportCsv} disabled={!entries.length}>
            {t("Download CSV")}
          </Button>
        </Row>
        <Row
          icon={<FileJson size={18} />}
          title={t("Full backup")}
          desc={t("Everything you saved, including goals and decisions (JSON).")}
        >
          <Button icon={<Download size={16} />} onClick={exportJson}>
            {t("Download JSON")}
          </Button>
        </Row>
        <Row
          icon={<Trash2 size={18} className="text-danger" />}
          title={t("Reset data")}
          desc={t("Deletes entries, goals, analyses and decisions. Your account stays.")}
        >
          <Button onClick={() => setConfirm(true)} className="text-danger!">
            {t("Reset data")}
          </Button>
        </Row>
      </Section>

      <Section title={t("Help")}>
        <Row
          icon={<Map size={18} />}
          title={t("Restart tour")}
          desc={t("A short walkthrough of the main features.")}
        >
          <Button
            onClick={() => {
              setTab("home");
              setTour(0);
            }}
          >
            {t("Start")}
          </Button>
        </Row>
        {pwa.mode !== "installed" && (
          // iOS never fires beforeinstallprompt and Android may not have offered
          // it yet, so fall back to step-by-step guidance instead of hiding it.
          <Row
            icon={<Download size={18} />}
            title={t("Install app")}
            desc={t("Add SpendSense to your device for quick access from your home screen.")}
          >
            <Button
              onClick={async () => {
                if (!(await pwa.install())) setInstallHelp(true);
              }}
            >
              {t(pwa.mode === "prompt" ? "Install" : "How to install")}
            </Button>
          </Row>
        )}
        <Row
          icon={<ShieldCheck size={18} />}
          title={t("Privacy")}
          desc={t("Your financial data is saved to your account and visible only to you.")}
        />
        <Row
          icon={<Info size={18} />}
          title={t("About")}
          desc={t(
            "SpendSense is an HCI course prototype. Scores are simple heuristics, not financial advice.",
          )}
        >
          <span className="f-num text-sm text-soft">
            {t("Version")} {version}
          </span>
        </Row>
      </Section>

      {confirm && (
        <Dialog
          danger
          title={t("Reset all data?")}
          body={t(
            "This deletes your saved entries, goals, analyses and decisions. It cannot be undone.",
          )}
          confirm={t("Reset data")}
          onClose={() => setConfirm(false)}
          onConfirm={reset}
        />
      )}
      {confirmLogout && (
        <Dialog
          danger
          title={t("Log out?")}
          body={t("You'll need to log in again to see your data. Your data stays in your account.")}
          confirm={t("Log out")}
          onClose={() => setConfirmLogout(false)}
          onConfirm={logout}
        />
      )}
      {installHelp && <InstallHelp onClose={() => setInstallHelp(false)} />}
    </>
  );
}
