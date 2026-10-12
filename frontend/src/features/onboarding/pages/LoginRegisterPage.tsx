import { useState, type FormEvent } from 'react'
import { ArrowLeft, Eye, EyeOff, Shield } from 'lucide-react'
import spendSenseLogoIcon from '@/assets/spendsense-logo-icon.svg'
import { Button } from '@/components/ui/button'
import './login-register.css'

export type AuthMode = 'register' | 'login'
type Field = 'email' | 'password' | 'confirmPassword'
type Props = { initialMode?: AuthMode; onBack: () => void }

export default function LoginRegisterPage({ initialMode = 'register', onBack }: Props) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [values, setValues] = useState({ email: '', password: '', confirmPassword: '' })
  const [visible, setVisible] = useState({ password: false, confirmPassword: false })
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [notice, setNotice] = useState('')
  const isRegister = mode === 'register'

  function switchMode(next: AuthMode) {
    setMode(next)
    setErrors({})
    setNotice('')
    setVisible({ password: false, confirmPassword: false })
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: Partial<Record<Field, string>> = {}
    if (isRegister ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()) : !values.email.trim()) {
      nextErrors.email = isRegister ? 'Enter a valid email address.' : 'Enter your email address.'
    }
    if (isRegister ? values.password.length < 8 : !values.password.trim()) {
      nextErrors.password = isRegister ? 'Password must contain at least 8 characters.' : 'Enter your password.'
    }
    if (isRegister && values.confirmPassword !== values.password) {
      nextErrors.confirmPassword = 'Passwords do not match.'
    }
    setErrors(nextErrors)
    setNotice('')
    if (Object.keys(nextErrors).length) {
      document.getElementById(`auth-${Object.keys(nextErrors)[0]}`)?.focus()
    }
  }

  function update(field: Field, value: string) {
    setValues(previous => ({ ...previous, [field]: value }))
    setErrors(previous => ({ ...previous, [field]: undefined }))
  }

  function passwordField(field: 'password' | 'confirmPassword', label: string) {
    const helper = field === 'password' && isRegister
    const VisibilityIcon = visible[field] ? EyeOff : Eye
    return (
      <div className="auth-field">
        <label htmlFor={`auth-${field}`}>{label}</label>
        <div className="auth-password">
          <input id={`auth-${field}`} type={visible[field] ? 'text' : 'password'}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={values[field]} onChange={event => update(field, event.target.value)}
            aria-invalid={Boolean(errors[field])}
            aria-describedby={[helper ? 'auth-password-help' : '', errors[field] ? `auth-${field}-error` : ''].filter(Boolean).join(' ') || undefined} />
          <button type="button" className="auth-visibility"
            aria-label={`${visible[field] ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
            aria-pressed={visible[field]} title={`${visible[field] ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
            onClick={() => setVisible(previous => ({ ...previous, [field]: !previous[field] }))}>
            <VisibilityIcon size={16} aria-hidden="true" />
          </button>
        </div>
        {helper && <p className="auth-help" id="auth-password-help">Use at least 8 characters.</p>}
        {errors[field] && <p className="auth-error" id={`auth-${field}-error`} role="alert">{errors[field]}</p>}
      </div>
    )
  }

  return (
    <main className="auth-page">
      <div className="auth-container">
        <button className="auth-back auth-text-button" type="button" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />Back to Welcome
        </button>
        <div className="auth-brand">
          <img src={spendSenseLogoIcon} alt="" width={36} height={36} />
          <span>Spend<span>Sense</span></span>
        </div>
        <section className="auth-card" aria-labelledby="auth-heading">
          <div className="auth-tabs" aria-label="Account access">
            <button type="button" aria-pressed={isRegister} onClick={() => switchMode('register')}>Create account</button>
            <button type="button" aria-pressed={!isRegister} onClick={() => switchMode('login')}>Log in</button>
          </div>
          <div className="auth-heading">
            <h1 id="auth-heading">{isRegister ? 'Create your account' : 'Welcome back'}</h1>
            <p>{isRegister ? 'Start making more thoughtful purchase decisions.' : 'Log in to continue to SpendSense.'}</p>
          </div>
          <form className="auth-form" noValidate onSubmit={submit}>
            <div className="auth-fields">
              <div className="auth-field">
                <label htmlFor="auth-email">Email</label>
                <input id="auth-email" type="email" autoComplete="email" placeholder="you@example.com"
                  value={values.email} onChange={event => update('email', event.target.value)}
                  aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'auth-email-error' : undefined} />
                {errors.email && <p className="auth-error" id="auth-email-error" role="alert">{errors.email}</p>}
              </div>
              {passwordField('password', 'Password')}
              {isRegister ? passwordField('confirmPassword', 'Confirm password') : (
                <button className="auth-forgot auth-text-button" type="button"
                  onClick={() => setNotice('Password reset is not available yet.')}>
                  Forgot password?
                </button>
              )}
            </div>
            <div className="auth-privacy">
              <Shield size={16} aria-hidden="true" />
              <p>{isRegister ? 'Your financial details are not requested during account creation.' : 'Your financial details are not requested when logging in.'}</p>
            </div>
            <Button type="submit" className="auth-submit">{isRegister ? 'Create account' : 'Log in'}</Button>
            <p className="auth-switch">
              {isRegister ? 'Already have an account?' : 'New to SpendSense?'}{' '}
              <button className="auth-text-button" type="button" onClick={() => switchMode(isRegister ? 'login' : 'register')}>
                {isRegister ? 'Log in' : 'Create an account'}
              </button>
            </p>
            {notice && <p className="auth-help" role="status">{notice}</p>}
          </form>
        </section>
      </div>
    </main>
  )
}
