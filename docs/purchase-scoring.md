# SpendSense – Purchase Analysis Rules

**Version:** v5 · Rules approved by the team

This document defines how the "Should I Buy It?" analysis calculates the fit score, the criteria cards and the "Why?" explanations. The app never makes the final decision; it shows the score, the criteria, the explanation and the goal impact, and the user chooses **Buy / Wait / Skip**.

Point values are initial estimates. Anything found unreasonable during user testing will be adjusted individually.

---

## 1. How It Works

The analysis consists of **4 criteria**. Each criterion scores **0–25 points**, and together they form a **fit score from 0 to 100**. A higher score always means "a better fit".

Each criterion is shown on screen as a card with a **Low / Medium / High** level. Every rule that is triggered is listed as a sentence in the **"Why?"** section, under **Positive** or **Watch out**. Levels are shown with an icon and text in addition to color (accessibility).

| Card | What it measures | Good state on screen |
|---|---|---|
| Budget fit | Price relative to monthly income | High |
| Need level | Purchase reason and category | High |
| Goal impact | How many days it delays goals | Low |
| Impulse risk | Reason, mood, time, profile, history | Low |

---

## 2. Inputs Used by the Analysis

| Source | Data |
|---|---|
| Onboarding (Member 1) | Monthly income range, monthly savings range, spending profile percentages |
| Goals (Member 2) | Goal name, target amount, amount saved so far, target date (optional) |
| Purchase form (Member 3) | Item name, price, category, purchase reason (required, one or more), similar product owned (required) and its condition, mood (optional), time |
| History | Evaluations of previous purchases in the same category |

### Income and Savings Ranges

The midpoint of each range is used in calculations. **The onboarding options must match this table exactly.**

| Income (TL) | Used as | Monthly savings (TL) | Used as |
|---|---|---|---|
| 0 – 10,000 | 5,000 | I can't save anything | 0 |
| 10,000 – 20,000 | 15,000 | 0 – 1,000 | 500 |
| 20,000 – 35,000 | 27,500 | 1,000 – 3,000 | 2,000 |
| 35,000 – 50,000 | 42,500 | 3,000 – 5,000 | 4,000 |
| 50,000 – 75,000 | 62,500 | 5,000 – 10,000 | 7,500 |
| 75,000 and above | 90,000 | 10,000 and above | 12,500 |

### Form Options

| Field | Options |
|---|---|
| Purchase reason (required, 1–3 choices) | I needed it · I've wanted it for a long time · I wanted to reward myself · Because of a social setting · It was on sale · My friends influenced me · I just felt like it · Unplanned purchase |
| Do you already own a similar product? (required) | Yes · No |
| Is the current product still usable? (only if Yes) | Yes, it's usable · Partly, it's worn out · No, it's not usable |
| Mood (optional, single choice) | Happy · Neutral · Stressed · Sad · Bored · Excited |

---

## 3. Criterion: Budget Fit (0–25)

**Ratio = price ÷ monthly income (range midpoint)**

| Ratio | Points | Level | "Why?" sentence |
|---|---|---|---|
| Less than 5% | 25 | High | Positive: A small amount compared to your monthly income. |
| 5% – 15% | 15 | Medium | — |
| 15% – 30% | 8 | Low | Watch out: About X% of your monthly income. |
| More than 30% | 0 | Low | Watch out: About X% of your monthly income. |

---

## 4. Criterion: Need Level (0–25)

**Points = the highest reason score among the selected reasons (max 3) + essential category bonus + similar product effect** (min 0, max 25).

If more than one reason is selected, only the strongest one counts, so selecting more reasons does not inflate the score.

| Purchase reason | Points |
|---|---|
| I needed it | 20 |
| I've wanted it for a long time | 14 |
| I wanted to reward myself | 8 |
| Because of a social setting | 6 |
| It was on sale | 6 |
| My friends influenced me | 4 |
| I just felt like it | 4 |
| Unplanned purchase | 2 |
| + Essential category (groceries, bills, transport, health, education) | +5 |

### Similar Product Effect

| Similar product / current condition | Effect | "Why?" sentence |
|---|---|---|
| No similar product | 0 | — |
| Owned, still usable | −8 | Watch out: You already own a similar product that is still usable. |
| Owned, partly / worn out | −3 | Watch out: You own a similar product, but it is worn out. |
| Owned, not usable | 0 | Positive: Your current product is no longer usable, so this is a replacement need. |

**Level:** 18 and above High, 10–17 Medium, below 10 Low.

---

## 5. Criterion: Goal Impact (0–25)

**Delay (days) = price ÷ (monthly savings ÷ 30)**, rounded up.

