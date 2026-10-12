import { Circle, CircleMinus, Layers } from 'lucide-react'

const indicators = [
  {
    title: 'Budget fit — Medium',
    description: 'Uses part of the flexible amount you set.',
    Icon: CircleMinus,
    tone: 'budget',
  },
  {
    title: 'Goal impact — High',
    description: 'Could change the timing of your stated goal.',
    Icon: Layers,
    tone: 'goal',
  },
  {
    title: 'Impulse risk — Low',
    description: 'You have considered this purchase over time.',
    Icon: Circle,
    tone: 'impulse',
  },
]

export default function PurchasePreview() {
  return (
    <section className="purchase-preview" aria-labelledby="preview-title">
      <div className="preview-heading">
        <h2 id="preview-title">A purchase preview</h2>
        <p>This is what a reflection looks like before you make a purchase.</p>
      </div>
      <div className="preview-summary">
        <div className="preview-title-row">
          <h3>Wireless headphones</h3>
          <p>2,500 TL</p>
        </div>
        <p>A purchase you are thinking about right now.</p>
      </div>
      <div className="preview-context">
        <Layers size={20} strokeWidth={1.8} aria-hidden="true" />
        <p>This purchase could affect the timing of one of your goals.</p>
      </div>
      <div className="preview-indicators">
        {indicators.map(({ title, description, Icon, tone }) => (
          <div className={`preview-indicator preview-indicator-${tone}`} key={title}>
            <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
            <div className="preview-indicator-copy">
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
