import type { Metadata } from "next"
import { Archivo, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google"
import "./globals.css"

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-display",
})

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
})

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "AvaPulse — Alerting-first observability for Avalanche L1s & ICM",
  description:
    "Open-source monitoring for self-hosted Avalanche L1s and ICM relayers. Semantic alerts — stuck cross-chain messages, draining relayer gas wallets, stalled relayers — delivered to Telegram, Discord, Slack, and webhooks.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
