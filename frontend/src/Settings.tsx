import { useContext, useEffect, useState, type ReactNode } from "react";
import {
  Globe,
  Coins,
  Banknote,
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
  SunMoon,
  Keyboard,
  ShieldAlert,
  Plus,
  X,
  ArrowLeft,
  ChevronRight,
  CircleHelp,
  Database,
  HandCoins,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useDeleteConfirm } from "./useDeleteConfirm";
import { categoryKey, parseCategoryKey } from "./lib/deleteConfirm";
import { DisplayCurrencyPicker } from "./DisplayCurrencyPicker";
import { recordCurrencyNote } from "./lib/displayCurrency";
import { ExchangeRateInfo, RatesLastUpdate } from "./ExchangeRateInfo";
import { useRates } from "./lib/useRates";
import { useApp, type SettingsSection } from "./context";
import {
  Button,
  Card,
  Dialog,
  InfoTip,
  LangCtx,
  PageHead,
  Segmented,
  Select,
  Tube,
  rangeLabel,
  useT,
  useToast,
} from "./ui";
import {
  EXP_CATS,
  HOLD_KINDS,
  INC_CATS,
  INCOME_RANGES,
  SAVINGS_RANGES,
  profileTubes,
  today,
} from "./store";
import { InstallHelp, TENDENCY } from "./Onboarding";
import { requireSupabase } from "./lib/supabase";
import { onlineOperation } from "./pwa/network";
import { usePwa } from "./pwa/Pwa";
import { useTheme } from "./useTheme";
import { version } from "../package.json";

const SECTIONS: [SettingsSection, string, LucideIcon][] = [
  ["account", "Account", User],
  ["preferences", "Preferences", SlidersHorizontal],
  ["currency", "Currency", Banknote],
  ["budget", "Budget basics", Wallet],
  ["style", "Your spending style", HandCoins],
  ["delete", "Delete confirmation", ShieldAlert],
  ["data", "Your data", Database],
  ["help", "Help", CircleHelp],
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  const t = useT();
  const { canGoBack, goBack, openSettings } = useApp();
  return (
    <section className="grid gap-3" aria-label={title}>
      <div className="flex items-center gap-2">
        <button
          className="btn clay-cream w-11 px-0! lg:hidden!"
          aria-label={t("Back to settings")}
          // A shared /settings/account link has no list behind it in the history.
          onClick={() => (canGoBack ? goBack() : openSettings(null))}
        >
          <ArrowLeft size={20} aria-hidden />
        </button>
        <h2 className="text-2xl font-bold m-0">{title}</h2>
      </div>
      <Card className="py-1! md:py-1!">{children}</Card>
    </section>
  );
}

/** One width for every control, so a category's right edge lines up. */
const Control = ({ children }: { children: ReactNode }) => (
  <div className="grid w-full sm:w-72">{children}</div>
);

