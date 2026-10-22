import { useEffect, useState } from 'react'
import { theme, type ThemeConfig } from 'antd'

/** Follows the OS colour scheme, the same switch styles.css uses. */
export function usePrefersDark(): boolean {
  const q = '(prefers-color-scheme: dark)'
  const [dark, setDark] = useState(() => window.matchMedia?.(q).matches ?? false)
  useEffect(() => {
    const m = window.matchMedia?.(q)
    if (!m) return
    const fn = () => setDark(m.matches)
    m.addEventListener('change', fn)
    return () => m.removeEventListener('change', fn)
  }, [])
  return dark
}

/**
 * antd tokens mapped from the dashboard's own palette in styles.css, so the
 * pipeline pages read as part of the same product: the green brand, the
 * Schibsted Grotesk face, warm paper greys, small radii.
 */
export function pipelineTheme(dark: boolean): ThemeConfig {
  const c = dark
    ? { page: '#0d0d0d', surface: '#1a1a19', ink: '#ffffff', ink2: '#c3c2b7', muted: '#898781', grid: '#2c2c2a', brand: '#7fb59e', wash: 'rgba(127, 181, 158, 0.12)', onBrand: '#0b0b0b' }
    : { page: '#f9f9f7', surface: '#fcfcfb', ink: '#0b0b0b', ink2: '#52514e', muted: '#898781', grid: '#e1e0d9', brand: '#1b4636', wash: 'rgba(27, 70, 54, 0.08)', onBrand: '#ffffff' }
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: c.brand,
      colorLink: c.brand,
      colorInfo: c.brand,
      colorBgLayout: c.page,
      colorBgContainer: c.surface,
      colorBgElevated: c.surface,
      colorText: c.ink,
      colorTextSecondary: c.ink2,
      colorTextTertiary: c.muted,
      colorBorderSecondary: c.grid,
      fontFamily: "'Schibsted Grotesk Variable', system-ui, -apple-system, 'Segoe UI', sans-serif",
      fontSize: 14,
      borderRadius: 4,
      borderRadiusLG: 4,
    },
    components: {
      Button: { primaryColor: c.onBrand, primaryShadow: 'none', fontWeight: 600 },
      Table: { headerBg: c.surface, headerColor: c.ink2, rowHoverBg: c.wash, headerSplitColor: 'transparent', borderColor: c.grid },
      Segmented: { itemSelectedBg: c.brand, itemSelectedColor: c.onBrand },
      Descriptions: { labelBg: c.wash },
    },
  }
}
