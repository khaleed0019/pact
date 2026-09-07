import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { SessionProvider } from '@/lib/client/session'
import './globals.css'

/*
 * Inter for the interface, JetBrains Mono for anything cryptographic.
 *
 * The split is meaningful rather than aesthetic: addresses, fingerprints and transaction
 * references are set in mono so they read as *data you can verify* rather than as prose.
 * Inside a wallet, that distinction is worth a typeface.
 */
const sans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
  // Only the weights actually used, so the WebView downloads less on a cold start.
  weight: ['400', '500', '600', '700'],
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'PACT — Send certainty',
  description:
    'Turn an informal agreement into something both sides signed. PACT structures the deal, both parties sign it with their Nimiq wallet, and every payment is recorded against it.',
  applicationName: 'PACT',
  appleWebApp: { capable: true, title: 'PACT', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false, date: false, address: false, email: false },
}

export const viewport: Viewport = {
  themeColor: '#0B0D10',
  width: 'device-width',
  initialScale: 1,
  // The app must not zoom under a user's fingers mid-payment, but pinch-zoom stays
  // available (maximumScale is not pinned to 1) because disabling it entirely is an
  // accessibility failure for low-vision users.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-[var(--app-height)]">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
