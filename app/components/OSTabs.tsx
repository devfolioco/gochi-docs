'use client'

import { Tabs, type TabsProps } from 'fumadocs-ui/components/tabs'
import { useEffect, useState } from 'react'

// Drop-in replacement for fumadocs <Tabs> for OS-specific command blocks.
// On the first (server + hydration) render it behaves exactly like a normal
// Tabs — index 0 is active — so there is no hydration mismatch. After mount it
// detects the visitor's OS and, if a matching tab exists, remounts Tabs (via
// `key`) with that tab pre-selected. Manual switching afterwards is unaffected.

// Matches fumadocs' internal value escaping (components/tabs.tsx).
function escapeValue(v: string) {
  return v.toLowerCase().replace(/\s/, '-')
}

function detectOSValue(items: string[]): string | undefined {
  if (typeof navigator === 'undefined') return undefined
  const hay = `${navigator.userAgent} ${
    (navigator as Navigator & { platform?: string }).platform ?? ''
  }`.toLowerCase()

  // Order matters: Android/ChromeOS UAs also contain "linux", so check the
  // more specific platforms first.
  let os: string | undefined
  if (/windows|win32|win64/.test(hay)) os = 'windows'
  else if (/mac|iphone|ipad|ipod/.test(hay)) os = 'mac'
  else if (/linux|android|x11|cros/.test(hay)) os = 'linux'
  if (!os) return undefined

  const match = items.find((item) => item.toLowerCase().includes(os))
  return match ? escapeValue(match) : undefined
}

export function OSTabs({ items = [], ...props }: TabsProps) {
  const [detected, setDetected] = useState<string | undefined>(undefined)

  useEffect(() => {
    setDetected(detectOSValue(items))
  }, [items])

  return (
    <Tabs key={detected ?? 'default'} items={items} defaultValue={detected} {...props} />
  )
}
