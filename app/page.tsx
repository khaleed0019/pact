'use client'

import { useSession } from '@/lib/client/session'
import { Welcome } from '@/components/screens/Welcome'
import { CommandCenter, DashboardSkeleton } from '@/components/screens/CommandCenter'
import { AppChrome } from '@/components/screens/AppChrome'
import { TabBar } from '@/components/nav/TabBar'

/**
 * The entry point decides between three states and nothing else.
 *
 * Loading renders the dashboard's own skeleton rather than a spinner, so the layout does
 * not jump when data lands — on a phone that shift is the difference between an app that
 * feels considered and one that feels cheap.
 */
export default function HomePage() {
  const { loading, me } = useSession()

  if (loading) return <DashboardSkeleton />
  if (!me?.signedIn) return <Welcome />

  return (
    <AppChrome>
      <CommandCenter />
      <TabBar />
    </AppChrome>
  )
}
