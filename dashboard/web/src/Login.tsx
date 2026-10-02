import { FormEvent, useState } from 'react'
import { Logo } from './Logo'

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (r.ok) {
        onSignedIn()
      } else if (r.status === 401) {
        setError('Wrong username or password.')
      } else {
        setError(`Sign-in failed (${r.status}). Try again.`)
      }
    } catch {
      setError('The API is unreachable. Start it with: go run ./dashboard/api')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <Logo />
        <h1 className="deal-name">Camber Credit 2026-1</h1>
        <p className="deal-sub">Sign in to open the pool servicing report</p>
        <label className="login-field">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>
        <label className="login-field">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <button className="login-submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
