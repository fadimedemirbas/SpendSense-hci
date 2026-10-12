# Spending Behavior Profile Scoring

## Purpose

This document defines the approved rule-based Spending Behavior Profile scoring model for the onboarding questionnaire.

The model is intended for an initial HCI prototype. It is not a psychological personality test, and it should not be presented as a fixed or clinical assessment of the user. The weights and interpretation may be adjusted after user testing.

The model produces five behavioral dimensions:

- `IMP` - Impulsive Decision Maker
- `PLN` - Planned Spender
- `BAR` - Bargain Hunter
- `SOC` - Social Spender
- `REW` - Reward-Driven Spender

## Question Scoring

Each onboarding questionnaire answer contributes points to one or more behavioral dimensions.

### Q1 - Unplanned Sale Purchase

| Answer | Score |
| --- | --- |
| Never | `PLN +3` |
| Rarely | `PLN +2`, `BAR +1` |
| Sometimes | `BAR +2`, `IMP +1` |
| Often | `BAR +2`, `IMP +2` |

### Q2 - Time Spent Thinking Before Purchase

| Answer | Score |
| --- | --- |
| I usually buy it right away | `IMP +3` |
| A few hours | `IMP +2`, `PLN +1` |
| A few days | `PLN +2`, `IMP +1` |
| A week or more | `PLN +3` |

### Q3 - Spending More Than Planned With Friends

| Answer | Score |
| --- | --- |
| Never | `PLN +2` |
| Rarely | `PLN +1`, `SOC +1` |
| Sometimes | `SOC +2`, `IMP +1` |
| Often | `SOC +3`, `IMP +1` |

### Q4 - Buying Something to Reward Yourself

| Answer | Score |
| --- | --- |
| Never | `PLN +2` |
| Rarely | `REW +1` |
| Sometimes | `REW +2`, `IMP +1` |
| Often | `REW +3`, `IMP +1` |

### Q5 - Buying Shortly After Adding Something to an Online Cart

| Answer | Score |
| --- | --- |
| Never | `PLN +3` |
| Rarely | `PLN +2`, `IMP +1` |
| Sometimes | `IMP +2`, `PLN +1` |
| Often | `IMP +3` |

### Q6 - Spending Increases Shortly After Receiving Income

| Answer | Score |
| --- | --- |
| Never | `PLN +3` |
| Rarely | `PLN +2`, `IMP +1` |
| Sometimes | `IMP +2`, `PLN +1` |
| Often | `IMP +3` |

### Q7 - First Thought Before Buying an Expensive Item

| Answer | Score |
| --- | --- |
| I want it now | `IMP +3` |
| Do I really need it? | `PLN +3` |
| Is there a cheaper option? | `BAR +3` |
| Does it fit my budget? | `PLN +3` |

### Q8 - Comparing Purchases With Long-Term Goals

| Answer | Score |
| --- | --- |
| Never | `IMP +3` |
| Rarely | `IMP +2`, `PLN +1` |
| Sometimes | `PLN +2`, `IMP +1` |
| Often | `PLN +3` |

## Maximum Raw Scores

The maximum possible raw score for each dimension is:

| Dimension | Maximum Raw Score |
| --- | ---: |
| `IMP` | 19 |
| `PLN` | 22 |
| `BAR` | 5 |
| `SOC` | 3 |
| `REW` | 3 |

## Normalization

Because the five dimensions are influenced by different numbers of questions, raw scores must not be directly converted into percentages.

First, normalize each dimension relative to its maximum possible score:

```text
normalizedScore = rawScore / maximumPossibleScore
```

Then convert normalized scores into a distribution totaling 100%:

```text
profilePercentage =
  normalizedScore / sumOfAllNormalizedScores * 100
```

Values should be rounded appropriately for display. The displayed profile percentages should total approximately 100%.

## Example Output

The following is an example only:

| Percentage | Dimension |
| ---: | --- |
| 42% | Impulsive Decision Maker |
| 27% | Planned Spender |
| 14% | Bargain Hunter |
| 10% | Reward-Driven Spender |
| 7% | Social Spender |

Actual percentages depend on the user's questionnaire answers.

## Purchase Analysis Connection

The generated Spending Behavior Profile percentages can later be consumed by the purchase analysis system.

In particular, the approved purchase-analysis rules use the Impulsive Decision Maker percentage when evaluating impulsive risk. This document does not duplicate the complete purchase-analysis algorithm.

## Design and HCI Notes

- Use the term "Spending Behavior Profile".
- Do not call the model a personality test.
- Do not present one dimension as the user's fixed identity.
- All five tendencies may coexist.
- Use neutral, non-judgmental descriptions.
- Allow users to update their questionnaire answers later.
- Treat the scoring model as a prototype that may be revised after user testing.
