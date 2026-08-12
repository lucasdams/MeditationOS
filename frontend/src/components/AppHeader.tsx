import { useEffect, useRef, useState, type ComponentType } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Compass,
  Wind,
  Brain,
  HandHeart,
  NotebookPen,
  Feather,
  MessagesSquare,
  LayoutGrid,
  Plus,
  ChartLine,
  History,
  Settings,
  Flame,
  Target,
  CalendarDays,
  Wrench,
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
import { t, useT } from '../i18n'

// A menu destination. Each carries a per-destination accent (light + dark shades) so the menu
// items read as the app's soft colour-tinted pills, not plain text. icon + label are separate
// so the icon can sit in a fixed-width gutter (labels line up cleanly). `icon` is a lucide
// line-icon component (no system emoji). `labelKey` is an i18n catalog key — resolved with t()
// at render time so the menus re-label live on a locale switch.
type MenuLink = { to: string; icon: ComponentType<LucideProps>; labelKey: string; light: string; dark: string }

// Practice — everything you DO in a session. The direct activities lead (breathe / meditate /
// candle gazing / gratitude / journal), then Paths (guided programs), then the hub ("All
// practices") + "Log a session" for the full library or recording an offline sit. Candle gazing
// (Trataka) lives HERE — it's a focal meditation, not a "more" extra.
// Per-destination accents are drawn from the Cool Electric family (indigo / cyan / blue / violet /
// amber-pop / pink): a deep light-mode shade + a lifted dark-mode shade, legible in both themes.
const PRACTICE_LINKS: MenuLink[] = [
  { to: '/breathe', icon: Wind, labelKey: 'nav.breathe', light: '#0e8aa6', dark: '#5fd2e8' },
  { to: '/meditate', icon: Brain, labelKey: 'nav.meditate', light: '#5847f0', dark: '#a8a2ff' },
  { to: '/trataka', icon: Flame, labelKey: 'nav.trataka', light: '#d97706', dark: '#f5a742' },
  { to: '/gratitude', icon: HandHeart, labelKey: 'nav.gratitude', light: '#b9760a', dark: '#f5c151' },
  { to: '/journal', icon: NotebookPen, labelKey: 'nav.journal', light: '#2f6fe0', dark: '#82b4ff' },
  { to: '/prayer', icon: Feather, labelKey: 'nav.prayer', light: '#0e8aa6', dark: '#5fd2e8' },
  { to: '/philosophers', icon: MessagesSquare, labelKey: 'nav.philosophers', light: '#7c3aed', dark: '#c4b5fd' },
  { to: '/paths', icon: Compass, labelKey: 'nav.paths', light: '#0e8aa6', dark: '#5fd2e8' },
  { to: '/practices', icon: LayoutGrid, labelKey: 'nav.allPractices', light: '#7c3aed', dark: '#c4b5fd' },
  { to: '/sessions/new', icon: Plus, labelKey: 'nav.logSession', light: '#5847f0', dark: '#a8a2ff' },
]

// Progress — everything you REVIEW or PLAN around your practice, plus account. Merges the old
// "Progress" + "More" menus into one (candle gazing moved to Practice): stats (Analytics,
// Timeline), planning (Goals, Schedule), then account (Settings, + Admin for admins below).
const PROGRESS_LINKS: MenuLink[] = [
  { to: '/analytics', icon: ChartLine, labelKey: 'nav.analytics', light: '#d6396f', dark: '#f06a98' },
  { to: '/timeline', icon: History, labelKey: 'nav.timeline', light: '#0e8aa6', dark: '#5fd2e8' },
  { to: '/goals', icon: Target, labelKey: 'nav.goals', light: '#6a5cff', dark: '#a8a2ff' },
  { to: '/schedule', icon: CalendarDays, labelKey: 'nav.schedule', light: '#2f6fe0', dark: '#82b4ff' },
  { to: '/settings', icon: Settings, labelKey: 'nav.settings', light: '#545a73', dark: '#a6acc4' },
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
      <span className="nav-menu-label">{t(l.labelKey)}</span>
    </NavLink>
  )
}

