import type { Metadata } from "next"
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google"
import "./globals.css"

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
})

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "Go Rabbit",
  description: "Agentic AI contributor assistant for open-source Go projects.",
  openGraph: {
    title: "Go Rabbit",
    description: "Agentic AI contributor assistant for open-source Go projects.",
    images: [
      {
        url: "/og-go-rabbit.png",
        alt: "Go Rabbit interface preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Go Rabbit",
    description: "Agentic AI contributor assistant for open-source Go projects.",
    images: ["/og-go-rabbit.png"],
  },
}

type RootLayoutProps = {
  children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${monoFont.variable}`}>
        {children}
      </body>
    </html>
  )
}