function Row({
  icon,
  title,
  desc,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  desc?: ReactNode;
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
      <div className="grow basis-40">
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
      data-shortcuts-block
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
            className="h-12 rounded-tile border border-line bg-field px-4 font-sans"
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

/** Categories whose entries ask for confirmation before they are deleted. */
function DeleteConfirmRow() {
  const t = useT();
  const { keys, add, remove } = useDeleteConfirm();
  const [pick, setPick] = useState("");
  const groups = (
    [
      ["expense", "Expenses", EXP_CATS],
      ["income", "Income", INC_CATS],
      ["saving", "Savings", HOLD_KINDS],
    ] as const
  ).map(
    ([type, label, cats]) =>
      [label, cats.map(([c]) => categoryKey(type, c)).filter((k) => !keys.includes(k))] as const,
  );
  const name = (key: string) => {
    const [type, cat] = parseCategoryKey(key);
    const label = type === "income" ? "Income" : type === "saving" ? "Saving" : "Expense";
    return `${t(cat)} (${t(label)})`;
  };
  return (
    <Row
      icon={<ShieldAlert size={18} />}
      title={t("Ask before deleting")}
      desc={t(
        "Deleting a record in these categories asks you to confirm first. Saved on this device.",
      )}
    >
      <form
        data-shortcuts-block={pick ? "" : undefined}
        className="basis-full flex flex-wrap gap-2 [&>.select-wrap]:grow"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pick) return;
          add(...parseCategoryKey(pick));
          setPick("");
        }}
      >
        <Select aria-label={t("Category")} value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">{t("Pick a category")}</option>
          {groups.map(
            ([label, options]) =>
              options.length > 0 && (
                <optgroup key={label} label={t(label)}>
                  {options.map((k) => (
                    <option key={k} value={k}>
                      {t(parseCategoryKey(k)[1])}
                    </option>
                  ))}
                </optgroup>
              ),
          )}
        </Select>
        <Button type="submit" icon={<Plus size={16} />} disabled={!pick}>
          {t("Add")}
        </Button>
      </form>
      <div className="basis-full">
        {keys.length === 0 ? (
          <p className="m-0 text-sm text-soft">
            {t("No categories yet. Entries are deleted right away, with an undo.")}
          </p>
        ) : (
          <ul
            className="m-0 p-0 list-none flex flex-wrap gap-2"
            aria-label={t("Ask before deleting")}
          >
            {keys.map((k) => (
              <li
                key={k}
                className="inline-flex items-center gap-1 rounded-full bg-peach pl-3 f-ui text-sm"
              >
                {name(k)}
                <button
                  type="button"
                  aria-label={t("Remove {c}", { c: name(k) })}
                  onClick={() => remove(k)}
                  className="w-9 h-9 rounded-full inline-flex items-center justify-center text-soft hover:bg-track hover:text-ink"
                >
                  <X size={16} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Row>
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
  const {
    profile,
    setProfile,
    setTour,
    setTab,
    settingsSection,
    openSettings,
    entries,
    holdings,
    goals,
    decisions,
    waiting,
    shortcutsEnabled,
    setShortcutsEnabled,
  } = useApp();
  const t = useT();
  const pwa = usePwa();
  const { lang, setLang } = useContext(LangCtx);
  const theme = useTheme();
  const rates = useRates();
  const [confirm, setConfirm] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [password, setPassword] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);
  // Wide screens show the first category beside the list; narrow ones show only the list.
  const active = settingsSection ?? "account";
  const currencyNote = recordCurrencyNote();
  // The pressed row or back arrow is hidden after a switch, so focus moves with the view.
  useEffect(() => {
    document
      .getElementById(settingsSection ? "settings-detail" : "main-content")
      ?.focus({ preventScroll: true });
  }, [settingsSection]);
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
        {
          exportedAt: new Date().toISOString(),
          profile,
          entries,
          holdings,
          goals,
          decisions,
          waiting,
        },
        null,
        2,
      ),
    );
  return (
    <>
      <div className={settingsSection ? "hidden lg:block" : ""}>
        <PageHead title={t("Settings")} />
      </div>
      <div className="grid gap-5 items-start lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label={t("Settings")} className={settingsSection ? "hidden lg:block" : ""}>
          <Card className="p-2! md:p-2!">
            <ul className="m-0 p-0 list-none grid gap-1">
              {SECTIONS.map(([key, title, Icon]) => (
                <li key={key}>
                  <button
                    aria-current={settingsSection === key ? "page" : undefined}
                    onClick={() => openSettings(key)}
                    className={`w-full flex items-center gap-3 p-2 rounded-inner text-left font-medium transition hover:bg-peach ${active === key ? "lg:bg-sun! lg:text-onbright lg:shadow-[inset_0_2px_0_#ffffff80,inset_0_-3px_0_#d9a21a,0_6px_14px_-6px_var(--glow-sun)]" : ""}`}
                  >
                    <span
                      className="w-10 h-10 rounded-inner bg-peach text-ink flex items-center justify-center shrink-0"
                      aria-hidden
                    >
                      <Icon size={18} />
                    </span>
                    <span className="grow">{t(title)}</span>
                    <ChevronRight size={18} className="shrink-0" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </nav>
        <div
          id="settings-detail"
          tabIndex={-1}
          className={`min-w-0 outline-none ${settingsSection ? "" : "hidden lg:block"}`}
        >
          {active === "account" && (
            <Section title={t("Account")}>
              {name && <Row icon={<User size={18} />} title={t("Name")} desc={name} />}
              <Row icon={<Mail size={18} />} title={t("Email")} desc={profile.email} />
              <Row
                icon={<KeyRound size={18} />}
                title={t("Password")}
                desc={t("Use at least 8 characters.")}
              >
                {!password && (
                  <Control>
                    <Button onClick={() => setPassword(true)}>{t("Change password")}</Button>
                  </Control>
                )}
                {password && <PasswordForm onDone={() => setPassword(false)} />}
              </Row>
              <Row
                icon={<LogOut size={18} className="text-danger" />}
                title={t("Log out")}
                desc={t("Your data stays in your account.")}
              >
                <Control>
                  <Button onClick={() => setConfirmLogout(true)} className="text-danger!">
                    {t("Log out")}
                  </Button>
                </Control>
              </Row>
            </Section>
          )}

          {active === "preferences" && (
            <Section title={t("Preferences")}>
              <Row icon={<Globe size={18} />} title={t("Language")}>
                <Control>
                  <Segmented
                    full
                    label={t("Language")}
                    value={lang}
                    onChange={setLang}
                    options={[
                      ["en", "English"],
                      ["tr", "Türkçe"],
                    ]}
                  />
                </Control>
              </Row>
              <Row
                icon={<SunMoon size={18} />}
                title={t("Theme")}
                desc={t("System follows your device's light or dark setting.")}
              >
                <Control>
                  <Segmented
                    full
                    label={t("Theme")}
                    value={theme.preference}
                    onChange={theme.setPreference}
                    options={[
                      ["light", t("Light")],
                      ["dark", t("Dark")],
                      ["system", t("System")],
                    ]}
                  />
                </Control>
              </Row>
              <Row
                icon={<Keyboard size={18} />}
                title={t("Keyboard shortcuts")}
                desc={t(
                  "Use N to add an expense, D to open Decide and ? for help. Saved on this device.",
                )}
              >
                <Control>
                  <Segmented
                    full
                    label={t("Keyboard shortcuts")}
                    value={shortcutsEnabled ? "on" : "off"}
                    onChange={(value) => setShortcutsEnabled(value === "on")}
                    options={[
                      ["off", t("Off")],
                      ["on", t("On")],
                    ]}
                  />
                </Control>
              </Row>
            </Section>
          )}

          {active === "currency" && (
            <Section title={t("Currency")}>
              <Row
                icon={<Banknote size={18} />}
                title={
                  <>
                    {t("Display currency")} <ExchangeRateInfo />
                  </>
                }
                desc={
                  <>
                    {/* Only while USD/EUR are disabled, to say why. */}
                    {currencyNote && t(currencyNote)}
                    <RatesLastUpdate />
                    {rates.status !== "fresh" && !rates.loading && (
                      <span className="block text-attn">
                        {t(
                          rates.status === "stale"
                            ? "These rates may be out of date."
                            : "Exchange rates are unavailable.",
                        )}
                      </span>
                    )}
                  </>
                }
              >
                {/* Shows the saved value only: it changes after the database confirms the save. */}
                <Control>
                  <DisplayCurrencyPicker
                    full
                    label={t("Display currency")}
                    value={profile.displayCurrency}
                    onChange={(displayCurrency) => void setProfile({ ...profile, displayCurrency })}
                  />
                </Control>
              </Row>
              <Row
                icon={<Coins size={18} />}
                title={t("Amount format")}
                desc={t("Display only — amounts are not converted.")}
              >
                <Control>
                  <Segmented
                    full
                    label={t("Amount format")}
                    value={profile.currency}
                    onChange={(c) => setProfile({ ...profile, currency: c })}
                    options={[
                      ["symbol", "₺ 1.000"],
                      ["code", "1.000 TRY"],
                    ]}
                  />
                </Control>
              </Row>
            </Section>
          )}

          {active === "budget" && (
            <Section title={t("Budget basics")}>
              <Row
                icon={<Wallet size={18} />}
                title={t("Monthly income")}
                desc={t("Used until you add this month's income.")}
              >
                <Control>
                  <Select
                    aria-label={t("Monthly income")}
                    value={profile.income}
                    onChange={(e) => setProfile({ ...profile, income: +e.target.value })}
                  >
                    {INCOME_RANGES.map((r, i) => (
                      <option key={r} value={i}>
                        {rangeLabel(t(r))}
                      </option>
                    ))}
                  </Select>
                </Control>
              </Row>
              <Row
                icon={<PiggyBank size={18} />}
                title={t("Monthly savings")}
                desc={t("Used to estimate how purchases delay your goals.")}
              >
                <Control>
                  <Select
                    aria-label={t("Monthly savings")}
                    value={profile.savings}
                    onChange={(e) => setProfile({ ...profile, savings: +e.target.value })}
                  >
                    {SAVINGS_RANGES.map((r, i) => (
                      <option key={r} value={i}>
                        {rangeLabel(t(r))}
                      </option>
                    ))}
                  </Select>
                </Control>
              </Row>
            </Section>
          )}

          {active === "style" && (
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
                <Control>
                  <Button onClick={retake}>{t("Retake spending style questions")}</Button>
                </Control>
              </Row>
            </Section>
          )}

          {active === "delete" && (
            <Section title={t("Delete confirmation")}>
              <DeleteConfirmRow />
            </Section>
          )}

          {active === "data" && (
            <Section title={t("Your data")}>
              <Row
                icon={<FileSpreadsheet size={18} />}
                title={t("Export entries")}
                desc={t("Income and expenses as a spreadsheet (CSV).")}
              >
                <Control>
                  <Button
                    icon={<Download size={16} />}
                    onClick={exportCsv}
                    disabled={!entries.length}
                  >
                    {t("Download CSV")}
                  </Button>
                </Control>
              </Row>
              <Row
                icon={<FileJson size={18} />}
                title={t("Full backup")}
                desc={t("Everything you saved, including savings, goals and decisions (JSON).")}
              >
                <Control>
                  <Button icon={<Download size={16} />} onClick={exportJson}>
                    {t("Download JSON")}
                  </Button>
                </Control>
              </Row>
              <Row
                icon={<Trash2 size={18} className="text-danger" />}
                title={t("Reset data")}
                desc={t(
                  "Deletes entries, savings, goals, analyses and decisions. Your account stays.",
                )}
              >
                <Control>
                  <Button onClick={() => setConfirm(true)} className="text-danger!">
                    {t("Reset data")}
                  </Button>
                </Control>
              </Row>
            </Section>
          )}

          {active === "help" && (
            <Section title={t("Help")}>
              <Row
                icon={<Map size={18} />}
                title={t("Restart tour")}
                desc={t("A short walkthrough of the main features.")}
              >
                <Control>
                  <Button
                    onClick={() => {
                      setTab("home");
                      setTour(0);
                    }}
                  >
                    {t("Start")}
                  </Button>
                </Control>
              </Row>
              {pwa.mode !== "installed" && (
                // iOS never fires beforeinstallprompt and Android may not have offered
                // it yet, so fall back to step-by-step guidance instead of hiding it.
                <Row
                  icon={<Download size={18} />}
                  title={t("Install app")}
                  desc={t("Add SpendSense to your device for quick access from your home screen.")}
                >
                  <Control>
                    <Button
                      onClick={async () => {
                        if (!(await pwa.install())) setInstallHelp(true);
                      }}
                    >
                      {t(pwa.mode === "prompt" ? "Install" : "How to install")}
                    </Button>
                  </Control>
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
          )}
        </div>
      </div>

      {confirm && (
        <Dialog
          danger
          title={t("Reset all data?")}
          body={t(
            "This deletes your saved entries, savings, goals, analyses and decisions. It cannot be undone.",
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
