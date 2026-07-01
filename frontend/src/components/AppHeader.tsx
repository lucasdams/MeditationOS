import { useEffect, useRef, useState, type ComponentType } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Compass,
  Wind,
  Brain,
  HandHeart,
  NotebookPen,
  LayoutGrid,
  Plus,
  ChartLine,
  History,
  Settings,
  Flame,
  Target,
  CalendarDays,
  Wrench,
  Flower2,
  Sparkles,
  TrendingUp,
  ChevronDown,
  LogOut,
  Menu,
  X,
  type LucideProps,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { dashboardService } from '../services/dashboard'
import { spiritService } from '../services/spirit'
import { weakestNeed } from '../lib/spiritNeeds'
import { NEED_COPY } from './Spirit'
import type { SpiritNeedKey, SpiritState } from '../types'

// A menu destination. Each carries a per-destination accent (light + dark shades) so the menu
// items read as the app's soft colour-tinted pills, not plain text. icon + label are separate
// so the icon can sit in a fixed-width gutter (labels line up cleanly). `icon` is a lucide
// line-icon component (no system emoji).
type MenuLink = { to: string; icon: ComponentType<LucideProps>; label: string; light: string; dark: string }

// Practice — everything you DO in a session. The direct activities lead (breathe / meditate /
// candle gazing / gratitude / journal), then Paths (guided programs), then the hub ("All
// practices") + "Log a session" for the full library or recording an offline sit. Candle gazing
// (Trataka) lives HERE — it's a focal meditation, not a "more" extra.
// Per-destination accents are drawn from the Cool Electric family (indigo / cyan / blue / violet /
// amber-pop / pink): a deep light-mode shade + a lifted dark-mode shade, legible in both themes.
const PRACTICE_LINKS: MenuLink[] = [
  { to: '/breathe', icon: Wind, label: 'Breathe', light: '#0e8aa6', dark: '#5fd2e8' },
  { to: '/meditate', icon: Brain, label: 'Meditate', light: '#5847f0', dark: '#a8a2ff' },
  { to: '/trataka', icon: Flame, label: 'Candle gazing', light: '#d97706', dark: '#f5a742' },
  { to: '/gratitude', icon: HandHeart, label: 'Gratitude', light: '#b9760a', dark: '#f5c151' },
  { to: '/journal', icon: NotebookPen, label: 'Journal', light: '#2f6fe0', dark: '#82b4ff' },
  { to: '/paths', icon: Compass, label: 'Paths', light: '#0e8aa6', dark: '#5fd2e8' },
  { to: '/practices', icon: LayoutGrid, label: 'All practices', light: '#7c3aed', dark: '#c4b5fd' },
  { to: '/sessions/new', icon: Plus, label: 'Log a session', light: '#5847f0', dark: '#a8a2ff' },
]

// Progress — everything you REVIEW or PLAN around your practice, plus account. Merges the old
// "Progress" + "More" menus into one (candle gazing moved to Practice): stats (Analytics,
// Timeline), planning (Goals, Schedule), then account (Settings, + Admin for admins below).
const PROGRESS_LINKS: MenuLink[] = [
  { to: '/analytics', icon: ChartLine, label: 'Analytics', light: '#d6396f', dark: '#f06a98' },
  { to: '/timeline', icon: History, label: 'Timeline', light: '#0e8aa6', dark: '#5fd2e8' },
  { to: '/goals', icon: Target, label: 'Goals', light: '#6a5cff', dark: '#a8a2ff' },
  { to: '/schedule', icon: CalendarDays, label: 'Schedule', light: '#2f6fe0', dark: '#82b4ff' },
  { to: '/settings', icon: Settings, label: 'Settings', light: '#545a73', dark: '#a6acc4' },
]

