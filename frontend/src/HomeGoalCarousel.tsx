import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Goal } from "./store";
import { Card, InfoTip, Ring, useT } from "./ui";
import { GoalAmounts, useDisplayMoney } from "./CurrencyTotals";
import "./home-goal-carousel.css";

export function HomeGoalCarousel({ goals }: { goals: Goal[] }) {
  const t = useT();
  const money = useDisplayMoney();
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; y: number } | null>(null);
  const hintId = useId();
  const [paused, setPaused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [indicatorsVisible, setIndicatorsVisible] = useState(false);
  const indicatorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(indicatorTimer.current), []);
  const revealIndicators = useCallback(() => {
    clearTimeout(indicatorTimer.current);
    setIndicatorsVisible(true);
    indicatorTimer.current = setTimeout(() => setIndicatorsVisible(false), 1100);
  }, []);
  const [rotation, setRotation] = useState({
    current: goals[0]?.id,
    previous: null as string | null,
    direction: 1,
  });
  const current = goals.find((goal) => goal.id === rotation.current) ?? goals[0];
  const previous = goals.find((goal) => goal.id === rotation.previous && goal.id !== current?.id);
  const advance = useCallback(
    (direction: 1 | -1) => {
      if (goals.length < 2) return;
      revealIndicators();
      const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
      setRotation((state) => {
        const index = Math.max(
          0,
          goals.findIndex((goal) => goal.id === state.current),
        );
        return {
          current: goals[(index + direction + goals.length) % goals.length].id,
          previous: reduceMotion ? null : goals[index].id,
          direction,
        };
      });
    },
    [goals, revealIndicators],
  );

  useEffect(() => {
    if (paused || goals.length < 2) return;
    const timer = window.setInterval(() => {
      // Leave time to read; do not move an info trigger while it is being used.
      if (
        document.hidden ||
        container.current?.matches(":hover") ||
        container.current?.querySelector(".goal-wheel")?.contains(document.activeElement)
      )
        return;
      advance(1);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [advance, goals.length, paused, rotation.current]);

  if (!current) return null;
  const content = (goal: Goal) => (
    <>
      <Ring
        value={(goal.saved / goal.target) * 100}
        label={`${goal.name} ${Math.round((goal.saved / goal.target) * 100)}%`}
        suffix="%"
      />
      <div>
        <div className="flex items-center gap-1">
          <h2 className="text-xl font-bold m-0">{goal.name}</h2>
          <InfoTip
            label={goal.name}
            text={t(
              "Progress is what you have saved divided by the target, in the goal's own currency. Add money whenever you set some aside.",
            )}
          />
        </div>
        <GoalAmounts
          saved={goal.saved}
          target={goal.target}
          currency={goal.currency}
          money={money}
        />
        <p className="f-voice m-0 mt-1">
          {t(
            goal.saved > 0
              ? "You're getting closer to your goal."
              : "Add money to this goal whenever you're ready.",
          )}
        </p>
      </div>
    </>
  );
  return (
    <Card className="relative flex items-center">
      <div
        ref={container}
        className="home-goal-carousel w-full"
        role="region"
        aria-label={t("Goals")}
        aria-describedby={goals.length > 1 ? hintId : undefined}
        tabIndex={goals.length > 1 ? 0 : undefined}
        onKeyDown={(event) => {
          if (goals.length < 2 || event.target !== event.currentTarget) return;
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            advance(event.key === "ArrowDown" ? 1 : -1);
          }
        }}
      >
        <div
          className="goal-wheel"
          data-swipe={goals.length > 1 || undefined}
          data-direction={rotation.direction}
          onPointerDown={(event) => {
            if (
              goals.length < 2 ||
              !event.isPrimary ||
              event.button !== 0 ||
              (event.target as HTMLElement).closest("button, a")
            )
              return;
            drag.current = { pointer: event.pointerId, y: event.clientY };
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
            if (event.pointerType === "mouse") event.preventDefault();
          }}
          onPointerUp={(event) => {
            const start = drag.current;
            if (!start || start.pointer !== event.pointerId) return;
            drag.current = null;
            setDragging(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
            const distance = event.clientY - start.y;
            if (Math.abs(distance) >= 36) advance(distance > 0 ? 1 : -1);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          onLostPointerCapture={() => {
            drag.current = null;
            setDragging(false);
          }}
        >
          {previous && (
            <div
              key={previous.id}
              className="goal-wheel-slide goal-wheel-out"
              aria-hidden="true"
              inert
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget)
                  setRotation((state) => ({ ...state, previous: null }));
              }}
            >
              {content(previous)}
            </div>
          )}
          <div key={current.id} className={`goal-wheel-slide ${previous ? "goal-wheel-in" : ""}`}>
            {content(current)}
          </div>
        </div>
        {goals.length > 1 && (
          <>
            <span id={hintId} className="sr-only">
              {t("Swipe up or down, or use the arrow keys to change goals.")}
            </span>
            <div
              className="goal-wheel-dots"
              data-visible={dragging || indicatorsVisible}
              aria-hidden="true"
            >
              {goals.map((goal) => (
                <span key={goal.id} data-active={goal.id === current.id} />
              ))}
            </div>
            <button
              type="button"
              className="goal-wheel-accessible-pause sr-only focus:not-sr-only"
              onClick={() => setPaused((value) => !value)}
            >
              {t(paused ? "Resume goal rotation" : "Pause goal rotation")}
            </button>
          </>
        )}
      </div>
    </Card>
  );
}