export default function AppHeader() {
  const { user, logout } = useAuth()
  // Subscribe to the locale so the whole header (incl. the module-level renderMenuLink t()
  // calls made during this render) re-labels live when the language changes in Settings.
  useT()
  const navigate = useNavigate()
  const location = useLocation()
  const [level, setLevel] = useState<number | null>(null)
  // A single source of truth for which dropdown is open: a menu id or null. Opening one
  // menu closes the other; outside-click / Escape close whichever is open.
  const [openMenu, setOpenMenu] = useState<'progress' | null>(null)
  const [navOpen, setNavOpen] = useState(false) // mobile hamburger menu
  // Which mobile nav group (Practice / Progress) is expanded inside the hamburger sheet.
  // Collapsed by default so the opened menu reads as a few buttons, not one long list.
  const [mobileSection, setMobileSection] = useState<'practice' | 'progress' | null>(null)
  const navRef = useRef<HTMLElement>(null)
  // The account dropdown (Settings + Log out) that opens from the name chip.
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userRef = useRef<HTMLDivElement>(null)

  // Publish the header's live height as --app-header-h on <html>, so sticky page elements (e.g.
  // the Spirit Customize viewer) can pin just below the fixed header. The header wraps to two rows
  // on narrow widths, so its height is content- and viewport-dependent — measure it rather than
  // hard-code. A ResizeObserver keeps the var correct across wraps, locale switches, and resizes.
  const headerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const publish = () =>
      document.documentElement.style.setProperty('--app-header-h', `${el.offsetHeight}px`)
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The admin entry renders only for admins (is_admin from /auth/me). Non-admins never
  // see it; the backend also 403s every /admin/* call regardless of the UI. It joins the
  // Progress menu (stats + account).
  const progressLinks = user?.is_admin
    ? [...PROGRESS_LINKS, { to: '/admin', icon: Wrench, labelKey: 'nav.admin', light: '#545a73', dark: '#a6acc4' }]
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

  // Close any open menu, the mobile nav, and the account dropdown on navigation.
  useEffect(() => {
    setOpenMenu(null)
    setNavOpen(false)
    setMobileSection(null)
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
    <header className="app-header" ref={headerRef}>
      <Link to="/" className="app-brand">
        MeditationOS
      </Link>
      <button
        type="button"
        className="nav-toggle"
        aria-label={t('nav.menu')}
        aria-expanded={navOpen}
        onClick={() => {
          // Always (re)open the sheet with its groups collapsed, so it starts compact.
          setMobileSection(null)
          setNavOpen((o) => !o)
        }}
      >
        {navOpen ? (
          <X size={20} strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
        )}
      </button>
      <nav className={`app-nav${navOpen ? ' open' : ''}`} ref={navRef}>
        <Link to="/" className="nav-home">
          {t('nav.home')}
        </Link>

        {/* Practice links straight to the all-practices hub (it lists every practice as cards) —
            clicking it navigates rather than opening a menu. Wrapped in .nav-menu so it hides on
            mobile like the dropdowns (mobile shows the inline sublinks below). Progress stays a
            dropdown of stats/planning destinations (it has no single overview page). */}
        <div className="nav-menu">
          <NavLink to="/practices" className="nav-menu-btn nav-menu-btn--practice">
            <Sparkles size={17} strokeWidth={1.75} aria-hidden="true" />
            <span className="nav-menu-btn-label">{t('nav.practice')}</span>
          </NavLink>
        </div>
        {renderMenu('progress', t('nav.progress'), TrendingUp, progressLinks)}

        {/* On mobile the desktop dropdowns are hidden; Practice / Progress become collapsible
            group buttons so the opened sheet stays compact (a few buttons, not one long list).
            Tapping a group expands its links; only one group opens at a time. */}
        <div className="nav-mobile-extra">
          <button
            type="button"
            className="nav-mobile-group"
            aria-expanded={mobileSection === 'practice'}
            onClick={() => setMobileSection((s) => (s === 'practice' ? null : 'practice'))}
          >
            <Sparkles size={17} strokeWidth={1.75} aria-hidden="true" />
            <span className="nav-mobile-group-label">{t('nav.practice')}</span>
            <ChevronDown size={16} strokeWidth={2} className="nav-mobile-group-caret" aria-hidden="true" />
          </button>
          {mobileSection === 'practice' && (
            <div className="nav-mobile-group-links">{PRACTICE_LINKS.map(renderMenuLink)}</div>
          )}
          <button
            type="button"
            className="nav-mobile-group"
            aria-expanded={mobileSection === 'progress'}
            onClick={() => setMobileSection((s) => (s === 'progress' ? null : 'progress'))}
          >
            <TrendingUp size={17} strokeWidth={1.75} aria-hidden="true" />
            <span className="nav-mobile-group-label">{t('nav.progress')}</span>
            <ChevronDown size={16} strokeWidth={2} className="nav-mobile-group-caret" aria-hidden="true" />
          </button>
          {mobileSection === 'progress' && (
            <div className="nav-mobile-group-links">{progressLinks.map(renderMenuLink)}</div>
          )}
        </div>
      </nav>
      <div className="app-user" ref={userRef}>
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
              {/* Guests get an auto username like guest_3f9a… — show a friendly label instead. */}
              {user?.is_guest ? t('user.guest') : user?.username}
              {level !== null && ` · ${t('user.level', { level })}`}
            </span>
            <ChevronDown size={14} strokeWidth={2} className="app-user-caret" aria-hidden="true" />
          </button>
          {userMenuOpen && (
            <div id="app-user-menu" className="app-user-menu">
              <Link to="/settings" className="app-user-menu-item">
                <Settings size={16} strokeWidth={1.75} aria-hidden="true" /> {t('nav.settings')}
              </Link>
              <button
                type="button"
                className="app-user-menu-item app-user-menu-item--danger"
                onClick={handleLogout}
              >
                <LogOut size={16} strokeWidth={1.75} aria-hidden="true" /> {t('user.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