// Each menu's links render in two sibling containers (desktop dropdown + mobile inline list),
// shown/hidden per breakpoint via CSS. Shared so the markup can't drift. NavLink adds an
// `active` class on the current route so the user can see where they are. The per-destination
// accent is passed as CSS vars; the CSS resolves light/dark per theme.
function renderMenuLink(l: MenuLink) {
  const Icon = l.icon
  return (
    <NavLink
      key={l.to}
      to={l.to}
      className="nav-menu-link"
      style={{ ['--menu-fill' as string]: l.light, ['--menu-fill-dark' as string]: l.dark }}
    >
      <span className="nav-menu-icon" aria-hidden="true">
        <Icon size={17} strokeWidth={1.75} />
      </span>
      <span className="nav-menu-label">{l.label}</span>
    </NavLink>
  )
}

export default function AppHeader() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [level, setLevel] = useState<number | null>(null)
  // A single source of truth for which dropdown is open: a menu id or null. Opening one
  // menu closes the other; outside-click / Escape close whichever is open.
  const [openMenu, setOpenMenu] = useState<'progress' | null>(null)
  const [navOpen, setNavOpen] = useState(false) // mobile hamburger menu
  const navRef = useRef<HTMLElement>(null)
  // The companion's needs — drives the small header reminder chip ("what it prefers right now").
  // Non-blocking + absent for a pathless spark / on failure.
  const [spirit, setSpirit] = useState<SpiritState | null>(null)
  // The account dropdown (Settings + Log out) that opens from the name chip.
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userRef = useRef<HTMLDivElement>(null)

  // The admin entry renders only for admins (is_admin from /auth/me). Non-admins never
  // see it; the backend also 403s every /admin/* call regardless of the UI. It joins the
  // Progress menu (stats + account).
  const progressLinks = user?.is_admin
    ? [...PROGRESS_LINKS, { to: '/admin', icon: Wrench, label: 'Admin', light: '#545a73', dark: '#a6acc4' }]
    : PROGRESS_LINKS

  // Refetch on every navigation so the level stays live after earning XP.
  useEffect(() => {
    let ignore = false
    dashboardService
      .getStats()
      .then((s) => { if (!ignore) setLevel(s.level) })
      .catch(() => {})
    return () => { ignore = true }
  }, [location.pathname])

  // The spirit's needs for the header reminder chip — refetched on navigation so it stays current
  // after tending / practicing. Non-blocking: a failure (or a pathless spark) just hides the chip.
  useEffect(() => {
    let ignore = false
    spiritService
      .get()
      .then((s) => { if (!ignore) setSpirit(s) })
      .catch(() => {})
    return () => { ignore = true }
  }, [location.pathname])

  // Close any open menu, the mobile nav, and the account dropdown on navigation.
  useEffect(() => {
    setOpenMenu(null)
    setNavOpen(false)
    setUserMenuOpen(false)
  }, [location.pathname])

  // Close the open menu on an outside click or Escape. One handler covers both dropdowns
  // since they live inside the shared nav element.
  useEffect(() => {
    if (!openMenu) return
    function onDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenu])

  // The account dropdown lives outside the nav element, so it gets its own outside-click / Escape
  // close handler keyed off the user wrapper.
  useEffect(() => {
    if (!userMenuOpen) return
    function onDown(e: MouseEvent) {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [userMenuOpen])

  // The companion's most-depleted need = what it prefers right now (lowest factor). Only when it has
  // a chosen path — a pathless spark has no preference yet, so the chip stays hidden. Shared with the
  // Practices hub via weakestNeed() so both agree (and match the backend's condition = weakest need).
  const need: SpiritNeedKey | null =
    spirit && spirit.path != null ? weakestNeed(spirit.needs) : null
  const NeedIcon = need ? NEED_COPY[need].icon : null
  const spiritName = spirit?.name ?? 'Your spirit'

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  // A grouped dropdown menu (Practice / Progress). The button toggles its own open state;
  // opening it closes the other (single openMenu source of truth). aria-controls ties the
  // button to the dropdown region it expands.
  function renderMenu(
    id: 'progress',
    label: string,
    Icon: ComponentType<LucideProps>,
    links: MenuLink[],
  ) {
    const open = openMenu === id
    const dropdownId = `nav-${id}-dropdown`
    return (
      <div className="nav-menu">
        <button
          type="button"
          className={`nav-menu-btn nav-menu-btn--${id}`}
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={dropdownId}
          onClick={() => setOpenMenu((cur) => (cur === id ? null : id))}
        >
          <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
          <span className="nav-menu-btn-label">{label}</span>
          <ChevronDown size={15} strokeWidth={2} className="nav-menu-caret" aria-hidden="true" />
        </button>
        {open && (
          <div id={dropdownId} className="nav-menu-dropdown">
            {links.map(renderMenuLink)}
          </div>
        )}
      </div>
    )
  }

  return (
    <header className="app-header">
      <Link to="/" className="app-brand">
        MeditationOS
      </Link>
      <button
        type="button"
        className="nav-toggle"
        aria-label="Menu"
        aria-expanded={navOpen}
        onClick={() => setNavOpen((o) => !o)}
      >
        {navOpen ? (
          <X size={20} strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
        )}
      </button>
      <nav className={`app-nav${navOpen ? ' open' : ''}`} ref={navRef}>
        <Link to="/" className="nav-home">
          Home
        </Link>

        {/* Practice links straight to the all-practices hub (it lists every practice as cards) —
            clicking it navigates rather than opening a menu. Wrapped in .nav-menu so it hides on
            mobile like the dropdowns (mobile shows the inline sublinks below). Progress stays a
            dropdown of stats/planning destinations (it has no single overview page). */}
        <div className="nav-menu">
          <NavLink to="/practices" className="nav-menu-btn nav-menu-btn--practice">
            <Sparkles size={17} strokeWidth={1.75} aria-hidden="true" />
            <span className="nav-menu-btn-label">Practice</span>
          </NavLink>
        </div>
        {renderMenu('progress', 'Progress', TrendingUp, progressLinks)}

        {/* Spirit is the centerpiece — its own prominent standalone link, not tucked in a menu. */}
        <Link to="/spirit" className="nav-spirit nav-spirit-feature">
          <Flower2 size={17} strokeWidth={1.75} aria-hidden="true" /> Spirit
        </Link>

        {/* On mobile the dropdowns are hidden; their links show inline as labelled sections. */}
        <div className="nav-mobile-extra">
          <p className="nav-mobile-heading">Practice</p>
          {PRACTICE_LINKS.map(renderMenuLink)}
          <p className="nav-mobile-heading">Progress</p>
          {progressLinks.map(renderMenuLink)}
        </div>
      </nav>
      <div className="app-user" ref={userRef}>
        {/* A persistent reminder of what the companion prefers right now — visible while you browse
            practices. Links to the practices that help fill it. Hidden for a pathless spark. */}
        {need && NeedIcon && (
          <Link
            to="/practices"
            className="spirit-need-chip"
            title={`${spiritName} wants more ${NEED_COPY[need].label.toLowerCase()} right now — these practices help`}
          >
            <NeedIcon size={15} strokeWidth={1.9} aria-hidden="true" />
            <span className="spirit-need-chip-label">Wants {NEED_COPY[need].label}</span>
          </Link>
        )}
        <div className="app-user-menu-wrap">
          <button
            type="button"
            className="app-user-trigger"
            aria-haspopup="true"
            aria-expanded={userMenuOpen}
            aria-controls="app-user-menu"
            onClick={() => setUserMenuOpen((o) => !o)}
          >
            <span>
              {user?.username}
              {level !== null && ` · Lv ${level}`}
            </span>
            <ChevronDown size={14} strokeWidth={2} className="app-user-caret" aria-hidden="true" />
          </button>
          {userMenuOpen && (
            <div id="app-user-menu" className="app-user-menu">
              <Link to="/settings" className="app-user-menu-item">
                <Settings size={16} strokeWidth={1.75} aria-hidden="true" /> Settings
              </Link>
              <button
                type="button"
                className="app-user-menu-item app-user-menu-item--danger"
                onClick={handleLogout}
              >
                <LogOut size={16} strokeWidth={1.75} aria-hidden="true" /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
