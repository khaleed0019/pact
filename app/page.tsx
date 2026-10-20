'use client'

import { useState } from 'react'
import { useSession } from '@/lib/client/session'
import { Welcome } from '@/components/screens/Welcome'
import { RoleSelect } from '@/components/screens/RoleSelect'
import { CommandCenter, DashboardSkeleton } from '@/components/screens/CommandCenter'
import { AppChrome } from '@/components/screens/AppChrome'
import { TabBar } from '@/components/nav/TabBar'

/**
 * The entry point decides between four states and nothing else:
 *
 *   loading           the dashboard's own skeleton, so nothing jumps when data lands
 *   signed out        Welcome — continue with Nimiq Pay, or explore the demo
 *   signed in, no role  the Brand / Contributor choice (asked once, then restored)
 *   signed in         the role dashboard
 *
 * The role comes from `/api/me`, which reads it from storage for the signed-in address,
 * so a returning user lands on their dashboard without being asked again.
 */
export default function HomePage() {
  const { loading, me } = useSession()
  const [switching, setSwitching] = useState(false)

  if (loading) return <DashboardSkeleton />
  if (!me?.signedIn) return <Welcome />
  if (!me.role) return <RoleSelect />
  if (switching) return <RoleSelect mode="switch" onDone={() => setSwitching(false)} />

  return (
    <AppChrome>
      <CommandCenter onSwitchRole={() => setSwitching(true)} />
      <TabBar />
    </AppChrome>
  )
}
