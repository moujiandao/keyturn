'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { T } from '@/lib/i18n/strings'
import { routes } from '@/lib/routes'
import { useAppUser, useAppLang } from '@/components/app-store'
import { Icon } from '@/property-management-app'

const supabase = createClient()

const navStyles = {
  rail: {
    position: 'sticky', top: 0, alignSelf: 'start', height: 'var(--ld-rail-height, 100dvh)', zIndex: 100,
    display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--ld-surface)',
    borderRight: 'var(--ld-rail-right, 1px solid var(--ld-border))', borderBottom: 'var(--ld-rail-bottom, 0)',
  },
  brandBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 'var(--ld-brand-padding, 23px 17px 21px)' },
  brand: { display: 'inline-flex', gap: 9, alignItems: 'center', minWidth: 0, fontSize: "1rem", fontWeight: 800, letterSpacing: '-.035em', textDecoration: 'none' },
  mark: { display: 'grid', placeItems: 'center', flex: '0 0 34px', height: 34, borderRadius: 9, color: '#fff', background: 'var(--ld-accent)' },
  body: { flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' },
  nav: { flex: 1, padding: '4px 12px 12px' },
  group: { display: 'grid', gap: 3 },
  secondary: { display: 'grid', gap: 3, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--ld-border)' },
  link: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 'var(--ld-nav-link-height, 39px)', padding: '8px 10px', borderRadius: 8, fontSize: "0.8125rem", lineHeight: 1.25, textDecoration: 'none' },
  button: { alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 10px', border: '1px solid var(--ld-border)', borderRadius: 8, color: 'var(--ld-ink)', cursor: 'pointer', font: 'inherit', fontSize: "0.8125rem", fontWeight: 650, whiteSpace: 'nowrap' },
  account: { padding: 12, borderTop: '1px solid var(--ld-border)' },
  language: { display: 'flex', alignItems: 'center', gap: 3, padding: 4, border: '1px solid var(--ld-border)', borderRadius: 8, background: 'var(--ld-subtle)', fontSize: "0.75rem" },
  languageLabel: { display: 'inline-flex', alignItems: 'center', flex: 1, gap: 4, paddingLeft: 3, color: 'var(--ld-muted)' },
  languageButton: { padding: '5px 7px', border: 0, borderRadius: 5, color: 'var(--ld-muted)', background: 'transparent', font: 'inherit', fontWeight: 700, cursor: 'pointer' },
  details: { display: 'flex', alignItems: 'center', gap: 7, marginTop: 12 },
  avatar: { display: 'grid', placeItems: 'center', flex: '0 0 30px', height: 30, borderRadius: '50%', background: 'var(--ld-accent-tint)', color: 'var(--ld-accent-hover)', fontSize: "0.6875rem", fontWeight: 750 },
  name: { flex: 1, minWidth: 0 },
  singleLine: { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
}

function LandlordSidebar({ user, lang, setLang, t, primary, secondary, activeHref, pathname, logout }) {
  const [open, setOpen] = useState(false)
  const menu = useRef(null)
  const initials = (user.name || user.email || '?').trim().split(/\s+/).slice(0, 2)
    .map(word => word[0]).join('').toUpperCase()

  // Lock background scroll only while the <=900px menu drawer is open, and
  // close the drawer automatically if an iPad rotates from portrait to landscape.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined
    const mql = window.matchMedia('(max-width: 900px)')
    if (!mql.matches) return undefined
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onChange = (event) => {
      if (!event.matches) setOpen(false)
    }
    mql.addEventListener('change', onChange)
    return () => {
      document.body.style.overflow = prevOverflow
      mql.removeEventListener('change', onChange)
    }
  }, [open])

  function renderLink(item) {
    return (
      <Link key={item.href} href={item.href} prefetch={false} className="landlord-nav-link" style={navStyles.link}
        aria-current={activeHref === item.href ? (activeHref === pathname ? 'page' : 'location') : undefined}
        onNavigate={() => setOpen(false)}>
        <Icon name={item.icon} size={17} />
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <>
      {open && (
        <div
          className="landlord-nav-backdrop"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className="landlord-rail" style={navStyles.rail} onKeyDown={event => {
        if (event.key !== 'Escape' || !open) return
        setOpen(false)
        menu.current?.focus()
      }}>
        <div style={navStyles.brandBar}>
          <Link href={routes.dashboard()} style={navStyles.brand} onNavigate={() => setOpen(false)}>
            <span style={navStyles.mark}><Icon name="building" size={19} /></span>
            <span>{t.appName}</span>
          </Link>
          <button type="button" className="landlord-menu-button" style={navStyles.button} ref={menu}
            aria-expanded={open} aria-controls="landlord-navigation" onClick={() => setOpen(value => !value)}>
            <Icon name={open ? 'x' : 'menu'} size={19} />
            {open ? t.navCloseMenu : t.navOpenMenu}
          </button>
        </div>
        <div id="landlord-navigation" className="landlord-navigation" style={navStyles.body} data-open={open}>
          <nav aria-label={t.navOpenMenu} style={navStyles.nav}>
            <div style={navStyles.group}>{primary.map(renderLink)}</div>
            <div style={navStyles.secondary}>{secondary.map(renderLink)}</div>
          </nav>
          <div style={navStyles.account}>
            <div className="landlord-language" style={navStyles.language} role="group" aria-label={t.langLabel}>
              <span style={navStyles.languageLabel}><Icon name="globe" size={15} />{t.langLabel}</span>
              {[['en', 'EN'], ['zh', '中文']].map(([value, label]) => (
                <button type="button" key={value} style={navStyles.languageButton} aria-pressed={lang === value} onClick={() => setLang(value)}>{label}</button>
              ))}
            </div>
            <div style={navStyles.details}>
              <span style={navStyles.avatar} aria-hidden="true">{initials}</span>
              <div style={navStyles.name}>
                <strong style={{ ...navStyles.singleLine, fontSize: "0.75rem", fontWeight: 650 }}>{user.name || user.email}</strong>
                <small style={{ ...navStyles.singleLine, fontSize: "0.6875rem", color: "var(--ld-muted)" }}>{user.email}</small>
              </div>
              <button type="button" className="landlord-menu-button landlord-logout" style={{ ...navStyles.button, display: "inline-flex", padding: 7 }}
                aria-label={t.logout} title={t.logout} onClick={logout}>
                <Icon name="logout" size={17} />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

export function Sidebar() {
  const { user } = useAppUser()
  const { lang, setLang } = useAppLang()
  const pathname = usePathname()
  const t = T[lang]

  const landlordNav = [
    { href: routes.dashboard(),   label: t.navDashboard,  icon: "home" },
    { href: routes.properties(),  label: t.navProperties, icon: "building" },
    { href: routes.tenants(),     label: t.navTenants,    icon: "users" },
    { href: routes.payments(),    label: t.navPayments,   icon: "dollar" },
    { href: routes.maintenance(), label: t.navTodo,       icon: "wrench" },
  ]
  const landlordBottomNav = [
    { href: routes.parking(),          label: t.navParking,          icon: "car" },
    { href: routes.leases(),           label: t.navLeases,           icon: "file" },
    { href: routes.renewals(),         label: t.navRenewals,         icon: "file" },
    { href: routes.email(),            label: t.navEmailAutomation,  icon: "mail" },
    { href: routes.reminders(),        label: t.navPaymentReminders, icon: "dollar" },
    { href: routes.documents(),        label: t.navDocuments,        icon: "key" },
    { href: routes.team(),             label: t.navAdminUsers,       icon: "users" },
    { href: routes.learnings(),        label: t.navLearnings,        icon: "book" },
  ]
  const tenantNav = [
    { href: routes.portal(),            label: t.navDashboard,      icon: "home" },
    { href: routes.portalPayments(),    label: t.navPaymentPortal,  icon: "dollar" },
    { href: routes.portalHistory(),     label: t.navPaymentHistory, icon: "clock" },
    { href: routes.portalProfile(),     label: t.navMyProfile,      icon: "key" },
    { href: routes.portalMaintenance(), label: t.navMaintenance,    icon: "wrench" },
  ]

  const isLandlord = user.role === "landlord"
  const nav = isLandlord ? landlordNav : tenantNav
  const bottomNav = isLandlord ? landlordBottomNav : []

  // Light the item whose href is the LONGEST prefix of the current path, rather
  // than every item that happens to be a prefix. Two cases depend on it:
  // /properties/<id> must light Properties (which a bare equality check would
  // miss — the old `currentPage === item.id` left nothing lit on detail views),
  // and /portal/payments/history must light History, not Payments.
  const activeHref = [...nav, ...bottomNav]
    .map(i => i.href)
    .filter(h => pathname === h || pathname.startsWith(h + '/'))
    .sort((a, b) => b.length - a.length)[0]

  const NavLink = ({ item }) => {
    const active = item.href === activeHref
    return (
      // prefetch={false}: all 12 links are in the viewport at load, and every
      // prefetch is an RSC request that runs middleware, which calls
      // supabase.auth.getUser() — a network round trip, not a local decode.
      <Link href={item.href} prefetch={false}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 9, border: "none", cursor: "pointer", marginBottom: 3, textAlign: "left", fontFamily: "inherit", transition: "all .15s", textDecoration: "none",
          background: active ? "rgba(255,255,255,.10)" : "transparent", color: active ? "#ffffff" : "#9ca3af", fontWeight: active ? 600 : 400, fontSize: "0.875rem" }}>
        <Icon name={item.icon} size={17} />{item.label}
        {active && <span style={{ marginLeft: "auto", width: 4, height: 4, background: "#ffffff", borderRadius: "50%" }} />}
      </Link>
    )
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Fall through to client sign-out so logout still clears local state.
    }
    await supabase.auth.signOut()
    // Leave the app surface entirely and land on the public marketing home.
    window.location.href = "/"
  }

  if (isLandlord) {
    return <LandlordSidebar user={user} lang={lang} setLang={setLang} t={t}
      primary={nav} secondary={bottomNav} activeHref={activeHref} pathname={pathname} logout={logout} />
  }

  return (
    <div style={{ width: 240, background: "#111111", minHeight: "100vh", display: "flex", flexDirection: "column", position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 100, fontFamily: "'Inter',system-ui,-apple-system,sans-serif" }}>
      <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, background: "linear-gradient(135deg,#111111,#000000)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff" }}><Icon name="building" size={20} /></div>
          <div>
            <div style={{ color: "#f5f5f5", fontWeight: 700, fontSize: "1rem", fontFamily: "'Inter',system-ui,-apple-system,sans-serif" }}>{t.appName}</div>
            <div style={{ color: "#9ca3af", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: ".7px" }}>{t.tenant}</div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: "14px 12px" }}>
        {nav.map(item => <NavLink key={item.href} item={item} />)}
      </nav>

      <div style={{ padding: "16px 12px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
        <div style={{ padding: "10px 12px", marginBottom: 4 }}>
          <div style={{ ...navStyles.singleLine, color: "#f5f5f5", fontSize: "0.875rem", fontWeight: 600 }}>{user.name}</div>
          <div style={{ ...navStyles.singleLine, color: "#9ca3af", fontSize: "0.75rem" }}>{user.email}</div>
        </div>
        <button onClick={logout} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 9, border: "none", cursor: "pointer", background: "transparent", color: "#6b7280", fontFamily: "inherit", fontSize: "0.875rem" }}>
          <Icon name="logout" size={17} />{t.logout}
        </button>
      </div>
    </div>
  )
}
