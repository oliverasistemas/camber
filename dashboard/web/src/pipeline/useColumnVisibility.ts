import { useCallback, useMemo, useState } from 'react'

const STORAGE_PREFIX = 'column-visibility:'

function read(key: string): string[] | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null
  } catch {
    return null
  }
}

/**
 * Which table columns are visible, remembered in localStorage per table.
 * The hidden set is what gets stored, so columns the API adds later show up
 * by default instead of silently staying hidden. `defaultHidden` only seeds
 * the first visit.
 */
export function useColumnVisibility(storageKey: string, allKeys: string[], defaultHidden: string[] = []) {
  const fullKey = STORAGE_PREFIX + storageKey
  const [hidden, setHidden] = useState<string[]>(() => read(fullKey) ?? defaultHidden)

  const visibleKeys = useMemo(() => allKeys.filter((k) => !hidden.includes(k)), [allKeys, hidden])

  const setVisible = useCallback(
    (keys: string[]) => {
      const next = allKeys.filter((k) => !keys.includes(k))
      setHidden(next)
      try {
        localStorage.setItem(fullKey, JSON.stringify(next))
      } catch {
        /* storage unavailable: the choice lasts for this page view */
      }
    },
    [allKeys, fullKey],
  )

  return { visibleKeys, setVisible }
}
