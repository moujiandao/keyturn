import { APP_NAME } from '@/lib/brand'
import Link from 'next/link'
import { Logo } from '../_brand'
import { palette, container, btnStyle } from '@/lib/theme'

export default function MarketingLayout({ children }) {
  return (
    <div style={{ background: palette.bg, color: palette.text, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main style={{ flex: 1 }}>{children}</main>
      <Footer />
    </div>
  )
}

function Header() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'saturate(180%) blur(12px)',
        borderBottom: `1px solid ${palette.border}`,
      }}
    >
      <div style={{ ...container, height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" aria-label={APP_NAME} style={{ textDecoration: 'none' }}>
          <Logo />
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <Link href="/#features" className="pm-navlink pm-nav-secondary" style={navLink}>Features</Link>
          <Link href="/pricing" className="pm-navlink pm-nav-secondary" style={navLink}>Pricing</Link>
          <Link href="/login" className="pm-navlink" style={navLink}>Log in</Link>
          <Link href="/signup" className="pm-btn pm-btn-primary" style={btnStyle('primary', 'md')}>Start for free</Link>
        </nav>
      </div>
    </header>
  )
}

const navLink = { color: palette.textMuted, textDecoration: 'none', fontSize: '0.9375rem', fontWeight: 600 }

function Footer() {
  return (
    <footer style={{ borderTop: `1px solid ${palette.border}`, background: palette.surface }}>
      <div style={{ ...container, padding: '40px 24px', display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between', alignItems: 'center' }}>
        <Logo size={26} />
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Link href="/#features" className="pm-navlink" style={{ ...navLink, fontSize: '0.875rem' }}>Features</Link>
          <Link href="/pricing" className="pm-navlink" style={{ ...navLink, fontSize: '0.875rem' }}>Pricing</Link>
          <Link href="/login" className="pm-navlink" style={{ ...navLink, fontSize: '0.875rem' }}>Log in</Link>
        </div>
        <span style={{ color: palette.textFaint, fontSize: '0.8125rem' }}>© {new Date().getFullYear()} {APP_NAME}</span>
      </div>
    </footer>
  )
}
