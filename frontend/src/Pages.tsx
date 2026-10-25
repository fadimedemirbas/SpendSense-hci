import { useState } from "react";
import {
  Lightbulb,
  CheckCircle2,
  Circle as CircleI,
  Plus,
  Scale,
  Clock,
  Pencil,
  Archive,
  Trash2,
  RotateCcw,
  PiggyBank,
  ShoppingBag,
  X,
  Hourglass,
  Globe,
  User,
  Repeat,
  Coins,
  Map,
  RefreshCw,
  LogOut,
  Info,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useApp } from "./context";
import {
  Button,
  Card,
  CountUp,
  Dialog,
  Empty,
  Expand,
  PageHead,
  Pill,
  Ring,
  Say,
  Segmented,
  Sheet,
  Tube,
  Tile,
  useT,
  useToast,
  fmt,
  LangCtx,
} from "./ui";
import { EntryRow, dayLabel } from "./Money";
import { REASONS, FEELINGS } from "./Decide";
import {
  INCOME_RANGES,
  SAVINGS_RANGES,
  uid,
  today,
  type Goal,
  type GStatus,
  type DecisionKind,
} from "./store";
import { useContext } from "react";

const daysUntil = (iso: string) =>
  Math.ceil((new Date(iso).getTime() - new Date(today()).getTime()) / 864e5);
const thisMonth = (d: string) => d.slice(0, 7) === today().slice(0, 7);

