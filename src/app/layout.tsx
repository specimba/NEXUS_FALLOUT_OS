import type { Metadata } from 'next'
import { Share_Tech_Mono, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { ThemeApplier } from '@/components/os/theme-applier'
import { CRTOverlay } from '@/components/os/crt-overlay'
import { Toaster } from '@/components/ui/sonner'

const shareTech = Share_Tech_Mono({
  variable: '--font-share-tech',
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'NEXUS OS',
  description: 'Bio-Pip-Cyberpunk AI Operating System',
  icons: {
    icon: '/logo.svg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${shareTech.variable} ${jetbrains.variable} font-mono antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <ThemeApplier />
          <CRTOverlay />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
