import { useState, type ReactNode } from "react";
import {
  ShoppingBag,
  MessageCircleQuestionMark,
  Hand,
  Download,
  HelpCircle,
  Smartphone,
  Heart,
  ShieldCheck,
  Tag,
  CloudRain,
  Users,
  Zap,
  Hourglass,
  Target,
  BarChart3,
  Smile,
  WifiOff,
  ChevronDown,
  ArrowRight,
} from "lucide-react";
import { Button, Card, Chip, Logo, Ring, Say, Tube, fmt, useT } from "./ui";
import { analyze, type Profile, type Purchase } from "./store";
import { usePwa } from "./pwa/Pwa";
import { InstallHelp, LangToggle } from "./Onboarding";

// Fixed sample context for the demo: mid income range, no goal, no entries.
const DEMO_PROFILE: Profile = {
  email: "",
  income: 1,
  savings: 2,
  habits: [],
  onboarded: true,
  currency: "symbol",
};
const DEMO_REASONS = ["need", "sale", "reward", "attention"];

function Demo() {
  const t = useT();
  const [price, setPrice] = useState(1500);
  const [reasons, setReasons] = useState<string[]>(["sale"]);
  const p: Purchase = {
    name: "",
    price,
    cat: "Shopping",
    reasons,
    feeling: "Neutral",
    own: false,
    wait: "3d",
  };
  const a = analyze(p, DEMO_PROFILE);
  return (
    <Card className="grid md:grid-cols-2 gap-6 items-center">
      <div className="grid gap-4">
        <label className="f-ui grid gap-2">
          <span className="flex justify-between">
            {t("Price")}
            <b className="f-num">{fmt(price)}</b>
          </span>
          <input
            type="range"
            min={100}
            max={20000}
            step={100}
            value={price}
            onChange={(e) => setPrice(+e.target.value)}
            className="w-full accent-[var(--color-coral)]"
          />
        </label>
        <div className="grid gap-2">
          <p className="f-ui m-0">{t("Why do you want it?")}</p>
          <div className="flex flex-wrap gap-2">
            {DEMO_REASONS.map((r) => (
              <Chip
                key={r}
                on={reasons.includes(r)}
                onClick={() =>
                  setReasons(reasons.includes(r) ? reasons.filter((x) => x !== r) : [...reasons, r])
                }
              >
                {t(r)}
              </Chip>
            ))}
          </div>
        </div>
        <p className="m-0 text-sm text-soft">
          {t("Example assumes a monthly income of about {m}.", { m: fmt(a.income) })}
        </p>
      </div>
      <div className="flex gap-4 items-center" aria-live="polite">
        <Ring value={a.fit} size={120} label={`${t("Overall fit")} ${a.fit}/100`} color="#6b4fa3" />
        <div className="flex-1 grid gap-2">
          <Tube label={t("Budget fit")} value={a.budget * 4} color="bg-leaf" />
          <Tube label={t("Need level")} value={a.need * 4} color="bg-leaf" />
          <Tube label={t("Impulse signals")} value={a.impulse * 4} />
        </div>
      </div>
    </Card>
  );
}

