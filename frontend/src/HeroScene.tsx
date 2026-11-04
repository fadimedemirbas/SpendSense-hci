import { useEffect, useRef, useState, type ReactNode } from "react";
import { Footprints, Headphones, Pause, Plane, Play, type LucideIcon } from "lucide-react";
import { Blob, Bubble, Ring, Tube, fmt, useT, type Expr } from "./ui";

const BARS = ["Budget fit", "Need level", "Goal impact", "Impulse signals"];
const LOOK = "Let's take a look.";
const CHECK = "Checking your budget and goals…";
const DONE = "Here's the context. It's your call.";
// Scores are [budget, need, goal impact, impulse], fixed so every loop reads well.
const PURCHASES: [string, number, LucideIcon, number[]][] = [
  ["Wireless headphones", 2400, Headphones, [78, 64, 22, 30]],
  ["New sneakers", 3200, Footprints, [52, 35, 41, 68]],
  ["Weekend trip", 6500, Plane, [84, 71, 18, 24]],
];
// Step 0 introduces the purchase, 1-4 fill one bar each, 5 is the mascot's reaction.
const VERDICT = BARS.length + 1;
const stepMs = (step: number) => (step === 0 ? 1300 : step === VERDICT ? 3400 : 750);
// Eyes and head turn toward the bar being read, top to bottom.
const GAZE: [number, number][] = [
  [3, -1],
  [4, 0.5],
  [4, 2],
  [3, 3.5],
];

const fitOf = ([budget, need, goal, impulse]: number[]) =>
  Math.round((budget + need + (100 - goal) + (100 - impulse)) / 4);

/** Eases a number toward `target`, for percentages that count instead of jumping. */
function useTween(target: number, still: boolean) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (still) {
      from.current = target;
      setValue(target);
      return;
    }
    const a = from.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 650);
      from.current = a + (target - a) * (1 - (1 - k) ** 3);
      setValue(from.current);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, still]);
  return value;
}

function Bar({
  label,
  value,
  dim,
  still,
}: {
  label: string;
  value: number;
  dim: boolean;
  still: boolean;
}) {
  return (
    <div className={`transition-opacity duration-300 ${dim ? "opacity-60" : ""}`}>
      <Tube decorative label={label} value={useTween(value, still)} />
    </div>
  );
}

/** Items share one grid cell, so swapping text cross-fades and never shifts the layout. */
const Swap = ({ on, children }: { on: boolean; children: ReactNode }) => (
  <div className={`hero-swap ${on ? "" : "hero-swap-off"}`}>{children}</div>
);

/**
 * Landing hero: the mascot sits inside the score ring and reads sample purchases
 * bar by bar. Plain SVG and CSS driven by one step timer, so it follows the theme
 * and language. Stops for reduced motion, off screen and the pause button.
 */
export function HeroScene() {
  const t = useT();
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [item, setItem] = useState(0);
  const [step, setStep] = useState(still ? VERDICT : 0);
  const [paused, setPaused] = useState(false);
  const [seen, setSeen] = useState(true);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (still) return;
    const observer = new IntersectionObserver(([entry]) => setSeen(entry.isIntersecting));
    observer.observe(root.current!);
    return () => observer.disconnect();
  }, [still]);

  const running = !still && !paused && seen;
  useEffect(() => {
    if (!running) return;
    const id = setTimeout(() => {
      if (step === VERDICT) setItem((i) => (i + 1) % PURCHASES.length);
      setStep((s) => (s === VERDICT ? 0 : s + 1));
    }, stepMs(step));
    return () => clearTimeout(id);
  }, [running, step]);

  const scores = PURCHASES[item][3];
  const fit = fitOf(scores);
  const verdict = step === VERDICT;
  const reading = step > 0 && !verdict;
  const glad = fit >= 60;
  const expr: Expr = verdict ? (glad ? "happy" : "calm") : reading ? "thinking" : "curious";
  const gaze = reading ? GAZE[step - 1] : verdict ? ([0, 0] as const) : ([0, -3] as const);
  const line = verdict ? DONE : reading ? CHECK : LOOK;

  return (
    <div ref={root} className="relative grid gap-4" data-frozen={paused || undefined}>
      {!still && (
        <button
          className="absolute -top-3 -right-3 z-10 w-7 h-7 rounded-full inline-flex items-center justify-center text-soft transition hover:bg-track hover:text-ink"
          aria-label={t(paused ? "Play animation" : "Pause animation")}
          onClick={() => setPaused(!paused)}
        >
          {paused ? (
            <Play size={12} fill="currentColor" aria-hidden />
          ) : (
            <Pause size={12} fill="currentColor" aria-hidden />
          )}
        </button>
      )}
      <div className="flex items-center gap-2 pr-6">
        <div className="grid grow min-w-0" aria-hidden>
          {PURCHASES.map(([name, price, Icon], i) => (
            <Swap key={name} on={i === item}>
              <div className="flex items-center gap-3 min-h-11 f-ui">
                <span className="w-10 h-10 rounded-inner bg-peach flex items-center justify-center shrink-0">
                  <Icon size={18} />
                </span>
                <span className="grow leading-tight">{t(name)}</span>
                <span className="f-num shrink-0">{fmt(price)}</span>
              </div>
            </Swap>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-4" aria-hidden>
        <div className="relative shrink-0 w-[150px] h-[150px]">
          <Ring value={(fit * Math.min(step, BARS.length)) / BARS.length} size={150} bare />
          <div
            className="absolute inset-0 flex items-center justify-center transition-transform duration-500"
            style={{ transform: `rotate(${gaze[0] * 1.5}deg)` }}
          >
            <div key={`${item}-${verdict}`} className={verdict && glad ? "hero-hop" : "hero-float"}>
              <Blob
                expr={expr}
                size={80}
                look={gaze}
                frozen={still || paused}
                className="hero-blob"
              />
            </div>
          </div>
          {verdict && (
            <>
              {glad &&
                [0, 1, 2, 3, 4, 5].map((i) => (
                  <i
                    key={i}
                    className="hero-spark"
                    style={{ "--a": `${i * 60 + 30}deg` } as never}
                  />
                ))}
              <span className="hero-pop clay-sun f-num absolute left-1/2 -bottom-1 px-3 py-0.5 rounded-full">
                {fit}
              </span>
            </>
          )}
        </div>
        <div className="grid gap-2 grow basis-44">
          {BARS.map((label, i) => (
            <Bar
              key={label}
              label={t(label)}
              value={i < step ? scores[i] : 0}
              dim={reading && i !== step - 1}
              still={still}
            />
          ))}
        </div>
      </div>

      <div className="grid" aria-hidden>
        {[LOOK, CHECK, DONE].map((text) => (
          <Swap key={text} on={text === line}>
            <Bubble>{t(text)}</Bubble>
          </Swap>
        ))}
      </div>
      <p className="sr-only">{t(DONE)}</p>
    </div>
  );
}
