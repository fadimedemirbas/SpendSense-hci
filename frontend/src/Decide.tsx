import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Check,
  HeartHandshake,
  Clock3,
  Tag,
  Wrench,
  Users,
  Gift,
  Eye,
  CircleDot,
  Leaf,
  Sparkles,
  CloudRain,
  Meh,
  Moon,
  Circle,
  ShoppingBag,
  X,
  Hourglass,
  Wallet,
  Target,
  Zap,
  Pencil,
  ReceiptText,
  ChevronDown,
  Lightbulb,
} from "lucide-react";
import { useApp } from "./context";
import {
  Button,
  Card,
  Chip,
  Expand,
  PageHead,
  Pill,
  Ring,
  Rule,
  Say,
  Segmented,
  Tile,
  Tube,
  useT,
  useToast,
  Dialog,
  curLabel,
  useExactAmount,
} from "./ui";
import {
  EXP_CATS,
  analyze,
  level,
  uid,
  today,
  addDays,
  WAIT_DAYS,
  type Purchase,
  monthTotals,
  habitSignals,
  purchaseEntry,
  type WaitLen,
  type DecisionKind,
} from "./store";
import { outcomeLabel, type Factor } from "./lib/decideLabels";

export const REASONS: [string, typeof Check][] = [
  ["need", HeartHandshake],
  ["wanted", Clock3],
  ["sale", Tag],
  ["easier", Wrench],
  ["social", Users],
  ["reward", Gift],
  ["attention", Eye],
  ["other", CircleDot],
];
export const FEELINGS: [string, typeof Check][] = [
  ["Calm", Leaf],
  ["Excited", Sparkles],
  ["Stressed", CloudRain],
  ["Bored", Meh],
  ["Tired", Moon],
  ["Neutral", Circle],
];
// Labels of the answer summary. "Wait time" (not "Wait") so the last answer does not read
// like the Wait decision button.
const STEPS = ["What", "Why", "Feeling", "Own", "Wait time"];
const fieldError = "m-0 -mt-1 text-sm text-attn bg-butter rounded-inner px-3 py-2";
const WAITS: [WaitLen, string][] = [
  ["24h", "24 hours"],
  ["3d", "3 days"],
  ["1w", "1 week"],
];

