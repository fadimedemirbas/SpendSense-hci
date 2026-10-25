import { useEffect, useState } from "react";
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
  fmt,
  Tip,
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
  type WaitLen,
  type DecisionKind,
} from "./store";

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
const STEPS = ["What", "Why", "Feeling", "Own", "Wait"];
const WAITS: [WaitLen, string][] = [
  ["24h", "24 hours"],
  ["3d", "3 days"],
  ["1w", "1 week"],
];

export function Decide() {
  const { prefill, openDecide, lastCat, setLastCat, setTab, recordAnalysis, profile, goals } =
    useApp();
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
  useEffect(() => {
    setP({ ...blank(), ...prefill });
    setPriceStr(prefill?.price ? String(prefill.price) : "");
    setOwn(prefill?.own ?? null);
    setWaitSet(!!prefill?.wait);
    setS(0);
    setAnalysisId(prefill?.analysisId);
    setPhase(prefill?.review ? "result" : "ask");
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
    if (!valid[s]) return setHint(t(hints[s]));
    setHint("");
    if (s === 0) setLastCat(p.cat);
    if (s < 4) setS(s + 1);
    else {
      setPhase("load");
      const goal = goals.find((g) => g.status === "Active");
      const [id] = await Promise.all([
        recordAnalysis(p, analyze(p, profile, goal), goal?.id),
        new Promise((resolve) => setTimeout(resolve, 900)),
      ]);
      if (id) {
        setAnalysisId(id);
        setPhase("result");
      } else {
        setPhase("ask");
        setHint(t("Your analysis could not be saved. Please try again."));
      }
    }
  };
  const cancel = () => {
    openDecide(undefined);
    setTab("home");
  };
  if (phase === "load")
    return (
      <Card>
        <Say expr="curious">{t("Looking at your context…")}</Say>
      </Card>
    );
  if (phase === "result")
    return (
      <Analysis
        p={p}
        analysisId={analysisId}
        waitId={prefill?.waitId}
        edit={() => {
          setPhase("ask");
          setS(0);
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
  return (
    <>
      <PageHead title={t("Should I buy it?")} sub={t("Let's add a little context first.")} />
      <ol className="flex gap-1 m-0 p-0 list-none" aria-label={t("Progress")}>
        {STEPS.map((l, i) => {
          const done = i < s && valid[i];
          return (
            <li key={l} className="flex-1">
              <button
                onClick={() => i <= s && setS(i)}
                disabled={i > s}
                aria-current={i === s ? "step" : undefined}
                aria-label={`${i + 1}. ${t(l)}`}
                className={`w-full f-ui text-sm min-h-11 rounded-full flex items-center justify-center gap-1 ${i === s ? "clay-sun" : done ? "bg-leaftint text-leaf" : "bg-track text-soft"}`}
              >
                {done ? (
                  <Check size={14} aria-label="done" />
                ) : (
                  <span className="f-num">{i + 1}</span>
                )}
                <span className="hidden sm:inline">{t(l)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {s > 0 && (
        <p className="f-ui text-sm text-soft m-0">
          {p.name} · {fmt(p.price)}
          {p.reasons.length > 0 && " · " + p.reasons.map((r) => t(r)).join(", ")}
          {p.feeling && " · " + t(p.feeling)}
        </p>
      )}
      <Say key={s} expr="thinking" size={56}>
        {t(
          [
            "What are you thinking of buying?",
            "Why do you want it?",
            "How are you feeling right now?",
            "Do you already have something similar?",
            "How long could you wait?",
          ][s],
        )}
      </Say>
      <Card className="grid gap-3">
        {s === 0 && (
          <>
            <label className="f-ui grid gap-1">
              {t("Product name")}
              <input
                value={p.name}
                onChange={(e) => setP({ ...p, name: e.target.value })}
                className="h-13 rounded-tile border border-line bg-white px-4 font-sans"
              />
            </label>
            <label className="f-ui grid gap-1">
              {t("Price")} (₺)
              <input
                inputMode="decimal"
                value={priceStr}
                onChange={(e) => {
                  if (/^\d{0,8}([.,]\d{0,2})?$/.test(e.target.value)) {
                    setPriceStr(e.target.value);
                    setP({ ...p, price: parseFloat(e.target.value.replace(",", ".")) || 0 });
                  }
                }}
                className="h-13 rounded-tile border border-line bg-white px-4 f-num text-xl"
              />
            </label>
            <p className="f-ui m-0">{t("Category")}</p>
            <div className="grid grid-cols-2 min-[400px]:grid-cols-4 gap-2">
              {EXP_CATS.map(([c, I]) => (
                <Tile
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
      </Card>
      <div className="flex justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          <Button onClick={cancel}>{t("Cancel")}</Button>
          {s > 0 && (
            <Button
              onClick={() => {
                setHint("");
                setS(s - 1);
              }}
            >
              {t("Back")}
            </Button>
          )}
        </div>
        <Button variant="coral" big onClick={next}>
          {s === 4 ? t("Analyze") : t("Next")}
        </Button>
      </div>
    </>
  );
}

function Analysis({
  p,
  analysisId,
  waitId,
  edit,
}: {
  p: Purchase;
  analysisId?: string;
  waitId?: string;
  edit: () => void;
}) {
  const {
    profile,
    goals,
    updateWorkspace,
    recordAnalysis,
    decisions,
    waiting,
    setTab,
    openDecide,
  } = useApp();
  const t = useT();
  const toast = useToast();
  const goal = goals.find((g) => g.status === "Active");
  const a = analyze(p, profile, goal);
  const [picker, setPicker] = useState(false);
  const [wl, setWl] = useState<WaitLen>(p.wait);
  const factors: [string, number, string, typeof Wallet, boolean, string][] = [
    [
      "Budget fit",
      a.budget,
      "Higher is better.",
      Wallet,
      true,
      `25 − (${fmt(p.price)} ÷ ${fmt(a.income)}) × 70`,
    ],
    [
      "Need level",
      a.need,
      "Higher means a stronger stated need.",
      HeartHandshake,
      true,
      `8 base · need +12 · easier +6 · wanted +3 · not owned +4 · owns usable −7`,
    ],
    [
      "Goal impact",
      a.goalImpact,
      "Lower means less effect on your goal.",
      Target,
      false,
      goal ? `(${fmt(p.price)} ÷ ${fmt(goal.target - goal.saved)}) × 60` : "No active goal",
    ],
    [
      "Impulse signals",
      a.impulse,
      "Lower means fewer impulse signals.",
      Zap,
      false,
      "3 base · +5 each: sale, attention, reward, social · +5 excited/stressed/bored/tired · +2 if 24h",
    ],
  ];
  const decide = async (d: DecisionKind, w?: WaitLen) => {
    const prevD = decisions,
      prevW = waiting;
    const savedAnalysisId = waitId
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
      })))
    )
      return;
    toast(d === "Wait" ? t("Added to your waiting list.") : t(`Saved: ${d}.`), () => {
      void updateWorkspace((previous) => ({ ...previous, decisions: prevD, waiting: prevW }));
    });
    openDecide(undefined);
    setTab(d === "Wait" ? "waiting" : "history");
  };
  return (
    <>
      <Say expr="calm">{t("Here's the context. It's your call.")}</Say>
      <Card className="flex flex-wrap gap-5 items-center">
        <Ring value={a.fit} size={128} label={`${t("Overall fit")} ${a.fit}/100`} color="#6b4fa3" />
        <div className="flex-1 min-w-0 basis-52">
          <h1 className="text-3xl font-bold m-0">{p.name}</h1>
          <p className="f-num text-xl m-0 mt-1">
            {fmt(p.price)} <span className="f-ui text-base text-soft">· {t(p.cat)}</span>
          </p>
          <p className="m-0 mt-2 flex items-center gap-1">
            {t("Overall fit")} <b className="f-num">{a.fit}/100</b>
            <Tip text={t("Higher means more aligned with your current context.")} />
          </p>
          <p className="text-sm text-soft m-0">
            {t("Higher means more aligned with your current context.")}
          </p>
        </div>
        <Button onClick={edit}>{t("Edit")}</Button>
      </Card>
      <div className="grid md:grid-cols-2 gap-4">
        {factors.map(([n, v, dir, I, higherGood, calc]) => {
          const lv = level(v);
          const positive = higherGood ? v >= 13 : v < 13;
          return (
            <Card key={n} className="grid gap-2">
              <div className="flex items-center gap-2">
                <I size={20} aria-hidden />
                <h2 className="text-lg font-bold m-0 flex-1">{t(n)}</h2>
                <span className="f-num text-xl">
                  {v}
                  <span className="text-soft text-sm">/25</span>
                </span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Pill tone={positive ? "leaf" : "butter"}>
                  {positive ? <Check size={14} /> : <Eye size={14} />}
                  {t(lv)}
                </Pill>
              </div>
              <Tube
                value={v * 4}
                label={t(dir)}
                color={positive ? "bg-leaf" : "bg-sun"}
                showPct={false}
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
        <Rule
          k={t("Budget fit")}
          v={t("This is {n}% of your monthly income.", { n: a.pctIncome })}
        />
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
          {t("Estimate based on your onboarding ranges.")}
        </p>
        <Expand title={t("How was this calculated?")}>
          <p className="m-0">
            Fit = Budget + Need + (25 − Goal impact) + (25 − Impulse) = {a.budget} + {a.need} +{" "}
            {25 - a.goalImpact} + {25 - a.impulse} = <b>{a.fit}</b>. Each factor is 0–25. A simple
            heuristic for reflection, not financial advice.
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
              aria-expanded={d === "Wait" ? picker : undefined}
              onClick={() => (d === "Wait" ? setPicker(!picker) : decide(d))}
              icon={<I size={18} />}
            >
              {t(d)}
            </Button>
          ))}
        </div>
        {picker && (
          <div className="rise grid gap-2">
            <p className="f-ui m-0">{t("Wait for how long?")}</p>
            <Segmented
              label={t("Wait for how long?")}
              value={wl}
              onChange={setWl}
              options={WAITS.map(([w, l]) => [w, t(l)])}
            />
            <div>
              <Button variant="coral" onClick={() => decide("Wait", wl)}>
                {t("Add to waiting list")}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
