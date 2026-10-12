export type ProfileDimension = 'IMP' | 'PLN' | 'BAR' | 'SOC' | 'REW'
export type ProfileScores = Record<ProfileDimension, number>
export type SpendingAnswer = number | null
export type SpendingProfileResult = {
  raw: ProfileScores
  normalized: ProfileScores
  percentages: ProfileScores
}
type Question = {
  text: string
  options: readonly { label: string; scores: Partial<ProfileScores> }[]
}

export const spendingQuestions: readonly Question[] = [
  {
    text: 'When you see an item on sale that you did not plan to buy, how often do you buy it?',
    options: [
      { label: 'Never', scores: { PLN: 3 } },
      { label: 'Rarely', scores: { PLN: 2, BAR: 1 } },
      { label: 'Sometimes', scores: { BAR: 2, IMP: 1 } },
      { label: 'Often', scores: { BAR: 2, IMP: 2 } },
    ],
  },
  {
    text: 'When you are considering a non-essential purchase, how long do you usually think before buying it?',
    options: [
      { label: 'I usually buy it right away', scores: { IMP: 3 } },
      { label: 'A few hours', scores: { IMP: 2, PLN: 1 } },
      { label: 'A few days', scores: { PLN: 2, IMP: 1 } },
      { label: 'A week or more', scores: { PLN: 3 } },
    ],
  },
  {
    text: 'When you are with friends or other people, how often do you spend more than you originally planned?',
    options: [
      { label: 'Never', scores: { PLN: 2 } },
      { label: 'Rarely', scores: { PLN: 1, SOC: 1 } },
      { label: 'Sometimes', scores: { SOC: 2, IMP: 1 } },
      { label: 'Often', scores: { SOC: 3, IMP: 1 } },
    ],
  },
  {
    text: 'How often do you buy something as a reward for yourself?',
    options: [
      { label: 'Never', scores: { PLN: 2 } },
      { label: 'Rarely', scores: { REW: 1 } },
      { label: 'Sometimes', scores: { REW: 2, IMP: 1 } },
      { label: 'Often', scores: { REW: 3, IMP: 1 } },
    ],
  },
  {
    text: 'How often do you add items to an online cart and buy them without planning the purchase beforehand?',
    options: [
      { label: 'Never', scores: { PLN: 3 } },
      { label: 'Rarely', scores: { PLN: 2, IMP: 1 } },
      { label: 'Sometimes', scores: { IMP: 2, PLN: 1 } },
      { label: 'Often', scores: { IMP: 3 } },
    ],
  },
  {
    text: 'How often do you spend a larger part of your income during the first few days after receiving it?',
    options: [
      { label: 'Never', scores: { PLN: 3 } },
      { label: 'Rarely', scores: { PLN: 2, IMP: 1 } },
      { label: 'Sometimes', scores: { IMP: 2, PLN: 1 } },
      { label: 'Often', scores: { IMP: 3 } },
    ],
  },
  {
    text: 'When you see an expensive item you like, what is usually your first thought?',
    options: [
      { label: 'I want it now', scores: { IMP: 3 } },
      { label: 'Do I really need it?', scores: { PLN: 3 } },
      { label: 'Is there a cheaper option?', scores: { BAR: 3 } },
      { label: 'Does it fit my budget?', scores: { PLN: 3 } },
    ],
  },
  {
    text: 'How often do you compare a purchase with your longer-term financial goals before deciding?',
    options: [
      { label: 'Never', scores: { IMP: 3 } },
      { label: 'Rarely', scores: { IMP: 2, PLN: 1 } },
      { label: 'Sometimes', scores: { PLN: 2, IMP: 1 } },
      { label: 'Often', scores: { PLN: 3 } },
    ],
  },
]

const maximumScores: ProfileScores = { IMP: 19, PLN: 22, BAR: 5, SOC: 3, REW: 3 }
const dimensions: ProfileDimension[] = ['IMP', 'PLN', 'BAR', 'SOC', 'REW']

export function calculateSpendingProfile(answers: readonly SpendingAnswer[]): SpendingProfileResult {
  if (answers.length !== spendingQuestions.length) {
    throw new Error('A complete questionnaire is required.')
  }
  const raw: ProfileScores = { IMP: 0, PLN: 0, BAR: 0, SOC: 0, REW: 0 }
  spendingQuestions.forEach((question, index) => {
    const answer = answers[index]
    if (typeof answer !== 'number' || !Number.isInteger(answer) || !question.options[answer]) {
      throw new Error('Each question requires a valid answer.')
    }
    const option = question.options[answer]!
    dimensions.forEach(dimension => { raw[dimension] += option.scores[dimension] ?? 0 })
  })
  const normalized = { ...raw }
  dimensions.forEach(dimension => { normalized[dimension] = raw[dimension] / maximumScores[dimension] })
  const total = dimensions.reduce((sum, dimension) => sum + normalized[dimension], 0)
  const percentages = { ...raw }
  dimensions.forEach(dimension => { percentages[dimension] = normalized[dimension] / total * 100 })
  return { raw, normalized, percentages }
}
