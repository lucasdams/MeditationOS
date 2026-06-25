import { Link } from 'react-router-dom'

// The Practices hub — one browsable "activities" screen listing every practice technique
// grouped by category. Each card deep-links into its practice with the variant pre-selected
// (Breathe reads `?pattern=`, Meditate reads `?guided=`; the reflection pages have their own
// routes). Pure presentational data — no state, no fetching.

interface PracticeCard {
  to: string
  emoji: string
  name: string
  desc: string
  // Per-card accent (light + dark shades, mirroring the home tiles / nav pills) so each
  // card reads as a soft colour-tinted tile rather than plain text. CSS resolves per theme.
  light: string
  dark: string
}

interface PracticeGroup {
  title: string
  cards: PracticeCard[]
}

const GROUPS: PracticeGroup[] = [
  {
    title: 'Breathing',
    cards: [
      {
        to: '/breathe?pattern=resonance',
        emoji: '🌊',
        name: 'Resonance',
        desc: 'Slow, longer-exhale breathing',
        light: '#0369a1',
        dark: '#0ea5e9',
      },
      {
        to: '/breathe?pattern=box',
        emoji: '🟦',
        name: 'Box',
        desc: 'Equal in·hold·out·hold',
        light: '#4338ca',
        dark: '#818cf8',
      },
      {
        to: '/breathe?pattern=energizing',
        emoji: '☀️',
        name: 'Energizing',
        desc: 'Brisk, active inhale',
        light: '#b45309',
        dark: '#fbbf24',
      },
      {
        to: '/breathe?pattern=alternate',
        emoji: '🌬️',
        name: 'Alternate nostril',
        desc: 'Nadi Shodhana — balance left & right',
        light: '#6d28d9',
        dark: '#a78bfa',
      },
    ],
  },
  {
    title: 'Meditation',
    cards: [
      {
        to: '/meditate',
        emoji: '🧘',
        name: 'Mindfulness',
        desc: 'Open, unguided sitting',
        light: '#0f766e',
        dark: '#14b8a6',
      },
      {
        to: '/meditate?guided=body-scan',
        emoji: '🌙',
        name: 'Body scan',
        desc: 'Guided head-to-toe relaxation',
        light: '#0369a1',
        dark: '#60a5fa',
      },
      {
        to: '/meditate?guided=loving-kindness',
        emoji: '💗',
        name: 'Loving-kindness',
        desc: 'Guided metta — warmth & goodwill',
        light: '#be185d',
        dark: '#f472b6',
      },
    ],
  },
  {
    title: 'Reflection',
    cards: [
      {
        to: '/gratitude',
        emoji: '🙏',
        name: 'Gratitude',
        desc: "Note what you're grateful for",
        light: '#b45309',
        dark: '#fbbf24',
      },
      {
        to: '/journal',
        emoji: '📓',
        name: 'Journal',
        desc: 'Reflect in writing',
        light: '#6d28d9',
        dark: '#a78bfa',
      },
      {
        to: '/trataka',
        emoji: '🕯️',
        name: 'Candle gazing',
        desc: 'Trataka — steady focus on a flame',
        light: '#c2410c',
        dark: '#fb923c',
      },
    ],
  },
]

export default function PracticesPage() {
  return (
    <main id="main-content" className="dashboard practices-page">
      <Link to="/" className="back-link">
        ← Home
      </Link>
      <header className="page-head">
        <h1>Practices</h1>
        <p className="page-subtitle">Every way to practice — pick one.</p>
      </header>

      {GROUPS.map((group) => (
        <section key={group.title} className="practices-group">
          <h2 className="practices-group-title">{group.title}</h2>
          <div className="practices-grid">
            {group.cards.map((card) => (
              <Link
                key={card.to}
                to={card.to}
                className="practice-card"
                style={{
                  ['--card-fill' as string]: card.light,
                  ['--card-fill-dark' as string]: card.dark,
                }}
              >
                <span className="practice-card-emoji" aria-hidden="true">
                  {card.emoji}
                </span>
                <span className="practice-card-body">
                  <span className="practice-card-name">{card.name}</span>
                  <span className="practice-card-desc">{card.desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}
