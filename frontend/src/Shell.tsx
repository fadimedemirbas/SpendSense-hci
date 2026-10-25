import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Home,
  Wallet,
  Scale,
  Target,
  BarChart3,
  MoreHorizontal,
  Clock,
  History,
  Settings,
  ArrowLeft,
} from "lucide-react";
import { Logo, Sheet, Button, Blob, useT } from "./ui";
import { LangToggle } from "./Onboarding";
import { useApp, type Tab } from "./context";

const MAIN: [Tab, string, typeof Home][] = [
  ["home", "Home", Home],
  ["money", "Money", Wallet],
  ["decide", "Decide", Scale],
  ["goals", "Goals", Target],
  ["insights", "Insights", BarChart3],
];
const MORE: [Tab, string, typeof Home][] = [
  ["waiting", "Waiting List", Clock],
  ["history", "History", History],
  ["settings", "Settings", Settings],
];
const TOUR: [string, string, string][] = [
  ["quick", "Quick add", "Add your income and expenses in two taps."],
  ["decide", "Should I buy it?", "Thinking about a purchase? Get context here."],
  ["goals", "Goals", "Track what you are saving toward."],
];

export function Shell({ children }: { children: ReactNode }) {
  const { tab, setTab, goBack, canGoBack, waiting, tour, setTour } = useApp();
  const t = useT();
  const [more, setMore] = useState(false);
  const [mobile, setMobile] = useState(() => !matchMedia("(min-width: 768px)").matches);
  useEffect(() => {
    const query = matchMedia("(min-width: 768px)");
    const change = () => {
      setMobile(!query.matches);
      setMore(false);
    };
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const menu = useRef<HTMLDivElement>(null);
  const inMore = MORE.some((m) => m[0] === tab);
  const due = waiting.length;
  useEffect(() => {
    document.body.dataset.tour = tour === null ? "" : TOUR[tour][0];
    return () => {
      document.body.dataset.tour = "";
    };
  }, [tour]);
  useEffect(() => {
    if (!more) return;
    const f = (e: MouseEvent) => {
      if (matchMedia("(min-width: 768px)").matches && !menu.current?.contains(e.target as Node)) {
        setMore(false);
      }
    };
    addEventListener("mousedown", f);
    return () => removeEventListener("mousedown", f);
  }, [more]);
  const go = (k: Tab) => {
    setTab(k);
    setMore(false);
  };
  const badge = due > 0 && (
    <span
      className="f-num text-xs bg-violettint text-violet rounded-full px-1.5"
      aria-label={`${due} waiting`}
    >
      {due}
    </span>
  );
  const pill = (k: Tab, l: string, I: typeof Home) => (
    <button
      key={k}
      data-tour-id={k === "decide" || k === "goals" ? k : undefined}
      aria-current={tab === k ? "page" : undefined}
      onClick={() => go(k)}
      className={`btn f-ui min-h-11! px-4! ${tab === k ? "clay-sun" : "hover:bg-peach"}`}
    >
      <I size={18} aria-hidden />
      {t(l)}
    </button>
  );
  return (
    <div className="app-safe min-h-screen pb-[calc(112px+env(safe-area-inset-bottom))] md:pb-10">
      <a href="#main-content" className="skip-link">
        {t("Skip to content")}
      </a>
      <header className="max-w-[880px] mx-auto px-4 pt-4 flex flex-wrap items-center gap-2">
        {canGoBack && mobile && (
          <button
            className="btn clay-cream w-11 px-0! md:hidden"
            aria-label={t("Back")}
            onClick={goBack}
          >
            <ArrowLeft size={20} aria-hidden />
          </button>
        )}
        <Logo />
        <b className="text-xl">SpendSense</b>
        <span className="flex-1" />
        <LangToggle />
        <button
          aria-label={t("Settings")}
          onClick={() => go("settings")}
          className="btn clay-cream w-11 px-0!"
        >
          <Settings size={18} />
        </button>
      </header>
      <nav
        aria-label={t("Main navigation")}
        className="hidden md:flex max-w-[880px] mx-auto px-4 mt-4 gap-1 flex-wrap"
      >
        {MAIN.map((m) => pill(...m))}
        <div className="relative" ref={menu}>
          <button
            aria-expanded={more}
            aria-label={t("More")}
            aria-haspopup="menu"
            onKeyDown={(event) => {
              if (event.key === "Escape") setMore(false);
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setMore(true);
                requestAnimationFrame(() =>
                  menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(),
                );
              }
            }}
            aria-current={inMore ? "page" : undefined}
            onClick={() => setMore(!more)}
            className={`btn f-ui min-h-11! px-4! ${inMore ? "clay-sun" : "hover:bg-peach"}`}
          >
            <MoreHorizontal size={18} />
            {t("More")}
            {badge}
          </button>
          {more && !mobile && (
            <div
              role="menu"
              aria-label={t("More")}
              onKeyDown={(event) => {
                const items = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
                );
                const index = items.indexOf(document.activeElement as HTMLButtonElement);
                if (event.key === "Escape") {
                  setMore(false);
                  menu.current?.querySelector<HTMLButtonElement>("[aria-haspopup]")?.focus();
                }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  items[
                    (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length
                  ]?.focus();
                }
              }}
              className="absolute right-0 top-13 z-30 clay rounded-tile! p-2 grid min-w-52"
            >
              {MORE.map(([k, l, I]) => (
                <button
                  role="menuitem"
                  aria-label={t(l)}
                  key={k}
                  onClick={() => go(k)}
                  className="f-ui min-h-11 px-3 rounded-inner flex items-center gap-2 hover:bg-peach text-left"
                >
                  <I size={18} />
                  {t(l)}
                  {k === "waiting" && badge}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>
      <main
        id="main-content"
        tabIndex={-1}
        className="max-w-[880px] mx-auto px-4 py-6 grid grid-cols-1 gap-5"
      >
        {children}
      </main>
      <nav
        aria-label={t("Main navigation")}
        className="mobile-nav md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-cardline px-1 pt-1 pb-[max(6px,env(safe-area-inset-bottom))] grid grid-cols-6"
      >
        {[...MAIN, ["more", "More", MoreHorizontal] as const].map(([k, l, I]) => {
          const active = k === "more" ? inMore : tab === k;
          return (
            <button
              key={k}
              aria-label={t(l)}
              data-tour-id={k === "decide" || k === "goals" ? k : undefined}
              aria-current={active ? "page" : undefined}
              onClick={() => (k === "more" ? setMore(true) : go(k as Tab))}
              className="f-ui text-[11px] min-h-14 flex flex-col items-center justify-center gap-0.5 rounded-inner"
            >
              <span className={`px-3 py-1 rounded-full relative ${active ? "bg-sun" : ""}`}>
                <I size={20} aria-hidden />
                {k === "more" && due > 0 && (
                  <span className="absolute -top-1 -right-1 f-num text-[10px] bg-violet text-white rounded-full px-1">
                    {due}
                  </span>
                )}
              </span>
              <span className="truncate max-w-full">{t(l)}</span>
            </button>
          );
        })}
      </nav>
      {more && mobile && (
        <div className="md:hidden">
          <Sheet title={t("More")} onClose={() => setMore(false)}>
            <div className="grid gap-2">
              {MORE.map(([k, l, I]) => (
                <Button
                  key={k}
                  aria-label={t(l)}
                  onClick={() => go(k)}
                  className="justify-start!"
                  icon={<I size={18} />}
                >
                  {t(l)}
                  {k === "waiting" && badge}
                </Button>
              ))}
            </div>
          </Sheet>
        </div>
      )}
      {tour !== null && (
        <div
          role="dialog"
          aria-label="Tour"
          className="fixed z-40 bottom-24 md:bottom-6 right-4 left-4 md:left-auto md:w-96 clay p-4 rise flex gap-3"
        >
          <Blob expr="thinking" size={48} />
          <div className="flex-1">
            <p className="f-ui text-sm text-soft m-0">
              {t("Step {n} of {t}", { n: tour + 1, t: 3 })}
            </p>
            <h2 className="text-lg font-bold m-0">{t(TOUR[tour][1])}</h2>
            <p className="m-0 text-sm">{t(TOUR[tour][2])}</p>
            <div className="flex gap-2 mt-2">
              <Button onClick={() => setTour(null)}>{t("Skip tour")}</Button>
              <Button variant="coral" onClick={() => setTour(tour < 2 ? tour + 1 : null)}>
                {tour < 2 ? t("Next") : t("Done")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
