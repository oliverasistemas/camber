import logoUrl from './assets/logo-mark.png'

/**
 * The Camber mark, painted through a CSS mask so the flat light-gray PNG
 * takes var(--brand) in both themes. Size lives in .logo-mark.
 */
export function Logo() {
  const mask = `url(${logoUrl}) center / contain no-repeat`
  return <span className="logo-mark" role="img" aria-label="Camber" style={{ WebkitMask: mask, mask }} />
}