export function HomePage() {
  const { entries, goals, waiting, decisions, setQuickAdd, setTab, openDecide } = useApp();
  const t = useT();
  const m = entries.filter((e) => thisMonth(e.date));
  const inc = m.filter((e) => e.type === "income").reduce((a, b) => a + b.amount, 0),
    sp = m.filter((e) => e.type === "expense").reduce((a, b) => a + b.amount, 0);
  const goal = goals.find((g) => g.status === "Active");
  const recent = [...entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const due = [...waiting].sort((a, b) => a.review.localeCompare(b.review)).slice(0, 2);
  return (
    <>
      <h1 className="sr-only">{t("Home")}</h1>
      <Say expr="happy" size={64}>
        {t("Hi there! Let's look at your month together.")}
      </Say>
      <Card>
        <h2 className="f-ui text-soft text-base m-0">{t("Left this month")}</h2>
        <CountUp value={inc - sp} className="text-5xl block my-2" />
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span className="text-leaf flex items-center gap-1">
            <ArrowUp size={16} aria-hidden />
            {t("Income")} <CountUp value={inc} />
          </span>
          <span className="flex items-center gap-1">
            <ArrowDown size={16} aria-hidden />
            {t("Spent")} <CountUp value={sp} />
          </span>
        </div>
        <div className="mt-4">
          <Tube label={`${t("Spent")} / ${t("Income")}`} value={inc ? (sp / inc) * 100 : 0} />
        </div>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-tour-id="quick">
        <Button
          variant="leaf"
          big
          icon={<Plus size={20} />}
          onClick={() => setQuickAdd("new-income")}
        >
          {t("Add income")}
        </Button>
        <Button variant="coral" big icon={<Plus size={20} />} onClick={() => setQuickAdd("new")}>
          {t("Add expense")}
        </Button>
        <Button
          variant="butter"
          big
          icon={<Scale size={20} />}
          onClick={() => {
            openDecide(undefined);
            setTab("decide");
          }}
        >
          {t("Should I buy it?")}
        </Button>
      </div>
      <Checklist />
      <div className="grid md:grid-cols-2 gap-5">
        {goal && (
          <Card className="flex gap-4 items-center">
            <Ring
              value={(goal.saved / goal.target) * 100}
              label={`${goal.name} ${Math.round((goal.saved / goal.target) * 100)}%`}
            />
            <div>
              <h2 className="text-xl font-bold m-0">{goal.name}</h2>
              <p className="f-num m-0">
                {fmt(goal.saved)} / {fmt(goal.target)}
              </p>
              <p className="f-voice m-0 mt-1">{t("You're getting closer to your goal.")}</p>
            </div>
          </Card>
        )}
        <Card>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold m-0">{t("Up for review")}</h2>
            <Clock size={18} aria-hidden />
          </div>
          {due.length ? (
            due.map((w) => (
              <button
                key={w.id}
                onClick={() => setTab("waiting")}
                className="w-full text-left flex justify-between py-2 border-t border-cardline first:border-0 min-h-11"
              >
                <span>{w.name}</span>
                <span className="f-ui text-sm text-soft">
                  {daysUntil(w.review) <= 0
                    ? t("Ready to revisit")
                    : t("Review on {d}", { d: dayLabel(w.review, t) })}
                </span>
              </button>
            ))
          ) : (
            <p className="text-soft m-0 mt-2">{t("We can revisit this whenever you're ready.")}</p>
          )}
        </Card>
      </div>
      {decisions.length + waiting.length >= 3 && (
        <section className="clay-butter rounded-card p-5 flex gap-3 items-center rise">
          <Lightbulb className="text-violet shrink-0" aria-hidden />
          <p className="f-voice text-lg m-0">
            {t("You tend to pause longer before bigger purchases.")}
          </p>
        </section>
      )}
      <Card>
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold m-0">{t("Recent entries")}</h2>
          <Button onClick={() => setTab("money")}>{t("See all")}</Button>
        </div>
        {recent.length ? (
          <ul className="m-0 p-0 list-none">
            {recent.map((e) => (
              <EntryRow key={e.id} e={e} />
            ))}
          </ul>
        ) : (
          <Empty text={t("Nothing here yet. Want to start together?")} />
        )}
      </Card>
    </>
  );
}

function Checklist() {
  const { entries, goals, decisions, waiting, setTab, setQuickAdd, openDecide } = useApp();
  const t = useT();
  const [hidden, setHidden] = useState(() => localStorage.getItem("ss.checklist") === "done");
  const items: [string, boolean, () => void][] = [
    ["Add a goal", goals.length > 0, () => setTab("goals")],
    ["Add your first entry", entries.length > 0, () => setQuickAdd("new")],
    [
      "Try “Should I buy it?”",
      decisions.length + waiting.length > 0,
      () => {
        openDecide(undefined);
        setTab("decide");
      },
    ],
  ];
  const all = items.every((i) => i[1]);
  if (hidden) return null;
  return (
    <Card className="grid gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold m-0">{t("Getting started")}</h2>
        <button
          aria-label={t("Close")}
          onClick={() => {
            localStorage.setItem("ss.checklist", "done");
            setHidden(true);
          }}
          className="btn clay-cream w-11 px-0!"
        >
          <X size={18} />
        </button>
      </div>
      {all ? (
        <p role="status" className="f-voice m-0">
          {t("All set — enjoy exploring.")}
        </p>
      ) : (
        items.map(([l, done, go]) => (
          <button
            key={l}
            onClick={go}
            disabled={done}
            className="flex items-center gap-2 min-h-11 text-left f-ui disabled:opacity-100"
          >
            {done ? (
              <CheckCircle2 size={20} className="text-leaf" aria-label="done" />
            ) : (
              <CircleI size={20} className="text-soft" aria-hidden />
            )}
            <span className={done ? "line-through text-soft" : ""}>{t(l)}</span>
          </button>
        ))
      )}
    </Card>
  );
}

export function Goals() {
  const { goals, setGoals } = useApp();
  const t = useT();
  const toast = useToast();
  const [f, setF] = useState<GStatus>("Active");
  const [form, setForm] = useState<Goal | null>(null);
  const [add, setAdd] = useState<Goal | null>(null);
  const [del, setDel] = useState<Goal | null>(null);
  const [amt, setAmt] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const upd = async (g: Goal) => {
    const done = g.saved >= g.target && g.status === "Active";
    const ng = done ? { ...g, status: "Completed" as GStatus } : g;
    const saved = await setGoals((gs) =>
      gs.some((x) => x.id === g.id) ? gs.map((x) => (x.id === g.id ? ng : x)) : [ng, ...gs],
    );
    if (saved && done) setNote(t("You reached {g}. Nicely done — take a breath.", { g: g.name }));
    return saved;
  };
  const list = goals.filter((g) => g.status === f);
  return (
    <>
      <PageHead
        title={t("Goals")}
        action={
          <Button
            variant="coral"
            icon={<Plus size={18} />}
            onClick={() => {
              setErr("");
              setForm({ id: uid(), name: "", target: 0, saved: 0, status: "Active" });
            }}
          >
            {t("Add goal")}
          </Button>
        }
      />
      <Segmented
        label="Status"
        value={f}
        onChange={setF}
        options={(["Active", "Completed", "Archived"] as GStatus[]).map((s) => [s, t(s)])}
      />
      {note && (
        <Say expr="calm" size={56}>
          {note}
        </Say>
      )}
      {list.length === 0 ? (
        <Card>
          <Empty text={t("Nothing here yet. Want to start together?")} />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {list.map((g) => {
            const pct = Math.round((g.saved / g.target) * 100);
            return (
              <Card key={g.id} className="grid gap-3">
                <div className="flex gap-4 items-center">
                  <Ring value={pct} label={`${g.name} ${pct}%`} />
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold m-0">{g.name}</h2>
                    <Pill
                      tone={
                        g.status === "Completed"
                          ? "leaf"
                          : g.status === "Archived"
                            ? "violet"
                            : "sun"
                      }
                    >
                      {t(g.status)}
                    </Pill>
                    <p className="f-num m-0 mt-1">
                      {fmt(g.saved)} / {fmt(g.target)}
                    </p>
                    <p className="text-sm text-soft m-0">
                      {t("Remaining")} {fmt(Math.max(0, g.target - g.saved))}
                      {g.date && ` · ${new Date(g.date).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.status === "Active" && (
                    <Button
                      variant="leaf"
                      icon={<PiggyBank size={16} />}
                      onClick={() => {
                        setAmt("");
                        setErr("");
                        setAdd(g);
                      }}
                    >
                      {t("Add money")}
                    </Button>
                  )}
                  <Button
                    aria-label={`${t("Edit")} ${g.name}`}
                    icon={<Pencil size={16} />}
                    onClick={() => {
                      setErr("");
                      setForm(g);
                    }}
                  >
                    {t("Edit")}
                  </Button>
                  {g.status === "Archived" ? (
                    <Button
                      icon={<RotateCcw size={16} />}
                      onClick={() => upd({ ...g, status: "Active" })}
                    >
                      {t("Restore")}
                    </Button>
                  ) : (
                    <Button
                      icon={<Archive size={16} />}
                      onClick={async () => {
                        const prev = goals;
                        if (
                          !(await setGoals(
                            goals.map((x) => (x.id === g.id ? { ...x, status: "Archived" } : x)),
                          ))
                        )
                          return;
                        toast(t("Archived"), () => setGoals(prev));
                      }}
                    >
                      {t("Archive")}
                    </Button>
                  )}
                  <Button
                    aria-label={`${t("Delete")} ${g.name}`}
                    icon={<Trash2 size={16} />}
                    onClick={() => setDel(g)}
                  >
                    {t("Delete")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {form && (
        <Sheet
          title={goals.some((g) => g.id === form.id) ? t("Edit goal") : t("Add goal")}
          onClose={() => setForm(null)}
        >
          <div className="grid gap-3">
            <label className="f-ui grid gap-1">
              {t("Goal name")}
              <input
                value={form.name}
                aria-invalid={!!err && !form.name.trim()}
                aria-describedby={err ? "goal-form-error" : undefined}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-13 rounded-tile border border-line bg-white px-4 font-sans"
              />
            </label>
            {(["target", "saved"] as const).map((k) => (
              <label key={k} className="f-ui grid gap-1">
                {t(k === "target" ? "Target" : "Saved")} (₺)
                <input
                  inputMode="numeric"
                  aria-invalid={!!err && k === "target" && form.target <= 0}
                  aria-describedby={err ? "goal-form-error" : undefined}
                  value={form[k] || ""}
                  onChange={(e) =>
                    /^\d{0,8}$/.test(e.target.value) && setForm({ ...form, [k]: +e.target.value })
                  }
                  className="h-13 rounded-tile border border-line bg-white px-4 f-num text-lg"
                />
              </label>
            ))}
            <label className="f-ui grid gap-1">
              {t("Target date (optional)")}
              <input
                type="date"
                value={form.date ?? ""}
                onChange={(e) => setForm({ ...form, date: e.target.value || undefined })}
                className="h-13 rounded-tile border border-line bg-white px-4 font-sans"
              />
            </label>
            {err && (
              <p
                id="goal-form-error"
                role="alert"
                className="m-0 text-attn bg-butter rounded-inner px-3 py-2"
              >
                {err}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button onClick={() => setForm(null)}>{t("Cancel")}</Button>
              <Button
                variant="coral"
                onClick={async () => {
                  if (!form.name.trim() || form.target <= 0)
                    return setErr(t("Give the goal a name and a target above zero."));
                  if (!(await upd(form))) return;
                  setForm(null);
                  toast(t("Goal saved."));
                }}
              >
                {t("Save")}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
      {add && (
        <Sheet title={`${t("Add money")} · ${add.name}`} onClose={() => setAdd(null)}>
          <div className="grid gap-3">
            <label className="f-ui grid gap-1">
              {t("Amount")} (₺)
              <input
                autoFocus
                inputMode="numeric"
                value={amt}
                onChange={(e) => /^\d{0,8}$/.test(e.target.value) && setAmt(e.target.value)}
                className="h-13 rounded-tile border border-line bg-white px-4 f-num text-2xl"
              />
            </label>
            {err && (
              <p role="status" className="m-0 text-attn">
                {err}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button onClick={() => setAdd(null)}>{t("Cancel")}</Button>
              <Button
                variant="coral"
                onClick={async () => {
                  if (!(+amt > 0)) return setErr(t("Enter an amount above zero."));
                  const prev = goals;
                  if (!(await upd({ ...add, saved: add.saved + +amt }))) return;
                  setAdd(null);
                  toast(t("Goal saved."), () => setGoals(prev));
                }}
              >
                {t("Save")}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
      {del && (
        <Dialog
          danger
          title={t("Delete this goal?")}
          body={t("This removes the goal and its progress. It can't be undone.")}
          confirm={t("Delete")}
          onClose={() => setDel(null)}
          onConfirm={async () => {
            if (!(await setGoals(goals.filter((g) => g.id !== del.id)))) return false;
            toast(t("Goal deleted."));
          }}
        />
      )}
    </>
  );
}

export function WaitingPage() {
  const { waiting, decisions, updateWorkspace, setTab, openDecide } = useApp();
  const t = useT();
  const toast = useToast();
  const act = async (id: string, d: DecisionKind) => {
    const w = waiting.find((x) => x.id === id)!;
    const pw = waiting,
      pd = decisions;
    if (
      !(await updateWorkspace((previous) => ({
        ...previous,
        waiting: waiting.filter((x) => x.id !== id),
        decisions: [{ ...w, id: uid(), decision: d, date: today() }, ...decisions],
      })))
    )
      return;
    toast(t(`Saved: ${d}.`), () => {
      void updateWorkspace((previous) => ({ ...previous, waiting: pw, decisions: pd }));
    });
  };
  return (
    <>
      <PageHead title={t("Waiting List")} />
      {waiting.length === 0 ? (
        <Card>
          <Empty expr="calm" text={t("We can revisit this whenever you're ready.")} />
        </Card>
      ) : (
        waiting.map((w) => {
          const left = daysUntil(w.review);
          return (
            <Card key={w.id} className="grid gap-3">
              <div className="flex items-start gap-3">
                <span className="w-11 h-11 rounded-inner bg-violettint text-violet flex items-center justify-center">
                  <Clock size={20} aria-hidden />
                </span>
                <div className="flex-1">
                  <h2 className="text-xl font-bold m-0">{w.name}</h2>
                  <p className="f-num m-0">
                    {fmt(w.price)}{" "}
                    <span className="f-ui text-sm text-soft">
                      · {t("Fit")} {w.fit}/100
                    </span>
                  </p>
                  <p className="text-sm text-soft m-0">
                    {t("Added")} {dayLabel(w.added, t)} ·{" "}
                    {t("Review on {d}", { d: new Date(w.review).toLocaleDateString() })}
                  </p>
                </div>
                <Pill tone={left <= 0 ? "leaf" : "violet"}>
                  {left <= 0 ? t("Ready to revisit") : t("{n} days left", { n: left })}
                </Pill>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Button
                  icon={<RotateCcw size={16} />}
                  onClick={() => {
                    openDecide({ ...w, waitId: w.id, review: true });
                    setTab("decide");
                  }}
                >
                  {t("Still want it?")}
                </Button>
                <Button icon={<ShoppingBag size={16} />} onClick={() => act(w.id, "Buy")}>
                  {t("Buy")}
                </Button>
                <Button icon={<X size={16} />} onClick={() => act(w.id, "Skip")}>
                  {t("Skip")}
                </Button>
              </div>
            </Card>
          );
        })
      )}
    </>
  );
}

const REFL = ["Uneasy", "Unsure", "Okay", "Good", "Very good"];
export function HistoryPage() {
  const { decisions, setDecisions } = useApp();
  const t = useT();
  const toast = useToast();
  const [f, setF] = useState<"all" | DecisionKind>("all");
  const list = decisions.filter((d) => f === "all" || d.decision === f);
  return (
    <>
      <PageHead title={t("History")} />
      <Segmented
        label="Filter"
        value={f}
        onChange={setF}
        options={[
          ["all", t("All")],
          ["Buy", t("Bought")],
          ["Wait", t("Waited")],
          ["Skip", t("Skipped")],
        ]}
      />
      {list.length === 0 ? (
        <Card>
          <Empty text={t("Nothing here yet. Want to start together?")} />
        </Card>
      ) : (
        list.map((d) => (
          <Card key={d.id} className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold m-0 flex-1">{d.name}</h2>
              <Pill tone="sun">
                {d.decision === "Buy" ? (
                  <ShoppingBag size={14} />
                ) : d.decision === "Wait" ? (
                  <Hourglass size={14} />
                ) : (
                  <X size={14} />
                )}
                {t(d.decision === "Buy" ? "Bought" : d.decision === "Wait" ? "Waited" : "Skipped")}
              </Pill>
            </div>
            <p className="m-0 text-sm text-soft">
              <span className="f-num text-ink">{fmt(d.price)}</span> · {dayLabel(d.date, t)} ·{" "}
              {t("Fit")} <span className="f-num">{d.fit}</span>
            </p>
            <Expand title={t("How do you feel about this decision now?")}>
              <div
                className="grid grid-cols-5 gap-1.5"
                role="radiogroup"
                aria-label={t("How do you feel about this decision now?")}
                onKeyDown={(event) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  const buttons = Array.from(
                    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
                  );
                  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? buttons.length - 1
                        : (index +
                            (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) +
                            buttons.length) %
                          buttons.length;
                  buttons[next]?.focus();
                  buttons[next]?.click();
                }}
              >
                {REFL.map((r, i) => (
                  <button
                    key={r}
                    role="radio"
                    aria-checked={d.reflection === i + 1}
                    tabIndex={d.reflection === i + 1 || (!d.reflection && i === 0) ? 0 : -1}
                    onClick={async () => {
                      if (
                        !(await setDecisions(
                          decisions.map((x) => (x.id === d.id ? { ...x, reflection: i + 1 } : x)),
                        ))
                      )
                        return;
                      toast(t("Reflection saved."));
                    }}
                    className={`f-ui text-xs sm:text-sm min-h-14 rounded-inner px-1 ${d.reflection === i + 1 ? "clay-sun ring-2 ring-ink" : "clay-cream"}`}
                  >
                    <span className="f-num block">{i + 1}</span>
                    {t(r)}
                  </button>
                ))}
              </div>
            </Expand>
          </Card>
        ))
      )}
    </>
  );
}

export function Insights() {
  const { entries, decisions, waiting } = useApp();
  const t = useT();
  const m = entries.filter((e) => thisMonth(e.date));
  const exp = m.filter((e) => e.type === "expense");
  const total = exp.reduce((a, b) => a + b.amount, 0) || 1;
  const byCat = Object.entries(
    exp.reduce<Record<string, number>>((g, e) => ((g[e.cat] = (g[e.cat] ?? 0) + e.amount), g), {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const inc = m.filter((e) => e.type === "income").reduce((a, b) => a + b.amount, 0);
  const max = Math.max(inc, total);
  const all = [...decisions, ...waiting];
  const count = (xs: string[]) =>
    Object.entries(
      xs.reduce<Record<string, number>>((g, x) => ((g[x] = (g[x] ?? 0) + 1), g), {}),
    ).sort((a, b) => b[1] - a[1]);
  const feels = count(all.map((d) => d.feeling)),
    reasons = count(all.flatMap((d) => d.reasons));
  return (
    <>
      <PageHead title={t("Insights")} />
      <Card className="grid gap-3">
        <h2 className="text-xl font-bold m-0">{t("Spending by category")}</h2>
        {byCat.length ? (
          byCat.map(([c, v]) => (
            <div key={c}>
              <Tube label={`${t(c)} · ${fmt(v)}`} value={(v / total) * 100} />
            </div>
          ))
        ) : (
          <Empty text={t("A few more decisions and patterns will appear.")} />
        )}
      </Card>
      <Card className="grid gap-3">
        <h2 className="text-xl font-bold m-0">{t("Income vs. expenses")}</h2>
        <Tube
          label={`${t("Income")} · ${fmt(inc)}`}
          value={max ? (inc / max) * 100 : 0}
          color="bg-leaf"
          showPct={false}
        />
        <Tube
          label={`${t("Expenses")} · ${fmt(exp.reduce((a, b) => a + b.amount, 0))}`}
          value={max ? (total / max) * 100 : 0}
          showPct={false}
        />
      </Card>
      <Card className="grid gap-3">
        <h2 className="text-xl font-bold m-0">{t("Decision patterns")}</h2>
        {all.length < 3 ? (
          <Empty expr="thinking" text={t("A few more decisions and patterns will appear.")} />
        ) : (
          <>
            <Say expr="thinking" size={48}>
              {t("You've often decided while feeling {f}. Just something to notice.", {
                f: t(feels[0][0]).toLowerCase(),
              })}
            </Say>
            <div className="flex flex-wrap gap-2">
              {feels.map(([f, n]) => {
                const I = FEELINGS.find((x) => x[0] === f)?.[1];
                return (
                  <Pill key={f} tone="violet">
                    {I && <I size={14} />}
                    {t(f)} · {n}
                  </Pill>
                );
              })}
            </div>
            {reasons[0] && (
              <p className="m-0">{t("Most common reason: {r}", { r: t(reasons[0][0]) })}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {reasons.map(([r, n]) => {
                const I = REASONS.find((x) => x[0] === r)?.[1];
                return (
                  <Pill key={r}>
                    {I && <I size={14} />}
                    {t(r)} · {n}
                  </Pill>
                );
              })}
            </div>
            <Expand title={t("How was this calculated?")}>
              Counts of feelings and reasons across {all.length} decisions and waiting items.
              Observations only — not a judgment.
            </Expand>
          </>
        )}
      </Card>
    </>
  );
}

export function SettingsPage({
  reset,
  logout,
  retake,
}: {
  reset: () => Promise<boolean>;
  logout: () => void;
  retake: () => void;
}) {
  const { profile, setProfile, setTour, setTab } = useApp();
  const t = useT();
  const { lang, setLang } = useContext(LangCtx);
  const [confirm, setConfirm] = useState(false);
  const Row = ({
    icon,
    title,
    children,
  }: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
  }) => (
    <Card className="grid gap-3">
      <h2 className="text-lg font-bold m-0 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </Card>
  );
  return (
    <>
      <PageHead title={t("Settings")} />
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
      <Row icon={<User size={18} />} title={t("Profile")}>
        <p className="m-0 text-soft">{profile.email}</p>
        <p className="f-ui m-0">{t("Monthly income")}</p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {INCOME_RANGES.map((r, i) => (
            <Tile
              key={r}
              label={r}
              on={profile.income === i}
              onClick={() => setProfile({ ...profile, income: i })}
            />
          ))}
        </div>
        <p className="f-ui m-0">{t("Monthly savings")}</p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {SAVINGS_RANGES.map((r, i) => (
            <Tile
              key={r}
              label={t(r)}
              on={profile.savings === i}
              onClick={() => setProfile({ ...profile, savings: i })}
            />
          ))}
        </div>
      </Row>
      <Row icon={<Coins size={18} />} title={t("Currency display")}>
        <Segmented
          label={t("Currency display")}
          value={profile.currency}
          onChange={(c) => setProfile({ ...profile, currency: c })}
          options={[
            ["symbol", "₺ 1.000"],
            ["code", "1.000 TRY"],
          ]}
        />
        <p className="text-sm text-soft m-0">{t("Display only — amounts are not converted.")}</p>
      </Row>
      <Card className="grid sm:grid-cols-2 gap-2">
        <Button icon={<Repeat size={16} />} onClick={retake}>
          {t("Retake spending style questions")}
        </Button>
        <Button
          icon={<Map size={16} />}
          onClick={() => {
            setTab("home");
            setTour(0);
          }}
        >
          {t("Restart tour")}
        </Button>
        <Button icon={<RefreshCw size={16} />} onClick={() => setConfirm(true)}>
          {t("Reset data")}
        </Button>
        <Button icon={<LogOut size={16} />} onClick={logout}>
          {t("Log out")}
        </Button>
      </Card>
      <Row icon={<Info size={18} />} title={t("About")}>
        <p className="m-0 text-soft">
          {t(
            "SpendSense is an HCI course prototype. Scores are simple heuristics, not financial advice.",
          )}
        </p>
      </Row>
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
    </>
  );
}
