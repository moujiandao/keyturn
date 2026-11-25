'use client'

import { APP_NAME } from '@/lib/brand'
import { useState } from 'react'
import Link from 'next/link'
import { palette } from '@/lib/theme'
import { homeFor } from '@/lib/routes'
import { resolveSafeNextPath } from '@/lib/auth/session-gate'
import { AuthCard, Field, SubmitButton, Alert } from '../_form'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (event) => {
    event?.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')

    try {
      // Server-side sign-in issues first-party HTTP Set-Cookie headers so
      // Safari ITP does not cap the session cookie to 7 days.
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Invalid email or password.')
        setLoading(false)
        return
      }

      const home = json.home || homeFor(json.role || 'landlord')
      const next = new URLSearchParams(window.location.search).get('next')
      window.location.href = resolveSafeNextPath(next, home)
    } catch {
      setError('Unable to reach the sign-in service. Please try again.')
      setLoading(false)
    }
  }

  return (
    <AuthCard title="Welcome back" subtitle={`Log in to your ${APP_NAME} account.`}>
      <Alert>{error}</Alert>
      <form onSubmit={handleLogin}>
        <Field
          label="Email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          autoComplete="username"
        />
        <Field
          label="Password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <SubmitButton type="submit" loading={loading}>
          {loading ? 'Signing in…' : 'Log in'}
        </SubmitButton>
      </form>

      <p style={{ textAlign: 'center', fontSize: 14, color: palette.textMuted, margin: '20px 0 6px' }}>
        New to {APP_NAME}?{' '}
        <Link href="/signup" style={{ color: palette.text, fontWeight: 600, textDecoration: 'none' }}>Start for free</Link>
      </p>
      <p style={{ textAlign: 'center', fontSize: 13, color: palette.textFaint, margin: 0 }}>
        Tenants: use the email and password your landlord set up for you.
      </p>
    </AuthCard>
  )
}
