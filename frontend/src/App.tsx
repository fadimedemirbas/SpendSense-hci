import { useRef, useState } from 'react'
import WelcomePage from './features/onboarding/pages/WelcomePage'
import LoginRegisterPage, { type AuthMode } from './features/onboarding/pages/LoginRegisterPage'
import BasicInformationPage, { type BasicInformationData } from './features/onboarding/pages/BasicInformationPage'
import SpendingHabitsPage from './features/onboarding/pages/SpendingHabitsPage'
import type { SpendingProfileResult } from './features/onboarding/lib/spendingProfileScoring'

function App() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)
  const [showBasicInformation, setShowBasicInformation] = useState(false)
  const basicInformation = useRef<BasicInformationData | null>(null)
  const spendingProfile = useRef<SpendingProfileResult | null>(null)
  const [showSpendingHabits, setShowSpendingHabits] = useState(false)
  if (showSpendingHabits) {
    return <SpendingHabitsPage onBack={() => setShowSpendingHabits(false)}
      onComplete={result => { spendingProfile.current = result }} />
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
