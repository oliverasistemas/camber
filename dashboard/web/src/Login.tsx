import { useEffect, useState } from 'react'
import { Logo } from './Logo'

const DOMAIN = 'cambercredit.com'

/** Reason codes the API's callback redirects with (`/?auth=<code>`). */
const MESSAGES: Record<string, string> = {
  domain: `Sign in with your @${DOMAIN} Google account.`,
  google: 'Google did not complete the sign-in. Try again.',
}

function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/**
 * The sign-in card. There is nothing to type: the button hands the browser to
 * the API, which sends it through Google and back. The current hash rides
 * along as `next` so a deep link survives the round trip.
 */
export function Login() {
  const [error, setError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const reason = params.get('auth')
    if (!reason) return
    setError(MESSAGES[reason] ?? 'Google sign-in did not complete. Try again.')
    // Drop ?auth=… so a reload or the next attempt starts clean.
    window.history.replaceState(null, '', window.location.pathname + window.location.hash)
  }, [])

  const href = '/api/auth/google?next=' + encodeURIComponent(window.location.hash)

  return (
    <div className="login-wrap">
      <div className="login">
        <Logo />
        <h1 className="deal-name">Camber Credit 2026-1</h1>
        <p className="deal-sub">Sign in to open the pool servicing report</p>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <a className="login-google" href={href}>
          <GoogleMark />
          Continue with Google
        </a>
        {!error && <p className="login-note">Use your @{DOMAIN} Google Workspace account.</p>}
      </div>
    </div>
  )
}