Since savings are shared across all goals, the delay is the same for every goal. The opportunity cost screen additionally shows, for each goal, what percentage of the goal the price represents and (if a target date is set) the new estimated date.

| Delay | Points | Level | "Why?" sentence |
|---|---|---|---|
| 0 – 3 days | 25 | Low | Positive: Barely affects your goals. |
| 4 – 7 days | 18 | Low | — |
| 8 – 14 days | 12 | Medium | Watch out: Delays your goals by about X days. |
| 15 – 30 days | 6 | High | Watch out: Delays your goals by about X days. |
| More than 30 days | 0 | High | Watch out: Delays your goals by about X days. |

**Special cases:**
- **No goals:** 25 points, with the note "You don't have a goal yet".
- **"I can't save anything" selected:** Days cannot be calculated. Instead, the price is compared to the largest goal: less than 2% → 20 points, 2–10% → 10 points, more than 10% → 0 points. "Why?" sentence: *"Since you're not saving right now, this purchase directly pushes your goals further away."*

---

## 6. Criterion: Impulse Risk (0–25)

Starts at **25** and decreases in the cases below (min 0, max 25).

If several reasons are selected, the reason penalty is applied only once: **−8** if at least one strong impulsive reason is selected, **−4** if only mild ones are selected.

| Condition | Effect |
|---|---|
| At least one selected reason: It was on sale, I just felt like it, Unplanned purchase, or My friends influenced me | −8 |
| Only mild reasons selected: I wanted to reward myself and/or Because of a social setting | −4 |
| Mood: stressed, sad, or bored (if selected) | −5 |
| Time between 22:00 and 06:00 | −3 |
| Impulsive share in spending profile above 40% | −(impulsive % × 0.08) |
| More than half of recent evaluations in this category are negative (at least 3) | −5 |
| More than half of recent evaluations in this category are positive (at least 3) | +3 |

**Level:** 18 and above Low risk, 10–17 Medium, below 10 High risk.

---

## 7. Evaluation (5 Levels)

On the History page (Member 2), every purchase marked as "bought" has an **Evaluate** button. The user can press it at any time and pick one of 5 options; the answer can be changed later. The analysis uses these answers for new purchases in the same category.

| Answer | Counted as |
|---|---|
| Glad I bought it | Positive |
| Satisfied | Positive |
| Neutral | Not counted |
| Not really necessary | Negative |
| I regret it | Negative |

---

## 8. The User's Decision

Three buttons appear below the analysis, and the user makes the decision. The app does not recommend or highlight any of them.

| Button | What happens |
|---|---|
| Buy | The purchase is saved as "bought", appears in History, and can be evaluated later. |
| Wait | The user picks a waiting period: **24 hours / 3 days / 1 week**. The item is added to the waiting list. When the period ends, the next time the user opens the app they are asked *"Do you still want to buy this?"*: Yes (Buy), No (Skip), or Wait a bit longer (a new period is chosen). |
| Skip | The purchase is saved as "skipped". The money saved is shown in the monthly summary and in goal progress. |

---

## 9. Example: Same Item, Different Context

- Income 20–35k (used as 27,500), 45% impulsive profile
- Monthly savings 1,000–3,000 (used as 2,000, about 67 TL per day)
- Vacation goal: 30,000 TL
- Item: 2,500 TL headphones, electronics, no similar product owned
- That is 9% of income, delays the vacation goal by 38 days, and equals 8% of the goal

| Criterion | Scenario A: On sale, stressed, 23:00 | Scenario B: Wanted it for a long time, happy, 14:00 |
|---|---|---|
| Budget fit | 15 · Medium | 15 · Medium |
| Need level | 6 · Low | 14 · Medium |
| Goal impact | 0 · High | 0 · High |
| Impulse risk | 25 − 8 − 5 − 3 − 4 = 5 · High | 25 − 4 = 21 · Low |
| **Fit score** | **26 / 100** | **50 / 100** |

In both scenarios the app does not decide; the user sees the cards and reasons, then chooses Buy / Wait / Skip.

---

## 10. Example: Multiple Reasons and a Similar Product

Same headphones. The user selected both **I needed it** and **It was on sale**, **already owns a similar product that is still usable**, did not select a mood, and the time is 15:00.

| Criterion | Calculation | Result |
|---|---|---|
| Budget fit | 9% of income | 15 · Medium |
| Need level | Highest reason 20, similar usable product −8 | 12 · Medium |
| Goal impact | Vacation delayed by 38 days | 0 · High |
| Impulse risk | 25 − 8 (On sale) − 4 (profile) | 13 · Medium |
| **Fit score** | | **40 / 100** |

The "Why?" section shows both positive ("You said you need it") and watch-out sentences ("Because it was on sale", "You already own a similar product that is still usable"). Mixed motives are reflected honestly to the user.
