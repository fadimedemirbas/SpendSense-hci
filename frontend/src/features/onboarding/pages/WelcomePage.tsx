import { History, Info, User } from 'lucide-react'
import spendSenseLogoIcon from '@/assets/spendsense-logo-icon.svg'
import { Button } from '@/components/ui/button'
import PurchasePreview from '../components/PurchasePreview'
import './welcome.css'

const benefits = [
  {
    title: 'See the impact',
    description: 'Understand how a purchase may affect your budget and goals.',
    Icon: Info,
  },
  {
    title: 'Understand your habits',
    description: 'Notice patterns in how and why you spend.',
    Icon: History,
  },
  {
    title: 'You stay in control',
    description: 'SpendSense provides context. The final decision is always yours.',
    Icon: User,
  },
]

type WelcomePageProps = {
  onCreateAccount?: () => void
  onLogin?: () => void
}

export default function WelcomePage({ onCreateAccount, onLogin }: WelcomePageProps) {
  return (
    <div className="welcome-page">
      <header className="welcome-header">
        <div className="welcome-brand">
          <span className="welcome-logo-icon" aria-hidden="true">
            <img src={spendSenseLogoIcon} alt="" width={36} height={36} />
          </span>
          <span>
            Spend<span>Sense</span>
          </span>
        </div>
        <nav className="welcome-actions" aria-label="Account">
          <Button className="welcome-button welcome-button-ghost" variant="ghost" onClick={onLogin}>
            Log in
          </Button>
          <Button className="welcome-button" onClick={onCreateAccount}>Create account</Button>
        </nav>
      </header>
      <main className="welcome-main">
        <section className="welcome-hero" aria-labelledby="welcome-title">
          <div className="welcome-intro">
            <div className="welcome-copy">
              <h1 id="welcome-title">Think before you spend.</h1>
              <p>
                SpendSense helps you understand how a purchase may affect your
                budget, goals, and spending habits before you decide.
              </p>
            </div>
            <div className="welcome-hero-actions">
              <Button className="welcome-button" onClick={onCreateAccount}>Get started</Button>
              <button className="welcome-login-link" type="button" onClick={onLogin}>
                I already have an account
              </button>
            </div>
            <div className="welcome-benefits" aria-label="SpendSense benefits">
              {benefits.map(({ title, description, Icon }) => (
                <div className="welcome-benefit" key={title}>
                  <span className="welcome-benefit-icon">
                    <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <div className="welcome-benefit-copy">
                    <h2>{title}</h2>
                    <p>{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <PurchasePreview />
        </section>
      </main>
    </div>
  )
}
