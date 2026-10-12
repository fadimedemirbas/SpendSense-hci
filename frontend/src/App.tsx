import { useRef, useState } from 'react'
import WelcomePage from './features/onboarding/pages/WelcomePage'
import LoginRegisterPage, { type AuthMode } from './features/onboarding/pages/LoginRegisterPage'
import BasicInformationPage, { type BasicInformationData } from './features/onboarding/pages/BasicInformationPage'

function App() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)
  const [showBasicInformation, setShowBasicInformation] = useState(false)
  const basicInformation = useRef<BasicInformationData | null>(null)
  if (showBasicInformation) {
    return <BasicInformationPage onBack={() => { setAuthMode('register'); setShowBasicInformation(false) }}
      onContinue={data => { basicInformation.current = data }} />
  }
  return authMode ? (
    <LoginRegisterPage initialMode={authMode} onBack={() => setAuthMode(null)}
      onRegistrationContinue={() => setShowBasicInformation(true)} />
  ) : (
    <WelcomePage onCreateAccount={() => setAuthMode('register')} onLogin={() => setAuthMode('login')} />
  )
}

export default App