export function Decide() {
  const {
    prefill,
    openDecide,
    lastCat,
    setLastCat,
    setTab,
    canGoBack,
    goBack,
    recordAnalysis,
    profile,
    goals,
    entries,
  } = useApp();
  const t = useT();
  const blank = (): Purchase => ({
    name: "",
    price: 0,
    cat: lastCat,
    reasons: [],
    feeling: "",
    own: false,
    usable: undefined,
    wait: "3d",
  });
  const [p, setP] = useState<Purchase>({ ...blank(), ...prefill });
  const [own, setOwn] = useState<boolean | null>(prefill?.own ?? null);
  const [waitSet, setWaitSet] = useState(!!prefill?.wait);
  const [s, setS] = useState(0);
  const [hint, setHint] = useState("");
  const [phase, setPhase] = useState<"ask" | "load" | "result">(prefill?.review ? "result" : "ask");
  const [priceStr, setPriceStr] = useState(prefill?.price ? String(prefill.price) : "");
  const [analysisId, setAnalysisId] = useState<string | undefined>(prefill?.analysisId);
  // Field-level errors for step 1 (product name and price).
  const [fieldErr, setFieldErr] = useState<{ name?: string; price?: string }>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  // Focus targets: the step replaced by Next/Back/Edit and the analysis status
  // would otherwise leave keyboard focus on <body>.
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);
  const [fromAnalyze, setFromAnalyze] = useState(false);
  const amount = useExactAmount();
  // Back from the result via Edit: every answer is listed as editable (D9).
  const [reviewing, setReviewing] = useState(false);
  const answersRef = useRef<HTMLOListElement>(null);
  const focusAnswers = useRef(false);
  useEffect(() => {
    if (focusAnswers.current && phase === "ask") {
      focusAnswers.current = false;
      answersRef.current?.querySelector<HTMLButtonElement>("li button")?.focus();
      return;
    }
    if (!moveFocus.current) return;
    moveFocus.current = false;
    if (phase === "ask") stepHeading.current?.focus();
    if (phase === "load") loadingRef.current?.focus();
  }, [s, phase]);
  useEffect(() => {
    setP({ ...blank(), ...prefill });
    setPriceStr(prefill?.price ? String(prefill.price) : "");
    setOwn(prefill?.own ?? null);
    setWaitSet(!!prefill?.wait);
    setS(0);
    setAnalysisId(prefill?.analysisId);
    setPhase(prefill?.review ? "result" : "ask");
    setFieldErr({});
    setFromAnalyze(false);
    setReviewing(false);
  }, [prefill]);
  const valid = [
    p.name.trim() !== "" && p.price > 0,
    p.reasons.length > 0,
    !!p.feeling,
    own === false || (own === true && p.usable !== undefined),
    waitSet,
  ];
  const hints = [
    "Add a name and a price above zero.",
    "Pick at least one reason to continue.",
    "Choose how you feel.",
    "Answer to continue.",
    "Answer to continue.",
  ];
  const next = async () => {
    if (s === 0) {
      const errors = {
        name: p.name.trim() ? undefined : t("Enter a product name."),
        price: p.price > 0 ? undefined : t("Enter a price above zero."),
      };
      setFieldErr(errors);
      if (errors.name || errors.price) {
        setHint("");
        return (errors.name ? nameRef : priceRef).current?.focus();
      }
    }
    if (!valid[s]) return setHint(t(hints[s]));
    setHint("");
    moveFocus.current = true;
    if (s === 0) setLastCat(p.cat);
    if (s < 4) setS(s + 1);
    else {
      setPhase("load");
      const goal = goals.find((g) => g.status === "Active");
      const [id] = await Promise.all([
        recordAnalysis(p, analyze(p, profile, goal, entries), goal?.id),
        new Promise((resolve) => setTimeout(resolve, 900)),
      ]);
      if (id) {
        setAnalysisId(id);
        setFromAnalyze(true);
        setReviewing(false);
        setPhase("result");
      } else {
        setPhase("ask");
        setHint(t("Your analysis could not be saved. Please try again."));
      }
    }
  };
  const [confirmCancel, setConfirmCancel] = useState(false);
  const dirty = !!(p.name || priceStr || p.reasons.length || p.feeling);
  // Cancel returns to the screen the user came from (Money, Home…), else Home.
  const leave = () => {
    openDecide(undefined);
    if (canGoBack) goBack();
    else setTab("home");
  };
  const cancel = () => (dirty ? setConfirmCancel(true) : leave());
  if (phase === "load")
    return (
      <Card>
        <div ref={loadingRef} tabIndex={-1} data-focus-region>
          <Say expr="curious" live>
            {t("Looking at your context…")}
          </Say>
        </div>
      </Card>
    );
  if (phase === "result")
    return (
      <Analysis
        p={p}
        analysisId={analysisId}
        waitId={prefill?.waitId}
        focusTitle={fromAnalyze}
        edit={() => {
          // Return with all answers listed for editing; analysis only reruns on Analyze.
          focusAnswers.current = true;
          setFromAnalyze(false);
          setReviewing(true);
          setPhase("ask");
          setS(STEPS.length - 1);
        }}
      />
    );
  const toggle = (r: string) => {
    if (!p.reasons.includes(r) && p.reasons.length >= 3) return;
    setP({
      ...p,
      reasons: p.reasons.includes(r) ? p.reasons.filter((x) => x !== r) : [...p.reasons, r],
    });
  };
  const questions = [
    "What are you thinking of buying?",
    "Why do you want it?",
    "How are you feeling right now?",
    "Do you already have something similar?",
    "How long could you wait?",
  ];
  const waitLabel = t(WAITS.find(([w]) => w === p.wait)![1]);
  const ownLabel =
    own === null ? "" : own ? t(p.usable ? "Yes, still usable" : "Yes, not usable") : t("No");
  const answers = [
    `${p.name} · ${amount(p.price)}`,
    p.reasons.map((r) => t(r)).join(", "),
    t(p.feeling),
    ownLabel,
    waitLabel,
  ];
  const back = () => {
    setHint("");
    setFieldErr({});
    moveFocus.current = true;
    setS(s - 1);
  };
  const enter = (e: React.KeyboardEvent) => e.key === "Enter" && void next();
  return (
    <>
      <PageHead title={t("Should I buy it?")} sub={t("Let's add a little context first.")} />
      <div className="grid md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5 items-start">
        <Receipt p={p} own={own} waitSet={waitSet} step={s} />
        <ol
          ref={answersRef}
          className="grid gap-2 m-0 p-0 list-none md:order-first"
          aria-label={t("Progress")}
        >
          {STEPS.map((l, i) =>
            i < s ? (
              // Every completed answer stays visible and editable on all screen sizes (D8).
              <li key={l}>
                <button
                  onClick={() => {
                    setHint("");
                    moveFocus.current = true;
                    setS(i);
                  }}
                  aria-label={`${t("Edit")}: ${t(l)} · ${answers[i]}`}
                  className="rise w-full min-h-11 flex items-center gap-2 px-3 py-2 rounded-tile bg-card border border-cardline text-left f-ui text-sm"
                >
                  <Check size={16} className="text-leaf shrink-0" aria-hidden />
                  <span className="text-soft shrink-0">{t(l)}</span>
                  <span className="truncate flex-1">{answers[i]}</span>
                  <Pencil size={14} className="text-soft shrink-0" aria-hidden />
                </button>
              </li>
            ) : i === s ? (
              <li key={l} aria-current="step">
                <Card className="grid gap-3 rise ring-2 ring-sun">
                  {/* Visible on every screen size; receives focus on step changes so
                      screen readers hear the position and the question together. */}
                  <h2 ref={stepHeading} tabIndex={-1} className="f-ui text-sm text-soft m-0">
                    <span aria-hidden>{t("Step {n} of {t}", { n: s + 1, t: STEPS.length })}</span>
                    <span className="sr-only">
                      {`${t("Step {n} of {t}", { n: s + 1, t: STEPS.length })}: ${t(questions[s])}`}
                    </span>
                  </h2>
                  <Say key={s} expr="thinking" size={48}>
                    {t(questions[s])}
                  </Say>
                  {reviewing && (
                    <p className="m-0 text-sm text-soft">
                      {t(
                        "You can change any answer above. Nothing is analyzed again until you press Analyze.",
                      )}
                    </p>
                  )}
                  {s === 0 && (
                    <>
                      <label className="f-ui grid gap-1">
                        {t("Product name")}
                        <input
                          autoFocus
                          ref={nameRef}
                          value={p.name}
                          aria-invalid={!!fieldErr.name || undefined}
                          aria-describedby={fieldErr.name ? `${fieldId}-name` : undefined}
                          onChange={(e) => {
                            setP({ ...p, name: e.target.value });
                            if (fieldErr.name) setFieldErr({ ...fieldErr, name: undefined });
                          }}
                          onKeyDown={enter}
                          className="h-13 rounded-tile border border-line bg-white px-4 font-sans"
                        />
                      </label>
                      {fieldErr.name && (
                        <p id={`${fieldId}-name`} role="alert" className={fieldError}>
                          {fieldErr.name}
                        </p>
                      )}
                      <label className="f-ui grid gap-1">
                        {t("Price")} ({curLabel()})
                        <input
                          ref={priceRef}
                          inputMode="decimal"
                          value={priceStr}
                          aria-invalid={!!fieldErr.price || undefined}
                          aria-describedby={`${fieldId}-price-hint${fieldErr.price ? ` ${fieldId}-price` : ""}`}
                          onChange={(e) => {
                            if (/^\d{0,8}([.,]\d{0,2})?$/.test(e.target.value)) {
                              setPriceStr(e.target.value);
                              setP({
                                ...p,
                                price: parseFloat(e.target.value.replace(",", ".")) || 0,
                              });
                              if (fieldErr.price) setFieldErr({ ...fieldErr, price: undefined });
                            }
                          }}
                          onKeyDown={enter}
                          className="h-13 rounded-tile border border-line bg-white px-4 f-num text-xl"
                        />
                      </label>
                      {/* Matches the parser: digits, one comma or dot, up to 2 decimals. */}
                      <p id={`${fieldId}-price-hint`} className="m-0 -mt-1 text-sm text-soft">
                        {t(
                          "Numbers only, without thousands separators. Use a comma or dot for kuruş, e.g. 1250 or 1250.50.",
                        )}
                      </p>
                      {fieldErr.price && (
                        <p id={`${fieldId}-price`} role="alert" className={fieldError}>
                          {fieldErr.price}
                        </p>
                      )}
                      <p className="f-ui m-0">{t("Category")}</p>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(7.25rem,1fr))] gap-2 sm:gap-3">
                        {EXP_CATS.map(([c, I]) => (
                          <Tile
                            dense
                            key={c}
                            on={p.cat === c}
                            onClick={() => setP({ ...p, cat: c })}
                            icon={<I size={20} />}
                            label={t(c)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  {s === 1 && (
                    <>
                      <p className="m-0 f-ui" aria-live="polite">
                        {t("{n} / 3 selected", { n: p.reasons.length })}
                      </p>
                      {p.reasons.length >= 3 && (
                        <p className="m-0 text-sm text-attn bg-butter rounded-inner px-3 py-2">
                          {t("Maximum reached. Remove one to choose another.")}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {REASONS.map(([r, I]) => (
                          <Chip
                            key={r}
                            disabled={!p.reasons.includes(r) && p.reasons.length >= 3}
                            on={p.reasons.includes(r)}
                            onClick={() => toggle(r)}
                            icon={<I size={16} />}
                          >
                            {t(r)}
                          </Chip>
                        ))}
                      </div>
                    </>
                  )}
                  {s === 2 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {FEELINGS.map(([f, I]) => (
                        <Tile
                          key={f}
                          on={p.feeling === f}
                          onClick={() => setP({ ...p, feeling: f })}
                          icon={<I size={26} />}
                          label={t(f)}
                        />
                      ))}
                    </div>
                  )}
                  {s === 3 && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <Tile
                          on={own === true}
                          onClick={() => {
                            setOwn(true);
                            setP({ ...p, own: true });
                          }}
                          label={t("Yes")}
                        />
                        <Tile
                          on={own === false}
                          onClick={() => {
                            setOwn(false);
                            setP({ ...p, own: false, usable: undefined });
                          }}
                          label={t("No")}
                        />
                      </div>
                      {own && (
                        <div className="rise grid gap-2">
                          <p className="f-ui m-0">{t("Is it still usable?")}</p>
                          <div className="grid grid-cols-2 gap-2">
                            <Tile
                              on={p.usable === true}
                              onClick={() => setP({ ...p, usable: true })}
                              label={t("Yes")}
                            />
                            <Tile
                              on={p.usable === false}
                              onClick={() => setP({ ...p, usable: false })}
                              label={t("No")}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {s === 4 && (
                    <div className="grid grid-cols-3 gap-2">
                      {WAITS.map(([w, l]) => (
                        <Tile
                          key={w}
                          on={waitSet && p.wait === w}
                          onClick={() => {
                            setWaitSet(true);
                            setP({ ...p, wait: w });
                          }}
                          icon={<Hourglass size={20} />}
                          label={t(l)}
                        />
                      ))}
                    </div>
                  )}
                  {hint && (
                    <p role="status" className="m-0 text-attn bg-butter rounded-inner px-3 py-2">
                      {hint}
                    </p>
                  )}
                  <div className="flex justify-between gap-2 flex-wrap">
                    <div className="flex gap-2">
                      <Button onClick={cancel}>{t("Cancel")}</Button>
                      {s > 0 && <Button onClick={back}>{t("Back")}</Button>}
                    </div>
                    <Button variant="coral" big onClick={next}>
                      {s === 4 ? t("Analyze") : t("Next")}
                    </Button>
                  </div>
                </Card>
              </li>
            ) : (
              <li
                key={l}
                className="hidden md:flex items-center gap-2 px-3 min-h-11 rounded-tile border border-dashed border-cardline text-soft f-ui text-sm"
              >
                <Circle size={16} aria-hidden />
                {t(questions[i])}
              </li>
            ),
          )}
        </ol>
      </div>
      {confirmCancel && (
        <Dialog
          title={t("Discard this purchase?")}
          body={t("Your answers for this purchase will not be saved.")}
          confirm={t("Discard")}
          cancel={t("Keep editing")}
          onClose={() => setConfirmCancel(false)}
          onConfirm={leave}
        />
      )}
    </>
  );
}

// Live summary that fills in as each answer is given. Collapses to a strip on phones.
function Receipt({
  p,
  own,
  waitSet,
  step,
}: {
  p: Purchase;
  own: boolean | null;
  waitSet: boolean;
  step: number;
}) {
  const { profile, entries } = useApp();
  const t = useT();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const amount = useExactAmount();
  const a = analyze(p, profile, undefined, entries);
  const month = monthTotals(entries);
  const left = a.income - month.spent;
  // analyze() falls back to the onboarding income range until this month has income.
  const estimated = !(month.income > 0);
  const CatIcon = EXP_CATS.find(([c]) => c === p.cat)?.[1] ?? CircleDot;
  const value = (v: ReactNode) =>
    v ? (
      <span key={String(v)} className="rise text-right">
        {v}
      </span>
    ) : (
      <span className="text-soft">—</span>
    );
  return (
    <Card className="grid gap-2 md:sticky md:top-4">
      <button
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
        className="md:hidden flex items-center gap-2 min-h-11 f-ui text-sm text-left"
      >
        <ReceiptText size={18} aria-hidden />
        {/* Hidden separators keep the spoken name readable:
            "Purchase receipt: Headphones · ₺130, Step 2 of 5" (not "₺1302/5"). */}
        <b className="truncate flex-1">
          <span className="sr-only">{t("Purchase receipt")}: </span>
          {p.name || t("New purchase")}
          {p.price > 0 && ` · ${amount(p.price)}`}
        </b>
        <span className="text-soft" aria-hidden>
          {step + 1}/5
        </span>
        <span className="sr-only">, {t("Step {n} of {t}", { n: step + 1, t: STEPS.length })}</span>
        <ChevronDown size={18} className={`transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {/* grid-cols-1 = minmax(0,1fr): a long product name truncates instead of
          widening the receipt past the screen on tablets. */}
      <div id={panelId} className={`${open ? "grid" : "hidden"} md:grid grid-cols-1 gap-2`}>
        <p className="hidden md:block f-ui text-xs text-soft text-center tracking-widest uppercase m-0">
          {t("Purchase receipt")}
        </p>
        <div className="flex items-center gap-2">
          <CatIcon size={20} aria-hidden />
          <b className="truncate">{p.name || t("New purchase")}</b>
        </div>
        <p key={p.price} className="f-num text-3xl m-0 rise">
          {amount(p.price)}
        </p>
        <dl className="m-0 grid text-sm">
          {(
            [
              ["Category", t(p.cat)],
              [
                "Reasons",
                p.reasons.length > 0 && (
                  <span className="flex flex-wrap gap-1 justify-end">
                    {p.reasons.map((r) => (
                      <Pill key={r} tone="butter">
                        {t(r)}
                      </Pill>
                    ))}
                  </span>
                ),
              ],
              ["Feeling", p.feeling && t(p.feeling)],
              [
                "Similar item",
                own === null ? "" : own ? t(p.usable ? "Yes, still usable" : "Yes") : t("No"),
              ],
              ["Wait time", waitSet && t(WAITS.find(([w]) => w === p.wait)![1])],
            ] as [string, ReactNode][]
          ).map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between gap-3 py-1.5 border-t border-dashed border-cardline"
            >
              <dt className="text-soft">{t(k)}</dt>
              <dd className="m-0">{value(v)}</dd>
            </div>
          ))}
        </dl>
        {p.price > 0 && (
          <p className="m-0 text-sm text-soft flex gap-2 items-start" aria-live="polite">
            <Lightbulb size={16} className="shrink-0 mt-0.5" aria-hidden />
            <span>
              {left > 0
                ? t("That's {n}% of what's left this month.", {
                    n: Math.round((p.price / left) * 100),
                  })
                : t("Nothing is left this month after your expenses.")}
              {estimated && (
                <span className="block text-xs mt-0.5">
                  {t("Estimate based on your onboarding ranges.")}
                </span>
              )}
            </span>
          </p>
        )}
      </div>
    </Card>
  );
}

function Analysis({
  p,
  analysisId,
  waitId,
  edit,
  focusTitle,
}: {
  p: Purchase;
  analysisId?: string;
  waitId?: string;
  edit: () => void;
  /** Move focus to the result title after "Analyze" (not when opened from elsewhere). */
  focusTitle?: boolean;
}) {
  const {
    profile,
    goals,
    updateWorkspace,
    recordAnalysis,
    decisions,
    waiting,
    entries,
    setTab,
    openDecide,
  } = useApp();
  const t = useT();
  const toast = useToast();
  const title = useRef<HTMLHeadingElement>(null);
  const amount = useExactAmount();
  const waitHelpId = useId();
  useEffect(() => {
    if (focusTitle) title.current?.focus();
  }, []); // On mount only: a later re-render must not pull focus back.
  const active = goals.filter((g) => g.status === "Active");
  const [goalId, setGoalId] = useState(active[0]?.id);
  const goal = active.find((g) => g.id === goalId) ?? active[0];
  const a = analyze(p, profile, goal, entries);
  const month = monthTotals(entries);
  const left = a.income - month.spent;
  const habits = habitSignals(p, profile);
  const factors: [string, number, string, typeof Wallet, boolean, string][] = [
    [
      "Budget fit",
      a.budget,
      "Higher is better.",
      Wallet,
      true,
      left > 0
        ? t(
            "The bigger the share of what's left this month, the lower this score. This purchase uses {n}% of it.",
            { n: Math.round((p.price / left) * 100) },
          )
        : t("Nothing is left this month, so this score is 0."),
    ],
    [
      "Need level",
      a.need,
      "Higher means a stronger stated need.",
      HeartHandshake,
      true,
      t(
        "Saying you need it, that it makes something easier, or that you don't own something similar raises this score. Owning a usable one lowers it.",
      ),
    ],
    [
      "Goal impact",
      a.goalImpact,
      "Lower means less effect on your goal.",
      Target,
      false,
      goal
        ? t("The bigger the share of what's left for {g}, the higher this score.", { g: goal.name })
        : t("No active goal, so this score is 0."),
    ],
    [
      "Impulse signals",
      a.impulse,
      "Lower means fewer impulse signals.",
      Zap,
      false,
      t(
        "Sale, catching your eye, treating yourself, friends, and feeling excited, stressed, bored or tired each raise this score. So do a 24-hour wait and matching answers from your spending style.",
      ),
    ],
  ];
  const decide = async (d: DecisionKind, w?: WaitLen) => {
    const prevD = decisions,
      prevW = waiting,
      prevE = entries;
    // A different compared goal or a re-review needs its own analysis snapshot.
    const savedAnalysisId =
      waitId || goal?.id !== active[0]?.id
        ? await recordAnalysis(p, a, goal?.id)
        : (analysisId ?? (await recordAnalysis(p, a, goal?.id)));
    if (!savedAnalysisId) return;
    const rec = {
      ...p,
      analysisId: savedAnalysisId,
      wait: w ?? p.wait,
      id: uid(),
      decision: d,
      date: today(),
      fit: a.fit,
    };
    const rest = waiting.filter((x) => x.id !== waitId);
    const nextWaiting =
      d === "Wait"
        ? [
            {
              ...p,
              analysisId: savedAnalysisId,
              wait: w!,
              id: waitId ?? uid(),
              added: today(),
              review: addDays(today(), WAIT_DAYS[w!]),
              fit: a.fit,
            },
            ...rest,
          ]
        : rest;
    if (
      !(await updateWorkspace((previous) => ({
        ...previous,
        decisions: [rec, ...decisions],
        waiting: nextWaiting,
        entries: d === "Buy" ? [purchaseEntry(p), ...entries] : entries,
      })))
    )
      return;
    toast(
      d === "Wait"
        ? t("Added to your waiting list.")
        : d === "Buy"
          ? t("Saved: Buy. Added to your expenses.")
          : t(`Saved: ${d}.`),
      () => {
        void updateWorkspace((previous) => ({
          ...previous,
          decisions: prevD,
          waiting: prevW,
          entries: prevE,
        }));
      },
    );
    openDecide(undefined);
    setTab(d === "Wait" ? "waiting" : "history");
  };
  return (
    <>
      <Say expr="calm">{t("Here's the context. It's your call.")}</Say>
      <Card className="flex flex-wrap gap-5 items-center">
        <Ring value={a.fit} size={128} label={`${t("Overall fit")} ${a.fit}/100`} color="#6b4fa3" />
        <div className="flex-1 min-w-0 basis-52">
          <h1 ref={title} tabIndex={-1} className="text-3xl font-bold m-0">
            {p.name}
          </h1>
          <p className="f-num text-xl m-0 mt-1">
            {amount(p.price)} <span className="f-ui text-base text-soft">· {t(p.cat)}</span>
          </p>
          {/* The explanation below stays visible; the duplicate info tooltip was removed. */}
          <p className="m-0 mt-2">
            {t("Overall fit")} <b className="f-num">{a.fit}/100</b>
          </p>
          <p className="text-sm text-soft m-0">
            {t("Higher means more aligned with your current context.")}
          </p>
        </div>
        <Button onClick={edit}>{t("Edit")}</Button>
      </Card>
      {active.length > 1 && (
        <Card className="grid gap-2">
          <p className="f-ui m-0">{t("Compare with goal")}</p>
          <Segmented
            label={t("Compare with goal")}
            value={goal!.id}
            onChange={setGoalId}
            options={active.map((g) => [g.id, g.name])}
          />
        </Card>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        {factors.map(([n, v, dir, I, higherGood, calc]) => {
          const lv = level(v);
          // Colour and icon keep their existing cut-off; only the wording changes.
          const positive = higherGood ? v >= 13 : v < 13;
          const outcome = outcomeLabel(n as Factor, lv, !!goal);
          return (
            <Card key={n} className="grid gap-2">
              <div className="flex items-center gap-2">
                <I size={20} aria-hidden />
                <h2 className="text-lg font-bold m-0 flex-1">{t(n)}</h2>
                <span className="f-num text-xl" aria-hidden>
                  {v}
                  <span className="text-soft text-sm">/25</span>
                </span>
                <span className="sr-only">{t("{v} out of {max}", { v, max: 25 })}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Pill tone={positive ? "leaf" : "butter"}>
                  {positive ? <Check size={14} /> : <Eye size={14} />}
                  {t(outcome)}
                </Pill>
              </div>
              {/* The bar is a visual of the score above, not a progress indicator. */}
              <Tube
                value={v * 4}
                label={t(dir)}
                color={positive ? "bg-leaf" : "bg-sun"}
                showPct={false}
                decorative
              />
              <Expand title={t("Why?")}>
                <p className="m-0">{calc}</p>
              </Expand>
            </Card>
          );
        })}
      </div>
      <Card className="grid gap-1">
        <h2 className="text-xl font-bold m-0 mb-1">{t("Context")}</h2>
        {/* Not the "Budget fit" score: this measures against monthly income. */}
        <Rule
          k={t("Share of monthly income")}
          v={t("This is {n}% of your monthly income.", { n: a.pctIncome })}
        />
        <Rule
          k={t("Left this month")}
          v={
            left > 0
              ? t("It would use {n}% of what's left this month.", {
                  n: Math.round((p.price / left) * 100),
                })
              : t("Nothing is left this month after your expenses.")
          }
        />
        {habits.map((h) => (
          <Rule key={h} k={t("Your spending style")} v={t(h)} />
        ))}
        {goal && a.pctGoal !== null && (
          <Rule
            k={goal.name}
            v={t("It's {n}% of what's left for {g}.", { n: a.pctGoal, g: goal.name })}
          />
        )}
        <Rule
          k={t("Goal impact")}
          v={
            goal && a.delayDays !== null
              ? t("It could delay your {g} goal by about {n} days.", {
                  g: goal.name,
                  n: a.delayDays,
                })
              : t("A reliable delay estimate isn't available yet.")
          }
        />
        <p className="text-xs text-soft m-0 mt-1">
          {t(
            month.income > 0
              ? "Based on this month's entries."
              : "Estimate based on your onboarding ranges.",
          )}
        </p>
        <Expand title={t("How was this calculated?")}>
          <p className="m-0">
            {t(
              "Overall fit adds budget fit and need level, plus the room left after goal impact and impulse signals: {a} + {b} + {c} + {d} = {f}. Each factor is 0–25. A simple heuristic for reflection, not financial advice.",
              { a: a.budget, b: a.need, c: 25 - a.goalImpact, d: 25 - a.impulse, f: a.fit },
            )}
          </p>
        </Expand>
      </Card>
      <Card className="grid gap-3">
        <h2 className="text-xl font-bold m-0">{t("You decide.")}</h2>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["Buy", ShoppingBag],
              ["Wait", Hourglass],
              ["Skip", X],
            ] as const
          ).map(([d, I]) => (
            <Button
              key={d}
              big
              onClick={() => decide(d, d === "Wait" ? p.wait : undefined)}
              icon={<I size={18} />}
              aria-describedby={d === "Wait" ? waitHelpId : undefined}
            >
              {t(d)}
            </Button>
          ))}
        </div>
        {/* Describes existing behaviour only: a Waiting List entry with a review date. */}
        <p id={waitHelpId} className="m-0 text-sm text-soft">
          {t(
            "Wait keeps it on your Waiting List for {w} without buying anything. Then it is marked ready to revisit there, so you can decide again. Use Edit to change the wait time.",
            { w: t(WAITS.find(([w]) => w === p.wait)![1]).toLowerCase() },
          )}
        </p>
      </Card>
    </>
  );
}
