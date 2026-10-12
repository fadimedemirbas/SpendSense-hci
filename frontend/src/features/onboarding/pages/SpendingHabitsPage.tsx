import { useRef, useState, type FormEvent } from 'react'
import { Info } from 'lucide-react'
import spendSenseLogoIcon from '@/assets/spendsense-logo-icon.svg'
import { Button } from '@/components/ui/button'
import { calculateSpendingProfile, spendingQuestions, type SpendingAnswer, type SpendingProfileResult } from '../lib/spendingProfileScoring'
import './spending-habits.css'

type Props = {
  onBack: () => void
  onComplete: (result: SpendingProfileResult) => void
}

export default function SpendingHabitsPage({ onBack, onComplete }: Props) {
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [answers, setAnswers] = useState<SpendingAnswer[]>(() => Array(spendingQuestions.length).fill(null))
  const [error, setError] = useState(false)
  const questionLegend = useRef<HTMLLegendElement>(null)
  const question = spendingQuestions[currentQuestion]!

  function moveTo(index: number) {
    setCurrentQuestion(index)
    setError(false)
    questionLegend.current?.focus()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (answers[currentQuestion] === null) {
      setError(true)
      document.querySelector<HTMLInputElement>('input[name="spending-answer"]')?.focus()
      return
    }
    if (currentQuestion < spendingQuestions.length - 1) {
      moveTo(currentQuestion + 1)
    } else {
      onComplete(calculateSpendingProfile(answers))
    }
  }

  return (
    <div className="habits-page">
      <header className="habits-header">
        <div className="habits-brand">
          <img src={spendSenseLogoIcon} alt="" width={32} height={32} />
          <span>Spend<span>Sense</span></span>
        </div>
        <p>Step 2 of 2</p>
      </header>
      <main className="habits-main">
        <div className="habits-intro">
          <span className="habits-badge">Spending Habits</span>
          <h1>How do you usually make spending decisions?</h1>
          <p>There are no right or wrong answers. Choose what feels closest to your usual behavior.</p>
        </div>
        <div className="habits-progress" role="progressbar" aria-label="Question progress"
          aria-valuemin={0} aria-valuemax={spendingQuestions.length} aria-valuenow={currentQuestion + 1}
          aria-valuetext={`Question ${currentQuestion + 1} of ${spendingQuestions.length}`}>
          <div style={{ width: `${(currentQuestion + 1) / spendingQuestions.length * 100}%` }} />
        </div>
        <form className="habits-form" onSubmit={submit} noValidate>
          <div className="habits-card">
            <p className="habits-counter" aria-live="polite">Question {currentQuestion + 1} of {spendingQuestions.length}</p>
            <fieldset className="habits-question" aria-describedby={error ? 'habits-error' : undefined}>
              <legend ref={questionLegend} tabIndex={-1}>{question.text}</legend>
              <div className="habits-options">
                {question.options.map((option, index) => (
                  <label className="habits-option" key={`${currentQuestion}-${index}`}>
                    <input type="radio" name="spending-answer" value={index} required
                      checked={answers[currentQuestion] === index} aria-invalid={error}
                      aria-describedby={error ? 'habits-error' : undefined}
                      onChange={() => {
                        setAnswers(previous => previous.map((answer, questionIndex) => questionIndex === currentQuestion ? index : answer))
                        setError(false)
                      }} />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              {error && <p className="habits-error" id="habits-error" role="alert">Choose the answer that feels closest to your usual behavior.</p>}
            </fieldset>
          </div>
          <div className="habits-note"><Info size={16} aria-hidden="true" /><p>Your answers help personalize future purchase feedback.</p></div>
          <div className="habits-actions">
            <Button className="habits-button habits-back" onClick={() => currentQuestion === 0 ? onBack() : moveTo(currentQuestion - 1)}>Back</Button>
            <Button className="habits-button habits-next" type="submit">{currentQuestion === spendingQuestions.length - 1 ? 'See my profile' : 'Next'}</Button>
          </div>
        </form>
      </main>
    </div>
  )
}
