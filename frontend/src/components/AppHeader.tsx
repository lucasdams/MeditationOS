import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { dashboardService } from '../services/dashboard'

// A menu destination. Each carries a per-destination accent (light + dark shades, mirroring
// the home tiles' TILE_COLORS pairs) so the menu items read as the app's soft colour-tinted
// pills, not plain text. icon + label are separate so the emoji can sit in a fixed-width
// gutter (labels line up cleanly).
type MenuLink = { to: string; icon: string; label: string; light: string; dark: string }

// Practice — the activities: things you *do* in a session. The hub ("All practices") sits at
// the top — a browsable library of every technique — with the direct links below it.
const PRACTICE_LINKS: MenuLink[] = [
  { to: '/practices', icon: '✨', label: 'All practices', light: '#7c3aed', dark: '#c4b5fd' },
  { to: '/paths', icon: '🧭', label: 'Paths', light: '#0d9488', dark: '#2dd4bf' },
  { to: '/meditate', icon: '🧘', label: 'Meditate', light: '#0f766e', dark: '#14b8a6' },
  { to: '/breathe', icon: '🫁', label: 'Breathe', light: '#0369a1', dark: '#0ea5e9' },
  { to: '/trataka', icon: '🕯️', label: 'Candle gazing', light: '#c2410c', dark: '#fb923c' },
  { to: '/gratitude', icon: '🙏', label: 'Gratitude', light: '#b45309', dark: '#fbbf24' },
  { to: '/journal', icon: '📓', label: 'Journal', light: '#6d28d9', dark: '#a78bfa' },
  { to: '/sessions/new', icon: '➕', label: 'Log a session', light: '#0f766e', dark: '#14b8a6' },
]

// Progress — stats + account: things you *review* or configure.
const PROGRESS_LINKS: MenuLink[] = [
  { to: '/analytics', icon: '📈', label: 'Analytics', light: '#be185d', dark: '#f472b6' },
  { to: '/timeline', icon: '🕒', label: 'Timeline', light: '#0369a1', dark: '#0ea5e9' },
  { to: '/goals', icon: '🎯', label: 'Goals', light: '#6d28d9', dark: '#a78bfa' },
  { to: '/schedule', icon: '🗓️', label: 'Schedule', light: '#1d4ed8', dark: '#60a5fa' },
  { to: '/settings', icon: '⚙️', label: 'Settings', light: '#475569', dark: '#94a3b8' },
]

// Each menu's links render in two sibling containers (desktop dropdown + mobile inline list),
// shown/hidden per breakpoint via CSS. Shared so the markup can't drift. NavLink adds an
// `active` class on the current route so the user can see where they are. The per-destination
// accent is passed as CSS vars; the CSS resolves light/dark per theme.
function renderMenuLink(l: MenuLink) {
  return (
    <NavLink
      key={l.to}
      to={l.to}
      className="nav-menu-link"
      style={{ ['--menu-fill' as string]: l.light, ['--menu-fill-dark' as string]: l.dark }}
    >
      <span className="nav-menu-icon" aria-hidden="true">{l.icon}</span>
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
    ? [...PROGRESS_LINKS, { to: '/admin', icon: '🛠️', label: 'Admin', light: '#475569', dark: '#94a3b8' }]
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
        {navOpen ? '✕' : '☰'}
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
          🪷 Spirit
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
