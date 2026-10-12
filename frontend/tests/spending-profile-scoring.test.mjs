import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateSpendingProfile } from '../src/features/onboarding/lib/spendingProfileScoring.ts'

const dimensions = ['IMP', 'PLN', 'BAR', 'SOC', 'REW']
// Independent fixtures transcribed from docs/spending-profile-scoring.md.
const weights = [
  [{ PLN: 3 }, { PLN: 2, BAR: 1 }, { BAR: 2, IMP: 1 }, { BAR: 2, IMP: 2 }],
  [{ IMP: 3 }, { IMP: 2, PLN: 1 }, { PLN: 2, IMP: 1 }, { PLN: 3 }],
  [{ PLN: 2 }, { PLN: 1, SOC: 1 }, { SOC: 2, IMP: 1 }, { SOC: 3, IMP: 1 }],
  [{ PLN: 2 }, { REW: 1 }, { REW: 2, IMP: 1 }, { REW: 3, IMP: 1 }],
  [{ PLN: 3 }, { PLN: 2, IMP: 1 }, { IMP: 2, PLN: 1 }, { IMP: 3 }],
  [{ PLN: 3 }, { PLN: 2, IMP: 1 }, { IMP: 2, PLN: 1 }, { IMP: 3 }],
  [{ IMP: 3 }, { PLN: 3 }, { BAR: 3 }, { PLN: 3 }],
  [{ IMP: 3 }, { IMP: 2, PLN: 1 }, { PLN: 2, IMP: 1 }, { PLN: 3 }],
]
const maxima = { IMP: 19, PLN: 22, BAR: 5, SOC: 3, REW: 3 }

test('all 65,536 complete answer combinations follow approved weights and normalization', () => {
  for (let combination = 0; combination < 4 ** 8; combination++) {
    const answers = Array.from({ length: 8 }, (_, index) => Math.floor(combination / 4 ** index) % 4)
    const expected = Object.fromEntries(dimensions.map(dimension => [dimension,
      answers.reduce((sum, answer, index) => sum + (weights[index][answer][dimension] ?? 0), 0),
    ]))
    const result = calculateSpendingProfile(answers)
    assert.deepEqual(result.raw, expected)
    const total = dimensions.reduce((sum, dimension) => sum + expected[dimension] / maxima[dimension], 0)
    for (const dimension of dimensions) {
      assert.equal(result.normalized[dimension], expected[dimension] / maxima[dimension])
      assert.equal(result.percentages[dimension], expected[dimension] / maxima[dimension] / total * 100)
    }
    assert.ok(Math.abs(Object.values(result.percentages).reduce((sum, value) => sum + value, 0) - 100) < 1e-10)
  }
})

test('incomplete and invalid answers are rejected', () => {
  for (const answers of [[], Array(8).fill(null), Array(7).fill(0), Array(9).fill(0),
    [0, 0, 0, 0, 0, 0, 0, 4], [0, 0, 0, 0, 0, 0, 0, -1], [0, 0, 0, 0, 0, 0, 0, 1.5]]) {
    assert.throws(() => calculateSpendingProfile(answers))
  }
})
