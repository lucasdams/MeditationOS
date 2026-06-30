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
  Menu,
  X,
  type LucideProps,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { dashboardService } from '../services/dashboard'

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
  const [openMenu, setOpenMenu] = useState<'practice' | 'progress' | null>(null)
  const [navOpen, setNavOpen] = useState(false) // mobile hamburger menu
  const navRef = useRef<HTMLElement>(null)

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

  // Close any open menu and the mobile nav on navigation.
  useEffect(() => {
    setOpenMenu(null)
    setNavOpen(false)
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

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  // A grouped dropdown menu (Practice / Progress). The button toggles its own open state;
  // opening it closes the other (single openMenu source of truth). aria-controls ties the
  // button to the dropdown region it expands.
  function renderMenu(id: 'practice' | 'progress', label: string, links: MenuLink[]) {
    const open = openMenu === id
    const dropdownId = `nav-${id}-dropdown`
    return (
      <div className="nav-menu">
        <button
          type="button"
          className="nav-menu-btn"
          aria-haspopup="true"
          aria-expanded={open}
          aria-controls={dropdownId}
          onClick={() => setOpenMenu((cur) => (cur === id ? null : id))}
        >
          {label} ▾
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

        {/* Desktop: grouped dropdown menus. Drop role="menu"/role="menuitem" — these links
            aren't a widget menu and arrow-key navigation isn't implemented. */}
        {renderMenu('practice', 'Practice', PRACTICE_LINKS)}
        {renderMenu('progress', 'Progress', progressLinks)}

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
      <div className="app-user">
        <Link to="/settings" className="nav-settings" title="Account settings">
          <span>
            {user?.username}
            {level !== null && ` · Lv ${level}`}
          </span>
        </Link>
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </header>
  )
}
