import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/current-user'
import { AppProvider } from '@/components/app-store'

// Guard + store for the whole authenticated surface.
//
// This layout sits above every app route, so the client store it mounts is
// created once and survives soft navigation between routes — Next does not
// re-render a shared parent layout when moving between its children.
//
// It answers both "is there a session?" and "which surface does this user
// belong to?". The role probe used to run client-side in an effect, two
// sequential round trips deep, before any data could load.
export default async function AppLayout({ children }) {
  const user = await getCurrentUser()

  // Do not kick signed-in users to /login on a transient Supabase Auth blip.
  if (user?.unavailable) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#f6f5f3', fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
        <div style={{ maxWidth: 420, width: '100%', background: '#fff', border: '1px solid #dedfdd', borderRadius: 12, padding: 28, textAlign: 'center' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 20, color: '#20262a' }}>Sign-in service temporarily unavailable / 登录服务暂时不可用</h1>
          <p style={{ margin: '0 0 18px', fontSize: 14, color: '#566168', lineHeight: 1.5 }}>
            Your session is safe. Please reload in a moment. / 您的登录状态未丢失，请稍后刷新重试。
          </p>
          <a href="" style={{ display: 'inline-block', padding: '10px 18px', borderRadius: 8, background: '#20262a', color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            Reload / 刷新
          </a>
        </div>
      </div>
    )
  }

  if (!user) redirect('/login?next=/dashboard')

  // Valid session but no landlord_members and no tenant_profiles row: include
  // `reason=no_profile` so middleware does not bounce the signed-in cookie
  // right back to /dashboard in an infinite redirect loop.
  if (!user.role) redirect('/login?reason=no_profile')

  return <AppProvider initialUser={user}>{children}</AppProvider>
}
