import type { ReactNode } from "react";
import {
  ArrowRight,
  Check,
  CircleCheck,
  Clock3,
  Gauge,
  Hand,
  Hourglass,
  ListChecks,
  MessageCircleQuestionMark,
  PiggyBank,
  ShoppingBag,
  Signpost,
  Smile,
  Target,
  UserRoundPlus,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { Button, Ring, Tube, fmt, useT } from "./ui";
import { TENDENCY } from "./Onboarding";

// Static previews of the real screens. Decorative: each step's text says the same.
const Preview = ({ children }: { children: ReactNode }) => (
  <div aria-hidden className="clay-cream rounded-tile p-4 grid gap-2 content-start">
    {children}
  </div>
);

function SetupPreview() {
  const t = useT();
  return (
    <Preview>
      {(
        [
          ["Planned Spender", 75],
          ["Bargain Hunter", 50],
          ["Social Spender", 40],
        ] as const
      ).map(([k, v]) => (
        <Tube key={k} label={t(TENDENCY[k])} value={v} color="bg-violet" decorative />
      ))}
    </Preview>
  );
}

function EntriesPreview() {
  const t = useT();
  return (
    <Preview>
      {(
        [
          ["Scholarship", 5000],
          ["Groceries", -850],
          ["Transport", -120],
        ] as const
      ).map(([c, v]) => (
        <div key={c} className="flex justify-between items-center bg-card rounded-inner px-3 py-2">
          <span className="f-ui">{t(c)}</span>
          <b className={`f-num ${v > 0 ? "text-leaf" : ""}`}>
            {v > 0 ? "+" : "−"}
            {fmt(Math.abs(v))}
          </b>
        </div>
      ))}
    </Preview>
  );
}

function QuestionsPreview() {
  const t = useT();
  const qs = ["What", "Why", "Feeling", "Own", "Wait time"];
  return (
    <Preview>
      {qs.map((q, i) => (
        <div key={q} className="flex items-center gap-2 f-ui">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
              i < 3 ? "bg-leaf text-white" : i === 3 ? "bg-sun" : "bg-track"
            }`}
          >
            {i < 3 ? <Check size={14} /> : i + 1}
          </span>
          <span className={i > 3 ? "text-soft" : ""}>{t(q)}</span>
        </div>
      ))}
    </Preview>
  );
}

function ScoresPreview() {
  const t = useT();
  return (
    <Preview>
      <div className="flex gap-4 items-center">
        <Ring value={72} size={88} />
        <div className="flex-1 grid gap-1.5">
          {["Budget fit", "Need level", "Goal impact", "Impulse signals"].map((c, i) => (
            <Tube key={c} label={t(c)} value={[84, 76, 20, 32][i]} decorative />
          ))}
        </div>
      </div>
    </Preview>
  );
}

function DecisionPreview() {
  const t = useT();
  return (
    <Preview>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["Buy", ShoppingBag],
            ["Wait", Hourglass],
            ["Skip", X],
          ] as const
        ).map(([d, I]) => (
          <span
            key={d}
            className={`f-ui rounded-inner min-h-16 grid place-items-center gap-1 py-2 ${
              d === "Wait" ? "clay-sun" : "bg-card"
            }`}
          >
            <I size={20} />
            {t(d)}
          </span>
        ))}
      </div>
    </Preview>
  );
}

function ReflectPreview() {
  const t = useT();
  return (
    <Preview>
      <div className="grid grid-cols-5 gap-1.5">
        {["Uneasy", "Unsure", "Okay", "Good", "Very good"].map((r, i) => (
          <span
            key={r}
            className={`f-ui text-xs rounded-inner px-1 py-2 text-center ${
              i === 3 ? "clay-leaf" : "bg-card"
            }`}
          >
            <span className="f-num block">{i + 1}</span>
            {t(r)}
          </span>
        ))}
      </div>
    </Preview>
  );
}

const STEPS = [
  [
    UserRoundPlus,
    "Set up your profile",
    "Pick your income and savings range and answer a few questions about your habits. No bank connection and no exact figures needed.",
    SetupPreview,
  ],
  [
    WalletCards,
    "Log what comes in and goes out",
    "Quick add takes a few taps. These entries tell SpendSense how much is really left this month.",
    EntriesPreview,
  ],
  [
    MessageCircleQuestionMark,
    "Ask “Should I buy it?”",
    "Answer five short questions: what it is, why you want it, how you feel, whether you already own something similar and how long you could wait.",
    QuestionsPreview,
  ],
  [
    Gauge,
    "See the context",
    "Four scores and an overall fit show, at a glance, how the purchase fits your situation.",
    ScoresPreview,
  ],
  [
    Signpost,
    "Make your call",
    "Buy it, wait a while or skip it. Waiting parks the purchase on your waiting list until it's time to look again.",
    DecisionPreview,
  ],
  [
    Smile,
    "Look back later",
    "A few days after a purchase, SpendSense asks how you feel about it. Insights show which decisions you were glad about.",
    ReflectPreview,
  ],
] as const;

const SCORES = [
  [PiggyBank, "Budget fit", "How comfortably the price fits what you have left this month."],
  [CircleCheck, "Need level", "How strongly the purchase meets a real need for you."],
  [Target, "Goal impact", "How much the purchase could slow down what you're saving for."],
  [Zap, "Impulse signals", "Whether the moment itself may be pushing you to buy."],
] as const;

export function HowItWorks({ start, tryDemo }: { start: () => void; tryDemo: () => void }) {
  const t = useT();
  return (
    <>
      <section className="py-12 md:py-16 max-w-3xl rise">
        <p className="f-ui text-sm uppercase tracking-wider text-violet m-0">{t("How it works")}</p>
        <h1 className="text-4xl md:text-5xl font-bold leading-tight mt-2 mb-0">
          {t("From “I want it” to a decision you feel good about")}
        </h1>
        <p className="text-lg text-soft mt-4 mb-0">
          {t(
            "SpendSense doesn't block purchases or tell you what to do. It gathers the context you'd want before paying and lays it out in plain words.",
          )}
        </p>
        <ul className="f-ui flex flex-wrap gap-2 mt-6 p-0 m-0 list-none">
          {(
            [
              [Clock3, "About a minute per check"],
              [ListChecks, "Five short questions"],
              [Hand, "You always decide"],
            ] as const
          ).map(([I, l]) => (
            <li key={l} className="clay-cream rounded-full px-4 py-2 flex items-center gap-2">
              <I size={18} aria-hidden className="text-violet" />
              {t(l)}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="journey-title" className="py-8 md:py-10">
        <h2 id="journey-title" className="text-3xl font-bold m-0 mb-8">
          {t("The journey, step by step")}
        </h2>
        <ol className="m-0 p-0 list-none">
          {STEPS.map(([I, title, body, Visual], i) => (
            <li
              key={title}
              className="relative grid grid-cols-[3rem_1fr] md:grid-cols-[3rem_1fr_1fr] gap-x-5 gap-y-4 pb-12 last:pb-0"
            >
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-6 -ml-px top-14 bottom-2 w-0.5 bg-line"
                />
              )}
              <span className="w-12 h-12 rounded-full clay-sun flex items-center justify-center">
                <I size={22} aria-hidden />
              </span>
              <div className="pt-1">
                <p className="f-ui text-sm text-soft m-0">
                  {t("Step {n} of {t}", { n: i + 1, t: STEPS.length })}
                </p>
                <h3 className="text-2xl font-bold mt-1 mb-2">{t(title)}</h3>
                <p className="m-0 text-soft text-lg">{t(body)}</p>
              </div>
              <div className="col-start-2 md:col-start-3">
                <Visual />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="scores-title" className="py-10 md:py-14">
        <h2 id="scores-title" className="text-3xl font-bold m-0">
          {t("What the scores mean")}
        </h2>
        <p className="text-lg text-soft mt-2 mb-0 max-w-2xl">
          {t("What each score tells you about a purchase.")}
        </p>
        <dl className="grid sm:grid-cols-2 gap-4 mt-6 mb-0">
          {SCORES.map(([I, title, body]) => (
            <div key={title} className="clay p-5 flex gap-4 items-start">
              <span className="w-11 h-11 rounded-inner clay-butter flex items-center justify-center shrink-0">
                <I size={22} aria-hidden />
              </span>
              <div>
                <dt className="text-lg font-bold">{t(title)}</dt>
                <dd className="m-0 mt-1 text-soft">{t(body)}</dd>
              </div>
            </div>
          ))}
        </dl>
        <p className="m-0 mt-4 text-sm text-soft">
          {t("Scores are simple heuristics, not financial advice.")}
        </p>
      </section>

      <section className="clay-butter rounded-card p-8 md:p-10 my-10 grid md:grid-cols-[1fr_auto] items-center gap-6">
        <div>
          <h2 className="text-3xl font-bold m-0">{t("Try it with your own numbers")}</h2>
          <p className="text-lg m-0 mt-2">
            {t("Create a free account and check your next purchase in a minute.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="coral" big onClick={start} icon={<ArrowRight size={20} aria-hidden />}>
            {t("Get started")}
          </Button>
          <Button big onClick={tryDemo}>
            {t("Try the demo")}
          </Button>
        </div>
      </section>
    </>
  );
}
