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
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useApp } from "./context";
import {
  Button,
  Card,
  Chip,
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
  useT,
  useToast,
  fmt,
  curLabel,
} from "./ui";
import { EntryRow, dayLabel } from "./Money";
import { REASONS, FEELINGS } from "./Decide";
import {
  uid,
  today,
  monthTotals,
  purchaseEntry,
  type Goal,
  type GStatus,
  type Decision,
  type DecisionKind,
} from "./store";

const daysUntil = (iso: string) =>
  Math.ceil((new Date(iso).getTime() - new Date(today()).getTime()) / 864e5);
const thisMonth = (d: string) => d.slice(0, 7) === today().slice(0, 7);

export function HomePage() {
  const { entries, goals, waiting, decisions, setQuickAdd, setTab, openDecide } = useApp();
  const t = useT();
  const { income: inc, spent: sp } = monthTotals(entries);
  const goal = goals.find((g) => g.status === "Active");
  const avgPrice = (k: DecisionKind) => {
    const xs = decisions.filter((d) => d.decision === k);
    return xs.length ? xs.reduce((a, b) => a + b.price, 0) / xs.length : null;
  };
  const waitedAvg = avgPrice("Wait"),
    boughtAvg = avgPrice("Buy");
  const reflect = decisions.find(
    (d) => d.decision === "Buy" && !d.reflection && daysUntil(d.date) <= -2,
  );
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
      {reflect && <ReflectCard d={reflect} />}
      <div className={`grid gap-5 ${goal ? "md:grid-cols-2" : ""}`}>
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
              <p className="f-voice m-0 mt-1">
                {t(
                  goal.saved > 0
                    ? "You're getting closer to your goal."
                    : "Add money to this goal whenever you're ready.",
                )}
              </p>
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
      {waitedAvg !== null && boughtAvg !== null && waitedAvg > boughtAvg && (
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

function ReflectCard({ d }: { d: Decision }) {
  const { decisions, setDecisions } = useApp();
  const t = useT();
  const toast = useToast();
  return (
    <Card className="grid gap-3">
      <h2 className="text-lg font-bold m-0">
        {t("You bought {p} {n} days ago. How do you feel about it now?", {
          p: d.name,
          n: -daysUntil(d.date),
        })}
      </h2>
      <div className="grid grid-cols-5 gap-1.5">
        {REFL.map((r, i) => (
          <button
            key={r}
            onClick={async () => {
              if (
                !(await setDecisions(
                  decisions.map((x) => (x.id === d.id ? { ...x, reflection: i + 1 } : x)),
                ))
              )
                return;
              toast(t("Reflection saved."));
            }}
            className="f-ui text-xs sm:text-sm min-h-14 rounded-inner px-1 clay-cream"
          >
            <span className="f-num block">{i + 1}</span>
            {t(r)}
          </button>
        ))}
      </div>
    </Card>
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
              <CheckCircle2 size={20} className="text-leaf" aria-label={t("Done")} />
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

const GOAL_IDEAS = ["Laptop", "Vacation", "Emergency fund", "New phone"];
const TARGET_IDEAS = [5000, 10000, 25000, 50000];
const inMonths = (n: number) => {
  const d = new Date(today());
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};
// One question per step, with a live preview of the goal filling up.
function GoalFlow({
  initial,
  editing,
  onCancel,
  onSave,
}: {
  initial: Goal;
  editing: boolean;
  onCancel: () => void;
  onSave: (g: Goal) => Promise<void>;
}) {
  const t = useT();
  const [g, setG] = useState(initial);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [discard, setDiscard] = useState(false);
  const pct = g.target > 0 ? Math.round((g.saved / g.target) * 100) : 0;
  const remaining = Math.max(0, g.target - g.saved);
  const months = g.date ? Math.max(1, Math.round(daysUntil(g.date) / 30.44)) : 0;
  const questions = [
    "What are you saving for?",
    "How much do you need?",
    "How much have you already set aside?",
    "When would you like to reach it?",
  ];
  const next = async () => {
    if (step === 0 && !g.name.trim()) return setErr(t("Give your goal a name."));
    if (step === 1 && g.target <= 0) return setErr(t("Enter a target above zero."));
    if (step === 3 && g.date && g.date <= today())
      return setErr(t("Pick a date after today, or leave it empty."));
    setErr("");
    if (step < 3) setStep(step + 1);
    else await onSave({ ...g, name: g.name.trim() });
  };
  const back = () => {
    setErr("");
    if (step > 0) setStep(step - 1);
    else if (!editing && (g.name || g.target)) setDiscard(true);
    else onCancel();
  };
  const amount = (k: "target" | "saved") => (
    <label className="f-ui grid gap-1">
      {t(k === "target" ? "Target" : "Saved")} ({curLabel()})
      <input
        autoFocus
        inputMode="numeric"
        placeholder="0"
        value={g[k] || ""}
        aria-invalid={!!err}
        aria-describedby={err ? "goal-flow-error" : undefined}
        onChange={(e) => /^\d{0,8}$/.test(e.target.value) && setG({ ...g, [k]: +e.target.value })}
        onKeyDown={(e) => e.key === "Enter" && void next()}
        className="h-14 rounded-tile border border-line bg-white px-4 f-num text-2xl"
      />
    </label>
  );
  return (
    <>
      <PageHead title={t(editing ? "Edit goal" : "Add goal")} />
      <div>
        <p className="f-ui text-sm m-0 mb-1">{t("Step {n} of {t}", { n: step + 1, t: 4 })}</p>
        <div className="h-2.5 rounded-full bg-track">
          <div
            className="h-full rounded-full bg-sun transition-all"
            style={{ width: `${((step + 1) / 4) * 100}%` }}
          />
        </div>
      </div>
      <Card className="flex gap-4 items-center">
        <Ring value={pct} size={88} label={`${g.name || t("Your goal")} ${pct}%`} />
        <div className="min-w-0">
          <h2 className="text-xl font-bold m-0 truncate">{g.name || t("Your goal")}</h2>
          <p className="f-num m-0">
            {fmt(g.saved)} / {fmt(g.target)}
          </p>
          <p className="text-sm text-soft m-0">
            {t("Remaining")} {fmt(remaining)}
            {g.date && ` · ${new Date(g.date).toLocaleDateString()}`}
          </p>
        </div>
      </Card>
      <Say key={step} expr={step === 3 ? "calm" : "thinking"} size={56} live>
        {t(questions[step])}
      </Say>
      <Card key={"s" + step} className="grid gap-3 rise">
        {step === 0 && (
          <>
            <label className="f-ui grid gap-1">
              {t("Goal name")}
              <input
                autoFocus
                value={g.name}
                aria-invalid={!!err}
                aria-describedby={err ? "goal-flow-error" : undefined}
                onChange={(e) => setG({ ...g, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && void next()}
                className="h-14 rounded-tile border border-line bg-white px-4 font-sans text-lg"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {GOAL_IDEAS.map((n) => (
                <Chip key={n} on={g.name === t(n)} onClick={() => setG({ ...g, name: t(n) })}>
                  {t(n)}
                </Chip>
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            {amount("target")}
            <div className="flex flex-wrap gap-2">
              {TARGET_IDEAS.map((n) => (
                <Chip key={n} on={g.target === n} onClick={() => setG({ ...g, target: n })}>
                  {fmt(n)}
                </Chip>
              ))}
            </div>
          </>
        )}
        {step === 2 && (
          <>
            {amount("saved")}
            <p className="m-0 text-sm text-soft">{t("Starting from zero is fine too.")}</p>
          </>
        )}
        {step === 3 && (
          <>
            <label className="f-ui grid gap-1">
              {t("Target date (optional)")}
              <input
                autoFocus
                type="date"
                min={today()}
                value={g.date ?? ""}
                aria-invalid={!!err}
                aria-describedby={err ? "goal-flow-error" : undefined}
                onChange={(e) => setG({ ...g, date: e.target.value || undefined })}
                className="h-14 rounded-tile border border-line bg-white px-4 font-sans"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  [3, "3 months"],
                  [6, "6 months"],
                  [12, "1 year"],
                ] as const
              ).map(([n, l]) => (
                <Chip
                  key={n}
                  on={g.date === inMonths(n)}
                  onClick={() => setG({ ...g, date: inMonths(n) })}
                >
                  {t(l)}
                </Chip>
              ))}
              {g.date && (
                <Chip on={false} onClick={() => setG({ ...g, date: undefined })}>
                  {t("No deadline")}
                </Chip>
              )}
            </div>
            <p className="m-0 f-voice text-lg" aria-live="polite">
              {remaining === 0
                ? t("You've already reached this amount.")
                : g.date
                  ? t("Setting aside about {m} a month gets you there.", {
                      m: fmt(Math.ceil(remaining / months)),
                    })
                  : t("No deadline is fine too. You can add one later.")}
            </p>
          </>
        )}
        {err && (
          <p
            id="goal-flow-error"
            role="alert"
            className="m-0 text-attn bg-butter rounded-inner px-3 py-2"
          >
            {err}
          </p>
        )}
      </Card>
      <div className="flex justify-between gap-2">
        <Button onClick={back}>{t(step === 0 ? "Cancel" : "Back")}</Button>
        <Button variant="coral" big onClick={() => void next()}>
          {t(step === 3 ? "Save goal" : "Next")}
        </Button>
      </div>
      {discard && (
        <Dialog
          title={t("Discard this goal?")}
          body={t("What you entered for this goal will not be saved.")}
          confirm={t("Discard")}
          onClose={() => setDiscard(false)}
          onConfirm={onCancel}
        />
      )}
    </>
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
  if (form)
    return (
      <GoalFlow
        initial={form}
        editing={goals.some((g) => g.id === form.id)}
        onCancel={() => setForm(null)}
        onSave={async (g) => {
          if (!(await upd(g))) return;
          setForm(null);
          toast(t("Goal saved."));
        }}
      />
    );
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
        label={t("Status")}
        value={f}
        onChange={setF}
        options={(["Active", "Completed", "Archived"] as GStatus[]).map((s) => [s, t(s)])}
      />
      {note && (
        <Say expr="calm" size={56} live>
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
      {add && (
        <Sheet title={`${t("Add money")} · ${add.name}`} onClose={() => setAdd(null)}>
          <div className="grid gap-3">
            <label className="f-ui grid gap-1">
              {t("Amount")} ({curLabel()})
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
  const { waiting, decisions, entries, updateWorkspace, setTab, openDecide } = useApp();
  const t = useT();
  const toast = useToast();
  const act = async (id: string, d: DecisionKind) => {
    const w = waiting.find((x) => x.id === id)!;
    const pw = waiting,
      pd = decisions,
      pe = entries;
    if (
      !(await updateWorkspace((previous) => ({
        ...previous,
        waiting: waiting.filter((x) => x.id !== id),
        decisions: [{ ...w, id: uid(), decision: d, date: today() }, ...decisions],
        entries: d === "Buy" ? [purchaseEntry(w), ...entries] : entries,
      })))
    )
      return;
    toast(t(d === "Buy" ? "Saved: Buy. Added to your expenses." : `Saved: ${d}.`), () => {
      void updateWorkspace((previous) => ({
        ...previous,
        waiting: pw,
        decisions: pd,
        entries: pe,
      }));
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
              {/* The status pill wraps below on narrow phones instead of squeezing the title. */}
              <div className="flex flex-wrap items-start gap-3">
                <span className="w-11 h-11 rounded-inner bg-violettint text-violet flex items-center justify-center">
                  <Clock size={20} aria-hidden />
                </span>
                <div className="flex-1 basis-40">
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
        label={t("Filter")}
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
  // Average later rating per feeling at decision time, lowest first.
  const rated = decisions.filter((d) => d.reflection);
  const byFeeling = [...new Set(rated.map((d) => d.feeling))]
    .map((f) => {
      const xs = rated.filter((d) => d.feeling === f);
      return [f, xs.reduce((a, b) => a + b.reflection!, 0) / xs.length, xs.length] as const;
    })
    .sort((a, b) => a[1] - b[1]);
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
          <Empty text={t("No expenses this month yet.")} />
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
              {t(
                "Counts of feelings and reasons across {n} decisions and waiting items. Observations only — not a judgment.",
                { n: all.length },
              )}
            </Expand>
          </>
        )}
      </Card>
      <Card className="grid gap-3">
        <h2 className="text-xl font-bold m-0">{t("How decisions felt later")}</h2>
        {byFeeling.length < 2 ? (
          <Empty
            expr="thinking"
            text={t("Rate a few past decisions in History and patterns will appear here.")}
          />
        ) : (
          <>
            <Say expr="thinking" size={48}>
              {t(
                "Decisions made while feeling {f} got your lowest later ratings ({n}/5). Just something to notice.",
                { f: t(byFeeling[0][0]).toLowerCase(), n: byFeeling[0][1].toFixed(1) },
              )}
            </Say>
            {byFeeling.map(([f, avg, n]) => (
              <Tube
                key={f}
                label={`${t(f)} · ${avg.toFixed(1)}/5 · ${t("{n} rated", { n })}`}
                value={(avg / 5) * 100}
                color="bg-violet"
                showPct={false}
              />
            ))}
          </>
        )}
      </Card>
    </>
  );
}
