import { useState } from 'react'
import WelcomePage from './features/onboarding/pages/WelcomePage'
import LoginRegisterPage, { type AuthMode } from './features/onboarding/pages/LoginRegisterPage'

function App() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)
  return authMode ? (
    <LoginRegisterPage initialMode={authMode} onBack={() => setAuthMode(null)} />
  ) : (
    <WelcomePage onCreateAccount={() => setAuthMode('register')} onLogin={() => setAuthMode('login')} />
  )
}

export default App
