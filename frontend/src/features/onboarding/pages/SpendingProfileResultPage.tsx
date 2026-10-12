import { useState } from 'react'
import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ProfileDimension, SpendingProfileResult } from '../lib/spendingProfileScoring'
import './spending-profile-result.css'

const tendencies: { dimension: ProfileDimension; name: string; description: string }[] = [
  { dimension: 'IMP', name: 'Impulsive Decision Maker', description: 'You may sometimes make purchase decisions quickly, especially when something feels immediately appealing.' },
  { dimension: 'PLN', name: 'Planned Spender', description: 'You often consider your budget or needs before making a purchase.' },
  { dimension: 'BAR', name: 'Bargain Hunter', description: 'Discounts and lower-price options can strongly influence your purchase decisions.' },
  { dimension: 'REW', name: 'Reward-Driven Spender', description: 'You may sometimes use purchases as a way to reward yourself.' },
  { dimension: 'SOC', name: 'Social Spender', description: 'Social situations may sometimes influence how much or what you spend.' },
]

type Props = {
  result: SpendingProfileResult | null
  onReview: () => void
  onContinue: () => void
}

export default function SpendingProfileResultPage({ result, onReview, onContinue }: Props) {
  const [showCalculation, setShowCalculation] = useState(false)
  const validResult = result && tendencies.every(({ dimension }) => {
    const value = result.percentages?.[dimension]
    return Number.isFinite(value) && value >= 0 && value <= 100
  }) && tendencies.some(({ dimension }) => result.percentages[dimension] > 0)

  if (!validResult) {
    return (
      <main className="profile-page">
        <div className="profile-container">
          <p>Complete your spending habits answers to see your profile.</p>
          <Button className="profile-button profile-secondary" onClick={onReview}>Review my answers</Button>
        </div>
      </main>
    )
  }

  return (
    <main className="profile-page">
      <div className="profile-container">
        <header className="profile-heading">
          <p>Onboarding complete</p>
          <h1>Your Spending Behavior Profile</h1>
        </header>
        <div className="profile-summary">
          <p>Your answers suggest a mix of spending tendencies. These patterns can help SpendSense personalize future feedback.</p>
          <p>This is not a personality test and your profile may change over time.</p>
        </div>
        <p className="profile-disclosure">Based on your onboarding answers.</p>
        <section className="profile-breakdown" aria-label="Spending tendencies">
          {tendencies.map(({ dimension, name, description }) => {
            const percentage = result.percentages[dimension]
            return (
              <div className="profile-tendency" key={dimension}>
                <div className="profile-tendency-heading">
                  <h2>{name}</h2><span>{Math.round(percentage)}%</span>
                </div>
                <div className="profile-tendency-detail">
                  <div className="profile-track" role="progressbar" aria-label={name}
                    aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
                    <div style={{ width: `${percentage}%` }} />
                  </div>
                  <p>{description}</p>
                </div>
              </div>
            )
          })}
        </section>
        <section className="profile-explanation" aria-labelledby="profile-use-heading">
          <div className="profile-explanation-heading">
            <Info size={24} aria-hidden="true" />
            <h2 id="profile-use-heading">How this is used</h2>
          </div>
          <p>SpendSense uses this profile to adjust the context shown in future purchase analyses. It does not make decisions for you.</p>
          <button className="profile-calculation-button" type="button" aria-expanded={showCalculation}
            aria-controls="profile-calculation" onClick={() => setShowCalculation(previous => !previous)}>
            How was this calculated?
          </button>
          <div id="profile-calculation" hidden={!showCalculation}>
            <p>Your answers add points to five spending tendencies. Each tendency is normalized against its maximum possible score, then converted into a percentage of your overall profile.</p>
          </div>
        </section>
        <div className="profile-actions">
          <Button className="profile-button profile-secondary" onClick={onReview}>Review my answers</Button>
          <Button className="profile-button" onClick={onContinue}>Continue to SpendSense</Button>
        </div>
        <p className="profile-bottom-note">You can update your answers later.</p>
      </div>
    </main>
  )
}
