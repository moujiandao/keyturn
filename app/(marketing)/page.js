import { APP_NAME } from '@/lib/brand'
import Link from 'next/link'
import { palette, container, btnStyle, radius, tracking } from '@/lib/theme'

export const metadata = {
  title: `${APP_NAME} - Move-in and move-out tracking for high-turnover rentals`,
  description:
    'For student, seasonal, and high-turnover rentals. Track every move-in and move-out for the next six months, reconcile Chase Zelle rent automatically, manage rent increases, and run bilingual operations.',
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <Turnover />
      <ZelleSpotlight />
      <Features />
      <ClosingCta />
    </>
  )
}

/* ─── Hero ─────────────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section
      style={{
        background: `linear-gradient(180deg, ${palette.surface} 0%, ${palette.bg} 82%)`,
        borderBottom: `1px solid ${palette.border}`,
        paddingTop: 76,
        paddingBottom: 0,
      }}
    >
      <div style={{ ...container, textAlign: 'center' }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: 13,
            fontWeight: 650,
            color: palette.accentHover,
            background: palette.accentTint,
            border: '1px solid #f0d0ce',
            borderRadius: radius.pill,
            padding: '6px 14px',
            marginBottom: 24,
          }}
        >
          Built for high-turnover rentals
        </span>
        {/* No hardcoded <br />: `balance` keeps the headline lines even across viewports. */}
        <h1
          style={{
            fontSize: 'clamp(40px, 6vw, 70px)',
            lineHeight: 1.04,
            fontWeight: 800,
            letterSpacing: tracking.display,
            margin: '0 auto 22px',
            maxWidth: 780,
            textWrap: 'balance',
            color: palette.text,
          }}
        >
          Move-ins, move-outs, nothing dropped.
        </h1>
        <p
          style={{
            fontSize: 'clamp(17px, 2vw, 20px)',
            color: palette.textMuted,
            lineHeight: 1.55,
            maxWidth: 620,
            margin: '0 auto 32px',
          }}
        >
          Tenant status updates itself from move-in and move-out dates. You just
          confirm what actually happened.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 54 }}>
          <Link href="/signup" className="pm-btn pm-btn-primary" style={btnStyle('primary', 'lg')}>Start for free</Link>
          <Link href="/pricing" className="pm-btn pm-btn-secondary" style={btnStyle('secondary', 'lg')}>See pricing</Link>
        </div>
        <ProductMock />
      </div>
    </section>
  )
}

// Static product preview mirroring the logged-in Redfin-inspired landlord workspace
// (white left rail with brick-red mark + rose active Dashboard pill over the warm
// stone canvas), built from pure server markup with no client bundle dependency.
const MOCK_NAV = ['Dashboard', 'Properties', 'Tenants', 'Payments', 'To Do List', 'Parking', 'Renewals']

const MOCK_STATS = [
  ['Occupied units', '22 / 26'],
  ['Move-ins next 30 days', '7'],
  ['Units to rent out', '3'],
]

const MOCK_ROWS = [
  ['Unit 4B', '2 moving out · Aug 31', 'Confirm move-out', palette.accentHover, palette.accentTint],
  ['Unit 2A', '1 moving in · Oct 3', 'Gap 1mo 12d', '#92400e', '#fef3c7'],
  ['Unit 7C', '2 moving out · Sep 30', 'Need to find new tenant(s)', '#ffffff', palette.accent],
]

