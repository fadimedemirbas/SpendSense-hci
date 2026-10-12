import { useRef, useState } from 'react'
import WelcomePage from './features/onboarding/pages/WelcomePage'
import LoginRegisterPage, { type AuthMode } from './features/onboarding/pages/LoginRegisterPage'
import BasicInformationPage, { type BasicInformationData } from './features/onboarding/pages/BasicInformationPage'
import SpendingHabitsPage from './features/onboarding/pages/SpendingHabitsPage'
import SpendingProfileResultPage from './features/onboarding/pages/SpendingProfileResultPage'
import { spendingQuestions, type SpendingAnswer, type SpendingProfileResult } from './features/onboarding/lib/spendingProfileScoring'

function App() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)
  const [showBasicInformation, setShowBasicInformation] = useState(false)
  const basicInformation = useRef<BasicInformationData | null>(null)
  const [spendingProfile, setSpendingProfile] = useState<SpendingProfileResult | null>(null)
  const [spendingAnswers, setSpendingAnswers] = useState<SpendingAnswer[]>(() => Array(spendingQuestions.length).fill(null))
  const [showProfileResult, setShowProfileResult] = useState(false)
  const onboardingContinued = useRef(false)
  const [showSpendingHabits, setShowSpendingHabits] = useState(false)
  if (showProfileResult) {
    return <SpendingProfileResultPage result={spendingProfile}
      onReview={() => { setShowProfileResult(false); setShowSpendingHabits(true) }}
      onContinue={() => { onboardingContinued.current = true }} />
  }
  if (showSpendingHabits) {
    return <SpendingHabitsPage answers={spendingAnswers} onAnswersChange={setSpendingAnswers}
      onBack={() => setShowSpendingHabits(false)}
      onComplete={result => { setSpendingProfile(result); setShowProfileResult(true) }} />
  }
  if (showBasicInformation) {
    return <BasicInformationPage initialData={basicInformation.current}
      onBack={() => { setAuthMode('register'); setShowBasicInformation(false) }}
      onContinue={data => { basicInformation.current = data; setShowSpendingHabits(true) }} />
  }
  return authMode ? (
    <LoginRegisterPage initialMode={authMode} onBack={() => setAuthMode(null)}
      onRegistrationContinue={() => setShowBasicInformation(true)} />
  ) : (
    <WelcomePage onCreateAccount={() => setAuthMode('register')} onLogin={() => setAuthMode('login')} />
  )
}

export default App
