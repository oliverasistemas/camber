import { useCallback, useMemo, useState } from 'react'

// v2: stores the visible set (v1 stored the hidden set; those choices are dropped).
const STORAGE_PREFIX = 'column-visibility:v2:'

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
 * `defaultVisible` applies until the viewer changes the picker; after that
 * their choice is the record. Columns the API adds later stay hidden until
 * picked, so a wide report never balloons on its own.
 */
export function useColumnVisibility(storageKey: string, allKeys: string[], defaultVisible: string[]) {
  const fullKey = STORAGE_PREFIX + storageKey
  const [chosen, setChosen] = useState<string[] | null>(() => read(fullKey))

  const visibleKeys = useMemo(() => {
    const want = chosen ?? defaultVisible
    return allKeys.filter((k) => want.includes(k))
  }, [allKeys, chosen, defaultVisible])

  const setVisible = useCallback(
    (keys: string[]) => {
      setChosen(keys)
      try {
        localStorage.setItem(fullKey, JSON.stringify(keys))
      } catch {
        /* storage unavailable: the choice lasts for this page view */
      }
    },
    [fullKey],
  )

  const reset = useCallback(() => {
    setChosen(null)
    try {
      localStorage.removeItem(fullKey)
    } catch {
      /* nothing stored */
    }
  }, [fullKey])

  return { visibleKeys, setVisible, reset, isDefault: chosen === null }
}