function ProductMock() {
  return (
    <div
      aria-hidden="true"
      style={{
        maxWidth: 980,
        margin: '0 auto',
        transform: 'translateY(1px)',
        borderRadius: `${radius.md}px ${radius.md}px 0 0`,
        border: `1px solid ${palette.border}`,
        borderBottom: 'none',
        background: palette.surface,
        boxShadow: '0 24px 60px rgba(32,38,42,0.10)',
        overflow: 'hidden',
        textAlign: 'left',
      }}
    >
      {/* window chrome */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 16px', background: palette.surface, borderBottom: `1px solid ${palette.border}` }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
        ))}
        <span style={{ marginLeft: 12, fontSize: 12, fontWeight: 500, color: palette.textMuted }}>{APP_NAME} / Dashboard</span>
      </div>
      <div style={{ display: 'flex', minHeight: 316 }}>
        {/* White left rail matching components/sidebar.jsx. `display` is owned by
            .pm-mock-sidebar in globals.css so the mobile media query hides it below 640px. */}
        <div
          className="pm-mock-sidebar"
          style={{
            width: 184,
            flexShrink: 0,
            background: palette.surface,
            borderRight: `1px solid ${palette.border}`,
            padding: '16px 12px',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 6px 14px', marginBottom: 4, borderBottom: `1px solid ${palette.borderSoft}` }}>
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: palette.accent,
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9.5V21h14V9.5" />
                <path d="M10 21v-6h4v6" />
              </svg>
            </span>
            <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: tracking.brand, color: palette.text }}>
              {APP_NAME}
            </span>
          </div>
          {MOCK_NAV.map((label, i) => (
            <div
              key={label}
              style={{
                fontSize: 13,
                fontWeight: i === 0 ? 700 : 600,
                color: i === 0 ? palette.accentHover : palette.textMuted,
                background: i === 0 ? palette.accentTint : 'transparent',
                padding: '8px 10px',
                borderRadius: radius.sm,
              }}
            >
              {label}
            </div>
          ))}
        </div>
        {/* warm stone canvas */}
        <div style={{ flex: 1, minWidth: 0, padding: 22, background: palette.bg }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
            {MOCK_STATS.map(([label, value]) => (
              <div
                key={label}
                style={{
                  flex: '1 1 150px',
                  background: palette.surface,
                  border: `1px solid ${palette.border}`,
                  borderRadius: radius.md,
                  padding: '15px 18px',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 500, color: palette.textMuted, marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 750, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: palette.text }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ background: palette.surface, border: `1px solid ${palette.border}`, borderRadius: radius.md, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: palette.text, marginBottom: 12 }}>Unit Transitions - Next 6 Months</div>
            {MOCK_ROWS.map(([unit, detail, status, fg, bg]) => (
              <div
                key={unit}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderTop: `1px solid ${palette.borderSoft}`,
                }}
              >
                <span style={{ fontSize: 13, color: palette.text }}>
                  <strong style={{ fontWeight: 650 }}>{unit}</strong>
                  <span style={{ color: palette.textMuted }}> · {detail}</span>
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 650,
                    color: fg,
                    background: bg,
                    padding: '4px 10px',
                    borderRadius: radius.pill,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── How one turnover goes ────────────────────────────────────────────────── */
const STEPS = [
  {
    title: 'Notice arrives',
    body: 'Enter the move-out date and Unit 4B appears under Unit Transitions with the exact date it comes free.',
  },
  {
    title: 'Nobody incoming yet',
    body: 'Until someone is booked, the unit carries a red "Need to find new tenant(s)" badge so an empty September cannot sneak up on you.',
  },
  {
    title: 'Lease and housemates',
    body: 'Upload the signed lease PDF and every housemate is created as a separate tenant with their own rent, each marked "Security Deposit not received" until the funds land.',
  },
  {
    title: 'Clean, then confirm',
    body: 'The unit shows "Clean unit before Sep 1" and "Gap 12d", and stays on the list until you press "Tenants have moved out" and "Tenants have moved in".',
  },
]

function Turnover() {
  return (
    <section style={{ padding: '92px 0 0' }}>
      <div style={container}>
        <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 48px' }}>
          <h2 style={{ fontSize: 'clamp(30px, 4vw, 44px)', fontWeight: 800, letterSpacing: tracking.heading, margin: '0 0 14px', color: palette.text }}>
            How one turnover goes
          </h2>
          <p style={{ fontSize: 18, color: palette.textMuted, lineHeight: 1.5, margin: 0 }}>
            One unit, from the day notice arrives to the day the next tenants get their keys.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 18 }}>
          {STEPS.map((s, i) => (
            <div
              key={s.title}
              style={{
                background: palette.surface,
                border: `1px solid ${palette.border}`,
                borderRadius: radius.md,
                padding: '24px 22px',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 750, color: palette.accent, letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums', marginBottom: 12 }}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.015em', margin: '0 0 10px', color: palette.text }}>{s.title}</h3>
              <p style={{ fontSize: 15, color: palette.textMuted, lineHeight: 1.55, margin: 0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─── Zelle Spotlight ──────────────────────────────────────────────────────── */
const ZELLE_COMPARISON = [
  {
    aspect: 'Payment fees',
    portal: 'Card network cuts (2.9%-3.5%) or ACH processing fees',
    keyturn: '$0 processor fees. Rent lands straight in your bank account.',
  },
  {
    aspect: 'Tenant onboarding',
    portal: 'Every short-term tenant must create a login and link checking via Plaid',
    keyturn: 'No portal setup. Tenants and parents pay with the Zelle they already use.',
  },
  {
    aspect: 'Payout timing',
    portal: '3-5 business day holds while funds clear through a middleman',
    keyturn: 'Direct bank deposit, reconciled from forwarded Chase Zelle emails.',
  },
  {
    aspect: 'Bank credentials',
    portal: 'Requires connecting bank accounts or third-party aggregator tokens',
    keyturn: 'No bank logins shared. Only inbound deposit notification emails.',
  },
  {
    aspect: 'Parent & split rent',
    portal: 'Rigid per-tenant invoices break when parents or housemates split rent',
    keyturn: '6-gate auto-posting with 1-click Undo, plus a review inbox for partial, split, or parent payments.',
  },
]

function ZelleSpotlight() {
  return (
    <section id="zelle" style={{ padding: '92px 0 0' }}>
      <div style={container}>
        <div style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 44px' }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: 13,
              fontWeight: 650,
              color: palette.accentHover,
              background: palette.accentTint,
              border: '1px solid #f0d0ce',
              borderRadius: radius.pill,
              padding: '6px 14px',
              marginBottom: 18,
            }}
          >
            No payment processors. No 3% fees.
          </span>
          <h2 id="zelle-heading" style={{ fontSize: 'clamp(30px, 4vw, 44px)', fontWeight: 800, letterSpacing: tracking.heading, margin: '0 0 14px', color: palette.text, textWrap: 'balance' }}>
            Keep Zelle. Ditch the payment portal.
          </h2>
          <p style={{ fontSize: 18, color: palette.textMuted, lineHeight: 1.55, margin: 0 }}>
            Other property software pushes tenants onto card networks, ACH middlemen, and 5-day payout holds. Keyturn lets tenants keep paying straight to your bank while automating the ledger behind the scenes.
          </p>
        </div>

        <div
          style={{
            background: palette.surface,
            border: `1px solid ${palette.border}`,
            borderRadius: radius.md,
            overflow: 'hidden',
            boxShadow: '0 10px 30px rgba(32,38,42,0.05)',
          }}
        >
          <div
            role="region"
            aria-labelledby="zelle-heading"
            tabIndex={0}
            style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
          >
            <table aria-labelledby="zelle-heading" style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  <th
                    scope="col"
                    style={{
                      width: '22%',
                      padding: '16px 20px',
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: palette.textMuted,
                      background: palette.bgSubtle,
                      borderBottom: `1px solid ${palette.border}`,
                    }}
                  >
                    What matters
                  </th>
                  <th
                    scope="col"
                    style={{
                      width: '41%',
                      padding: '16px 20px',
                      fontSize: 14,
                      fontWeight: 750,
                      color: palette.accentHover,
                      background: palette.accentTint,
                      borderBottom: `2px solid ${palette.accent}`,
                      borderLeft: '1px solid #f0d0ce',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span>{APP_NAME} + Zelle</span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#fff',
                          background: palette.accent,
                          padding: '3px 9px',
                          borderRadius: radius.pill,
                        }}
                      >
                        $0 fees
                      </span>
                    </span>
                  </th>
                  <th
                    scope="col"
                    style={{
                      width: '37%',
                      padding: '16px 20px',
                      fontSize: 14,
                      fontWeight: 700,
                      color: palette.textMuted,
                      background: palette.bgSubtle,
                      borderBottom: `1px solid ${palette.border}`,
                      borderLeft: '1px solid #f0d0ce',
                    }}
                  >
                    Traditional rent portals
                  </th>
                </tr>
              </thead>
              <tbody>
                {ZELLE_COMPARISON.map((row, idx) => {
                  const rowBorder = idx === 0 ? 'none' : `1px solid ${palette.borderSoft}`
                  return (
                    <tr key={row.aspect}>
                      <th
                        scope="row"
                        style={{
                          padding: '16px 20px',
                          fontSize: 14,
                          fontWeight: 700,
                          color: palette.text,
                          verticalAlign: 'top',
                          borderTop: rowBorder,
                        }}
                      >
                        {row.aspect}
                      </th>
                      <td
                        style={{
                          padding: '16px 20px',
                          fontSize: 14,
                          lineHeight: 1.5,
                          color: palette.text,
                          fontWeight: 500,
                          verticalAlign: 'top',
                          background: 'rgba(249, 233, 232, 0.28)',
                          borderTop: rowBorder,
                          borderLeft: '1px solid #f0d0ce',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 9 }}>
                          <svg
                            aria-hidden="true"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke={palette.accent}
                            strokeWidth="2.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ flexShrink: 0, marginTop: 3 }}
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                          <span>{row.keyturn}</span>
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '16px 20px',
                          fontSize: 14,
                          lineHeight: 1.5,
                          color: palette.textMuted,
                          verticalAlign: 'top',
                          borderTop: rowBorder,
                          borderLeft: '1px solid #f0d0ce',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 9 }}>
                          <span aria-hidden="true" style={{ color: palette.textFaint, fontWeight: 700, flexShrink: 0, lineHeight: 1.4 }}>✕</span>
                          <span>{row.portal}</span>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Features ─────────────────────────────────────────────────────────────── */
// Ordered to lead with Unit Transitions and derived status, followed by shipped
// financial, lease, automation, and bilingual operations workflows.
// Deliberately absent: tenant ACH bank collection and automated /settings/reminders cron.
const FEATURES = [
  {
    icon: 'swap',
    title: 'Unit Transitions & human confirmation',
    body: 'See every move-in and move-out across a 6-month horizon, with tenant status derived from dates instead of a manual dropdown. Catch vacancy gaps and cleaning windows early, and confirm each turnover yourself.',
  },
  {
    icon: 'dollar',
    title: 'Chase Zelle rent auto-reconciliation',
    body: 'Forward Chase Zelle deposit emails to reconcile rent automatically. Deterministic matching and 6-gate auto-posting record clear payments with 1-click Undo, while partial, split, or parent payments land in a review inbox.',
  },
  {
    icon: 'trending',
    title: 'Rent Increase Manager & printable notices',
    body: 'Track multi-year unit rent history with year-over-year comparison in one grid, then generate editable, print-ready rent increase notice letters straight from the same unit record.',
  },
  {
    icon: 'users',
    title: 'AI lease parsing & housemate splits',
    body: 'Upload a signed lease PDF to create separate housemate records with individual rents inside a shared unit. Security deposits stay flagged until received, and move-out refunds are tracked on the way out.',
  },
  {
    icon: 'mail',
    title: 'Date-anchored email automations',
    body: 'Trigger emails a chosen number of days before or after move-in, move-out, lease end, or rent due dates. Hold batches for human review before sending, with idempotent delivery so no tenant is emailed twice.',
  },
  {
    icon: 'wrench',
    title: 'Bilingual maintenance board & parking lot map',
    body: 'Track tenant maintenance requests on an EN / 中文 kanban board with automatic translation, alongside an interactive parking lot diagram for tenant and market parking leases.',
  },
]

function Features() {
  return (
    <section id="features" style={{ padding: '92px 0' }}>
      <div style={container}>
        <div style={{ textAlign: 'center', maxWidth: 660, margin: '0 auto 52px' }}>
          <h2 style={{ fontSize: 'clamp(30px, 4vw, 44px)', fontWeight: 800, letterSpacing: tracking.heading, margin: '0 0 14px', color: palette.text }}>
            Built around the turnover, not the lease
          </h2>
          <p style={{ fontSize: 18, color: palette.textMuted, lineHeight: 1.5, margin: 0 }}>
            Most property software assumes tenants stay for years. Keyturn is built for portfolios that turn over every season.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 18 }}>
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureCard({ icon, title, body }) {
  return (
    <div
      className="pm-card"
      style={{
        background: palette.surface,
        border: `1px solid ${palette.border}`,
        borderRadius: radius.md,
        padding: '26px 24px',
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.sm,
          background: palette.accentTint,
          color: palette.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 18,
        }}
      >
        <FeatureIcon name={icon} />
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.015em', margin: '0 0 10px', color: palette.text }}>{title}</h3>
      <p style={{ fontSize: 15, color: palette.textMuted, lineHeight: 1.55, margin: 0 }}>{body}</p>
    </div>
  )
}

// Paths are inlined rather than imported from the app's shared Icon component:
// that one lives in property-management-app.jsx, which is 'use client' and would
// drag the whole dashboard bundle onto this page.
function FeatureIcon({ name }) {
  const common = { 'aria-hidden': true, width: 21, height: 21, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const paths = {
    swap: <><path d="M7 4 3 8l4 4" /><path d="M3 8h13a4 4 0 0 1 0 8h-1" /><path d="m17 20 4-4-4-4" /></>,
    dollar: <><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
    trending: <><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></>,
    users: <><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="3.5" /><path d="M17 4.5a3.5 3.5 0 0 1 0 6.8" /><path d="M22 20v-2a4 4 0 0 0-3-3.8" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    wrench: <path d="M14.7 6.3a4 4 0 0 0 5 5l-9 9a2.83 2.83 0 1 1-4-4l9-9a4 4 0 0 0-1-1z" />,
  }
  return <svg {...common}>{paths[name]}</svg>
}

/* ─── Closing CTA ──────────────────────────────────────────────────────────── */
function ClosingCta() {
  return (
    <section style={{ padding: '0 24px 96px' }}>
      <div
        style={{
          ...container,
          background: palette.text,
          color: '#fff',
          borderRadius: 16,
          padding: 'clamp(48px, 7vw, 76px) 32px',
          textAlign: 'center',
        }}
      >
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, letterSpacing: tracking.heading, margin: '0 0 14px' }}>
          Get ahead of the next move-out
        </h2>
        <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.74)', maxWidth: 560, margin: '0 auto 28px', lineHeight: 1.5 }}>
          Put in your move-out dates and see the next six months. Free to start, no credit card required.
        </p>
        <Link href="/signup" className="pm-btn pm-btn-primary" style={btnStyle('primary', 'lg')}>
          Start for free
        </Link>
      </div>
    </section>
  )
}
