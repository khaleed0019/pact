'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Light / dark theme.
 *
 * The preference is one of `system`, `light` or `dark`, kept in localStorage — it is a
 * per-device display choice, so it does not belong on the server. `system` (the default)
 * follows the phone's setting and keeps following it if that changes.
 *
 * The attribute is first set by THEME_SCRIPT in the document head, before anything paints,
 * so there is never a flash of the wrong theme. This hook only changes it afterwards.
 */

export type ThemePreference = 'system' | 'light' | 'dark'
const KEY = 'pact-theme'

const META_COLOR = { light: '#F5F6F8', dark: '#0B0D10' } as const

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function apply(preference: ThemePreference): 'light' | 'dark' {
  const resolved = preference === 'system' ? systemTheme() : preference
  document.documentElement.dataset.theme = resolved
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', META_COLOR[resolved]))
  return resolved
}

function read(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system' // storage blocked in a WebView: fall back to the device setting
  }
}

export function useTheme(): {
  preference: ThemePreference
  resolved: 'light' | 'dark'
  setPreference: (next: ThemePreference) => void
} {
  const [preference, setPref] = useState<ThemePreference>('system')
  const [resolved, setResolved] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    const initial = read()
    setPref(initial)
    setResolved(apply(initial))
    // While following the system, follow it live.
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      if (read() === 'system') setResolved(apply('system'))
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const setPreference = useCallback((next: ThemePreference) => {
    try {
      if (next === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, next)
    } catch {
      // Not persisted, but still applied for this session.
    }
    setPref(next)
    setResolved(apply(next))
  }, [])

  return { preference, resolved, setPreference }
}
