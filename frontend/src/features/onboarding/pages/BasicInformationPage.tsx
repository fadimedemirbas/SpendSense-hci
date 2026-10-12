import { useState, type FormEvent } from 'react'
import { Info } from 'lucide-react'
import spendSenseLogoIcon from '@/assets/spendsense-logo-icon.svg'
import { Button } from '@/components/ui/button'
import './basic-information.css'

const incomeOptions = [
  { value: 'income_0_10000', label: '0 \u2013 10,000 TL' },
  { value: 'income_10000_20000', label: '10,000 \u2013 20,000 TL' },
  { value: 'income_20000_35000', label: '20,000 \u2013 35,000 TL' },
  { value: 'income_35000_50000', label: '35,000 \u2013 50,000 TL' },
  { value: 'income_50000_75000', label: '50,000 \u2013 75,000 TL' },
  { value: 'income_75000_plus', label: '75,000 TL and above' },
] as const

const savingsOptions = [
  { value: 'savings_none', label: 'I currently cannot save' },
  { value: 'savings_0_1000', label: '0 \u2013 1,000 TL' },
  { value: 'savings_1000_3000', label: '1,000 \u2013 3,000 TL' },
  { value: 'savings_3000_5000', label: '3,000 \u2013 5,000 TL' },
  { value: 'savings_5000_10000', label: '5,000 \u2013 10,000 TL' },
  { value: 'savings_10000_plus', label: '10,000 TL and above' },
] as const

type IncomeRange = typeof incomeOptions[number]['value']
type SavingsRange = typeof savingsOptions[number]['value']
export type BasicInformationData = {
  monthlyIncomeRange: IncomeRange
  monthlySavingsRange: SavingsRange
}
type Props = {
  onBack: () => void
  onContinue?: (data: BasicInformationData) => void
}

export default function BasicInformationPage({ onBack, onContinue }: Props) {
  const [monthlyIncomeRange, setMonthlyIncomeRange] = useState<IncomeRange | ''>('')
  const [monthlySavingsRange, setMonthlySavingsRange] = useState<SavingsRange | ''>('')
  const [errors, setErrors] = useState({ income: false, savings: false })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({ income: !monthlyIncomeRange, savings: !monthlySavingsRange })
    if (!monthlyIncomeRange || !monthlySavingsRange) {
      document.querySelector<HTMLInputElement>(`input[name="${!monthlyIncomeRange ? 'income' : 'savings'}"]`)?.focus()
      return
    }
    onContinue?.({ monthlyIncomeRange, monthlySavingsRange })
  }

  return (
    <main className="basic-page">
      <div className="basic-container">
        <div className="basic-brand">
          <img src={spendSenseLogoIcon} alt="" width={32} height={32} />
          <span>Spend<span>Sense</span></span>
        </div>
        <div className="basic-progress">
          <div className="basic-step-labels"><span>Step 1 of 2</span><span>Basic Information</span></div>
          <div className="basic-progress-track" role="progressbar" aria-label="Onboarding progress"
            aria-valuemin={0} aria-valuemax={2} aria-valuenow={1} aria-valuetext="Step 1 of 2">
            <div className="basic-progress-fill" />
          </div>
        </div>
        <form className="basic-card" aria-labelledby="basic-heading" noValidate onSubmit={submit}>
          <div className="basic-heading">
            <h1 id="basic-heading">Tell us a little about your finances</h1>
            <p>Estimates are enough. You don't need to enter exact amounts.</p>
          </div>
          <div className="basic-ranges">
            <fieldset className="basic-field" aria-describedby={`income-help${errors.income ? ' income-error' : ''}`}>
              <legend>Monthly income range (required)</legend>
              <div className="basic-options">
                {incomeOptions.map(option => (
                  <label className="basic-option" key={option.value}>
                    <input type="radio" name="income" value={option.value} required
                      checked={monthlyIncomeRange === option.value} aria-invalid={errors.income}
                      aria-describedby={errors.income ? 'income-error' : undefined}
                      onChange={() => { setMonthlyIncomeRange(option.value); setErrors(previous => ({ ...previous, income: false })) }} />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <p className="basic-help" id="income-help">We use this range only to estimate how large a purchase is relative to your monthly income.</p>
              {errors.income && <p className="basic-error" id="income-error" role="alert">Select your monthly income range.</p>}
            </fieldset>
            <fieldset className="basic-field" aria-describedby={`savings-help${errors.savings ? ' savings-error' : ''}`}>
              <legend>Monthly savings range (required)</legend>
              <div className="basic-options">
                {savingsOptions.map(option => (
                  <label className="basic-option" key={option.value}>
                    <input type="radio" name="savings" value={option.value} required
                      checked={monthlySavingsRange === option.value} aria-invalid={errors.savings}
                      aria-describedby={errors.savings ? 'savings-error' : undefined}
                      onChange={() => { setMonthlySavingsRange(option.value); setErrors(previous => ({ ...previous, savings: false })) }} />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <p className="basic-help" id="savings-help">This helps estimate how a purchase may affect the timing of your goals.</p>
              {errors.savings && <p className="basic-error" id="savings-error" role="alert">Select your monthly savings range.</p>}
            </fieldset>
          </div>
          <div className="basic-information">
            <Info size={24} aria-hidden="true" />
            <p>Approximate ranges are enough. You can update these later.</p>
          </div>
          <div className="basic-actions">
            <Button className="basic-button basic-back" onClick={onBack}>Back</Button>
            <Button className="basic-button" type="submit">Continue</Button>
          </div>
        </form>
      </div>
    </main>
  )
}
