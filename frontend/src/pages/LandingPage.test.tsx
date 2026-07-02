/**
 * LandingPage — the logged-out marketing homepage. Verifies the professional-product
 * structure (hero value prop, CTAs, how-it-works, feature grid, privacy/trust, honest
 * story + value stack) renders with the right landmarks and links, and that the copy
 * stays honest: no fabricated testimonials/ratings/user-counts and no medical claims.
 *
 * GuestButton is mocked to a plain button so this test stays focused on the marketing
 * structure and doesn't need the auth context / router-navigate wiring it depends on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../components/GuestButton', () => ({
  default: () => <button type="button">Continue as a guest</button>,
}))

import LandingPage from './LandingPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  )
}

describe('LandingPage', () => {
  afterEach(cleanup)

  it('renders a single main landmark with the hero value prop as the h1', () => {
    renderPage()
    const main = screen.getByRole('main')
    expect(main).toBeInTheDocument()
    const h1 = screen.getByRole('heading', { level: 1 })
    // The differentiator, not just the brand name.
    expect(h1).toHaveTextContent(/tracks itself/i)
    // The hero states the data-first positioning (the phrase also recurs later on the page).
    expect(screen.getAllByText(/your practice data/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/not\s+another\s+audio\s+library/i)).toBeInTheDocument()
  })

  it('shows a primary "get started" CTA to register and a secondary "log in" link', () => {
    renderPage()
    const register = screen.getAllByRole('link', { name: /get started/i })
    expect(register.length).toBeGreaterThan(0)
    register.forEach((l) => expect(l).toHaveAttribute('href', '/register'))
    const login = screen.getAllByRole('link', { name: /log in/i })
    expect(login.length).toBeGreaterThan(0)
    login.forEach((l) => expect(l).toHaveAttribute('href', '/login'))
  })

  it('offers a guest entry point ("no sign-up needed")', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /continue as a guest/i })).toBeInTheDocument()
    expect(screen.getByText(/no sign-up needed/i)).toBeInTheDocument()
  })

  it('renders the how-it-works steps', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /how it works/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /sit for a few minutes/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /log it/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /watch the pattern emerge/i })).toBeInTheDocument()
  })

  it('renders the real feature highlights as a scannable set of headings', () => {
    renderPage()
    for (const name of [
      /meditation timer/i,
      /resonance breathing/i,
      /gratitude/i,
      /journal/i,
      /candle gazing/i,
      /goals/i,
      /spirit/i,
      /dashboard & analytics/i,
      /streaks, xp & missions/i,
    ]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
  })

  it('has a privacy-first trust section that links to the Privacy policy', () => {
    renderPage()
    const trust = screen
      .getByRole('heading', { name: /your practice data stays yours/i })
      .closest('section') as HTMLElement
    expect(trust).toBeInTheDocument()
    // Export + delete are real capabilities the app ships.
    expect(within(trust).getByRole('heading', { name: /export anytime/i })).toBeInTheDocument()
    expect(within(trust).getByRole('heading', { name: /delete anytime/i })).toBeInTheDocument()
    expect(within(trust).getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/privacy',
    )
  })

  it('makes NO medical claims (honest, non-clinical copy)', () => {
    renderPage()
    const text = screen.getByRole('main').textContent ?? ''
    // Explicit non-medical disclaimer present.
    expect(text).toMatch(/makes no medical claims/i)
    // No clinical/medical claim language.
    expect(text).not.toMatch(/\b(cure|treat|treats|diagnos|clinically proven|rewires your brain|reduces anxiety|lowers your blood pressure)\b/i)
  })

  it('does NOT fabricate testimonials, ratings, or user counts', () => {
    renderPage()
    const text = screen.getByRole('main').textContent ?? ''
    // No star ratings / "X stars".
    expect(text).not.toMatch(/\b\d(\.\d)?\s*(stars?|\/\s*5)\b/i)
    // No invented user/download counts like "10,000 users" or "1M+ meditators".
    expect(text).not.toMatch(/\b[\d,]+\s*(\+)?\s*(users|members|meditators|downloads|people)\b/i)
    // No "rated #1 / loved by thousands" puffery.
    expect(text).not.toMatch(/loved by (thousands|millions)|rated #?1|join thousands/i)
    // The testimonial slot ships as an honest invitation, not a fake quote.
    expect(screen.getByText(/we’d love to feature your story/i)).toBeInTheDocument()
  })

  it('renders the public footer with Privacy and Terms links', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /^privacy$/i })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: /^terms$/i })).toHaveAttribute('href', '/terms')
  })
})