function Section({
  id,
  title,
  sub,
  children,
}: {
  id?: string;
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="py-10 md:py-14 scroll-mt-6" aria-labelledby={id && `${id}-title`}>
      <h2 id={id && `${id}-title`} className="text-3xl font-bold m-0">
        {title}
      </h2>
      {sub && <p className="text-lg text-soft mt-2 mb-0 max-w-2xl">{sub}</p>}
      <div className="mt-6">{children}</div>
    </section>
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
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const installLabel = t(pwa.mode === "prompt" ? "Install app" : "How to install");
  const installIcon =
    pwa.mode === "prompt" ? (
      <Download size={18} aria-hidden />
    ) : (
      <HelpCircle size={18} aria-hidden />
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
            aria-label={installLabel}
            onClick={openInstall}
            icon={installIcon}
          >
            <span className="hidden sm:inline">{installLabel}</span>
          </Button>
        )}
        <LangToggle />
        <Button variant="butter" onClick={() => start(true)}>
          {t("Log in")}
        </Button>
      </header>
      {help && <InstallHelp onClose={() => setHelp(false)} />}

      <section className="grid md:grid-cols-2 gap-10 items-center py-12 md:py-20">
        <div className="rise">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight m-0">
            {t("Pause. Reflect. Decide.")}
          </h1>
          <p className="text-lg text-soft mt-4">
            {t(
              "SpendSense shows how a purchase fits your budget, goals and mood before you buy. No lectures, no blocking. The decision stays yours.",
            )}
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Button variant="coral" big onClick={() => start(false)}>
              {t("Get started")}
            </Button>
            <Button big onClick={() => go("demo")}>
              {t("Try it now")}
            </Button>
          </div>
          <p className="f-ui text-sm text-soft mt-4 mb-0 flex flex-wrap gap-x-4 gap-y-1">
            <span className="flex items-center gap-1">
              <Heart size={14} aria-hidden />
              {t("No judgment")}
            </span>
            <span className="flex items-center gap-1">
              <ShieldCheck size={14} aria-hidden />
              {t("Your data stays private")}
            </span>
            <span className="flex items-center gap-1">
              <Smartphone size={14} aria-hidden />
              {t("Works on your phone")}
            </span>
          </p>
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
              <Button className="w-full justify-center" onClick={openInstall} icon={installIcon}>
                {installLabel}
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

      <Section
        id="why"
        title={t("Most regret buys start the same way")}
        sub={t(
          "Spending isn't only about money. These moments push us to buy before we've thought it through.",
        )}
      >
        <div className="grid md:grid-cols-3 gap-4">
          {(
            [
              [
                Tag,
                "It's on sale",
                "A countdown or a big red discount makes waiting feel like losing.",
              ],
              [
                CloudRain,
                "A hard day",
                "Stress, boredom or tiredness turn shopping into a quick mood fix.",
              ],
              [
                Users,
                "Everyone has it",
                "What friends and feeds show us quietly becomes what we need.",
              ],
            ] as const
          ).map(([I, title, body]) => (
            <Card key={title} className="grid gap-2 content-start">
              <span className="w-11 h-11 rounded-inner clay-butter flex items-center justify-center">
                <I size={22} aria-hidden />
              </span>
              <h3 className="text-xl font-bold m-0">{t(title)}</h3>
              <p className="m-0 text-soft">{t(body)}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="how" title={t("See how it works")} sub={t("Three short steps, about a minute.")}>
        <ol className="grid md:grid-cols-3 gap-4 m-0 p-0 list-none">
          {(
            [
              [ShoppingBag, "Add a purchase", "Name it, add the price and say why you want it."],
              [
                MessageCircleQuestionMark,
                "See your context",
                "Budget fit, need, goal impact and impulse signals in one view.",
              ],
              [
                Hand,
                "You decide",
                "Buy, wait a few days or skip. SpendSense never decides for you.",
              ],
            ] as const
          ).map(([I, title, body], i) => (
            <li key={title}>
              <Card className="grid gap-2 h-full content-start">
                <div className="flex items-center gap-3">
                  <span className="f-num w-9 h-9 rounded-full bg-sun flex items-center justify-center">
                    {i + 1}
                  </span>
                  <I size={22} aria-hidden />
                </div>
                <h3 className="text-xl font-bold m-0">{t(title)}</h3>
                <p className="m-0 text-soft">{t(body)}</p>
              </Card>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="demo"
        title={t("Try it now")}
        sub={t("Move the price and pick reasons to see how the context changes.")}
      >
        <Demo />
      </Section>

      <Section id="features" title={t("Everything in one calm place")}>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {(
            [
              [
                Zap,
                "Quick add",
                "Log income and expenses in a few taps, with ready-made categories.",
              ],
              [
                MessageCircleQuestionMark,
                "Should I buy it?",
                "A five-question check that shows the context before you pay.",
              ],
              [
                Hourglass,
                "Waiting List",
                "Park a purchase for 24 hours to a week and revisit it calmly.",
              ],
              [Target, "Goals", "See how each purchase could delay what you're saving for."],
              [BarChart3, "Insights", "Spot the moods and reasons behind your spending."],
              [Smile, "Reflection", "Rate past decisions and learn which ones you're glad about."],
            ] as const
          ).map(([I, title, body]) => (
            <Card key={title} className="grid gap-2 content-start">
              <I size={24} aria-hidden className="text-violet" />
              <h3 className="text-lg font-bold m-0">{t(title)}</h3>
              <p className="m-0 text-soft">{t(body)}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section id="principles" title={t("Built on a few promises")}>
        <div className="grid sm:grid-cols-2 gap-4">
          {(
            [
              [Heart, "No judgment", "No red warnings or guilt. Just context, in plain words."],
              [
                Hand,
                "You stay in control",
                "Scores never block a purchase. Every decision is yours.",
              ],
              [
                ShieldCheck,
                "Your data stays private",
                "Your entries are saved to your account and visible only to you.",
              ],
              [
                WifiOff,
                "No bank connection",
                "You add what you want to track. Nothing is pulled from your accounts.",
              ],
            ] as const
          ).map(([I, title, body]) => (
            <div key={title} className="flex gap-3 items-start">
              <span className="w-11 h-11 rounded-inner clay-sun flex items-center justify-center shrink-0">
                <I size={20} aria-hidden />
              </span>
              <div>
                <h3 className="text-lg font-bold m-0">{t(title)}</h3>
                <p className="m-0 text-soft">{t(body)}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="faq" title={t("Frequently asked questions")}>
        <div className="grid gap-3">
          {(
            [
              [
                "Is SpendSense free?",
                "Yes. It's a university HCI course project and there's nothing to pay.",
              ],
              [
                "Do I need to connect my bank account?",
                "No. You add the income, expenses and purchases you want to think about yourself.",
              ],
              [
                "Is this financial advice?",
                "No. Scores are simple, transparent heuristics to help you reflect. Each one explains how it was calculated.",
              ],
              [
                "Where is my data stored?",
                "In your SpendSense account. Only you can see it, and you can export or reset it anytime in Settings.",
              ],
              [
                "Can I use it on my phone?",
                "Yes. Open it in your phone's browser and add it to your home screen to use it like an app.",
              ],
            ] as const
          ).map(([q, a]) => (
            <details key={q} className="clay rounded-tile! px-5 py-4 group">
              <summary className="f-ui text-lg cursor-pointer list-none flex items-center justify-between gap-3 min-h-11">
                {t(q)}
                <ChevronDown
                  size={20}
                  aria-hidden
                  className="shrink-0 transition group-open:rotate-180"
                />
              </summary>
              <p className="m-0 mt-2 text-soft">{t(a)}</p>
            </details>
          ))}
        </div>
      </Section>

      <section className="clay-butter rounded-card p-8 md:p-10 my-10 grid md:grid-cols-[1fr_auto] items-center gap-6">
        <div>
          <h2 className="text-3xl font-bold m-0">{t("Ready to start?")}</h2>
          <p className="text-lg m-0 mt-2">
            {t("Create a free account and check your next purchase in a minute.")}
          </p>
        </div>
        <Button
          variant="coral"
          big
          onClick={() => start(false)}
          icon={<ArrowRight size={20} aria-hidden />}
        >
          {t("Get started")}
        </Button>
      </section>

      <footer className="border-t border-cardline pt-10 mt-6 grid gap-8">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="grid gap-3 content-start">
            <div className="flex items-center gap-2">
              <Logo size={28} />
              <b className="text-lg">SpendSense</b>
            </div>
            <p className="m-0 text-soft text-sm max-w-xs">
              {t("Context for your purchases. The decision stays yours.")}
            </p>
            <div className="justify-self-start">
              <LangToggle />
            </div>
          </div>
          <nav aria-label={t("Product")} className="grid gap-2 content-start">
            <h2 className="f-ui text-sm uppercase tracking-wider text-soft m-0">{t("Product")}</h2>
            {(
              [
                ["how", "See how it works"],
                ["demo", "Try it now"],
                ["features", "Features"],
                ["faq", "Frequently asked questions"],
              ] as const
            ).map(([id, l]) => (
              <a
                key={id}
                href={`#${id}`}
                className="f-ui min-h-11 flex items-center hover:underline"
              >
                {t(l)}
              </a>
            ))}
          </nav>
          <div className="grid gap-2 content-start">
            <h2 className="f-ui text-sm uppercase tracking-wider text-soft m-0">{t("Account")}</h2>
            <button
              className="f-ui min-h-11 text-left hover:underline"
              onClick={() => start(false)}
            >
              {t("Create an account")}
            </button>
            <button className="f-ui min-h-11 text-left hover:underline" onClick={() => start(true)}>
              {t("Log in to your account")}
            </button>
          </div>
          <div className="grid gap-2 content-start">
            <h2 className="f-ui text-sm uppercase tracking-wider text-soft m-0">{t("App")}</h2>
            {pwa.mode !== "installed" && (
              <button className="f-ui min-h-11 text-left hover:underline" onClick={openInstall}>
                {t("Install SpendSense")}
              </button>
            )}
            <a href="#principles" className="f-ui min-h-11 flex items-center hover:underline">
              {t("Privacy")}
            </a>
          </div>
        </div>
        <div className="border-t border-cardline pt-4 pb-2 flex flex-wrap justify-between gap-2 text-sm text-soft f-ui">
          <span>© 2026 SpendSense · {t("HCI prototype")}</span>
          <span>{t("Scores are simple heuristics, not financial advice.")}</span>
        </div>
      </footer>
    </div>
  );
}
